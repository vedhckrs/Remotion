#!/usr/bin/env node
/**
 * Render a topic package on this machine, one scene at a time, keeping every finished scene. Change one
 * scene and only that scene is rendered again; stop half way and the next run carries on where it left off.
 * No Claude calls, no network: everything comes from the package.
 *
 *   node scripts/package-render.mjs <episode folder> [--video long|short|all] [--4k] [--hw] [--budget 50]
 *        [--gl angle] [--draft] [--no-captions] [--force]
 *
 * Run it from the Remotion project root. Per video:
 *   1. validate the package (stops on errors) and copy it into public/packages/<id>/
 *   2. render each scene as a silent H.264 segment into <folder>/renders/<video>/segments/, named by a key
 *      of everything that changes its picture (scene content, measured voice, brands, renderer code, quality)
 *   3. render the sound once (voice + music with ducking) as WAV, set it to -14 LUFS with peaks under
 *      -1 dBTP, and encode AAC 48 kHz
 *   4. join the segments without re-encoding and add the sound: <folder>/renders/<id>_<video>_<WxH>.mp4
 *   5. check the file (size, 60 fps, length, codecs, loudness, silence, blank or frozen pictures) and write
 *      renders/<video>/qc.json and renders/render-manifest.json
 *
 * --4k        render at twice the composition size (3840x2160 / 2160x3840), the channel master
 * --hw        hardware encoder (VideoToolbox on a Mac): faster and cooler, larger files
 * --budget N  percent of the machine to use (Chrome tabs = cores x N%, capped by memory / 4)
 * --draft     half size, fast encode, separate cache: for checking timing and layout quickly
 * Progress lines start with "PROGRESS " followed by JSON, for the dashboard.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {RENDERER_VERSION, renderInputs, sha256, validatePackage} from './lib/package-schema.mjs';
import {integratedLoudness, normalizeLoudness, peaks, readWav, writeWav} from './lib/audio.mjs';
import {ffmpeg, ffmpegBuffer, ffprobe} from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const src = path.resolve(String(args._[0] ?? ''));
const project = process.cwd();
if (!fs.existsSync(path.join(src, 'production.json'))) {
  console.error('Usage: node scripts/package-render.mjs <episode folder> [--video long|short|all] [--4k] [--hw] [--budget 50] [--draft] [--force]');
  process.exit(1);
}
if (!fs.existsSync(path.join(project, 'src', 'episode'))) {
  console.error('Run this from the Remotion project root (src/episode/ not found). Update the project with scaffold.sh first.');
  process.exit(1);
}
try {
  os.setPriority(10); // keep the Mac responsive; Chrome inherits it
} catch {
  // not permitted: carry on at normal priority
}

const progress = (o) => console.log(`PROGRESS ${JSON.stringify(o)}`);
const fail = (msg) => {
  console.error(`\n${msg}`);
  process.exit(1);
};

// 1. Validate --------------------------------------------------------------------------------------------
const report = validatePackage(src, {projectDir: project});
if (report.errors.length) fail(`Package has errors, fix them first:\n  ${report.errors.join('\n  ')}`);
const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
const production = JSON.parse(fs.readFileSync(path.join(src, 'production.json'), 'utf8'));
const id = String(pkg.id ?? path.basename(src)).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const videos = production.videos.filter((v) => !args.video || args.video === 'all' || v.id === args.video);
if (!videos.length) fail(`No video "${args.video}" in this package (has: ${production.videos.map((v) => v.id).join(', ')})`);

// Copy the package into public/packages/<id> (the renderer reads it from there). Renders stay out.
const pub = path.join(project, 'public', 'packages', id);
const same = path.resolve(pub) === src;
const sync = (from, to) => {
  fs.mkdirSync(to, {recursive: true});
  for (const e of fs.readdirSync(from, {withFileTypes: true})) {
    if (e.name === 'renders' || e.name.startsWith('.')) continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) sync(a, b);
    else {
      const sa = fs.statSync(a);
      const sb = fs.existsSync(b) ? fs.statSync(b) : null;
      if (!sb || sb.size !== sa.size || sb.mtimeMs < sa.mtimeMs) fs.copyFileSync(a, b);
    }
  }
};
if (!same) sync(src, pub);

// Quality settings ----------------------------------------------------------------------------------------
const draft = Boolean(args.draft);
const fourK = !draft && Boolean(args['4k']);
const hw = Boolean(args.hw) && (process.platform === 'darwin' || args.hw === 'force');
const budget = Math.min(100, Math.max(10, Number(args.budget ?? 50) || 50));
const cores = os.cpus().length;
let concurrency = Math.max(1, Math.min(Math.floor((cores * budget) / 100), Math.floor(os.totalmem() / 2 ** 30 / 4)));
if (fourK) concurrency = Math.max(1, Math.floor(concurrency / 2));
if (process.env.REMOTION_CONCURRENCY) concurrency = Number(process.env.REMOTION_CONCURRENCY);
const scale = draft ? 0.5 : fourK ? 2 : 1;
const gl = args.gl ?? process.env.REMOTION_GL ?? null;
// REMOTION_IGNORE_CERTS=1 only for machines behind an intercepting proxy (never needed on a normal Mac).
const chromiumOptions = {...(gl ? {gl} : {}), ...(process.env.REMOTION_IGNORE_CERTS === '1' ? {ignoreCertificateErrors: true} : {})};
const quality = (vertical) =>
  draft
    ? {crf: 30, x264Preset: 'veryfast'}
    : hw
      ? {hardwareAcceleration: 'if-possible', videoBitrate: fourK ? (vertical ? '50M' : '60M') : vertical ? '14M' : '16M'}
      : {crf: fourK ? 17 : 16, x264Preset: fourK ? 'medium' : 'slow'};

// Everything under src/episode and public/fonts decides how a scene looks.
const hashTree = (dir) => {
  if (!fs.existsSync(dir)) return '';
  const parts = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else parts.push(`${path.relative(dir, p)}:${sha256(fs.readFileSync(p))}`);
    }
  };
  walk(dir);
  return sha256(parts.join('\n'));
};
const rendererHash = sha256([RENDERER_VERSION, hashTree(path.join(project, 'src', 'episode')), hashTree(path.join(project, 'public', 'fonts')), fs.readFileSync(path.join(project, 'node_modules', 'remotion', 'package.json'), 'utf8').match(/"version":\s*"([^"]+)"/)?.[1] ?? ''].join('|'));

// 2-5 per video -----------------------------------------------------------------------------------------
const {bundle} = await import(path.join(project, 'node_modules', '@remotion', 'bundler', 'dist', 'index.js'));
const renderer = await import(path.join(project, 'node_modules', '@remotion', 'renderer', 'dist', 'index.js'));
const {openBrowser, renderMedia, selectComposition} = renderer.default ?? renderer;

console.log(`Bundling the project...`);
const serveUrl = await bundle({entryPoint: path.join(project, 'src', 'index.ts'), onProgress: () => undefined});
const browser = await openBrowser('chrome', {chromiumOptions, logLevel: 'error'});
const manifestFile = path.join(src, 'renders', 'render-manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
const t0 = Date.now();

try {
  for (const video of videos) {
    const vertical = video.ratio === '9:16';
    const compId = vertical ? 'EpisodeShort' : 'EpisodeLong';
    const inputProps = {packageId: id, video: video.id, captions: !args['no-captions'], music: true, onlyScenes: []};
    const comp = await selectComposition({serveUrl, id: compId, inputProps, puppeteerInstance: browser, chromiumOptions, logLevel: 'error'});
    const data = comp.props.data;
    const total = comp.durationInFrames;
    const q = quality(vertical);
    const W = Math.round(comp.width * scale);
    const H = Math.round(comp.height * scale);
    const settingsKey = sha256(JSON.stringify({scale, q, rendererHash, captions: inputProps.captions}));
    const outDir = path.join(src, 'renders', video.id);
    const segDir = path.join(outDir, draft ? 'segments-draft' : 'segments');
    fs.mkdirSync(segDir, {recursive: true});
    const vr = report.videos[video.id];
    console.log(`\n${id} ${video.id}: ${data.scenes.length} scenes, ${(total / comp.fps).toFixed(1)} s, ${W}x${H} @ ${comp.fps} fps, ${hw ? 'hardware' : 'x264'} encoder, ${concurrency} tabs`);

    // Silent picture, scene by scene.
    const segments = [];
    let rendered = 0;
    for (const [i, scene] of data.scenes.entries()) {
      // The landscape progress line depends on where the scene sits in the video.
      const where = vertical ? null : [scene.from, total];
      const key = sha256(JSON.stringify({s: vr.scenes[scene.id], frames: scene.frames, where, settingsKey})).slice(0, 16);
      const file = path.join(segDir, `${String(i + 1).padStart(2, '0')}-${scene.id}-${key}.mp4`);
      segments.push(file);
      if (fs.existsSync(file) && !args.force) {
        progress({video: video.id, scene: scene.id, index: i + 1, of: data.scenes.length, status: 'cached'});
        continue;
      }
      // Remove stale segments for this scene position.
      for (const f of fs.readdirSync(segDir)) if (f.startsWith(`${String(i + 1).padStart(2, '0')}-`) && path.join(segDir, f) !== file) fs.rmSync(path.join(segDir, f));
      const tmp = `${file}.part.mp4`;
      const ts = Date.now();
      await renderMedia({
        composition: comp,
        serveUrl,
        codec: 'h264',
        outputLocation: tmp,
        inputProps,
        frameRange: [scene.from, scene.from + scene.frames - 1],
        muted: true,
        scale,
        concurrency,
        puppeteerInstance: browser,
        chromiumOptions,
        logLevel: 'error',
        pixelFormat: 'yuv420p',
        colorSpace: 'bt709',
        overwrite: true,
        ...q,
        onProgress: ({progress: p}) => progress({video: video.id, scene: scene.id, index: i + 1, of: data.scenes.length, status: 'rendering', progress: +p.toFixed(3)}),
      });
      fs.renameSync(tmp, file);
      rendered++;
      const secs = (Date.now() - ts) / 1000;
      console.log(`  ${scene.id} rendered in ${secs.toFixed(1)} s (${(scene.frames / secs).toFixed(1)} fps)`);
      progress({video: video.id, scene: scene.id, index: i + 1, of: data.scenes.length, status: 'done', seconds: +secs.toFixed(1)});
    }
    console.log(`  picture: ${rendered} scenes rendered, ${data.scenes.length - rendered} reused`);

    // Sound: one pass for the whole video (no screenshots), then loudness.
    const timingFile = path.join(src, 'voice', video.id, 'timing.json');
    const musicSpec = pkg.music?.[video.id];
    const musicFile = musicSpec ? path.join(src, musicSpec.file) : null;
    const audioKey = sha256(JSON.stringify({
      timing: fs.existsSync(timingFile) ? sha256(fs.readFileSync(timingFile)) : null,
      music: musicFile && fs.existsSync(musicFile) ? sha256(fs.readFileSync(musicFile)) : null,
      level: musicSpec?.level ?? null,
      frames: data.scenes.map((s) => [s.from, s.frames]),
      rendererHash,
    })).slice(0, 16);
    const master = path.join(outDir, `audio-${audioKey}.wav`);
    let loud;
    if (!fs.existsSync(master) || args.force) {
      progress({video: video.id, stage: 'audio', status: 'rendering'});
      const mix = path.join(outDir, 'audio-mix.part.wav');
      await renderMedia({composition: comp, serveUrl, codec: 'wav', outputLocation: mix, inputProps, puppeteerInstance: browser, chromiumOptions, concurrency, overwrite: true, logLevel: 'error'});
      const audio = readWav(mix);
      loud = normalizeLoudness(audio, {target: -14, ceiling: -1});
      for (const f of fs.readdirSync(outDir)) if (/^audio-.*\.wav$/.test(f)) fs.rmSync(path.join(outDir, f));
      writeWav(master, audio.channels, audio.sampleRate);
      console.log(`  sound: ${loud.before.toFixed(1)} -> ${loud.after.toFixed(1)} LUFS, true peak ${loud.truePeakDb.toFixed(1)} dBTP`);
    } else {
      console.log(`  sound: unchanged, reused`);
    }

    // Join and mux.
    progress({video: video.id, stage: 'mux', status: 'running'});
    const list = path.join(outDir, 'segments.txt');
    fs.writeFileSync(list, segments.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    const finalName = `${id}_${video.id}_${W}x${H}${draft ? '_draft' : ''}.mp4`;
    const finalFile = path.join(src, 'renders', finalName);
    const tmpFinal = `${finalFile}.part.mp4`;
    const mux = ffmpeg(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', master, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', vertical ? '256k' : '320k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', tmpFinal]);
    if (mux.status !== 0) fail(`Joining failed: ${mux.stderr}`);
    fs.renameSync(tmpFinal, finalFile);

    // 5. QC.
    progress({video: video.id, stage: 'qc', status: 'running'});
    const qc = runQc({file: finalFile, master, W, H, fps: comp.fps, total, scenes: data.scenes, vertical});
    fs.writeFileSync(path.join(outDir, 'qc.json'), JSON.stringify(qc, null, 1) + '\n');
    const status = qc.checks.some((c) => c.level === 'error' && !c.pass) ? 'failed' : qc.checks.some((c) => !c.pass) ? 'passed-with-warnings' : 'passed';
    manifest[video.id + (draft ? '-draft' : '')] = {
      file: `renders/${finalName}`,
      sha256: sha256(fs.readFileSync(finalFile)),
      bytes: fs.statSync(finalFile).size,
      width: W,
      height: H,
      fps: comp.fps,
      frames: total,
      seconds: +(total / comp.fps).toFixed(3),
      settings: {scale, hw, draft, ...q},
      rendererVersion: RENDERER_VERSION,
      rendererHash,
      inputs: renderInputs(src, video.id, vr.scenes, musicSpec),
      scenes: Object.fromEntries(data.scenes.map((s, i) => [s.id, path.basename(segments[i])])),
      audio: path.basename(master),
      qc: status,
      renderedAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
    for (const c of qc.checks) console.log(`  ${c.pass ? 'ok  ' : c.level === 'error' ? 'FAIL' : 'warn'}  ${c.name}: ${c.detail}`);
    console.log(`  ${status.toUpperCase()}: ${path.relative(process.cwd(), finalFile)} (${(fs.statSync(finalFile).size / 2 ** 20).toFixed(1)} MB)`);
    progress({video: video.id, stage: 'done', status, file: finalFile});
  }
} finally {
  await browser.close({silent: true}).catch(() => undefined);
}
console.log(`\nFinished in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

// ---------------------------------------------------------------------------------------------------------
function runQc({file, master, W, H, fps, total, scenes, vertical}) {
  const checks = [];
  const check = (name, pass, detail, level = 'error') => checks.push({name, pass: Boolean(pass), detail, level});
  const probe = JSON.parse(ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).stdout || '{}');
  const v = probe.streams?.find((s) => s.codec_type === 'video');
  const a = probe.streams?.find((s) => s.codec_type === 'audio');
  const [num, den] = String(v?.r_frame_rate ?? '0/1').split('/').map(Number);
  const duration = Number(probe.format?.duration ?? 0);
  check('picture size', v?.width === W && v?.height === H, `${v?.width}x${v?.height} (expected ${W}x${H})`);
  check('frame rate', Math.abs(num / den - fps) < 0.01, `${(num / den).toFixed(3)} fps`);
  check('video codec', v?.codec_name === 'h264' && v?.pix_fmt === 'yuv420p', `${v?.codec_name} ${v?.pix_fmt} ${v?.color_space ?? ''}`.trim());
  check('length', Math.abs(duration - total / fps) <= 2 / fps + 0.05, `${duration.toFixed(3)} s (expected ${(total / fps).toFixed(3)} s)`);
  check('sound codec', a?.codec_name === 'aac' && Number(a?.sample_rate) === 48000 && a?.channels === 2, `${a?.codec_name} ${a?.sample_rate} Hz ${a?.channels} ch`);

  const audio = readWav(master);
  const lufs = integratedLoudness(audio);
  const pk = peaks(audio);
  check('loudness', Math.abs(lufs + 14) <= 1, `${lufs.toFixed(1)} LUFS (target -14 ±1)`);
  check('true peak', pk.truePeakDb <= -0.9, `${pk.truePeakDb.toFixed(1)} dBTP (limit -1)`);
  // Speech present in every scene that has a voice; no long silent stretch anywhere.
  const sr = audio.sampleRate;
  const ch = audio.channels[0];
  const rmsDb = (from, to) => {
    let e = 0;
    const a0 = Math.max(0, Math.floor(from * sr));
    const a1 = Math.min(ch.length, Math.floor(to * sr));
    for (let i = a0; i < a1; i++) e += ch[i] * ch[i];
    return a1 > a0 ? 10 * Math.log10(e / (a1 - a0) + 1e-12) : -120;
  };
  const quiet = scenes.filter((s) => s.voice && rmsDb(s.from / fps + 0.25, (s.from + s.frames) / fps) < -40).map((s) => s.id);
  check('voice in every scene', quiet.length === 0, quiet.length ? `no speech heard in ${quiet.join(', ')}` : `${scenes.filter((s) => s.voice).length} scenes`);
  let longest = 0;
  let run = 0;
  for (let t = 0; t < ch.length / sr; t += 0.1) {
    run = rmsDb(t, t + 0.1) < -55 ? run + 0.1 : 0;
    longest = Math.max(longest, run);
  }
  check('no dead air', longest < 2, `longest silence ${longest.toFixed(1)} s`, 'warning');

  // Pictures: decode one raw yuv420p frame at two points per scene (the bundled ffmpeg has no scale or select
  // filters, so no conversion), and read the luma plane: blank = almost no variation, frozen = no change.
  const luma = (t) => {
    const r = ffmpegBuffer(['-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'rawvideo', 'pipe:1']);
    return r.status === 0 && r.stdout.length >= W * H ? r.stdout : null;
  };
  const stats = (buf) => {
    const n = W * H;
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i += 7) {
      sum += buf[i];
      sq += buf[i] * buf[i];
    }
    const m = sum / Math.ceil(n / 7);
    return {mean: m, sd: Math.sqrt(Math.max(0, sq / Math.ceil(n / 7) - m * m))};
  };
  const blank = [];
  const frozen = [];
  for (const s of scenes) {
    const a1 = s.from / fps + (s.frames / fps) * 0.3;
    const b1 = s.from / fps + (s.frames / fps) * 0.85;
    const fa = luma(a1);
    const fb = luma(b1);
    if (!fa || !fb) {
      blank.push(`${s.id} (could not decode)`);
      continue;
    }
    if (stats(fa).sd < 2 || stats(fb).sd < 2) blank.push(s.id);
    let diff = 0;
    for (let i = 0; i < W * H; i += 5) diff += Math.abs(fa[i] - fb[i]);
    if (s.frames / fps > 3 && diff / Math.ceil((W * H) / 5) < 0.05) frozen.push(s.id);
  }
  check('no blank pictures', blank.length === 0, blank.length ? blank.join(', ') : `${scenes.length * 2} frames sampled`);
  check('picture changes within scenes', frozen.length === 0, frozen.length ? `unchanged in ${frozen.join(', ')}` : 'captions and beats move in every scene', 'warning');
  return {file: path.basename(file), checkedAt: new Date().toISOString(), loudness: +lufs.toFixed(2), truePeak: +pk.truePeakDb.toFixed(2), duration, checks};
}
