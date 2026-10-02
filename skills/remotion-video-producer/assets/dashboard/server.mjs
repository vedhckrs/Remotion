#!/usr/bin/env node
/**
 * Local control room for a Remotion project: http://localhost:4545
 *
 *   node tools/dashboard/server.mjs [--port 4545] [--skill /path/to/remotion-video-producer]
 *
 * One process, no dependencies beyond the project's node_modules (@remotion/bundler and
 * @remotion/renderer ship with @remotion/cli). It renders in-process through the Node API with
 * real per-frame progress and cancel, runs the skill's scripts (analyze, voiceover, captions, music,
 * LUTs) as child processes with live logs, edits script JSON, starts/stops Studio, lists outputs
 * with previews, and applies the machine budget (default 50% of cores, memory-capped) to every render.
 *
 * Start it with `nice -n 10` (the npm script does) so Chrome and FFmpeg inherit a lower priority and
 * the laptop stays responsive while it works.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {RATIOS_FOR_KIND, createEpisodes} from './episodes.mjs';
import {createLibrary} from './library.mjs';
import {parseRange} from './ranges.mjs';
import {loadJobs,saveJobs} from './job-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
};
const BROWSER=process.env.REMOTION_BROWSER_EXECUTABLE || (process.platform==='darwin'&&fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':null);
const PORT = Number(arg('port', process.env.DASHBOARD_PORT || 4545));
const SKILL_DIR = path.resolve(arg('skill', process.env.REMOTION_SKILL_DIR || path.join(here, '..', '..', '..', 'skills', 'remotion-video-producer')));
const SETTINGS_FILE = path.join(here, 'settings.json');
const require = createRequire(path.join(cwd, 'package.json'));

if (!fs.existsSync(path.join(cwd, 'package.json'))) {
  console.error('Run this from a Remotion project root (package.json not found).');
  process.exit(1);
}

let bundler;
let renderer;
try {
  bundler = require('@remotion/bundler');
  renderer = require('@remotion/renderer');
} catch (error) {
  console.error('@remotion/bundler or @remotion/renderer not found in this project. Install @remotion/cli (they come with it).', error.message);
  process.exit(1);
}

// ---------- machine ------------------------------------------------------------------------------
const cores = os.cpus().length || 4;
const memoryGb = os.totalmem() / 1024 ** 3;
const isMac = process.platform === 'darwin';

const readSettings = () => {
  const defaults = {budget: 50, hw: isMac, gl: process.env.REMOTION_GL || (process.platform === 'linux' ? 'swangle' : 'angle'), fourK: true, studioPort: 3000, planFile: '', tested: null, voiceProvider: 'elevenlabs', music: 'library', writer: 'claude', writerModel: 'sonnet', libraryDir: ''};
  try {
    return {...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))};
  } catch {
    return defaults;
  }
};
let settings = readSettings();
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

const concurrencyFor = (budget, fourK) => {
  // Full speed (100 %) uses the tab count the speed test measured as fastest on this machine, if any.
  const tested = settings?.tested?.[fourK ? 'fourK' : 'hd'];
  if (budget >= 100 && tested?.best) return tested.best;
  const byCpu = Math.floor((cores * Math.min(100, Math.max(10, budget))) / 100);
  const byMem = Math.floor(memoryGb / 4);
  let c = Math.max(1, Math.min(byCpu, byMem));
  if (fourK) c = Math.max(1, Math.floor(c / 2));
  return c;
};

/**
 * Thermal state. Apple Silicon has no CPU_Speed_Limit in `pmset -g therm`, so ask macOS the way apps do:
 * NSProcessInfo.thermalState (0 nominal, 1 fair, 2 serious = throttling, 3 critical) through JXA, cached
 * because spawning osascript every gauge tick would itself cost CPU. Intel Macs fall back to pmset.
 */
const THERMAL_NAMES = ['normal', 'warm', 'hot', 'critical'];
let thermalCache = {at: 0, value: null};
const thermal = () => {
  if (!isMac) return null;
  if (Date.now() - thermalCache.at < 15_000) return thermalCache.value;
  let value = null;
  const res = spawnSync('osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("Foundation"); $.NSProcessInfo.processInfo.thermalState'], {encoding: 'utf8', timeout: 3000});
  const level = Number(String(res.stdout || '').trim());
  if (res.status === 0 && Number.isInteger(level) && level >= 0 && level <= 3) value = {level, state: THERMAL_NAMES[level]};
  else {
    const m = (spawnSync('pmset', ['-g', 'therm'], {encoding: 'utf8'}).stdout || '').match(/CPU_Speed_Limit\s*=\s*(\d+)/);
    if (m) {
      const limit = Number(m[1]);
      const lvl = limit >= 100 ? 0 : limit >= 80 ? 1 : limit >= 50 ? 2 : 3;
      value = {level: lvl, state: THERMAL_NAMES[lvl], speedLimit: limit};
    }
  }
  thermalCache = {at: Date.now(), value};
  return value;
};

/** Memory apps can use now. macOS keeps idle memory as cache, so os.freemem() reads near zero on a healthy
 * Mac; vm_stat's free + inactive + speculative + purgeable pages is what Activity Monitor calls available. */
const availableMemoryGb = () => {
  if (isMac) {
    const out = spawnSync('vm_stat', {encoding: 'utf8'}).stdout || '';
    const page = Number((out.match(/page size of (\d+) bytes/) || [])[1]) || 16384;
    const pages = (name) => Number((out.match(new RegExp(`Pages ${name}:\\s+(\\d+)`)) || [])[1]) || 0;
    const bytes = (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * page;
    if (bytes > 0) return Math.round((bytes / 1024 ** 3) * 10) / 10;
  }
  return Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
};

const machine = () => {
  const load = os.loadavg()[0];
  return {
    platform: process.platform,
    arch: os.arch(),
    chip: isMac ? (spawnSync('sysctl', ['-n', 'machdep.cpu.brand_string'], {encoding: 'utf8'}).stdout || '').trim() : os.cpus()[0]?.model || '',
    cores,
    memoryGb: Math.round(memoryGb),
    freeMemoryGb: availableMemoryGb(),
    load1: Math.round(load * 10) / 10,
    loadPercent: Math.min(100, Math.round((load / cores) * 100)),
    thermal: thermal(),
    recommendedConcurrency: concurrencyFor(settings.budget, false),
    recommendedConcurrency4k: concurrencyFor(settings.budget, true),
    hardwareEncoder: isMac ? 'VideoToolbox' : spawnSync('which', ['nvidia-smi']).status === 0 ? 'NVENC' : null,
    freeDiskGb: (() => {
      const res = spawnSync('df', ['-Pk', cwd], {encoding: 'utf8'});
      const line = (res.stdout || '').trim().split('\n').pop() || '';
      const avail = Number(line.split(/\s+/)[3]);
      return Number.isFinite(avail) ? Math.round(avail / 1048576) : null;
    })(),
  };
};

// ---------- presets (mirror scripts/render-preset.sh) --------------------------------------------
const PRESETS = {
  'youtube-1080p': {crf: 16, x264: 'slow', hwBitrate: '16M', audioBitrate: '320k', label: 'YouTube 16:9'},
  shorts: {crf: 17, x264: 'medium', hwBitrate: '14M', audioBitrate: '256k', label: 'YouTube Shorts'},
  reels: {crf: 17, x264: 'medium', hwBitrate: '14M', audioBitrate: '256k', label: 'Instagram Reels'},
  stories: {crf: 17, x264: 'medium', hwBitrate: '14M', audioBitrate: '256k', label: 'Stories'},
  facebook: {crf: 17, x264: 'medium', hwBitrate: '14M', audioBitrate: '256k', label: 'Facebook Reels'},
  feed: {crf: 17, x264: 'medium', hwBitrate: '12M', audioBitrate: '256k', label: 'Feed 4:5'},
  preview: {crf: 28, x264: 'ultrafast', hwBitrate: '4M', audioBitrate: '128k', label: 'Preview (half size)', scale: 0.5, jpegQuality: 70},
};

// ---------- project ------------------------------------------------------------------------------
const entryPoint = ['src/index.ts', 'src/index.tsx', 'remotion/index.ts', 'remotion/index.tsx'].map((p) => path.join(cwd, p)).find((p) => fs.existsSync(p));
const publicDir = path.join(cwd, 'public');
const outDir = path.join(cwd, 'out');
fs.mkdirSync(outDir, {recursive: true});

const listScripts = () => {
  const dir = path.join(publicDir, 'script');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.replace(/\.json$/, '');
      let scenes = 0;
      let title = '';
      let pacing = '';
      try {
        const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        scenes = json.scenes?.length ?? 0;
        title = json.title || '';
        pacing = json.pacing || '';
      } catch {
        /* unreadable */
      }
      const voDir = path.join(publicDir, 'voiceover', id);
      const manifest = fs.existsSync(path.join(voDir, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(voDir, 'manifest.json'), 'utf8')) : null;
      const hasCaptions = manifest ? manifest.scenes.every((s) => Array.isArray(s.captions) && s.captions.length > 0) : false;
      const music = fs.existsSync(path.join(publicDir, 'music')) ? fs.readdirSync(path.join(publicDir, 'music')).filter((m) => m.startsWith(`${id}-`) || m.startsWith(`${id}.`)) : [];
      return {id, title, scenes, pacing, voiceover: manifest ? {provider: manifest.provider, scenes: manifest.scenes.length, seconds: Math.round(manifest.scenes.reduce((s, x) => s + x.durationSeconds + (manifest.gapSeconds || 0), 0))} : null, captions: hasCaptions, music};
    });
};

/** Resolve a path under out/ (one level of subfolders allowed), refusing anything that escapes it. */
const safeOut = (rel) => {
  const full = path.resolve(outDir, String(rel || ''));
  return full.startsWith(outDir + path.sep) ? full : null;
};

// out/*.mp4 from the render panel plus out/<videoId>/ folders written by autopilot and the thumbnail script.
const listOutputs = () => {
  const rows = [];
  const add = (rel) => {
    const st = fs.statSync(path.join(outDir, rel));
    rows.push({file: rel, size: st.size, mtime: st.mtimeMs});
  };
  for (const f of fs.readdirSync(outDir)) {
    if (f.startsWith('.')) continue; // .speedtest and other scratch folders
    const full = path.join(outDir, f);
    if (fs.statSync(full).isDirectory()) {
      for (const g of fs.readdirSync(full)) if (/\.(mp4|mov|webm|gif|png|jpg|srt)$/i.test(g)) add(path.join(f, g));
    } else if (/\.(mp4|mov|webm|gif|png|jpg|srt)$/i.test(f)) add(f);
  }
  return rows.sort((a, b) => b.mtime - a.mtime);
};

let compositions = [];
let compositionsError = null;
const refreshCompositions = () =>
  new Promise((resolve) => {
    const child = spawn('npx', ['remotion', 'compositions', '--quiet', ...(BROWSER?['--browser-executable',BROWSER]:[]), ...(process.env.REMOTION_IGNORE_CERTS ? ['--ignore-certificate-errors'] : [])], {cwd, env: {...process.env}, shell: process.platform === 'win32'});
    let out = '';
    let err = '';
    child.on('error',(e) => { err = e.message; });
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code === 0) {
        // --quiet prints the ids on the last line; earlier lines can be cache notices.
        compositions = (out.trim().split('\n').filter((l) => l.trim()).pop() || '').trim().split(/\s+/).filter(Boolean);
        compositionsError = null;
      } else {
        compositionsError = err.split('\n').filter((l) => l.trim()).slice(-3).join(' ');
      }
      resolve(compositions);
    });
  });

// ---------- SSE + log ----------------------------------------------------------------------------
const clients = new Set();
const send = (event, data) => {
  if (event === 'jobs') saveJobs(JOBS_FILE,jobs);
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
};
const logLines = [];
const log = (source, line) => {
  const entry = {t: Date.now(), source, line: String(line).replace(/\s+$/, '')};
  if (!entry.line) return;
  logLines.push(entry);
  if (logLines.length > 400) logLines.shift();
  send('log', entry);
};

// ---------- queue --------------------------------------------------------------------------------
const JOBS_FILE=path.join(cwd,'automation','dashboard-jobs.json');
const jobs=loadJobs(JOBS_FILE);
let running = null;
let nextId = Math.max(0,...jobs.map(j=>Number(j.id)||0))+1;
let serveUrl = null;
let bundledAt = 0;
const cancelSignals = new Map();

const latestSourceMtime = () => {
  let latest = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else latest = Math.max(latest, fs.statSync(full).mtimeMs);
    }
  };
  for (const dir of ['src', 'remotion', 'public']) if (fs.existsSync(path.join(cwd, dir))) walk(path.join(cwd, dir));
  for (const f of ['remotion.config.ts', 'package.json']) if (fs.existsSync(path.join(cwd, f))) latest = Math.max(latest, fs.statSync(path.join(cwd, f)).mtimeMs);
  return latest;
};

const ensureBundle = async (job) => {
  if (serveUrl && bundledAt > latestSourceMtime()) return serveUrl;
  if (job.status !== 'cancelled') job.status = 'bundling';
  send('jobs', jobs);
  serveUrl = await bundler.bundle({entryPoint, publicDir, onProgress: (p) => (job.bundleProgress = p)});
  bundledAt = Date.now();
  log('bundle', `Bundled project (${path.basename(serveUrl)})`);
  return serveUrl;
};

/**
 * Render one composition to a file with real progress and cancel. Used by the Render panel (runRender)
 * and by the episode pipeline (one call per aspect ratio).
 */
const renderTo = async ({compositionId, preset: presetName, inputProps = {}, outputLocation, fourK: wantFourK, hw: wantHw, budget, frames, concurrency: forcedConcurrency, jobForBundle, cancelKey, onStart, onProgress}) => {
  const preset = PRESETS[presetName] || PRESETS.shorts;
  const url = await ensureBundle(jobForBundle);
  const hw = wantHw && machine().hardwareEncoder;
  const fourK = wantFourK && presetName !== 'preview';
  const scale = preset.scale ?? (fourK ? 2 : 1);
  const concurrency = forcedConcurrency || concurrencyFor(budget ?? settings.budget, fourK);
  const chromiumOptions = {gl: settings.gl, ignoreCertificateErrors: Boolean(process.env.REMOTION_IGNORE_CERTS)};
  const composition = await renderer.selectComposition({serveUrl: url, id: compositionId, inputProps, chromiumOptions, browserExecutable:BROWSER, logLevel: 'error'});
  const width = Math.round(composition.width * scale);
  const height = Math.round(composition.height * scale);
  const info = {width, height, fps: composition.fps, totalFrames: composition.durationInFrames, concurrency, encoder: hw ? machine().hardwareEncoder : 'x264', fourK, hw};
  // Cancel pressed while bundling or selecting: stop before Chrome starts rendering.
  if (jobForBundle?.status === 'cancelled') throw new Error('Cancelled');
  const target = typeof outputLocation === 'function' ? outputLocation(info) : outputLocation;
  fs.mkdirSync(path.dirname(target), {recursive: true});
  onStart?.({...info, output: target});
  const cancelSignal = renderer.makeCancelSignal();
  cancelSignals.set(cancelKey, cancelSignal);
  const startedAt = Date.now();
  const frameRange = frames ? String(frames).split('-').map((n) => Number(n)) : null;
  // Watchdog: a render with no progress for STALL_MS (Chrome hung, Mac slept mid-frame) is stopped with a
  // clear error instead of blocking the queue forever.
  const STALL_MS = 5 * 60_000;
  let lastProgressAt = Date.now();
  let stalled = false;
  const watchdog = setInterval(() => {
    if (Date.now() - lastProgressAt > STALL_MS) {
      stalled = true;
      clearInterval(watchdog);
      log('render', `No progress for ${STALL_MS / 60_000} minutes: stopping this render`);
      cancelSignal.cancel();
    }
  }, 15_000);
  try {
    await renderer.renderMedia({
      composition,
      serveUrl: url,
      codec: 'h264',
      outputLocation: target,
      inputProps,
      chromiumOptions,
      browserExecutable:BROWSER,
      concurrency,
      scale,
      colorSpace: 'bt709',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: preset.audioBitrate,
      jpegQuality: preset.jpegQuality ?? 90,
      frameRange: frameRange && frameRange.length === 2 ? [frameRange[0], frameRange[1]] : null,
      ...(hw ? {hardwareAcceleration: 'if-possible', videoBitrate: fourK ? '60M' : preset.hwBitrate} : {crf: fourK ? preset.crf + 1 : preset.crf, x264Preset: fourK && preset.x264 === 'slow' ? 'medium' : preset.x264}),
      cancelSignal: cancelSignal.cancelSignal,
      logLevel: 'error',
      onProgress: ({progress, renderedFrames, encodedFrames, stitchStage}) => {
        lastProgressAt = Date.now();
        const elapsed = (Date.now() - startedAt) / 1000;
        onProgress?.({progress, renderedFrames, encodedFrames, stage: stitchStage, etaSeconds: progress > 0.02 ? Math.round((elapsed / progress) * (1 - progress)) : null});
      },
    });
  } catch (error) {
    if (stalled) throw new Error('Render stalled (no progress for 5 minutes). Generate again to retry; if it repeats, lower the budget or restart the dashboard.');
    throw error;
  } finally {
    clearInterval(watchdog);
    cancelSignals.delete(cancelKey);
  }
  return {...info, output: target, bytes: fs.statSync(target).size, seconds: Math.round((Date.now() - startedAt) / 1000)};
};

const runRender = async (job) => {
  const result = await renderTo({
    compositionId: job.compositionId,
    preset: job.preset,
    inputProps: job.inputProps || {},
    fourK: job.fourK,
    hw: job.hw,
    budget: job.budget,
    frames: job.frames,
    jobForBundle: job,
    cancelKey: job.id,
    outputLocation: ({width, height, fourK, hw}) => path.join(outDir, `${job.compositionId}_${job.preset === 'preview' ? 'preview' : `${job.preset}_${width}x${height}${fourK ? '_4k' : ''}${hw ? '_hw' : ''}`}.mp4`),
    onStart: (info) => {
      Object.assign(job, {output: path.basename(info.output), totalFrames: info.totalFrames, fps: info.fps, size: `${info.width}x${info.height}@${info.fps}`, concurrency: info.concurrency, encoder: info.encoder, status: 'rendering', startedAt: Date.now()});
      send('jobs', jobs);
      log('render', `${job.compositionId} -> ${job.output} | ${job.size} | ${info.concurrency} tabs | ${info.encoder}${info.fourK ? ' | 4K' : ''}`);
    },
    onProgress: (p) => {
      Object.assign(job, p);
      send('jobs', jobs);
    },
  });
  job.bytes = result.bytes;
  log('render', `Done ${job.output} (${(result.bytes / 1048576).toFixed(1)} MB) in ${result.seconds} s`);
};

const TASKS = {
  analyze: (o) => ['scripts/analyze-script.mjs', o.input, '--id', o.videoId, '--pacing', o.pacing || 'fast', ...(o.voicePreset ? ['--voice-preset', o.voicePreset] : []), ...(o.logo ? ['--logo', o.logo] : []), ...(o.musicMood ? ['--music-mood', o.musicMood] : []), ...(o.grade ? ['--grade', o.grade] : [])],
  voiceover: (o) => ['scripts/generate-voiceover.mjs', '--script', `public/script/${o.videoId}.json`, '--provider', o.provider || 'elevenlabs', ...(o.voicePreset ? ['--voice-preset', o.voicePreset] : []), ...(o.only ? ['--only', o.only] : []), ...(o.gap ? ['--gap', String(o.gap)] : [])],
  captions: (o) => [o.provider && o.provider !== 'whisper' ? 'scripts/transcribe-cloud.mjs' : 'scripts/transcribe-whisper.mjs', `public/voiceover/${o.videoId}`, ...(o.provider && o.provider !== 'whisper' ? ['--provider', o.provider] : ['--model', o.model || 'medium.en'])],
  music: (o) => ['scripts/generate-music.mjs', '--id', o.videoId, '--mood', o.mood || 'energetic-tech', ...(o.seconds ? ['--seconds', String(o.seconds)] : [])],
  luts: () => ['scripts/make-lut.mjs', '--out', 'public/luts'],
  'machine-check': (o) => ['scripts/machine-check.sh', '--render-test', o.compositionId || compositions[0] || 'Shorts'],
  icons: (o) => ['scripts/fetch-icons.mjs', '--from-script', `public/script/${o.videoId}.json`, ...(o.brands ? ['--brands', o.brands] : []), ...(o.lucide ? ['--lucide', o.lucide] : [])],
  thumbnails: (o) => ['scripts/make-thumbnails.mjs', '--video', o.videoId, ...(o.text ? ['--text', o.text] : []), ...(o.variants ? ['--variants', o.variants] : [])],
  pack: (o) => ['scripts/make-publish-pack.mjs', '--video', o.videoId, ...(o.handle ? ['--handle', o.handle] : [])],
  publish: (o) => ['scripts/publish.mjs', '--video', o.videoId, '--platform', o.platform || 'youtube-shorts', ...(o.when ? ['--when', o.when] : []), ...(o.dryRun ? ['--dry-run'] : []), ...(o.file ? ['--file', o.file] : [])],
  'autopilot-plan': (o) => ['scripts/autopilot.mjs', 'plan', ...(o.days ? ['--days', String(o.days)] : [])],
  'autopilot-run': (o) => ['scripts/autopilot.mjs', 'run', ...(o.limit ? ['--limit', String(o.limit)] : []), ...(o.id ? ['--id', o.id] : []), ...(o.dryRun ? ['--dry-run'] : [])],
  'autopilot-publish-due': () => ['scripts/autopilot.mjs', 'publish-due'],
};

const readQueue = () => {
  const file = path.join(cwd, 'automation', 'queue.json');
  if (!fs.existsSync(file)) return null;
  try {
    const q = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {timezone: q.timezone, slots: q.slots, writer: q.writer, budget: q.budget, items: (q.items || []).slice().sort((a, b) => String(a.publishAt).localeCompare(String(b.publishAt))).slice(-30)};
  } catch {
    return null;
  }
};

const runTask = (job) =>
  new Promise((resolve, reject) => {
    const args = TASKS[job.task](job.options || {});
    const script = path.join(SKILL_DIR, args[0]);
    if (!fs.existsSync(script)) return reject(new Error(`Skill script not found: ${script}. Pass --skill <dir>.`));
    const isBash = script.endsWith('.sh');
    const child = spawn(isBash ? 'bash' : process.execPath, [script, ...args.slice(1)], {cwd, env: {...process.env, REMOTION_GL: settings.gl, REMOTION_BUDGET: String(settings.budget)}});
    job.status = 'running';
    job.startedAt = Date.now();
    send('jobs', jobs);
    child.stdout.on('data', (d) => String(d).split('\n').forEach((l) => log(job.task, l)));
    child.stderr.on('data', (d) => String(d).split('\n').forEach((l) => log(job.task, l)));
    cancelSignals.set(job.id, {cancel: () => child.kill('SIGTERM')});
    child.on('error', (error) => {cancelSignals.delete(job.id);reject(error);});
    child.on('close', (code) => {
      cancelSignals.delete(job.id);
      if (code === 0 || (job.task === 'music' && code === 2) || (job.task === 'publish' && code === 3) || (job.task === 'icons' && code === 2)) resolve();
      else reject(new Error(`${job.task} exited with code ${code}`));
    });
  });

const pump = async () => {
  if (running) return;
  // Oldest queued job first (jobs are stored newest first for the UI).
  const job = [...jobs].reverse().find((j) => j.status === 'queued');
  if (!job) return;
  running = job;
  try {
    if (job.kind === 'render') await runRender(job);
    else if (job.kind === 'episode') await episodes.runEpisode(job);
    else if (job.kind === 'speedtest') await runSpeedTest(job);
    else if (job.kind === 'package') await library.run(job);
    else await runTask(job);
    job.status = job.status === 'cancelled' ? 'cancelled' : 'done';
  } catch (error) {
    job.status = job.status === 'cancelled' ? 'cancelled' : 'failed';
    if (job.status === 'cancelled') log(job.kind, `Cancelled: ${job.title || job.task || job.compositionId || job.kind}`);
    else {
      job.error = error.message.split('\n')[0].slice(0, 300);
      log(job.kind, `Failed: ${job.error}`);
    }
  } finally {
    job.endedAt = Date.now();
    running = null;
    send('jobs', jobs);
    send('outputs', listOutputs());
    if (job.kind === 'episode') send('plan', episodes.summary());
    setTimeout(pump, 50);
  }
};

const enqueue = (job) => {
  const full = {id: nextId++, status: 'queued', createdAt: Date.now(), progress: 0, ...job};
  jobs.unshift(full);
  if (jobs.length > 120) {
    const i = jobs.map((j) => ['queued', 'bundling', 'selecting', 'rendering', 'running'].includes(j.status)).lastIndexOf(false);
    if (i !== -1) jobs.splice(i, 1);
  }
  send('jobs', jobs);
  pump();
  return full;
};

/**
 * Speed test: render the same 2 seconds with different Chrome tab counts and keep the fastest as the
 * "full speed" setting (used when the budget slider is at 100 %). Too few tabs leave cores idle; too
 * many thrash memory, so the best value is measured, not guessed (Remotion's own advice).
 */
const runSpeedTest = async (job) => {
  const o = job.options || {};
  const fourK = o.fourK ?? settings.fourK;
  const scripts = listScripts().filter((x) => x.voiceover);
  const videoId = o.videoId || scripts[0]?.id || 'example';
  const compositionId = compositions.includes('Shorts') ? 'Shorts' : compositions.find((c) => !['Thumbnail', 'Cover', 'SquareCover'].includes(c)) || 'Shorts';
  const candidates = [...new Set([2, 3, 4, 5, 6, 8, cores].filter((c) => c >= 1 && c <= cores))].sort((a, b) => a - b);
  const dir = path.join(outDir, '.speedtest');
  await ensureBundle(job);
  if (job.status === 'cancelled') return;
  fs.mkdirSync(dir, {recursive: true});
  job.status = 'running';
  job.results = [];
  send('jobs', jobs);
  log('speedtest', `${compositionId} (${videoId}), frames 0-119 at ${fourK ? '4K' : '1080p'}, hw=${Boolean(settings.hw && machine().hardwareEncoder)}: trying ${candidates.join(', ')} tabs`);
  try {
    for (const [i, c] of candidates.entries()) {
      if (job.status === 'cancelled') break;
      const started = Date.now();
      await renderTo({compositionId, preset: compositionId === 'YouTube' ? 'youtube-1080p' : 'shorts', inputProps: {videoId}, outputLocation: path.join(dir, `tabs-${c}.mp4`), fourK, hw: settings.hw, frames: '0-119', concurrency: c, jobForBundle: job, cancelKey: job.id, onProgress: (p) => { job.progress = (i + p.progress) / candidates.length; send('jobs', jobs); }});
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      job.results.push({tabs: c, seconds});
      log('speedtest', `  ${String(c).padStart(2)} tabs: ${seconds} s`);
      send('jobs', jobs);
    }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true}); // test clips are scratch, also after a cancel or failure
  }
  if (!job.results.length) return;
  const best = job.results.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  settings = {...settings, budget: 100, tested: {...(settings.tested || {}), [fourK ? 'fourK' : 'hd']: {best: best.tabs, seconds: best.seconds, results: job.results, at: new Date().toISOString()}}};
  saveSettings();
  job.best = best;
  log('speedtest', `Fastest: ${best.tabs} tabs (${best.seconds} s for 2 s of video). Saved; budget set to 100 % (full speed).`);
  send('state', state());
};

const episodes = createEpisodes({cwd, SKILL_DIR, getSettings: () => settings, log, send, renderTo, cancelSignals, getCompositions: () => compositions, jobs});
const library = createLibrary({cwd, SKILL_DIR, getSettings: () => settings, log, send, cancelSignals, jobs});

// ---------- folder picker ------------------------------------------------------------------------
/** Native Finder dialog on macOS; resolves {path} or {cancelled: true}. Other systems use /api/browse. */
const pickNative = ({kind, prompt, start}) =>
  new Promise((resolve) => {
    if (!isMac) return resolve({unsupported: true});
    const esc = (t) => String(t || '').replace(/[\\"]/g, '');
    const where = start && fs.existsSync(start) ? ` default location (POSIX file "${esc(start)}")` : '';
    const type = kind === 'zip' ? '"public.zip-archive"' : '"public.json"';
    const what = kind === 'file' || kind === 'zip' ? `choose file with prompt "${esc(prompt || 'Choose a file')}" of type {${type}}${where}` : `choose folder with prompt "${esc(prompt || 'Choose a folder')}"${where}`;
    const child = spawn('osascript', ['-e', 'tell application "System Events"', '-e', 'activate', '-e', `set chosen to POSIX path of (${what})`, '-e', 'end tell', '-e', 'return chosen']);
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => resolve(code === 0 && out.trim() ? {path: out.trim().replace(/\/$/, '') || '/'} : {cancelled: true}));
    child.on('error', () => resolve({unsupported: true}));
  });

const browse = (dir, withFiles) => {
  const home = os.homedir();
  const roots = [{name: 'Home', path: home}, {name: 'Project', path: cwd}];
  if (isMac && fs.existsSync('/Volumes')) for (const v of fs.readdirSync('/Volumes')) roots.push({name: v, path: path.join('/Volumes', v)});
  const target = path.resolve(dir || home);
  let entries = [];
  try {
    entries = fs
      .readdirSync(target, {withFileTypes: true})
      .filter((e) => !e.name.startsWith('.') && (e.isDirectory() || (withFiles && /\.(json|zip)$/i.test(e.name))))
      .map((e) => ({name: e.name, path: path.join(target, e.name), dir: e.isDirectory()}))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  } catch (error) {
    return {dir: target, parent: path.dirname(target), roots, entries: [], error: error.message};
  }
  return {dir: target, parent: path.dirname(target), roots, entries};
};

// ---------- studio -------------------------------------------------------------------------------
let studio = null;
let studioUrl = null;
const startStudio = () => {
  if (studio) return;
  studio = spawn('npx', ['remotion', 'studio', '--no-open', `--port=${settings.studioPort}`], {cwd, shell: process.platform === 'win32'});
  studioUrl = null;
  studio.on('error', (e) => {log('studio',e.message);});
  const onData = (d) => {
    const text = String(d);
    const m = text.match(/https?:\/\/[^\s]+/);
    if (m && !studioUrl) studioUrl = m[0];
    text.split('\n').forEach((l) => log('studio', l));
    send('studio', {running: true, url: studioUrl});
  };
  studio.stdout.on('data', onData);
  studio.stderr.on('data', onData);
  studio.on('close', () => {
    studio = null;
    studioUrl = null;
    send('studio', {running: false, url: null});
  });
};
const stopStudio = () => {
  if (studio) studio.kill('SIGTERM');
};

// ---------- http ---------------------------------------------------------------------------------
const MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mov': 'video/quicktime', '.srt': 'text/plain', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4'};
/** Stream a file with HTTP range support (video and audio seeking). */
const serveFile = (req, res, file) => {
  const st = fs.statSync(file);
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  let bounds;
  if (range) {
    bounds = parseRange(range,st.size);
    if (!bounds) { res.writeHead(416, {'Content-Range': `bytes */${st.size}`}); return res.end(); }
    res.writeHead(206, {'Content-Range': `bytes ${bounds.start}-${bounds.end}/${st.size}`, 'Accept-Ranges':'bytes','Content-Length':bounds.end-bounds.start+1,'Content-Type':type});
  } else res.writeHead(200, {'Content-Length':st.size,'Content-Type':type,'Accept-Ranges':'bytes'});
  const stream = fs.createReadStream(file,bounds);
  stream.on('error', (error) => res.destroy(error));
  res.on('close', () => stream.destroy());
  if (req.method === 'HEAD') {stream.destroy();return res.end();}
  return stream.pipe(res);
};
const json = (res, code, data) => {
  res.writeHead(code, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(data));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });

const state = () => ({machine: machine(), settings, compositions, compositionsError, scripts: listScripts(), jobs, outputs: listOutputs(), queue: readQueue(), studio: {running: Boolean(studio), url: studioUrl}, skillDir: SKILL_DIR, project: path.basename(cwd), entryPoint: entryPoint ? path.relative(cwd, entryPoint) : null, log: logLines.slice(-80)});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  // Local-only guard: refuse other hosts (DNS rebinding) and cross-site writes. The page sends
  // X-Dashboard on every non-GET request; a foreign website cannot add that header without a CORS
  // preflight, which this server never approves.
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    res.writeHead(403);
    return res.end('forbidden host');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-dashboard'] !== '1') {
    res.writeHead(403);
    return res.end('missing X-Dashboard header');
  }
  try {
    if (req.method === 'GET' && p === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      return res.end(fs.readFileSync(path.join(here, 'index.html')));
    }
    if (req.method === 'GET' && p === '/api/state') return json(res, 200, state());
    if (req.method === 'GET' && p === '/api/plan') return json(res, 200, episodes.summary());
    if (req.method === 'GET' && /^\/api\/episodes\/[^/]+\/details$/.test(p)) {
      const d = episodes.details(decodeURIComponent(p.split('/')[3]));
      return d ? json(res, 200, d) : json(res, 404, {error: 'episode not in plan'});
    }
    if (req.method === 'GET' && /^\/api\/episodes\/[^/]+\/upload-details\.md$/.test(p)) {
      const d = episodes.details(decodeURIComponent(p.split('/')[3]));
      if (!d) return json(res, 404, {error: 'episode not in plan'});
      res.writeHead(200, {'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${d.id}-upload-details.md"`});
      return res.end(episodes.detailsMarkdown(d));
    }
    if (req.method === 'POST' && p === '/api/episodes/generate') {
      const body = await readBody(req);
      if (!episodes.findEpisode(body.episodeId)) return json(res, 404, {error: 'episode not in plan'});
      const found = episodes.findEpisode(body.episodeId);
      // One job per video, in plan order: each renders and saves completely before the next starts.
      const order = found.ep.videos.map((v) => v.variant);
      const kindOf = Object.fromEntries(found.ep.videos.map((v) => [v.variant, v.kind]));
      const videos = (Array.isArray(body.videos) ? body.videos : [])
        .filter((v) => v && kindOf[v.variant])
        .map((v) => ({variant: v.variant, ratios: [...new Set(Array.isArray(v.ratios) ? v.ratios : [])].filter((r) => (RATIOS_FOR_KIND[kindOf[v.variant]] || []).includes(r))}))
        .filter((v) => v.ratios.length)
        .sort((a, b) => order.indexOf(a.variant) - order.indexOf(b.variant));
      if (!videos.length) return json(res, 400, {error: 'Select at least one video and one aspect ratio'});
      const label = {long: 'Long video', 'short-a': 'Short A', 'short-b': 'Short B'};
      const queued = videos.map((v, i) =>
        enqueue({kind: 'episode', title: `${found.ep.id.toUpperCase()} · ${label[v.variant] || v.variant} (${i + 1}/${videos.length})`, topic: found.ep.topic, options: {episodeId: body.episodeId, videos: [v], outDir: body.outDir || null, fourK: body.fourK ?? settings.fourK, hw: body.hw ?? settings.hw, regenerate: Boolean(body.regenerate), writer: body.writer || settings.writer, writerModel: ['sonnet', 'opus', 'default'].includes(body.writerModel) ? body.writerModel : settings.writerModel || 'sonnet', voiceProvider: body.voiceProvider || settings.voiceProvider, music: body.music || settings.music}}),
      );
      return json(res, 200, {jobs: queued.map((j) => ({id: j.id, title: j.title}))});
    }
    if (req.method === 'POST' && p === '/api/speedtest') {
      const body = await readBody(req);
      return json(res, 200, enqueue({kind: 'speedtest', title: `Speed test (${(body.fourK ?? settings.fourK) ? '4K' : '1080p'})`, options: {fourK: body.fourK ?? settings.fourK, videoId: body.videoId}}));
    }
    if (req.method === 'POST' && p === '/api/pick') return json(res, 200, await pickNative(await readBody(req)));
    if (req.method === 'GET' && p === '/api/browse') return json(res, 200, browse(url.searchParams.get('dir'), url.searchParams.get('files') === '1'));
    if (req.method === 'POST' && p === '/api/open') {
      const body = await readBody(req);
      const target = path.resolve(String(body.path || ''));
      if (!body.path || !fs.existsSync(target)) return json(res, 404, {error: 'not found'});
      if (isMac) spawn('open', [target]).on('error',(e) => log('open',e.message));
      else if (process.platform === 'win32') spawn('explorer', [target]).on('error',(e) => log('open',e.message));
      else spawn('xdg-open', [target]).on('error',(e) => log('open',e.message));
      return json(res, 200, {ok: true});
    }
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive'});
      res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && p === '/api/settings') {
      const body = await readBody(req);
      // Only known keys with sane values; a bad value would break every render.
      const clean = {};
      if (body.budget !== undefined && Number.isFinite(Number(body.budget))) clean.budget = Math.min(100, Math.max(10, Math.round(Number(body.budget))));
      for (const k of ['hw', 'fourK']) if (typeof body[k] === 'boolean') clean[k] = body[k];
      if (['angle', 'angle-egl', 'swangle', 'egl', 'swiftshader', 'vulkan'].includes(body.gl)) clean.gl = body.gl;
      if (Number.isInteger(body.studioPort) && body.studioPort > 1023 && body.studioPort < 65536) clean.studioPort = body.studioPort;
      if (typeof body.planFile === 'string') clean.planFile = body.planFile.trim();
      if (typeof body.libraryDir === 'string') clean.libraryDir = body.libraryDir.trim();
      if (['elevenlabs', 'openai', 'macos'].includes(body.voiceProvider)) clean.voiceProvider = body.voiceProvider;
      if (['library', 'generate', 'off'].includes(body.music)) clean.music = body.music;
      if (['claude', 'manual'].includes(body.writer)) clean.writer = body.writer;
      if (['sonnet', 'opus', 'default'].includes(body.writerModel)) clean.writerModel = body.writerModel;
      settings = {...settings, ...clean};
      saveSettings();
      return json(res, 200, {settings, machine: machine()});
    }
    if (req.method === 'POST' && p === '/api/compositions/refresh') {
      await refreshCompositions();
      return json(res, 200, {compositions, compositionsError});
    }
    const scriptId = p.startsWith('/api/scripts/') ? decodeURIComponent(p.slice('/api/scripts/'.length)).replace(/\.md$/, '') : null;
    if (scriptId !== null && !/^[A-Za-z0-9_-]{1,80}$/.test(scriptId)) return json(res, 400, {error: 'script id may only use letters, numbers, - and _'});
    if (req.method === 'GET' && p.startsWith('/api/scripts/')) {
      const id = scriptId;
      const file = path.join(publicDir, 'script', `${id}.json`);
      if (!fs.existsSync(file)) return json(res, 404, {error: 'not found'});
      res.writeHead(200, {'Content-Type': 'application/json'});
      return res.end(fs.readFileSync(file));
    }
    if (req.method === 'PUT' && p.startsWith('/api/scripts/') && p.endsWith('.md')) {
      // Raw script text from the "New from text" panel; the analyze task turns it into JSON.
      const id = decodeURIComponent(p.split('/')[3]).replace(/\.md$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
      let text = '';
      await new Promise((resolve) => {
        req.on('data', (d) => (text += d));
        req.on('end', resolve);
      });
      fs.mkdirSync(path.join(publicDir, 'script'), {recursive: true});
      const file = path.join(publicDir, 'script', `${id}.md`);
      fs.writeFileSync(file, text);
      return json(res, 200, {ok: true, path: path.relative(cwd, file)});
    }
    if (req.method === 'PUT' && p.startsWith('/api/scripts/')) {
      const id = scriptId;
      const body = await readBody(req);
      try {
        const schema = await import(path.join(SKILL_DIR, 'scripts', 'lib', 'script-schema.mjs'));
        schema.validateScript(body);
      } catch (error) {
        return json(res, 400, {error: error.message});
      }
      fs.mkdirSync(path.join(publicDir, 'script'), {recursive: true});
      fs.writeFileSync(path.join(publicDir, 'script', `${id}.json`), JSON.stringify(body, null, 2));
      log('script', `Saved public/script/${id}.json`);
      return json(res, 200, {ok: true});
    }
    if (req.method === 'POST' && p === '/api/render') {
      const body = await readBody(req);
      if (!body.compositionId) return json(res, 400, {error: 'compositionId required'});
      const job = enqueue({kind: 'render', compositionId: body.compositionId, preset: body.preset || 'shorts', hw: body.hw ?? settings.hw, fourK: body.fourK ?? settings.fourK, budget: body.budget ?? settings.budget, frames: body.frames || null, inputProps: body.inputProps || null});
      return json(res, 200, job);
    }
    if (req.method === 'POST' && p === '/api/tasks') {
      const body = await readBody(req);
      if (!TASKS[body.task]) return json(res, 400, {error: `unknown task ${body.task}`});
      return json(res, 200, enqueue({kind: 'task', task: body.task, options: body.options || {}}));
    }
    if (req.method === 'POST' && p.match(/^\/api\/jobs\/\d+\/cancel$/)) {
      const id = Number(p.split('/')[3]);
      const job = jobs.find((j) => j.id === id);
      if (!job) return json(res, 404, {error: 'not found'});
      // Any active job: mark it cancelled (runners check between steps) and stop the current child or render.
      if (['queued', 'bundling', 'selecting', 'rendering', 'running'].includes(job.status)) {
        job.status = 'cancelled';
        cancelSignals.get(id)?.cancel();
      }
      send('jobs', jobs);
      return json(res, 200, job);
    }
    if (req.method === 'POST' && p === '/api/reveal') {
      const body = await readBody(req);
      const file = safeOut(body.file);
      if (!file || !fs.existsSync(file)) return json(res, 404, {error: 'not found'});
      if (isMac) spawn('open', ['-R', file]).on('error',(e) => log('open',e.message));
      else if (process.platform === 'win32') spawn('explorer', ['/select,', file]).on('error',(e) => log('open',e.message));
      else spawn('xdg-open', [outDir]).on('error',(e) => log('open',e.message));
      return json(res, 200, {ok: true});
    }
    if (req.method === 'DELETE' && p.startsWith('/api/outputs/')) {
      const file = safeOut(decodeURIComponent(p.slice('/api/outputs/'.length)));
      if (file && fs.existsSync(file) && !fs.statSync(file).isDirectory()) fs.unlinkSync(file);
      return json(res, 200, {outputs: listOutputs()});
    }
    if (req.method === 'POST' && p === '/api/studio') {
      const body = await readBody(req);
      if (body.action === 'start') startStudio();
      else stopStudio();
      return json(res, 200, {running: Boolean(studio), url: studioUrl});
    }
    if (req.method === 'GET' && p.startsWith('/out/')) {
      const file = safeOut(decodeURIComponent(p.slice(5)));
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      return serveFile(req, res, file);
    }
    if (req.method === 'GET' && p === '/api/library') return json(res, 200, await library.summary());
    if (req.method === 'GET' && p === '/api/library/details') {
      const d = await library.details(url.searchParams.get('id'));
      return d ? json(res, 200, d) : json(res, 404, {error: 'package not found'});
    }
    if (req.method === 'GET' && p === '/api/library/estimate') {
      const e = library.estimate(url.searchParams.get('id'), url.searchParams.get('provider'));
      return e ? json(res, 200, e) : json(res, 404, {error: 'package not found'});
    }
    if (req.method === 'GET' && p === '/lib/file') {
      const file = library.file(url.searchParams.get('id'), url.searchParams.get('path'));
      if (!file) {
        res.writeHead(404);
        return res.end();
      }
      return serveFile(req, res, file);
    }
    if (req.method === 'POST' && p === '/api/library/import') {
      const body = await readBody(req);
      try {
        return json(res, 200, {imported: library.importZip(body.path), library: await library.summary()});
      } catch (error) {
        return json(res, 400, {error: error.message});
      }
    }
    if (req.method === 'POST' && p === '/api/library/reveal') {
      const body = await readBody(req);
      const target = body.id ? (body.path ? library.file(body.id, body.path) : library.dirOf(body.id)) : library.root();
      if (!target || !fs.existsSync(target)) return json(res, 404, {error: 'not found'});
      if (isMac) spawn('open', fs.statSync(target).isDirectory() ? [target] : ['-R', target]).on('error',(e) => log('open',e.message));
      else spawn('xdg-open', [fs.statSync(target).isDirectory() ? target : path.dirname(target)]).on('error',(e) => log('open',e.message));
      return json(res, 200, {ok: true});
    }
    if (req.method === 'POST' && p === '/api/library/run') {
      const body = await readBody(req);
      if (!library.dirOf(body.id)) return json(res, 404, {error: 'package not found'});
      const videos = (Array.isArray(body.videos) ? body.videos : []).filter((v) => /^[a-z0-9-]{1,40}$/.test(v));
      if (!videos.length) return json(res, 400, {error: 'Select at least one video'});
      const pick = (k) => Boolean(body[k]);
      if (!['stills', 'voice', 'music', 'render'].some(pick)) return json(res, 400, {error: 'Select at least one step'});
      const options = {id: body.id, videos, stills: pick('stills'), voice: pick('voice'), voiceProvider: ['elevenlabs', 'macos'].includes(body.voiceProvider) ? body.voiceProvider : 'elevenlabs', music: pick('music'), render: pick('render'), draft: pick('draft'), maxCharacters: Number.isFinite(body.maxCharacters) ? Math.max(0, Math.round(body.maxCharacters)) : null, fourK: body.fourK ?? settings.fourK, hw: body.hw ?? settings.hw, force: pick('force')};
      return json(res, 200, enqueue({kind: 'package', title: `${body.id} · ${videos.join(' + ')}${options.draft ? ' · draft' : ''}`, options}));
    }
    res.writeHead(404);
    res.end('not found');
  } catch (error) {
    json(res, 500, {error: error.message});
  }
});

setInterval(() => send('machine', machine()), 2500);

server.on('error',error=>{console.error(`Dashboard could not listen on port ${PORT}: ${error.message}`);process.exit(1);});
server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Remotion dashboard  http://localhost:${PORT}`);
  console.log(`  project: ${cwd}`);
  console.log(`  skill:   ${SKILL_DIR}`);
  console.log(`  budget:  ${settings.budget}% -> ${concurrencyFor(settings.budget, false)} tabs (1080p), ${concurrencyFor(settings.budget, true)} tabs (4K), gl=${settings.gl}, hw=${settings.hw}`);
  if (!entryPoint) console.warn('  no src/index.ts found: renders will fail until the project has an entry point');
  await refreshCompositions();
  console.log(`  compositions: ${compositions.join(', ') || compositionsError || 'none'}`);
});

// launchd restarts (skill-update, kickstart) send SIGTERM: stop running renders and child processes too,
// so no Chrome or writer keeps the CPU busy after the dashboard is gone.
const shutdown = () => {
  for (const signal of cancelSignals.values()) {
    try {
      signal.cancel();
    } catch {}
  }
  stopStudio();
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
