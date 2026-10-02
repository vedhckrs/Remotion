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
import crypto from 'node:crypto';
import {runQc} from './lib/package-qc.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {RENDERER_VERSION, renderInputs, sha256, validatePackage} from './lib/package-schema.mjs';
import {integratedLoudness, normalizeLoudness, peaks, readWav, writeWav} from './lib/audio.mjs';
import {ffmpeg, ffmpegBuffer, ffprobe} from './lib/media.mjs';
import {chromiumFor, episodeEntry, loadRemotion, lowerPriority, readableErrors, packageId, rendererHash as rendererHashOf, syncPackage, tabsFor} from './lib/render-kit.mjs';

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
lowerPriority();
readableErrors();

const progress = (o) => console.log(`PROGRESS ${JSON.stringify(o)}`);
const fail = (msg) => {
  console.error(`\n${msg}`);
  console.error(`ERROR ${msg.replace(/\n\s*/g, ' ').slice(0, 280)}`);
  process.exit(1);
};

// 1. Validate --------------------------------------------------------------------------------------------
const report = validatePackage(src, {projectDir: project});
if (report.errors.length) fail(`Package has errors, fix them first:\n  ${report.errors.join('\n  ')}`);
const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
const production = JSON.parse(fs.readFileSync(path.join(src, 'production.json'), 'utf8'));
const id = packageId(pkg, src);
const videos = production.videos.filter((v) => !args.video || args.video === 'all' || v.id === args.video);
if (!videos.length) fail(`No video "${args.video}" in this package (has: ${production.videos.map((v) => v.id).join(', ')})`);
// Voice and music must exist for the videos being rendered (the other video may still be waiting for its voice).
const missing = (report.todo ?? []).filter((t) => videos.some((v) => t.startsWith(`${v.id}:`)));
if (missing.length) fail(`Not ready to render yet. Still to do:\n  ${missing.join('\n  ')}\nRun package-voice.mjs / package-music.mjs (or tick Voice and Music in the dashboard).`);

// Copy the package into public/packages/<id> (the renderer reads it from there). Renders stay out.
syncPackage(src, project, id);

// Quality settings ----------------------------------------------------------------------------------------
const draft = Boolean(args.draft);
const fourK = !draft && Boolean(args['4k']);
const hw = Boolean(args.hw) && (process.platform === 'darwin' || args.hw === 'force');
const budget = Math.min(100, Math.max(10, Number(args.budget ?? 50) || 50));
const concurrency = tabsFor(budget, fourK);
const scale = draft ? 0.5 : fourK ? 2 : 1;
const gl = args.gl ?? process.env.REMOTION_GL ?? null;
const chromiumOptions = chromiumFor(gl);
const quality = (vertical) =>
  draft
    ? {crf: 30, x264Preset: 'veryfast'}
    : hw
      ? {hardwareAcceleration: 'if-possible', videoBitrate: fourK ? (vertical ? '50M' : '60M') : vertical ? '14M' : '16M'}
      : {crf: fourK ? 17 : 16, x264Preset: fourK ? 'medium' : 'slow'};

const rendererHash = rendererHashOf(project);
const {bundle, openBrowser, renderMedia, selectComposition} = await loadRemotion(project);

console.log(`Bundling the project...`);
const serveUrl = await bundle({entryPoint: episodeEntry(project), onProgress: () => undefined});
const browser = await openBrowser('chrome', {chromiumOptions, logLevel: 'error'});
// Cancel from the dashboard (SIGTERM) or Ctrl+C: close Chrome; finished scenes stay for the next run.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    browser.close({silent: true}).finally(() => process.exit(130));
    setTimeout(() => process.exit(130), 3000).unref();
  });
}
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
      inputs: renderInputs(src, video.id, vr.scenes, musicSpec, project),
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
    if (mux.status !== 0) throw new Error(`Joining failed: ${mux.stderr}`);
    fs.renameSync(tmpFinal, finalFile);

    // 5. QC.
    progress({video: video.id, stage: 'qc', status: 'running'});
    const qc = runQc({file: finalFile, master, W, H, fps: comp.fps, total, scenes: data.scenes, vertical});
    fs.writeFileSync(path.join(outDir, 'qc.json'), JSON.stringify(qc, null, 1) + '\n');
    const status = qc.checks.some((c) => c.level === 'error' && !c.pass) ? 'failed' : qc.checks.some((c) => !c.pass) ? 'passed-with-warnings' : 'passed';
    manifest[video.id + (draft ? '-draft' : '')] = {
      file: `renders/${finalName}`,
      sha256: hashFile(finalFile),
      bytes: fs.statSync(finalFile).size,
      width: W,
      height: H,
      fps: comp.fps,
      frames: total,
      seconds: +(total / comp.fps).toFixed(3),
      settings: {scale, hw, draft, captions: inputProps.captions, ...q},
      rendererVersion: RENDERER_VERSION,
      rendererHash,
      inputs: renderInputs(src, video.id, vr.scenes, musicSpec, project, {scale, hw, draft, captions: inputProps.captions, ...q}),
      scenes: Object.fromEntries(data.scenes.map((s, i) => [s.id, path.basename(segments[i])])),
      audio: path.basename(master),
      qc: status,
      renderedAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
    for (const c of qc.checks) console.log(`  ${c.pass ? 'ok  ' : c.level === 'error' ? 'FAIL' : 'warn'}  ${c.name}: ${c.detail}`);
    console.log(`  ${status.toUpperCase()}: ${path.relative(process.cwd(), finalFile)} (${(fs.statSync(finalFile).size / 2 ** 20).toFixed(1)} MB)`);
    progress({video: video.id, stage: status === 'failed' ? 'qc' : 'done', status, file: finalFile});
    if (status === 'failed') throw new Error(`QC failed for ${video.id}; final export blocked. See ${path.join(outDir, 'qc.json')}`);
  }
} finally {
  await browser.close({silent: true}).catch(() => undefined);
}
console.log(`\nFinished in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

// ---------------------------------------------------------------------------------------------------------
/** SHA-256 of a file read in 8 MB pieces (a 4K master is several GB; never load it whole). */
function hashFile(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8 * 2 ** 20);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}
