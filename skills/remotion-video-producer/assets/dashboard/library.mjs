/**
 * Library: topic packages on this machine (one folder per episode, prepared once), their stage, validation,
 * voice cost, music, storyboard stills, renders and QC, and one "Generate" job that runs only the steps a
 * package still needs: stills, voice, music, render. Every step keeps its finished work, so a failed or
 * cancelled job resumes where it stopped. No Claude calls: packages already hold the script and storyboard.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

/** Share of the job's progress bar per step (rendering dominates the time). */
const WEIGHT = {stills: 0.1, voice: 0.1, music: 0.05, render: 0.72, thumbs: 0.03};

export const createLibrary =({cwd, SKILL_DIR, getSettings, log, send, cancelSignals, jobs}) => {
  let schema = null;
  const loadSchema = async () => (schema ??= await import(pathToFileURL(path.join(SKILL_DIR, 'scripts', 'lib', 'package-schema.mjs')).href));
  const root = () => path.resolve(getSettings().libraryDir || path.join(cwd, 'library'));
  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };

  /** Package folders up to two levels down (library/ep001 or library/week-01/ep001). Id = relative path. */
  const scan = () => {
    const base = root();
    if (!fs.existsSync(base)) return [];
    const found = [];
    const walk = (dir, depth) => {
      if (fs.existsSync(path.join(dir, 'production.json'))) return found.push(dir);
      if (depth >= 2) return;
      for (const e of fs.readdirSync(dir, {withFileTypes: true})) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'renders') walk(path.join(dir, e.name), depth + 1);
    };
    walk(base, 0);
    return found.map((dir) => ({id: path.relative(base, dir).split(path.sep).join('/') || '@root', dir}));
  };
  const dirOf = (id) => {
    const full = id === '@root' ? root() : path.resolve(root(), String(id || ''));
    return (full === root() || full.startsWith(root() + path.sep)) && fs.existsSync(path.join(full, 'production.json')) ? full : null;
  };

  const summary = async () => {
    const s = await loadSchema();
    const items = scan().map(({id, dir}) => {
      const pkg = readJson(path.join(dir, 'package.json')) ?? {};
      let report;
      try {
        report = s.validatePackage(dir, {projectDir: cwd});
      } catch (error) {
        report = {stage: null, errors: [error.message], warnings: [], videos: {}};
      }
      const videos = Object.fromEntries(Object.entries(report.videos ?? {}).map(([v, r]) => [v, {estimated: Math.round(r.estimatedSeconds ?? 0), measured: r.measuredSeconds == null ? null : Math.round(r.measuredSeconds), render: r.render ?? null}]));
      return {id, title: pkg.title ?? id, topic: pkg.topic ?? '', week: pkg.week ?? null, date: pkg.date ?? null, episode: pkg.id ?? id, stage: report.stage, errors: report.errors.length, warnings: report.warnings.length, videos};
    });
    items.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || a.id.localeCompare(b.id));
    return {root: root(), exists: fs.existsSync(root()), items};
  };

  const details = async (id) => {
    const dir = dirOf(id);
    if (!dir) return null;
    const s = await loadSchema();
    const report = s.validatePackage(dir, {projectDir: cwd});
    const pkg = readJson(path.join(dir, 'package.json')) ?? {};
    const production = readJson(path.join(dir, 'production.json')) ?? {videos: []};
    const credits = readJson(path.join(dir, 'music', 'credits.json')) ?? {};
    const manifest = readJson(path.join(dir, 'renders', 'render-manifest.json')) ?? {};
    const videos = production.videos.map((v) => {
      const timing = readJson(path.join(dir, 'voice', v.id, 'timing.json'));
      const stills = readJson(path.join(dir, 'renders', v.id, 'stills', 'stills.json')) ?? {};
      const qc = readJson(path.join(dir, 'renders', v.id, 'qc.json'));
      const thumbDir = path.join(dir, 'renders', 'thumbs');
      const thumb = fs.existsSync(thumbDir) ? fs.readdirSync(thumbDir).find((f) => f.endsWith(`_${v.id}_thumbnail.jpg`)) : null;
      const upload = readJson(path.join(dir, 'upload', `${v.id}.json`));
      // Chapters are written as [sceneId, title]; their times exist once the voice is measured.
      const starts = report.videos?.[v.id]?.starts ?? {};
      if (upload && Array.isArray(upload.chapters) && Object.keys(starts).length) {
        const stamp = (s) => {
          const t = Math.floor(s);
          const h = Math.floor(t / 3600);
          const mm = Math.floor((t % 3600) / 60);
          const ss = String(t % 60).padStart(2, '0');
          return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
        };
        upload.chapterText = upload.chapters.filter(([sid]) => starts[sid] != null).map(([sid, title]) => `${stamp(starts[sid])} ${title}`).join('\n');
      }
      return {
        id: v.id,
        ratio: v.ratio,
        title: v.title,
        target: v.targetSeconds ?? null,
        report: report.videos?.[v.id] ?? null,
        voice: timing ? {provider: timing.provider, voiceId: timing.voiceId, model: timing.model, characters: (timing.chunks ?? []).reduce((a, c) => a + (c.characters ?? 0), 0), chunks: (timing.chunks ?? []).map((c) => c.file), generatedAt: timing.generatedAt} : null,
        music: pkg.music?.[v.id] ? {...pkg.music[v.id], credits: credits[v.id] ?? null, exists: fs.existsSync(path.join(dir, pkg.music[v.id].file))} : null,
        render: manifest[v.id] ?? null,
        thumb: thumb ? `renders/thumbs/${thumb}` : null,
        draft: manifest[`${v.id}-draft`] ?? null,
        qc,
        upload,
        scenes: v.scenes.map((sc) => ({id: sc.id, headline: sc.headline, kind: sc.visual?.kind, narration: sc.narration, sources: sc.sources ?? [], sourceNote: sc.sourceNote ?? null, still: stills[sc.id]?.file ? `renders/${v.id}/stills/${stills[sc.id].file}` : null, voiced: Boolean(timing?.scenes?.[sc.id])})),
      };
    });
    return {id, dir, pkg, stage: report.stage, errors: report.errors, warnings: report.warnings, todo: report.todo ?? [], pace: report.pace ?? null, sources: readJson(path.join(dir, 'research', 'sources.json')) ?? [], videos};
  };

  /** Characters ElevenLabs would bill for the chunks that are not voiced yet (offline dry run). */
  const estimate = (id, provider) => {
    const dir = dirOf(id);
    if (!dir) return null;
    const res = spawnSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'package-voice.mjs'), dir, '--dry-run', ...(provider ? ['--provider', provider] : [])], {cwd, encoding: 'utf8', timeout: 30_000});
    const rows = (res.stdout || '').split('\n').filter((l) => l.startsWith('ESTIMATE ')).map((l) => JSON.parse(l.slice(9)));
    return {videos: rows, characters: rows.reduce((a, r) => a + r.characters, 0), error: res.status === 0 ? null : (res.stderr || '').trim().split('\n').pop()};
  };

  /** Unzip a package zip into the library. Returns the new package ids. */
  const importZip = (zip) => {
    const src = path.resolve(String(zip || ''));
    if (!fs.existsSync(src) || !src.toLowerCase().endsWith('.zip')) throw new Error('Choose a .zip file');
    const before = new Set(scan().map((p) => p.id));
    fs.mkdirSync(root(), {recursive: true});
    const tmp = fs.mkdtempSync(path.join(root(), '.import-'));
    try {
      const res = process.platform === 'darwin' ? spawnSync('ditto', ['-x', '-k', src, tmp], {encoding: 'utf8'}) : spawnSync('unzip', ['-q', src, '-d', tmp], {encoding: 'utf8'});
      if (res.status !== 0) throw new Error(`Could not unzip: ${(res.stderr || '').trim()}`);
      // The zip may hold the package folder itself or its contents; skip macOS resource folders.
      const top = fs.readdirSync(tmp).filter((n) => n !== '__MACOSX' && !n.startsWith('.'));
      const pkgDir = fs.existsSync(path.join(tmp, 'production.json')) ? tmp : top.length === 1 && fs.existsSync(path.join(tmp, top[0], 'production.json')) ? path.join(tmp, top[0]) : null;
      if (!pkgDir) throw new Error('No production.json found in the zip (expected one episode package folder)');
      const pkg = readJson(path.join(pkgDir, 'package.json')) ?? {};
      const name = String(pkg.id && pkg.topic ? `${pkg.id}-${pkg.topic}` : pkg.id || path.basename(src, '.zip')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      const dest = path.join(root(), name);
      if (fs.existsSync(dest)) {
        // Re-import over an existing package: keep its voice, music and renders (they are keyed by content).
        for (const e of fs.readdirSync(pkgDir)) fs.cpSync(path.join(pkgDir, e), path.join(dest, e), {recursive: true, force: true});
      } else {
        fs.cpSync(pkgDir, dest, {recursive: true});
      }
      log('library', `Imported ${path.basename(src)} -> ${path.relative(root(), dest)}`);
      return scan().map((p) => p.id).filter((i) => !before.has(i) || i === path.relative(root(), dest));
    } finally {
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  };

  // ---- the Generate job ------------------------------------------------------------------------------
  const runStep = (job, step, script, args, onLine) =>
    new Promise((resolve, reject) => {
      step.status = 'running';
      step.startedAt = Date.now();
      send('jobs', jobs);
      const settings = getSettings();
      const child = spawn(process.execPath, [path.join(SKILL_DIR, 'scripts', script), ...args], {cwd, env: {...process.env, REMOTION_GL: settings.gl}});
      cancelSignals.set(job.id, {cancel: () => child.kill('SIGTERM')});
      child.on('error',(error) => {cancelSignals.delete(job.id);step.status='failed';step.detail=error.message;send('jobs',jobs);reject(error);});
      let last = '';
      let reason = '';
      const onData = (d) => {
        for (const line of String(d).split('\n')) {
          if (!line.trim()) continue;
          if (line.startsWith('PROGRESS ')) {
            try {
              onLine?.(JSON.parse(line.slice(9)));
            } catch {
              /* partial line */
            }
            continue;
          }
          last = line.trim();
          // The scripts print failures as "ERROR <message>"; that line (not Node's stack dump) is the reason.
          if (/^ERROR /.test(last) && !/^ERROR hint:/.test(last)) reason = last.slice(6);
          log(step.key, line);
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('close', (code) => {
        cancelSignals.delete(job.id);
        step.endedAt = Date.now();
        if (job.status === 'cancelled') {
          step.status = 'failed';
          step.detail = 'cancelled';
          return reject(new Error('Cancelled'));
        }
        if (code === 0) {
          step.status = 'done';
          step.detail = step.detail || last.slice(0, 160);
          send('jobs', jobs);
          return resolve();
        }
        step.status = 'failed';
        step.detail = (reason || last).slice(0, 300);
        send('jobs', jobs);
        reject(new Error(`${step.label}: ${reason || last || `exited with code ${code}`}`));
      });
    });

  const run = async (job) => {
    const o = job.options;
    const dir = dirOf(o.id);
    if (!dir) throw new Error(`Package ${o.id} not found in ${root()}`);
    const settings = getSettings();
    const videoArgs = o.videos.length === 1 ? ['--video', o.videos[0]] : ['--video', 'all'];
    const steps = [];
    if (o.stills) steps.push({key: 'stills', label: 'Storyboard stills', status: 'queued'});
    if (o.voice) steps.push({key: 'voice', label: o.voiceProvider === 'macos' ? 'Draft voice (macOS)' : 'Voice (ElevenLabs)', status: 'queued'});
    if (o.music) steps.push({key: 'music', label: 'Music', status: 'queued'});
    if (o.render) steps.push({key: 'render', label: o.draft ? 'Draft render' : `Render${o.fourK ? ' 4K' : ''}`, status: 'queued'});
    // Thumbnails are quick: made with the storyboard and again with every render, so they follow the package.
    if (o.stills || o.render) steps.push({key: 'thumbs', label: 'Thumbnails', status: 'queued'});
    job.steps = steps;
    job.status = 'running';
    job.startedAt = Date.now();
    send('jobs', jobs);
    const total = steps.reduce((a, s) => a + WEIGHT[s.key], 0);
    let doneWeight = 0;
    const setProgress = (key, fraction) => {
      job.progress = Math.min(1, (doneWeight + WEIGHT[key] * fraction) / total);
      send('jobs', jobs);
    };
    try {
      await runSteps(job, o, dir, settings, steps, videoArgs, setProgress, (w) => (doneWeight += w));
    } finally {
      // After a failure or cancel the remaining steps read "not run", and the library shows what was finished.
      for (const step of steps) if (step.status === 'queued') step.status = 'notrun';
      send('jobs', jobs);
      send('library', await summary());
    }
  };

  const runSteps = async (job, o, dir, settings, steps, videoArgs, setProgress, addDone) => {
    for (const step of steps) {
      if (job.status === 'cancelled') break;
      const perVideo = {};
      const onProgress = (p) => {
        if (p.index && p.of) {
          perVideo[p.video] = (p.index - 1 + (p.status === 'rendering' ? p.progress ?? 0 : p.status === 'done' || p.status === 'cached' ? 1 : 0)) / p.of;
          const frac = o.videos.reduce((a, v) => a + (perVideo[v] ?? 0), 0) / o.videos.length;
          step.detail = `${p.video} · scene ${p.index}/${p.of}${p.status === 'cached' ? ' (kept)' : ''}`;
          setProgress(step.key, frac);
        } else if (p.stage) {
          step.detail = `${p.video} · ${p.stage === 'audio' ? 'sound' : p.stage === 'mux' ? 'joining' : p.stage === 'qc' ? 'checking' : p.status}`;
          send('jobs', jobs);
        }
      };
      if (step.key === 'stills') await runStep(job, step, 'package-stills.mjs', [dir, ...videoArgs, ...(o.force ? ['--force'] : [])], onProgress);
      if (step.key === 'voice') await runStep(job, step, 'package-voice.mjs', [dir, ...videoArgs, '--provider', o.voiceProvider || 'elevenlabs', ...(o.force ? ['--force'] : []), ...(o.maxCharacters != null ? ['--max-characters', String(o.maxCharacters)] : [])]);
      if (step.key === 'music') await runStep(job, step, 'package-music.mjs', [dir, ...videoArgs]);
      if (step.key === 'thumbs') await runStep(job, step, 'package-thumbs.mjs', [dir, ...videoArgs, ...(settings.gl ? ['--gl', settings.gl] : [])]);
      if (step.key === 'render')
        await runStep(job, step, 'package-render.mjs', [dir, ...videoArgs, '--budget', String(settings.budget), ...(o.draft ? ['--draft'] : []), ...(o.fourK && !o.draft ? ['--4k'] : []), ...(o.hw ? ['--hw'] : []), ...(settings.gl ? ['--gl', settings.gl] : []), ...(o.force ? ['--force'] : [])], onProgress);
      addDone(WEIGHT[step.key]);
      setProgress(step.key, 0);
    }
  };

  /** A file inside a package (stills, voice, music, renders), refusing anything outside it. */
  const file = (id, rel) => {
    const dir = dirOf(id);
    if (!dir) return null;
    const full = path.resolve(dir, String(rel || ''));
    return full.startsWith(dir + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
  };

  return {summary, details, estimate, importZip, run, file, dirOf, root};
};
