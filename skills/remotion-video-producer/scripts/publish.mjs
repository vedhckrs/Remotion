#!/usr/bin/env node
/**
 * Upload a rendered video with the copy from its publish pack, scheduled or immediate.
 *
 *   node scripts/publish.mjs --video <id> --platform youtube|youtube-shorts|instagram|facebook|facebook-video
 *        [--when 2026-09-28T09:00:00+05:30] [--file out/...mp4] [--public] [--dry-run] [--no-thumbnail]
 *
 * Reads out/<id>/publish/<platform>.json (scripts/make-publish-pack.mjs). Never prints tokens.
 *
 * YouTube (long-form and Shorts): resumable upload (videos.insert, 1600 quota units of the daily
 *   10 000), private + publishAt when --when is set (YouTube publishes it itself), then
 *   thumbnails.set (long-form only; Shorts covers come from the first frame) and captions.insert
 *   when public/captions/<id>.srt exists. Env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
 * Instagram Reels: resumable container upload -> poll status_code FINISHED -> media_publish.
 *   No native scheduling: with a future --when this exits 3 ("due later") so autopilot can retry at
 *   the due time. Env: IG_USER_ID (professional account id), META_ACCESS_TOKEN.
 * Facebook Reels: start -> binary upload -> finish with video_state SCHEDULED (10 min to 29 days) or
 *   PUBLISHED. Env: META_PAGE_ID, META_PAGE_TOKEN.
 * Facebook page video (16:9 / 4:5, not a Reel): multipart upload with published=false +
 *   scheduled_publish_time.
 *
 * Results append to out/<id>/publish/log.json. Exit 0 ok, 1 error, 3 due later.
 */
import fs from 'node:fs';
import path from 'node:path';
import {loadEnv, parseArgs} from './lib/env.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const videoId = args.video || args._[0];
const platform = args.platform || args._[1];
const PLATFORMS = ['youtube', 'youtube-shorts', 'instagram', 'facebook', 'facebook-video'];
if (!videoId || !PLATFORMS.includes(platform)) {
  console.error(`Usage: node scripts/publish.mjs --video <id> --platform ${PLATFORMS.join('|')} [--when ISO] [--dry-run]`);
  process.exit(1);
}
const dryRun = Boolean(args['dry-run']);
const packDir = path.join('out', videoId, 'publish');
const packFile = path.join(packDir, `${platform === 'facebook-video' ? 'facebook' : platform}.json`);
if (!fs.existsSync(packFile)) {
  console.error(`Missing ${packFile}. Run: node scripts/make-publish-pack.mjs --video ${videoId}`);
  process.exit(1);
}
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const when = args.when ? new Date(String(args.when)) : null;
if (when && Number.isNaN(when.getTime())) {
  console.error(`Bad --when: ${args.when}. Use ISO 8601, e.g. 2026-09-28T09:00:00+05:30`);
  process.exit(1);
}
const future = when && when.getTime() > Date.now() + 60_000;
const GRAPH = 'https://graph.facebook.com/v25.0';

// ---- file resolution ---------------------------------------------------------------------------------
const compFor = {youtube: ['YouTube'], 'youtube-shorts': ['Shorts'], instagram: ['Reels', 'Shorts'], facebook: ['Reels', 'Shorts', 'Facebook'], 'facebook-video': ['Feed', 'YouTube']};
const resolveFile = () => {
  if (args.file) return String(args.file);
  const wanted = platform === 'facebook-video' ? pack.feedVideo || pack.video : pack.video;
  if (wanted && fs.existsSync(wanted)) return wanted;
  const candidates = fs.existsSync('out')
    ? fs
        .readdirSync('out')
        .filter((f) => /\.mp4$/i.test(f) && compFor[platform].some((c) => f.startsWith(`${c}_`)))
        .map((f) => ({f: path.join('out', f), m: fs.statSync(path.join('out', f)).mtimeMs}))
        .sort((a, b) => b.m - a.m)
    : [];
  if (candidates.length) return candidates[0].f;
  return null;
};
const file = resolveFile();
if (!file || !fs.existsSync(file)) {
  console.error(`No rendered file for ${platform}. Expected ${pack.video} or out/<Composition>_<preset>*.mp4. Render first or pass --file.`);
  process.exit(1);
}
const size = fs.statSync(file).size;
const thumbnail = !args['no-thumbnail'] && (pack.thumbnail || pack.coverImage) && fs.existsSync(pack.thumbnail || pack.coverImage) ? pack.thumbnail || pack.coverImage : null;
const srt = [pack.captions, path.join('public', 'captions', `${videoId}.srt`)].find((f) => f && fs.existsSync(f)) || path.join('public', 'captions', `${videoId}.srt`);

const logResult = (entry) => {
  const logFile = path.join(packDir, 'log.json');
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
  log.push({at: new Date().toISOString(), platform, file, when: when ? when.toISOString() : null, ...entry});
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2) + '\n');
};

const env = (name) => {
  const v = process.env[name];
  if (!v && !dryRun) {
    console.error(`Missing ${name} in .env (see references/publishing-seo.md for how to get it).`);
    process.exit(1);
  }
  return v || `<${name}>`;
};

const jsonOrThrow = async (res, what) => {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = {raw: text};
  }
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 600)}`);
  return data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const plan = (lines) => {
  console.log(`${dryRun ? '[dry-run] ' : ''}${platform} <- ${file} (${(size / 1048576).toFixed(1)} MB)${when ? ` at ${when.toISOString()}` : ' now'}`);
  lines.forEach((l) => console.log(`  ${l}`));
};

// ---- YouTube -----------------------------------------------------------------------------------------
const youtubeToken = async () => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: env('YT_CLIENT_ID'), client_secret: env('YT_CLIENT_SECRET'), refresh_token: env('YT_REFRESH_TOKEN'), grant_type: 'refresh_token'}),
  });
  const data = await jsonOrThrow(res, 'YouTube token refresh (run scripts/auth-youtube.mjs again if invalid_grant)');
  return data.access_token;
};

const uploadInChunks = async (sessionUrl, headers) => {
  const chunk = 32 * 1024 * 1024;
  const fd = fs.openSync(file, 'r');
  try {
    let offset = 0;
    while (offset < size) {
      const len = Math.min(chunk, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      let res;
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch(sessionUrl, {method: 'PUT', headers: {...headers, 'Content-Length': String(len), 'Content-Range': `bytes ${offset}-${offset + len - 1}/${size}`}, body: buf});
        if (res.status === 308 || res.ok) break;
        await sleep(2000 * 2 ** attempt);
      }
      if (res.status === 308) {
        const range = res.headers.get('Range');
        offset = range ? Number(range.split('-')[1]) + 1 : offset + len;
      } else if (res.ok) {
        return res.json();
      } else {
        throw new Error(`Upload chunk failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      }
      process.stdout.write(`\r  uploaded ${Math.round((offset / size) * 100)}%`);
    }
  } finally {
    fs.closeSync(fd);
  }
  throw new Error('Upload ended without a final response');
};

const publishYouTube = async () => {
  const body = {
    snippet: {title: pack.title, description: pack.description, tags: pack.tags, categoryId: String(pack.categoryId || 22), defaultLanguage: pack.defaultLanguage || 'en', defaultAudioLanguage: pack.defaultAudioLanguage || pack.defaultLanguage || 'en'},
    status: {privacyStatus: args.public && !future ? 'public' : 'private', selfDeclaredMadeForKids: false, embeddable: true, ...(future ? {publishAt: when.toISOString()} : {})},
  };
  plan([`title: ${pack.title}`, `privacy: ${body.status.privacyStatus}${future ? ` (publishAt ${when.toISOString()})` : ''}`, `tags: ${pack.tags.length}`, thumbnail && platform === 'youtube' ? `thumbnail: ${thumbnail}` : 'thumbnail: none', fs.existsSync(srt) ? `captions: ${srt}` : 'captions: none (public/captions/<id>.srt)']);
  if (dryRun) return {id: 'dry-run'};
  const token = await youtubeToken();
  const auth = {Authorization: `Bearer ${token}`};
  const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {...auth, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4'},
    body: JSON.stringify(body),
  });
  if (!start.ok) throw new Error(`videos.insert start: HTTP ${start.status} ${(await start.text()).slice(0, 600)}`);
  const sessionUrl = start.headers.get('Location');
  const video = await uploadInChunks(sessionUrl, {...auth, 'Content-Type': 'video/mp4'});
  console.log(`\n  video id ${video.id}`);
  if (thumbnail && platform === 'youtube') {
    const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, {method: 'POST', headers: {...auth, 'Content-Type': 'image/jpeg'}, body: fs.readFileSync(thumbnail)});
    if (res.ok) console.log('  thumbnail set');
    else console.log(`  thumbnail failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)} (channel may need phone verification for custom thumbnails)`);
  }
  if (fs.existsSync(srt)) {
    const boundary = 'remotion-caption-' + Date.now();
    const meta = JSON.stringify({snippet: {videoId: video.id, language: pack.defaultLanguage || 'en', name: 'Captions', isDraft: false}});
    const bodyParts = [`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`, `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`];
    const multipart = Buffer.concat([Buffer.from(bodyParts[0]), Buffer.from(bodyParts[1]), fs.readFileSync(srt), Buffer.from(`\r\n--${boundary}--`)]);
    const res = await fetch('https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart', {method: 'POST', headers: {...auth, 'Content-Type': `multipart/related; boundary=${boundary}`}, body: multipart});
    console.log(res.ok ? '  captions uploaded' : `  captions failed: HTTP ${res.status}`);
  }
  return {id: video.id, url: `https://youtu.be/${video.id}`, privacy: body.status.privacyStatus, publishAt: body.status.publishAt || null};
};

// ---- Instagram ---------------------------------------------------------------------------------------
const publishInstagram = async () => {
  if (future) {
    plan(['Instagram has no API scheduling; this item is due later. autopilot publish-due retries it at the due time.']);
    if (!dryRun) logResult({status: 'due', dueAt: when.toISOString()});
    process.exit(3);
  }
  plan([`caption: ${pack.caption.split('\n')[0]}`, `share_to_feed: ${pack.shareToFeed !== false}`]);
  if (dryRun) return {id: 'dry-run'};
  const igUser = env('IG_USER_ID');
  const token = env('META_ACCESS_TOKEN');
  const container = await jsonOrThrow(
    await fetch(`${GRAPH}/${igUser}/media`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({media_type: 'REELS', upload_type: 'resumable', caption: pack.caption, share_to_feed: String(pack.shareToFeed !== false), thumb_offset: '0', access_token: token})}),
    'IG create container',
  );
  const up = await fetch(container.uri || `https://rupload.facebook.com/ig-api-upload/v25.0/${container.id}`, {method: 'POST', headers: {Authorization: `OAuth ${token}`, offset: '0', file_size: String(size), 'Content-Type': 'application/octet-stream'}, body: fs.readFileSync(file)});
  await jsonOrThrow(up, 'IG binary upload');
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const st = await jsonOrThrow(await fetch(`${GRAPH}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`), 'IG status');
    process.stdout.write(`\r  processing: ${st.status_code}   `);
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error(`IG container ${st.status_code}: ${st.status || ''}`);
  }
  const pub = await jsonOrThrow(await fetch(`${GRAPH}/${igUser}/media_publish`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({creation_id: container.id, access_token: token})}), 'IG media_publish');
  const link = await fetch(`${GRAPH}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => ({}));
  console.log(`\n  published ${pub.id}`);
  return {id: pub.id, url: link.permalink || null};
};

// ---- Facebook ----------------------------------------------------------------------------------------
const fbSchedule = () => {
  if (!future) return {};
  const min = Date.now() + 10 * 60_000;
  const max = Date.now() + 29 * 86400_000;
  if (when.getTime() < min || when.getTime() > max) throw new Error('Facebook scheduling must be 10 minutes to 29 days ahead');
  return {scheduled_publish_time: String(Math.floor(when.getTime() / 1000))};
};

const publishFacebookReel = async () => {
  const sched = fbSchedule();
  plan([`title: ${pack.title}`, future ? `video_state: SCHEDULED (${when.toISOString()})` : 'video_state: PUBLISHED']);
  if (dryRun) return {id: 'dry-run'};
  const page = env('META_PAGE_ID');
  const token = env('META_PAGE_TOKEN');
  const start = await jsonOrThrow(await fetch(`${GRAPH}/${page}/video_reels`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({upload_phase: 'start', access_token: token})}), 'FB reel start');
  const up = await fetch(`https://rupload.facebook.com/video-upload/v25.0/${start.video_id}`, {method: 'POST', headers: {Authorization: `OAuth ${token}`, offset: '0', file_size: String(size), 'Content-Type': 'application/octet-stream'}, body: fs.readFileSync(file)});
  await jsonOrThrow(up, 'FB reel upload');
  const finish = await jsonOrThrow(
    await fetch(`${GRAPH}/${page}/video_reels`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({upload_phase: 'finish', video_id: start.video_id, video_state: future ? 'SCHEDULED' : 'PUBLISHED', description: pack.description, title: pack.title, ...sched, access_token: token})}),
    'FB reel finish',
  );
  console.log(`  reel ${start.video_id} ${finish.success ? 'accepted' : JSON.stringify(finish).slice(0, 200)}`);
  return {id: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}`, scheduled: future ? when.toISOString() : null};
};

const publishFacebookVideo = async () => {
  const sched = fbSchedule();
  plan([`title: ${pack.title}`, future ? `published=false, scheduled ${when.toISOString()}` : 'published=true']);
  if (dryRun) return {id: 'dry-run'};
  const page = env('META_PAGE_ID');
  const token = env('META_PAGE_TOKEN');
  const form = new FormData();
  form.set('access_token', token);
  form.set('title', pack.title);
  form.set('description', pack.description);
  form.set('published', future ? 'false' : 'true');
  for (const [k, v] of Object.entries(sched)) form.set(k, v);
  form.set('source', new Blob([fs.readFileSync(file)], {type: 'video/mp4'}), path.basename(file));
  if (thumbnail) form.set('thumb', new Blob([fs.readFileSync(thumbnail)], {type: 'image/jpeg'}), 'thumb.jpg');
  const res = await jsonOrThrow(await fetch(`https://graph-video.facebook.com/v25.0/${page}/videos`, {method: 'POST', body: form}), 'FB video upload');
  console.log(`  video ${res.id}`);
  return {id: res.id, url: `https://www.facebook.com/${page}/videos/${res.id}`, scheduled: future ? when.toISOString() : null};
};

// ---- run ---------------------------------------------------------------------------------------------
const run = {youtube: publishYouTube, 'youtube-shorts': publishYouTube, instagram: publishInstagram, facebook: publishFacebookReel, 'facebook-video': publishFacebookVideo}[platform];
try {
  const result = await run();
  if (!dryRun) logResult({status: future && platform !== 'instagram' ? 'scheduled' : 'published', ...result});
  if (result.url) console.log(`  ${result.url}`);
  console.log(dryRun ? 'Dry run only; nothing uploaded.' : 'Done.');
} catch (error) {
  console.error(`\n${platform} failed: ${error.message}`);
  if (!dryRun) logResult({status: 'failed', error: error.message});
  process.exit(1);
}
