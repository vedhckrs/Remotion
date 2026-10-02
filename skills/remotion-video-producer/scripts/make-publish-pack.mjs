#!/usr/bin/env node
/**
 * Build per-platform upload files (titles, descriptions, tags, hashtags, chapters, credits) from a
 * script's `seo` block, so every platform gets copy shaped for its own ranking signals.
 *
 *   node scripts/make-publish-pack.mjs --video <id> [--handle @you] [--site https://...] [--out out/<id>/publish]
 *        [--long-title "..."] [--short-title "..."] [--extra-hashtags "#a,#b"]
 *
 * Video paths follow autopilot's layout (out/<id>/<id>_shorts.mp4, _youtube.mp4, _feed.mp4; render-preset.sh
 * --out writes them). publish.mjs falls back to the newest out/<Composition>_<preset>*.mp4 when absent.
 *
 * Writes out/<id>/publish/
 *   youtube.json         long-form: title (<=70 visible), description with hook, chapters, CTA, hashtags,
 *                        credits; tags <= 500 chars; categoryId; defaultLanguage; thumbnail path
 *   youtube-shorts.json  <=70-char title with #Shorts, short description with 3 hashtags first
 *   instagram.json       caption (hook line first, hashtags last, <= 2200 chars), cover path
 *   facebook.json        Reel/page video title + description (1-2 hashtags), thumbnail path
 *   titles.md            A/B title list and thumbnail texts for a human to pick from
 *   pack.json            everything above plus the file list, consumed by publish.mjs / autopilot.mjs
 *
 * Copy comes from the script (Claude writes seo.titles / description / keywords / hashtags in Phase 2);
 * this script only shapes and validates it. See references/publishing-seo.md for the rules applied.
 */
import fs from 'node:fs';
import path from 'node:path';
import {computeSceneTimings, absoluteCaptions, totalFrames} from '../assets/templates/src/lib/timeline.mjs';
import {parseArgs} from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
const videoId = args.video || args._[0];
if (!videoId) {
  console.error('Usage: node scripts/make-publish-pack.mjs --video <id> [--handle @you] [--site url]');
  process.exit(1);
}
const scriptFile = path.join('public', 'script', `${videoId}.json`);
if (!fs.existsSync(scriptFile)) {
  console.error(`Missing ${scriptFile}`);
  process.exit(1);
}
const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
const seo = script.seo || {};
const outDir = path.resolve(args.out || path.join('out', videoId, 'publish'));
fs.mkdirSync(outDir, {recursive: true});

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const manifest = readJson(path.join('public', 'voiceover', videoId, 'manifest.json'), null);
const credits = readJson(path.join('public', 'icons', 'credits.json'), []);
const thumbs = readJson(path.join('out', videoId, 'thumbnails.json'), {results: []});
const musicLicenses = fs.existsSync(path.join('public', 'music', 'LICENSES.md')) ? fs.readFileSync(path.join('public', 'music', 'LICENSES.md'), 'utf8') : '';

// ---- timing (chapters) -------------------------------------------------------------------------
const PACING = {fast: {gap: 0.35, wpm: 185}, medium: {gap: 0.6, wpm: 165}, calm: {gap: 0.9, wpm: 145}};
const pace = PACING[script.pacing] || PACING.medium;
const fps = 60;
const gap = manifest?.gapSeconds ?? pace.gap;
const durations = script.scenes.map((s) => ({id:s.id,minSeconds:s.minSeconds,durationSeconds:manifest?.scenes?.find((m) => m.id === s.id)?.durationSeconds ?? 0.6+s.voiceover.trim().split(/\s+/).length*60/pace.wpm}));
const timings = computeSceneTimings(durations,fps,gap);
const chapters = timings.map((t,i) => ({start:Math.floor(t.startFrame/fps),headline:script.scenes[i].headline.replace(/[.!?]+$/, '')}));
const endSeconds = script.endCard === null ? 0 : 2.5;
const totalSeconds = Math.round(totalFrames(timings)/fps + endSeconds + (endSeconds ? Math.ceil(gap*fps)/fps : 0));
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
// YouTube only accepts chapters when there are 3+, the first is 00:00 and each lasts 10+ seconds.
const useChapters = chapters.length >= 3 && chapters.every((c, i) => i === 0 || c.start - chapters[i - 1].start >= 10) && totalSeconds - chapters[chapters.length - 1].start >= 10;

// ---- copy pieces -------------------------------------------------------------------------------
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const title = clean(args['long-title'] || seo.titles?.[0] || script.title || script.scenes[0].headline);
const titles = Array.from(new Set([title, ...(seo.titles || []).map(clean), clean(script.title), clean(script.scenes[0].headline)].filter(Boolean)));
const description = clean(seo.description || script.scenes.slice(0, 2).map((s) => s.voiceover).join(' '));
const keywords = Array.from(new Set((seo.keywords || []).map((k) => clean(k).toLowerCase()).filter(Boolean)));
const toTag = (k) => '#' + String(k).toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_]/g, '');
const hashtags = Array.from(new Set([...(seo.hashtags || []), ...(args['extra-hashtags'] ? String(args['extra-hashtags']).split(',') : []), ...keywords].map(toTag).filter((h) => h.length > 2)));
const longHashtags = hashtags.filter((h) => h.toLowerCase() !== '#shorts'); // #Shorts only belongs on the Short
const cta = clean(seo.cta || 'Follow for part two.');
const handle = args.handle || (script.logo?.text ? `@${String(script.logo.text).replace(/^@/, '')}` : '');
const site = args.site || '';
const language = seo.language || 'en';

const CATEGORY_IDS = {'film & animation': 1, autos: 2, music: 10, pets: 15, sports: 17, travel: 19, gaming: 20, 'people & blogs': 22, comedy: 23, entertainment: 24, 'news & politics': 25, 'howto & style': 26, education: 27, 'science & technology': 28, technology: 28, science: 28, business: 27, finance: 27, marketing: 27};
const categoryId = CATEGORY_IDS[String(seo.category || 'education').toLowerCase()] || 22;

// Credits line: real brand marks and icon sets used, plus music licence.
const usedKeys = new Set();
for (const scene of script.scenes) for (const ic of scene.visual?.icons || []) usedKeys.add(`${ic.set || 'simple-icons'}:${ic.name}`);
if (script.logo?.icon) usedKeys.add(`${script.logo.icon.set || 'simple-icons'}:${script.logo.icon.name}`);
const usedCredits = credits.filter((c) => usedKeys.has(`${c.set}:${c.name}`));
const brandNames = usedCredits.filter((c) => c.set === 'simple-icons' || c.set === 'logos').map((c) => c.title);
const setNames = Array.from(new Set(usedCredits.map((c) => ({'simple-icons': 'Simple Icons (CC0 1.0)', logos: 'SVG Logos (CC0 1.0)', lucide: 'Lucide (ISC)', tabler: 'Tabler Icons (MIT)', 'fluent-emoji-flat': 'Fluent Emoji (MIT)'})[c.set] || c.set)));
const creditLines = [];
if (brandNames.length) creditLines.push(`Logos: ${brandNames.join(', ')} ${brandNames.length === 1 ? 'is a trademark of its owner' : 'are trademarks of their respective owners'}; used for identification only.`);
if (setNames.length) creditLines.push(`Icons: ${setNames.join(', ')}.`);
if (script.music?.credit) creditLines.push(`Music: ${clean(script.music.credit)}${script.music.license ? ` (${clean(script.music.license)})` : ''}.`);
else if (script.music?.src && /elevenlabs|generated/i.test(script.music.src + (script.music.mood || ''))) creditLines.push('Music: generated with ElevenLabs Music.');
else if (script.music?.src && musicLicenses) creditLines.push('Music: see LICENSES in the video description source.');

// ---- YouTube long-form ---------------------------------------------------------------------------
const ytTitle = title.length > 100 ? title.slice(0, 97) + '...' : title;
const ytDescription = [
  description.split(/(?<=[.!?])\s+/).slice(0, 2).join(' '), // first 2 sentences show above the fold
  '',
  description.split(/(?<=[.!?])\s+/).slice(2).join(' '),
  '',
  useChapters ? ['Chapters', ...chapters.map((c) => `${mmss(c.start)} ${c.headline}`)].join('\n') : '',
  '',
  cta,
  handle ? `Follow ${handle}` : '',
  site,
  '',
  longHashtags.slice(0, 5).join(' '),
  '',
  creditLines.join('\n'),
]
  .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
  .join('\n')
  .trim()
  .slice(0, 5000);
const tags = [];
let tagChars = 0;
for (const k of [...keywords, ...titles.map((t) => t.toLowerCase()), ...longHashtags.map((h) => h.slice(1))]) {
  const t = k.trim();
  if (!t || t.length > 30 || tags.includes(t)) continue; // YouTube caps single tags at 30 chars; never cut words
  if (tagChars + t.length + 2 > 480) break;
  tags.push(t);
  tagChars += t.length + 2;
}
const youtube = {
  platform: 'youtube',
  kind: 'video',
  title: ytTitle,
  description: ytDescription,
  tags,
  categoryId,
  defaultLanguage: language,
  defaultAudioLanguage: language,
  privacyStatus: 'private',
  selfDeclaredMadeForKids: false,
  embeddable: true,
  license: 'youtube',
  thumbnail: thumbs.results.find((r) => r.variant === 'youtube')?.file || null,
  video: `out/${videoId}/${videoId}_youtube.mp4`,
  notes: ['Title under 70 characters shows in full on mobile.', 'First two sentences are visible before "more".', 'Upload as private with publishAt to schedule (publish.mjs does this).'],
};

// ---- YouTube Shorts --------------------------------------------------------------------------------
const shortBase = clean(args['short-title'] || seo.titles?.[1] || title);
const shortTitleRaw = /#shorts/i.test(shortBase) ? shortBase : `${shortBase} #Shorts`;
const shortTitle = shortTitleRaw.length > 100 ? `${shortBase.slice(0, 100 - 8 - 3)}... #Shorts` : shortTitleRaw;
const shortsHashtags = Array.from(new Set(['#Shorts', ...hashtags.filter((h) => h.toLowerCase() !== '#shorts')])).slice(0, 4);
const youtubeShorts = {
  platform: 'youtube',
  kind: 'short',
  title: shortTitle,
  description: [description.split(/(?<=[.!?])\s+/)[0], '', cta, handle ? `Follow ${handle}` : '', '', shortsHashtags.join(' '), '', creditLines.join('\n')].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim(),
  tags: tags.slice(0, 15),
  categoryId,
  defaultLanguage: language,
  privacyStatus: 'private',
  selfDeclaredMadeForKids: false,
  video: `out/${videoId}/${videoId}_shorts.mp4`,
  notes: ['Vertical 9:16 up to 3 minutes is a Short automatically; #Shorts in the title helps discovery.', 'Shorts ignore custom thumbnails on mobile: the first frame is the cover, so the hook scene must read as a poster.'],
};

// ---- Instagram Reels ---------------------------------------------------------------------------------
const igHashtags = hashtags.filter((h) => h.toLowerCase() !== '#shorts').slice(0, 8);
const igCaption = [titles[0], '', description.split(/(?<=[.!?])\s+/).slice(0, 3).join(' '), '', `${cta}${handle ? ` ${handle}` : ''}`, '', igHashtags.join(' '), creditLines.length ? '' : null, creditLines.join(' ')]
  .filter((l) => l !== null)
  .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
  .join('\n')
  .trim()
  .slice(0, 2200);
const instagram = {
  platform: 'instagram',
  kind: 'reel',
  caption: igCaption,
  shareToFeed: true,
  coverImage: thumbs.results.find((r) => r.variant === 'cover')?.file || null,
  video: `out/${videoId}/${videoId}_shorts.mp4`,
  notes: ['Hook line first: only ~125 characters show before "more".', 'Keywords in the caption text matter more than hashtag volume; 3-8 specific hashtags.', 'Instagram has no API scheduling: autopilot publishes at the due time.'],
};

// ---- Facebook ------------------------------------------------------------------------------------------
const facebook = {
  platform: 'facebook',
  kind: 'reel',
  title: title.slice(0, 255),
  description: [description.split(/(?<=[.!?])\s+/).slice(0, 2).join(' '), '', cta, '', longHashtags.slice(0, 2).join(' '), '', creditLines.join(' ')].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim(),
  thumbnail: thumbs.results.find((r) => r.variant === 'youtube')?.file || null,
  video: `out/${videoId}/${videoId}_shorts.mp4`,
  feedVideo: `out/${videoId}/${videoId}_feed.mp4`,
  notes: ['Facebook Reels API schedules natively (10 minutes to 29 days ahead).', 'Fewer hashtags perform better on Facebook; the first sentence is the ranking text.'],
};

// ---- SRT from word timing (YouTube captions.insert; better search indexing than burned-in only) -------
const msToSrt = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
};
let srtFile = null;
if (manifest?.scenes?.some((sc) => sc.captions?.length)) {
  const cues = [];
  let offset = 0;
  const captionTimeline = absoluteCaptions(manifest, timings, fps);
  for (const scene of [{captions: captionTimeline}]) {
    const words = scene.captions || [];
    let line = [];
    let start = null;
    const flush = () => {
      if (!line.length) return;
      cues.push({start: start + offset, end: line[line.length - 1].endMs + offset, text: line.map((w) => w.text.trim()).join(' ')});
      line = [];
      start = null;
    };
    for (const w of words) {
      if (start === null) start = w.startMs;
      line.push(w);
      if (line.length >= 8 || w.endMs - start > 3500 || /[.!?]$/.test(w.text.trim())) flush();
    }
    flush();
    // Captions are already on the canonical frame timeline.
  }
  if (cues.length) {
    srtFile = path.join(outDir, `${videoId}.srt`);
    fs.writeFileSync(srtFile, cues.map((c, i) => `${i + 1}\n${msToSrt(c.start)} --> ${msToSrt(c.end)}\n${c.text}\n`).join('\n'));
  }
}

// ---- write ---------------------------------------------------------------------------------------------
const files = {youtube, 'youtube-shorts': youtubeShorts, instagram, facebook};
youtube.captions = srtFile ? path.relative(process.cwd(), srtFile) : null;
youtubeShorts.captions = youtube.captions;
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2) + '\n');

const titlesMd = [
  `# ${videoId}: titles and thumbnail text`,
  '',
  '## Title options (A/B)',
  ...titles.map((t, i) => `- ${String.fromCharCode(65 + i)}. ${t} (${t.length} chars${t.length > 70 ? ', trims on mobile' : ''})`),
  '',
  '## Shorts title',
  `- ${shortTitle} (${shortTitle.length} chars)`,
  '',
  '## Thumbnail text',
  `- ${seo.thumbnailText || titles[0].split(/\s+/).slice(0, 4).join(' ')}`,
  '',
  '## Hashtags',
  `- ${hashtags.join(' ')}`,
  '',
  `## Chapters${useChapters ? '' : ' (not written to YouTube: needs 3+ chapters of 10 s or more)'}`,
  ...chapters.map((c) => `- ${mmss(c.start)} ${c.headline}`),
  '',
  `Approx. runtime ${mmss(totalSeconds)}${manifest ? ' (from voiceover)' : ' (estimated, no voiceover yet)'}.`,
  creditLines.length ? `\nCredits appended to every description:\n${creditLines.map((l) => `- ${l}`).join('\n')}` : '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'titles.md'), titlesMd + '\n');

const pack = {videoId, generatedAt: new Date().toISOString(), title: titles[0], titles, hashtags, keywords, chapters, totalSeconds, credits: creditLines, files: Object.fromEntries(Object.keys(files).map((k) => [k, path.relative(process.cwd(), path.join(outDir, `${k}.json`))])), platforms: files};
fs.writeFileSync(path.join(outDir, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');

console.log(`Publish pack for ${videoId} in ${path.relative(process.cwd(), outDir)}:`);
console.log(`  youtube.json         "${ytTitle}" (${ytTitle.length} chars), ${tags.length} tags (${tagChars} chars), ${useChapters ? chapters.length : 'no'} chapters`);
console.log(`  youtube-shorts.json  "${shortTitle}"`);
console.log(`  instagram.json       caption ${igCaption.length} chars, ${igHashtags.length} hashtags`);
console.log(`  facebook.json        "${facebook.title}"`);
console.log(`  titles.md, pack.json${srtFile ? `, ${path.basename(srtFile)} (captions for YouTube)` : ''}`);
if (!seo.titles?.length) console.log('Tip: fill script.seo.titles / description / keywords / hashtags (Phase 2) for stronger copy; this run used fallbacks from the scenes.');
if (!thumbs.results.length) console.log('Tip: run scripts/make-thumbnails.mjs first so the pack can point at thumbnail files.');
