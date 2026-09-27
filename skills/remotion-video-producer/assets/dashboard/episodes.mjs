/**
 * Episode studio for the dashboard: reads a content plan (weeks -> episodes -> videos), reports what
 * exists for every video, and produces a whole episode in one queued job:
 *
 *   script (episode folder Markdown -> analyzer, or existing JSON, or Claude Code headless)
 *   -> icons -> voice -> captions -> music -> thumbnails -> one render per aspect ratio
 *   -> publish pack -> copy everything into the chosen folder + UPLOAD-DETAILS.md
 *
 * Plan format: references/dashboard.md ("Content plan"). Video ids are `<episodeId>-<variant>`
 * (ep001-long, ep001-short-a); files follow autopilot's layout (out/<id>/<id>_shorts.mp4 ...), so
 * publish.mjs and the Publish buttons work on episode output unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

/** Aspect ratio -> platform prop (sets the frame size), encoding preset, output tag, compositions to try. */
export const RATIOS = {
  '16:9': {tag: 'youtube', platform: 'youtube', preset: 'youtube-1080p', comps: ['YouTube'], label: 'YouTube 16:9'},
  '9:16': {tag: 'shorts', platform: 'shorts', preset: 'shorts', comps: ['Shorts', 'Reels'], label: 'Shorts / Reels 9:16'},
  '4:5': {tag: 'feed', platform: 'feed', preset: 'feed', comps: ['Feed'], label: 'Feed 4:5'},
  '1:1': {tag: 'square', platform: 'square', preset: 'feed', comps: ['Square', 'Feed'], label: 'Square 1:1'},
};

/** Ratios that make sense per video kind: Shorts are vertical (plus feed crops), long videos are 16:9. */
export const RATIOS_FOR_KIND = {short: ['9:16', '4:5', '1:1'], long: ['16:9']};
const allowedRatios = (kind) => RATIOS_FOR_KIND[kind] || RATIOS_FOR_KIND.short;

const AUDIO = /\.(mp3|m4a|wav|aac|ogg)$/i;
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const mtime = (file) => (fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0);
const uniq = (list) => list.filter((v, i, a) => v && a.indexOf(v) === i);

export const createEpisodes = (ctx) => {
  const {cwd, SKILL_DIR, getSettings, log, send, renderTo, cancelSignals, getCompositions} = ctx;
  const publicDir = path.join(cwd, 'public');
  const outDir = path.join(cwd, 'out');

  // ---- plan ------------------------------------------------------------------------------------
  const planPath = () => {
    const configured = getSettings().planFile;
    if (configured) return path.resolve(cwd, configured);
    const local = path.join(cwd, 'automation', 'plan.json');
    return fs.existsSync(local) ? local : null;
  };

  let cache = {file: null, mtime: 0, plan: null, error: null};
  const loadPlan = () => {
    const file = planPath();
    if (!file) return {plan: null, error: 'No content plan yet. Choose a plan file (JSON) or create automation/plan.json.', file: null};
    if (!fs.existsSync(file)) return {plan: null, error: `Plan file not found: ${file}${file.startsWith('/Volumes/') ? ' (is the drive connected? Plug it in and reload)' : ''}`, file};
    const m = mtime(file);
    if (cache.file === file && cache.mtime === m) return cache;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const root = path.resolve(path.dirname(file), raw.root || '.');
      const weeks = (raw.weeks || []).map((w, wi) => ({
        ...w,
        number: w.number ?? wi + 1,
        episodes: (w.episodes || []).map((ep) => ({
          ...ep,
          folderAbs: ep.folder ? path.resolve(root, ep.folder) : null,
          videos: (ep.videos || []).map((v) => ({...v, kind: v.kind || (v.variant === 'long' ? 'long' : 'short'), videoId: `${ep.id}-${v.variant}`})),
        })),
      }));
      cache = {file, mtime: m, error: null, plan: {...raw, root, weeks}};
    } catch (error) {
      cache = {file, mtime: m, error: `Plan file is not valid JSON: ${error.message}`, plan: null};
    }
    return cache;
  };

  const findEpisode = (id) => {
    const {plan} = loadPlan();
    if (!plan) return null;
    for (const week of plan.weeks) for (const ep of week.episodes) if (ep.id === id) return {plan, week, ep};
    return null;
  };

  const whenFor = (plan, ep, video) => (ep.date && video.time ? `${ep.date}T${video.time}:00${plan.utcOffset || 'Z'}` : null);
  const defaultRatios = (plan, video) => {
    const wanted = (plan.defaults?.[video.kind]?.ratios || [allowedRatios(video.kind)[0]]).filter((r) => allowedRatios(video.kind).includes(r));
    return wanted.length ? wanted : [allowedRatios(video.kind)[0]];
  };
  const defaultExportDir = (ep) => (ep.folderAbs ? path.join(ep.folderAbs, 'exports') : path.join(outDir, ep.id));

  const videoStatus = (ep, video) => {
    const id = video.videoId;
    const md = ep.folderAbs ? path.join(ep.folderAbs, `script-${video.variant}.md`) : null;
    const manifest = readJson(path.join(publicDir, 'voiceover', id, 'manifest.json'));
    const renders = Object.fromEntries(Object.entries(RATIOS).map(([ratio, r]) => [ratio, fs.existsSync(path.join(outDir, id, `${id}_${r.tag}.mp4`))]));
    const exported = readJson(path.join(outDir, id, 'export.json'));
    return {
      md: Boolean(md && fs.existsSync(md)),
      script: fs.existsSync(path.join(publicDir, 'script', `${id}.json`)),
      voice: Boolean(manifest),
      renders,
      rendered: Object.values(renders).some(Boolean),
      pack: fs.existsSync(path.join(outDir, id, 'publish', 'pack.json')),
      exported: exported?.dir || null,
    };
  };

  const summary = () => {
    const {plan, error, file} = loadPlan();
    if (!plan) return {file, error, weeks: []};
    return {
      file,
      error: null,
      title: plan.title || path.basename(file),
      root: plan.root,
      style: plan.style || null,
      handle: plan.handle || '',
      timezone: plan.timezone || '',
      defaults: plan.defaults || {},
      ratios: Object.fromEntries(Object.entries(RATIOS).map(([k, r]) => [k, r.label])),
      musicLibrary: plan.musicLibrary ? path.resolve(plan.root, plan.musicLibrary) : null,
      weeks: plan.weeks.map((w) => ({
        number: w.number,
        title: w.title,
        pillar: w.pillar,
        background: w.background,
        playlist: w.playlist,
        start: w.start,
        month: w.month,
        episodes: w.episodes.map((ep) => ({
          id: ep.id,
          date: ep.date,
          topic: ep.topic,
          folder: ep.folderAbs,
          exportDir: defaultExportDir(ep),
          videos: ep.videos.map((v) => ({variant: v.variant, kind: v.kind, time: v.time, title: v.title, hook: v.hook, videoId: v.videoId, when: whenFor(plan, ep, v), ratios: defaultRatios(plan, v), allowed: allowedRatios(v.kind), status: videoStatus(ep, v)})),
        })),
      })),
    };
  };

  // ---- upload details --------------------------------------------------------------------------
  const details = (episodeId) => {
    const found = findEpisode(episodeId);
    if (!found) return null;
    const {plan, week, ep} = found;
    return {
      id: ep.id,
      topic: ep.topic,
      date: ep.date,
      week: {number: week.number, title: week.title, playlist: week.playlist},
      handle: plan.handle || '',
      exportDir: defaultExportDir(ep),
      videos: ep.videos.map((v) => {
        const id = v.videoId;
        const dir = path.join(outDir, id);
        const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
        const pack = readJson(path.join(dir, 'publish', 'pack.json'));
        const srt = fs.existsSync(path.join(dir, 'publish', `${id}.srt`)) ? `${id}/publish/${id}.srt` : null;
        return {
          variant: v.variant,
          kind: v.kind,
          time: v.time,
          when: whenFor(plan, ep, v),
          planTitle: v.title,
          hook: v.hook,
          videoId: id,
          videos: files.filter((f) => f.endsWith('.mp4')).map((f) => ({file: `${id}/${f}`, ratio: Object.keys(RATIOS).find((k) => f.endsWith(`_${RATIOS[k].tag}.mp4`)) || ''})),
          thumbnails: files.filter((f) => /\.(jpg|png)$/i.test(f)).map((f) => `${id}/${f}`),
          srt,
          pack,
          exported: readJson(path.join(dir, 'export.json'))?.dir || null,
        };
      }),
    };
  };

  const detailsMarkdown = (d) => {
    const block = (text) => ['```text', String(text || '').trim(), '```'].join('\n');
    const lines = [`# ${d.id.toUpperCase()}: ${d.topic}`, '', `Week ${d.week.number}: ${d.week.title} · playlist "${d.week.playlist || ''}" · ${d.date || ''}`, ''];
    for (const v of d.videos) {
      const p = v.pack?.platforms;
      lines.push(`## ${v.variant === 'long' ? 'Long video' : v.variant === 'short-a' ? 'Short A' : v.variant === 'short-b' ? 'Short B' : v.variant} · ${v.time || ''}${v.when ? ` · schedule ${v.when}` : ''}`, '');
      lines.push(`Files: ${v.variant}/ (${v.videos.map((f) => path.basename(f.file)).join(', ') || 'no video yet'})`, '');
      if (!p) {
        lines.push('_No publish pack yet: generate this video first._', '');
        continue;
      }
      if (v.kind === 'long') {
        lines.push('### YouTube', '', `**Title:** ${p.youtube.title}`, '', 'Other title options:', ...v.pack.titles.slice(1, 4).map((t) => `- ${t}`), '', '**Description:**', block(p.youtube.description), '', `**Tags:** ${p.youtube.tags.join(', ')}`, '', `**Category id:** ${p.youtube.categoryId} · **Thumbnail:** ${v.variant}/thumbnail.jpg${v.srt ? ` · **Captions:** ${v.variant}/publish/${path.basename(v.srt)}` : ''}`, '');
        lines.push('### Facebook (page video)', '', `**Title:** ${p.facebook.title}`, '', block(p.facebook.description), '');
      } else {
        lines.push('### YouTube Shorts', '', `**Title:** ${p['youtube-shorts'].title}`, '', block(p['youtube-shorts'].description), '', `**Tags:** ${p['youtube-shorts'].tags.join(', ')}`, '');
        lines.push('### Instagram Reels', '', block(p.instagram.caption), '');
        lines.push('### Facebook Reels', '', `**Title:** ${p.facebook.title}`, '', block(p.facebook.description), '');
      }
    }
    return lines.join('\n') + '\n';
  };

  // ---- pipeline ---------------------------------------------------------------------------------
  const runChild = (job, label, cmd, args, {okCodes = [], timeoutMs = 60 * 60_000, env = {}} = {}) =>
    new Promise((resolve) => {
      let out = '';
      let child;
      try {
        child = spawn(cmd, args, {cwd, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, REMOTION_GL: getSettings().gl, REMOTION_BUDGET: String(getSettings().budget), ...env}}); // no stdin: claude -p would wait 3 s for it
      } catch (error) {
        resolve({code: -1, ok: false, out: error.message});
        return;
      }
      const onData = (d) => {
        const text = String(d);
        out = (out + text).slice(-50_000);
        text.split('\n').forEach((l) => log(label, l));
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
      cancelSignals.set(job.id, {cancel: () => child.kill('SIGTERM')});
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({code: -1, ok: false, out: error.message});
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        cancelSignals.delete(job.id);
        resolve({code, ok: code === 0 || okCodes.includes(code), out});
      });
    });

  const skillScript = (name) => path.join(SKILL_DIR, 'scripts', name);
  const node = process.execPath;

  const writerPrompt = (plan, week, ep, video) => {
    const own = path.join(cwd, 'automation', 'writer-prompt.md');
    const file = fs.existsSync(own) ? own : path.join(SKILL_DIR, 'assets', 'automation', 'writer-prompt.md');
    const hook = video.hook || ep.videos.find((x) => x.variant === 'short-a')?.hook || '';
    const topic = video.kind === 'long' ? `${video.title} (episode topic: ${ep.topic})` : `${ep.topic}. On-screen hook at frame 1: "${hook}"`;
    const vars = {
      videoId: video.videoId,
      topic,
      kind: video.kind,
      style: plan.style || 'auto',
      targetSeconds: String(plan.targetSeconds?.[video.kind] || (video.kind === 'long' ? 420 : 45)),
      voicePreset: plan.voicePreset || 'young-male-pro',
      handle: plan.handle || '@yourhandle',
      skillDir: SKILL_DIR,
      platforms: video.kind === 'long' ? 'youtube, facebook-video' : 'youtube-shorts, instagram, facebook',
    };
    const extra = [
      '',
      'Episode context (from the content plan):',
      `- Series: week ${week.number} "${week.title}" (${week.pillar || ''}); episode ${ep.id} "${ep.topic}", publishes ${ep.date || ''} ${video.time || ''}.`,
      `- Title: "${video.title || ep.topic}".`,
      hook ? `- Scene 1 opens with this hook on screen and in the voiceover: "${hook}".` : '',
      plan.signOff ? `- Last line of the voiceover: "${plan.signOff}".` : '',
      plan.writerNotes ? `- ${plan.writerNotes}` : '',
    ].filter(Boolean);
    return fs.readFileSync(file, 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '') + extra.join('\n') + '\n';
  };

  const pickLibraryTrack = (plan, id) => {
    if (!plan.musicLibrary) return null;
    const dir = path.resolve(plan.root, plan.musicLibrary);
    if (!fs.existsSync(dir)) return null;
    const tracks = fs.readdirSync(dir).filter((f) => AUDIO.test(f)).sort();
    if (!tracks.length) return null;
    // Stable choice per video, so a re-run keeps the same track.
    const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const file = tracks[hash % tracks.length];
    const credits = readJson(path.join(dir, 'credits.json'), {});
    return {file: path.join(dir, file), name: file, credit: credits[file] || null};
  };

  const buildSteps = (videos) => {
    const steps = [];
    for (const v of videos) {
      const add = (key, label) => steps.push({key: `${v.variant}:${key}`, variant: v.variant, label, status: 'pending'});
      add('script', 'Script');
      add('icons', 'Icons');
      add('voice', 'Voice');
      add('captions', 'Captions');
      add('music', 'Music');
      add('thumbnails', 'Thumbnails');
      for (const ratio of v.ratios) add(`render:${ratio}`, `Render ${ratio}`);
      add('pack', 'Upload details');
      add('export', 'Save to folder');
    }
    return steps;
  };

  const runEpisode = async (job) => {
    const found = findEpisode(job.options.episodeId);
    if (!found) throw new Error(`Episode ${job.options.episodeId} is not in the plan`);
    const {plan, week, ep} = found;
    const o = job.options;
    const selected = ep.videos
      .map((v) => ({...v, ratios: ((o.videos || []).find((x) => x.variant === v.variant)?.ratios || []).filter((r) => allowedRatios(v.kind).includes(r))}))
      .filter((v) => v.ratios && v.ratios.length);
    if (!selected.length) throw new Error('Select at least one video and one aspect ratio');
    const exportBase = path.resolve(o.outDir || defaultExportDir(ep));
    job.exportDir = exportBase;
    job.steps = buildSteps(selected);
    const setStep = (key, status, detail) => {
      const st = job.steps.find((x) => x.key === key);
      if (st) Object.assign(st, {status, ...(detail !== undefined ? {detail} : {})});
      const done = job.steps.filter((x) => ['done', 'skipped', 'failed', 'notrun'].includes(x.status)).length;
      job.progress = done / job.steps.length;
      job.current = status === 'running' ? `${key}` : job.current;
      send('jobs', ctx.jobs);
    };
    const cancelled = () => job.status === 'cancelled';
    job.status = 'running';
    job.startedAt = Date.now();
    send('jobs', ctx.jobs);
    let failures = 0;

    for (const v of selected) {
      if (cancelled()) break;
      const id = v.videoId;
      const k = (s) => `${v.variant}:${s}`;
      const scriptFile = path.join(publicDir, 'script', `${id}.json`);
      const vOut = path.join(outDir, id);
      fs.mkdirSync(vOut, {recursive: true});
      const fail = (step, message) => {
        setStep(k(step), 'failed', message);
        for (const st of job.steps) if (st.variant === v.variant && st.status === 'pending') st.status = 'notrun';
        failures++;
        log('episode', `${id}: ${step} failed: ${message}`);
        send('jobs', ctx.jobs);
      };

      // 1. Script: the episode folder's Markdown wins when it is newer (or on Redo); else the existing JSON; else the writer.
      setStep(k('script'), 'running');
      const md = ep.folderAbs ? path.join(ep.folderAbs, `script-${v.variant}.md`) : null;
      const topicKeyword = ep.topic?.toLowerCase();
      const keywords = uniq([...(plan.keywords || []), topicKeyword]).join(', ');
      let scriptSource = null;
      if (md && fs.existsSync(md) && (o.regenerate || !fs.existsSync(scriptFile) || mtime(md) > mtime(scriptFile))) {
        const pacing = plan.defaults?.[v.kind]?.pacing || (v.kind === 'long' ? 'medium' : 'fast');
        const r = await runChild(job, 'analyze', node, [skillScript('analyze-script.mjs'), md, '--id', id, '--pacing', pacing, '--voice-preset', plan.voicePreset || 'young-male-pro', ...(plan.style ? ['--style', plan.style] : []), ...(keywords ? ['--keywords', keywords] : []), '--out', path.join('public', 'script', `${id}.json`)]);
        if (!r.ok || !fs.existsSync(scriptFile)) {
          fail('script', `analyzer failed on ${md}`);
          continue;
        }
        scriptSource = 'md';
        setStep(k('script'), 'done', 'from episode folder');
      } else if (fs.existsSync(scriptFile)) {
        setStep(k('script'), 'done', 'existing script');
      } else if ((o.writer || getSettings().writer) === 'claude') {
        // Sonnet by default: a script does not need the largest model, and it uses less of a Claude plan.
        const model = o.writerModel || getSettings().writerModel || 'sonnet';
        const r = await runChild(job, 'writer', process.env.CLAUDE_BIN || 'claude', ['-p', writerPrompt(plan, week, ep, v), ...(model === 'default' ? [] : ['--model', model]), '--output-format', 'text', '--max-turns', '80', '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(node *),Bash(npx remotion compositions*),Bash(ls *),Bash(cat *)'], {timeoutMs: 25 * 60_000, env: {CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: ''}});
        if (!fs.existsSync(scriptFile)) {
          fail('script', r.code === -1 ? 'claude CLI not found: install Claude Code or add script-*.md files to the episode folder'
            : /not logged in|\/login|invalid api key|authentication/i.test(r.out) ? 'Claude Code is not logged in: open Terminal, run claude, type /login, then Generate again (or add ' + `script-${v.variant}.md` + ' to the episode folder)'
            : 'the writer finished without public/script/' + id + '.json');
          continue;
        }
        setStep(k('script'), 'done', 'written by Claude Code');
      } else {
        fail('script', `no script: add ${md ? path.basename(md) + ' to the episode folder' : 'public/script/' + id + '.json'} or switch the writer to Claude Code`);
        continue;
      }
      if (cancelled()) break;

      // Brand and plan data into the script: style, titles, category, logo, hashtags.
      const script = readJson(scriptFile);
      script.videoId = id;
      if (plan.style) script.style = plan.style;
      script.seo = script.seo || {};
      if (v.title) script.seo.titles = uniq([v.title, ...(script.seo.titles || [])]);
      if (plan.category) script.seo.category = plan.category;
      // The analyzer seeds keywords with each scene's highlight word ("ocean", "request"); for scripts
      // it just built, the plan's keywords and the topic are the better tags. Writer scripts keep theirs.
      const topicTag = topicKeyword ? '#' + topicKeyword.replace(/[^a-z0-9]/g, '') : null;
      if (scriptSource === 'md') {
        script.seo.keywords = uniq([...(plan.keywords || []), topicKeyword]);
        script.seo.hashtags = uniq([...(plan.hashtags || []), topicTag]);
      } else {
        script.seo.keywords = uniq([...(plan.keywords || []), topicKeyword, ...(script.seo.keywords || [])]);
      }
      if (plan.language && !script.seo.language) script.seo.language = plan.language;
      if (v.thumbnailText && !script.seo.thumbnailText) script.seo.thumbnailText = v.thumbnailText;
      if (plan.hashtags && scriptSource !== 'md') script.seo.hashtags = uniq([...plan.hashtags, ...(script.seo.hashtags || [])]);
      if (plan.cta) script.seo.cta = plan.cta;
      if (plan.logo && !script.logo) {
        const src = path.resolve(plan.root, plan.logo);
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.join(publicDir, 'brand'), {recursive: true});
          fs.copyFileSync(src, path.join(publicDir, 'brand', path.basename(src)));
          script.logo = {src: `brand/${path.basename(src)}`, corner: 'top-left'};
        }
      }
      fs.writeFileSync(scriptFile, JSON.stringify(script, null, 2) + '\n');
      if (ep.folderAbs) {
        fs.mkdirSync(ep.folderAbs, {recursive: true});
        fs.copyFileSync(scriptFile, path.join(ep.folderAbs, `script-${v.variant}.json`));
      }

      // A script edited after it was voiced invalidates the voice, thumbnails and renders.
      const manifestPath = path.join(publicDir, 'voiceover', id, 'manifest.json');
      const redo = Boolean(o.regenerate) || (scriptSource === 'md' && fs.existsSync(manifestPath) && mtime(md) > mtime(manifestPath));
      if (redo && !o.regenerate) log('episode', `${id}: script changed since the last voice; re-voicing and re-rendering`);

      // 2. Icons.
      const wantsIcons = script.scenes.some((sc) => sc.visual?.icons?.length) || script.logo?.icon;
      if (wantsIcons) {
        setStep(k('icons'), 'running');
        const r = await runChild(job, 'icons', node, [skillScript('fetch-icons.mjs'), '--from-script', path.join('public', 'script', `${id}.json`)], {okCodes: [2], timeoutMs: 5 * 60_000});
        setStep(k('icons'), r.ok ? 'done' : 'failed', r.code === 2 ? 'some icons missing (see log)' : undefined);
      } else setStep(k('icons'), 'skipped', 'no icons in script');
      if (cancelled()) break;

      // 3. Voice (word timing comes back in the manifest).
      const manifestFile = path.join(publicDir, 'voiceover', id, 'manifest.json');
      if (fs.existsSync(manifestFile) && !redo) setStep(k('voice'), 'skipped', 'already voiced');
      else {
        setStep(k('voice'), 'running');
        const provider = o.voiceProvider || getSettings().voiceProvider || 'elevenlabs';
        const r = await runChild(job, 'voice', node, [skillScript('generate-voiceover.mjs'), '--script', path.join('public', 'script', `${id}.json`), '--provider', provider, '--voice-preset', script.voice?.preset || plan.voicePreset || 'young-male-pro'], {timeoutMs: 20 * 60_000});
        if (!r.ok) {
          fail('voice', `${provider} voice failed (check the key in .env, or pick the macOS draft voice)`);
          continue;
        }
        setStep(k('voice'), 'done', provider);
      }
      if (cancelled()) break;

      // 4. Captions: ElevenLabs returns word timing; Whisper only fills gaps.
      const manifest = readJson(manifestFile);
      if (manifest?.scenes?.every((sc) => sc.captions?.length)) setStep(k('captions'), 'skipped', 'word timing from voice');
      else {
        setStep(k('captions'), 'running');
        const r = await runChild(job, 'captions', node, [skillScript('transcribe-whisper.mjs'), path.join('public', 'voiceover', id), '--model', 'medium.en'], {timeoutMs: 30 * 60_000});
        setStep(k('captions'), r.ok ? 'done' : 'skipped', r.ok ? 'Whisper' : 'Whisper unavailable; captions follow scene text');
      }
      if (cancelled()) break;

      // 5. Music: a track from the plan's library folder, a generated bed, or none.
      const musicMode = o.music || getSettings().music || 'library';
      if (script.music?.src && !redo) setStep(k('music'), 'skipped', 'already set');
      else if (musicMode === 'off') setStep(k('music'), 'skipped', 'off');
      else {
        setStep(k('music'), 'running');
        let track = musicMode === 'library' ? pickLibraryTrack(plan, id) : null;
        if (track) {
          fs.mkdirSync(path.join(publicDir, 'music'), {recursive: true});
          const dest = `${id}${path.extname(track.name)}`;
          fs.copyFileSync(track.file, path.join(publicDir, 'music', dest));
          script.music = {src: `music/${dest}`, level: script.music?.level ?? 0.16, ...(track.credit ? {credit: track.credit} : {})};
          setStep(k('music'), 'done', `library: ${track.name}`);
        } else {
          const r = await runChild(job, 'music', node, [skillScript('generate-music.mjs'), '--id', id, '--mood', script.music?.mood || plan.music || 'energetic-tech'], {okCodes: [2], timeoutMs: 10 * 60_000});
          const generated = path.join(publicDir, 'music', `${id}.mp3`);
          if (r.ok && fs.existsSync(generated)) {
            script.music = {src: `music/${id}.mp3`, level: script.music?.level ?? 0.16, credit: 'Generated with ElevenLabs Music', mood: script.music?.mood || plan.music || 'energetic-tech'};
            setStep(k('music'), 'done', musicMode === 'library' ? 'library empty: generated' : 'generated');
          } else setStep(k('music'), 'skipped', 'no music (no tracks in the library and no ElevenLabs key)');
        }
        fs.writeFileSync(scriptFile, JSON.stringify(script, null, 2) + '\n');
      }
      if (cancelled()) break;

      // 6. Thumbnails and covers.
      if (fs.existsSync(path.join(vOut, 'thumbnails.json')) && !redo) setStep(k('thumbnails'), 'skipped', 'already made');
      else {
        setStep(k('thumbnails'), 'running');
        const r = await runChild(job, 'thumbnails', node, [skillScript('make-thumbnails.mjs'), '--video', id], {timeoutMs: 15 * 60_000});
        setStep(k('thumbnails'), r.ok ? 'done' : 'failed', r.ok ? undefined : 'see log');
      }
      if (cancelled()) break;

      // 7. One render per aspect ratio.
      const available = getCompositions();
      let renderFailed = false;
      for (const ratio of v.ratios) {
        if (cancelled()) break;
        const r = RATIOS[ratio];
        if (!r) {
          setStep(k(`render:${ratio}`), 'skipped', 'unknown ratio');
          continue;
        }
        const file = path.join(vOut, `${id}_${r.tag}.mp4`);
        if (fs.existsSync(file) && !redo) {
          setStep(k(`render:${ratio}`), 'skipped', 'already rendered');
          continue;
        }
        setStep(k(`render:${ratio}`), 'running');
        const compositionId = r.comps.find((c) => available.includes(c)) || available.find((c) => ['Shorts', 'YouTube', 'Feed', 'Reels'].includes(c)) || r.comps[0];
        try {
          const res = await renderTo({
            compositionId,
            preset: r.preset,
            inputProps: {videoId: id, platform: r.platform, ...(week.background ? {background: week.background} : {}), ...(plan.endCard ? {endCard: plan.endCard} : {})},
            outputLocation: file,
            fourK: o.fourK ?? getSettings().fourK,
            hw: o.hw ?? getSettings().hw,
            budget: getSettings().budget,
            jobForBundle: job,
            cancelKey: job.id,
            onStart: (info) => {
              job.status = 'running';
              job.render = {ratio, size: `${info.width}x${info.height}@${info.fps}`, encoder: info.encoder, concurrency: info.concurrency, progress: 0};
              log('episode', `${id} ${ratio} -> ${path.relative(cwd, file)} | ${job.render.size} | ${info.concurrency} tabs | ${info.encoder}`);
              send('jobs', ctx.jobs);
            },
            onProgress: (p) => {
              job.render = {...job.render, ...p};
              const done = job.steps.filter((x) => ['done', 'skipped', 'failed', 'notrun'].includes(x.status)).length;
              job.progress = (done + p.progress) / job.steps.length;
              send('jobs', ctx.jobs);
            },
          });
          setStep(k(`render:${ratio}`), 'done', `${res.width}x${res.height} · ${(res.bytes / 1048576).toFixed(1)} MB · ${res.seconds} s`);
        } catch (error) {
          if (cancelled()) break;
          renderFailed = true;
          fail(`render:${ratio}`, error.message.split('\n')[0].slice(0, 200));
          break;
        } finally {
          job.render = null;
        }
      }
      if (cancelled() || renderFailed) continue;

      // 8. Upload details (per-platform titles, descriptions, tags, hashtags, chapters, SRT).
      setStep(k('pack'), 'running');
      const packArgs = [skillScript('make-publish-pack.mjs'), '--video', id, ...(plan.handle ? ['--handle', plan.handle] : []), ...(plan.site ? ['--site', plan.site] : []), ...(v.title ? [v.kind === 'long' ? '--long-title' : '--short-title', v.title] : [])];
      const pr = await runChild(job, 'pack', node, packArgs, {timeoutMs: 60_000});
      if (!pr.ok) {
        fail('pack', 'see log');
        continue;
      }
      setStep(k('pack'), 'done');

      // 9. Copy videos, thumbnails, upload details and the script into the chosen folder.
      setStep(k('export'), 'running');
      try {
        const dest = path.join(exportBase, v.variant);
        fs.mkdirSync(dest, {recursive: true});
        for (const f of fs.readdirSync(vOut)) {
          const src = path.join(vOut, f);
          if (fs.statSync(src).isDirectory()) {
            if (f === 'publish') fs.cpSync(src, path.join(dest, 'publish'), {recursive: true});
          } else if (/\.(mp4|jpg|png)$/i.test(f)) fs.copyFileSync(src, path.join(dest, f));
        }
        fs.copyFileSync(scriptFile, path.join(dest, `${id}.script.json`));
        fs.writeFileSync(path.join(vOut, 'export.json'), JSON.stringify({dir: dest, at: new Date().toISOString()}, null, 2));
        setStep(k('export'), 'done', dest);
      } catch (error) {
        fail('export', error.message);
      }
    }

    // One human-readable file with every platform's copy for the whole episode.
    try {
      const d = details(ep.id);
      if (d && fs.existsSync(exportBase)) fs.writeFileSync(path.join(exportBase, 'UPLOAD-DETAILS.md'), detailsMarkdown(d));
    } catch (error) {
      log('episode', `UPLOAD-DETAILS.md not written: ${error.message}`);
    }
    send('plan', summary());
    if (cancelled()) return;
    if (failures) throw new Error(`${failures} step(s) failed. See the steps list and log.`);
  };

  return {summary, details, detailsMarkdown, runEpisode, loadPlan, defaultExportDir, findEpisode};
};
