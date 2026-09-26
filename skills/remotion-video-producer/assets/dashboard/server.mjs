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

const here = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
};
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
  const defaults = {budget: 50, hw: isMac, gl: process.env.REMOTION_GL || (process.platform === 'linux' ? 'swangle' : 'angle'), fourK: true, studioPort: 3000};
  try {
    return {...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))};
  } catch {
    return defaults;
  }
};
let settings = readSettings();
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

const concurrencyFor = (budget, fourK) => {
  const byCpu = Math.floor((cores * Math.min(100, Math.max(10, budget))) / 100);
  const byMem = Math.floor(memoryGb / 4);
  let c = Math.max(1, Math.min(byCpu, byMem));
  if (fourK) c = Math.max(1, Math.floor(c / 2));
  return c;
};

const thermal = () => {
  if (!isMac) return null;
  const res = spawnSync('pmset', ['-g', 'therm'], {encoding: 'utf8'});
  const m = (res.stdout || '').match(/CPU_Speed_Limit\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

const machine = () => {
  const load = os.loadavg()[0];
  return {
    platform: process.platform,
    arch: os.arch(),
    chip: isMac ? (spawnSync('sysctl', ['-n', 'machdep.cpu.brand_string'], {encoding: 'utf8'}).stdout || '').trim() : os.cpus()[0]?.model || '',
    cores,
    memoryGb: Math.round(memoryGb),
    freeMemoryGb: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
    load1: Math.round(load * 10) / 10,
    loadPercent: Math.min(100, Math.round((load / cores) * 100)),
    cpuSpeedLimit: thermal(),
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

const listOutputs = () =>
  fs
    .readdirSync(outDir)
    .filter((f) => /\.(mp4|mov|webm|gif|png|srt)$/i.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(outDir, f));
      return {file: f, size: st.size, mtime: st.mtimeMs};
    })
    .sort((a, b) => b.mtime - a.mtime);

let compositions = [];
let compositionsError = null;
const refreshCompositions = () =>
  new Promise((resolve) => {
    const child = spawn('npx', ['remotion', 'compositions', '--quiet', ...(process.env.REMOTION_IGNORE_CERTS ? ['--ignore-certificate-errors'] : [])], {cwd, env: {...process.env}, shell: process.platform === 'win32'});
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code === 0) {
        compositions = out.trim().split(/\s+/).filter(Boolean);
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
const jobs = [];
let running = null;
let nextId = 1;
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
  job.status = 'bundling';
  send('jobs', jobs);
  serveUrl = await bundler.bundle({entryPoint, publicDir, onProgress: (p) => (job.bundleProgress = p)});
  bundledAt = Date.now();
  log('bundle', `Bundled project (${path.basename(serveUrl)})`);
  return serveUrl;
};

const runRender = async (job) => {
  const preset = PRESETS[job.preset] || PRESETS.shorts;
  const url = await ensureBundle(job);
  const hw = job.hw && machine().hardwareEncoder;
  const fourK = job.fourK && job.preset !== 'preview';
  const scale = preset.scale ?? (fourK ? 2 : 1);
  const concurrency = job.concurrency || concurrencyFor(job.budget ?? settings.budget, fourK);
  const chromiumOptions = {gl: settings.gl, ignoreCertificateErrors: Boolean(process.env.REMOTION_IGNORE_CERTS)};
  const inputProps = job.inputProps || {};

  job.status = 'selecting';
  send('jobs', jobs);
  const composition = await renderer.selectComposition({serveUrl: url, id: job.compositionId, inputProps, chromiumOptions, logLevel: 'error'});
  const width = Math.round(composition.width * scale);
  const height = Math.round(composition.height * scale);
  const suffix = job.preset === 'preview' ? 'preview' : `${job.preset}_${width}x${height}${fourK ? '_4k' : ''}${hw ? '_hw' : ''}`;
  const outputLocation = path.join(outDir, `${job.compositionId}_${suffix}.mp4`);
  job.output = path.basename(outputLocation);
  job.totalFrames = composition.durationInFrames;
  job.fps = composition.fps;
  job.size = `${width}x${height}@${composition.fps}`;
  job.concurrency = concurrency;
  job.encoder = hw ? machine().hardwareEncoder : 'x264';
  job.status = 'rendering';
  job.startedAt = Date.now();
  send('jobs', jobs);
  log('render', `${job.compositionId} -> ${job.output} | ${job.size} | ${concurrency} tabs | ${job.encoder}${fourK ? ' | 4K' : ''}`);

  const cancelSignal = renderer.makeCancelSignal();
  cancelSignals.set(job.id, cancelSignal);

  const frameRange = job.frames ? job.frames.split('-').map((n) => Number(n)) : null;
  await renderer.renderMedia({
    composition,
    serveUrl: url,
    codec: 'h264',
    outputLocation,
    inputProps,
    chromiumOptions,
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
      job.progress = progress;
      job.renderedFrames = renderedFrames;
      job.encodedFrames = encodedFrames;
      job.stage = stitchStage;
      const elapsed = (Date.now() - job.startedAt) / 1000;
      job.etaSeconds = progress > 0.02 ? Math.round((elapsed / progress) * (1 - progress)) : null;
      send('jobs', jobs);
    },
  });
  cancelSignals.delete(job.id);
  const st = fs.statSync(outputLocation);
  job.bytes = st.size;
  log('render', `Done ${job.output} (${(st.size / 1048576).toFixed(1)} MB) in ${Math.round((Date.now() - job.startedAt) / 1000)} s`);
};

const TASKS = {
  analyze: (o) => ['scripts/analyze-script.mjs', o.input, '--id', o.videoId, '--pacing', o.pacing || 'fast', ...(o.voicePreset ? ['--voice-preset', o.voicePreset] : []), ...(o.logo ? ['--logo', o.logo] : []), ...(o.musicMood ? ['--music-mood', o.musicMood] : []), ...(o.grade ? ['--grade', o.grade] : [])],
  voiceover: (o) => ['scripts/generate-voiceover.mjs', '--script', `public/script/${o.videoId}.json`, '--provider', o.provider || 'elevenlabs', ...(o.voicePreset ? ['--voice-preset', o.voicePreset] : []), ...(o.only ? ['--only', o.only] : []), ...(o.gap ? ['--gap', String(o.gap)] : [])],
  captions: (o) => [o.provider && o.provider !== 'whisper' ? 'scripts/transcribe-cloud.mjs' : 'scripts/transcribe-whisper.mjs', `public/voiceover/${o.videoId}`, ...(o.provider && o.provider !== 'whisper' ? ['--provider', o.provider] : ['--model', o.model || 'medium.en'])],
  music: (o) => ['scripts/generate-music.mjs', '--id', o.videoId, '--mood', o.mood || 'energetic-tech', ...(o.seconds ? ['--seconds', String(o.seconds)] : [])],
  luts: () => ['scripts/make-lut.mjs', '--out', 'public/luts'],
  'machine-check': (o) => ['scripts/machine-check.sh', '--render-test', o.compositionId || compositions[0] || 'Shorts'],
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
    child.on('close', (code) => {
      cancelSignals.delete(job.id);
      if (code === 0 || (job.task === 'music' && code === 2)) resolve();
      else reject(new Error(`${job.task} exited with code ${code}`));
    });
  });

const pump = async () => {
  if (running) return;
  const job = jobs.find((j) => j.status === 'queued');
  if (!job) return;
  running = job;
  try {
    if (job.kind === 'render') await runRender(job);
    else await runTask(job);
    job.status = job.status === 'cancelled' ? 'cancelled' : 'done';
  } catch (error) {
    job.status = job.status === 'cancelled' ? 'cancelled' : 'failed';
    job.error = error.message.split('\n')[0].slice(0, 300);
    log(job.kind, `Failed: ${job.error}`);
  } finally {
    job.endedAt = Date.now();
    running = null;
    send('jobs', jobs);
    send('outputs', listOutputs());
    setTimeout(pump, 50);
  }
};

const enqueue = (job) => {
  const full = {id: nextId++, status: 'queued', createdAt: Date.now(), progress: 0, ...job};
  jobs.unshift(full);
  if (jobs.length > 60) jobs.pop();
  send('jobs', jobs);
  pump();
  return full;
};

// ---------- studio -------------------------------------------------------------------------------
let studio = null;
let studioUrl = null;
const startStudio = () => {
  if (studio) return;
  studio = spawn('npx', ['remotion', 'studio', '--no-open', `--port=${settings.studioPort}`], {cwd, shell: process.platform === 'win32'});
  studioUrl = null;
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

const state = () => ({machine: machine(), settings, compositions, compositionsError, scripts: listScripts(), jobs, outputs: listOutputs(), studio: {running: Boolean(studio), url: studioUrl}, skillDir: SKILL_DIR, project: path.basename(cwd), entryPoint: entryPoint ? path.relative(cwd, entryPoint) : null, log: logLines.slice(-80)});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      return res.end(fs.readFileSync(path.join(here, 'index.html')));
    }
    if (req.method === 'GET' && p === '/api/state') return json(res, 200, state());
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive'});
      res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && p === '/api/settings') {
      const body = await readBody(req);
      settings = {...settings, ...body};
      saveSettings();
      return json(res, 200, {settings, machine: machine()});
    }
    if (req.method === 'POST' && p === '/api/compositions/refresh') {
      await refreshCompositions();
      return json(res, 200, {compositions, compositionsError});
    }
    if (req.method === 'GET' && p.startsWith('/api/scripts/')) {
      const id = decodeURIComponent(p.split('/')[3]);
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
      const id = decodeURIComponent(p.split('/')[3]);
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
      if (job.status === 'queued') job.status = 'cancelled';
      else {
        const sig = cancelSignals.get(id);
        if (sig) {
          job.status = 'cancelled';
          sig.cancel();
        }
      }
      send('jobs', jobs);
      return json(res, 200, job);
    }
    if (req.method === 'POST' && p === '/api/reveal') {
      const body = await readBody(req);
      const file = path.join(outDir, path.basename(body.file || ''));
      if (!fs.existsSync(file)) return json(res, 404, {error: 'not found'});
      if (isMac) spawn('open', ['-R', file]);
      else if (process.platform === 'win32') spawn('explorer', ['/select,', file]);
      else spawn('xdg-open', [outDir]);
      return json(res, 200, {ok: true});
    }
    if (req.method === 'DELETE' && p.startsWith('/api/outputs/')) {
      const file = path.join(outDir, path.basename(decodeURIComponent(p.split('/')[3])));
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return json(res, 200, {outputs: listOutputs()});
    }
    if (req.method === 'POST' && p === '/api/studio') {
      const body = await readBody(req);
      if (body.action === 'start') startStudio();
      else stopStudio();
      return json(res, 200, {running: Boolean(studio), url: studioUrl});
    }
    if (req.method === 'GET' && p.startsWith('/out/')) {
      const file = path.join(outDir, path.basename(decodeURIComponent(p.slice(5))));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      const st = fs.statSync(file);
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.mov') ? 'video/quicktime' : file.endsWith('.srt') ? 'text/plain' : 'video/mp4';
      const range = req.headers.range;
      if (range) {
        const [startStr, endStr] = range.replace('bytes=', '').split('-');
        const start = Number(startStr);
        const end = endStr ? Number(endStr) : st.size - 1;
        res.writeHead(206, {'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': type});
        return fs.createReadStream(file, {start, end}).pipe(res);
      }
      res.writeHead(200, {'Content-Length': st.size, 'Content-Type': type, 'Accept-Ranges': 'bytes'});
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404);
    res.end('not found');
  } catch (error) {
    json(res, 500, {error: error.message});
  }
});

setInterval(() => send('machine', machine()), 2500);

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Remotion dashboard  http://localhost:${PORT}`);
  console.log(`  project: ${cwd}`);
  console.log(`  skill:   ${SKILL_DIR}`);
  console.log(`  budget:  ${settings.budget}% -> ${concurrencyFor(settings.budget, false)} tabs (1080p), ${concurrencyFor(settings.budget, true)} tabs (4K), gl=${settings.gl}, hw=${settings.hw}`);
  if (!entryPoint) console.warn('  no src/index.ts found: renders will fail until the project has an entry point');
  await refreshCompositions();
  console.log(`  compositions: ${compositions.join(', ') || compositionsError || 'none'}`);
});

process.on('SIGINT', () => {
  stopStudio();
  process.exit(0);
});
