#!/usr/bin/env node
/**
 * Transcribe audio locally with Whisper.cpp into Remotion Caption[] JSON.
 *
 *   node scripts/transcribe-whisper.mjs <file-or-folder> [--model medium.en] [--gap 0.6] [--offset -40] [--replace "remotion=Remotion,ai=AI"]
 *                                       [--whisper-dir ~/.cache/remotion-whisper] [--whisper-version 1.5.5]
 *
 * Whisper.cpp and models live in ONE shared cache (default ~/.cache/remotion-whisper, or WHISPER_DIR)
 * instead of every project, which matters on a 512 GB laptop: medium.en alone is ~1.5 GB.
 * On Apple Silicon whisper.cpp uses Metal automatically; medium.en runs faster than real time.
 * Models: tiny/base/small/medium (+ .en variants), large-v3, large-v3-turbo (needs whisper.cpp >= 1.7.x and cmake).
 *
 * - A folder with manifest.json: every scene is transcribed, per-scene captions are stored in the
 *   manifest and an absolute captions.json is written using the manifest gap.
 * - A single file: writes <file>.captions.json next to it.
 *
 * Requires @remotion/install-whisper-cpp in the project: npx remotion add @remotion/install-whisper-cpp
 * First run downloads Whisper.cpp and the model into the shared cache; later runs reuse them.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseArgs} from './lib/env.mjs';
import {isMediaFile, toWhisperWav} from './lib/media.mjs';
import {readManifest, sceneStarts, writeJson} from './lib/script-schema.mjs';
import {applyReplacements, normalizeSpacing, shiftCaptions} from './lib/alignment.mjs';

const args = parseArgs(process.argv.slice(2));
const target = args._[0];
if (!target || !fs.existsSync(target)) {
  console.error('Usage: node scripts/transcribe-whisper.mjs <audio-file | voiceover-folder> [--model medium.en]');
  process.exit(1);
}

const require = createRequire(path.join(process.cwd(), 'package.json'));
let whisper;
try {
  whisper = await import(require.resolve('@remotion/install-whisper-cpp'));
} catch {
  console.error('Install the package first: npx remotion add @remotion/install-whisper-cpp');
  process.exit(1);
}

const model = args.model || 'medium.en';
// 1.5.5 builds with plain make everywhere; large-v3-turbo needs a newer whisper.cpp, which needs cmake (brew install cmake).
const version = args['whisper-version'] || (model.indexOf('large-v3-turbo') === 0 ? '1.7.4' : '1.5.5');
const whisperPath = path.resolve(args['whisper-dir'] || process.env.WHISPER_DIR || path.join(os.homedir(), '.cache', 'remotion-whisper'));
fs.mkdirSync(whisperPath, {recursive: true});
const offsetMs = Number(args.offset ?? 0);
const replacements = {};
if (args.replace) {
  for (const pair of String(args.replace).split(',')) {
    const [from, to] = pair.split('=');
    if (from && to) replacements[from.trim()] = to.trim();
  }
}

console.log(`Whisper.cpp ${version} + model ${model} in ${whisperPath} (downloaded once, shared by all projects)...`);
await whisper.installWhisperCpp({to: whisperPath, version});
await whisper.downloadWhisperModel({model, folder: whisperPath});

const transcribeFile = async (file) => {
  const wav = toWhisperWav(file, file.replace(path.extname(file), '.16k.wav'));
  const output = await whisper.transcribe({
    model,
    whisperPath,
    whisperCppVersion: version,
    inputPath: wav,
    tokenLevelTimestamps: true,
    splitOnWord: true,
  });
  fs.unlinkSync(wav);
  const {captions} = whisper.toCaptions({whisperCppOutput: output});
  return normalizeSpacing(applyReplacements(shiftCaptions(captions, offsetMs), replacements));
};

const stat = fs.statSync(target);
if (stat.isDirectory()) {
  const manifestFile = path.join(target, 'manifest.json');
  const manifest = readManifest(manifestFile);
  if (!manifest) {
    console.error(`No manifest.json in ${target}. Run scripts/audio-durations.mjs first.`);
    process.exit(1);
  }
  const gap = Number(args.gap ?? manifest.gapSeconds ?? 0.6);
  for (const scene of manifest.scenes) {
    const file = path.join(target, scene.file);
    if (!isMediaFile(file)) continue;
    process.stdout.write(`  ${scene.id}... `);
    scene.captions = await transcribeFile(file);
    console.log(`${scene.captions.length} words`);
    writeJson(manifestFile, manifest);
  }
  const starts = sceneStarts(manifest.scenes, gap);
  const all = [];
  manifest.scenes.forEach((s, i) => all.push(...shiftCaptions(s.captions || [], Math.round(starts[i] * 1000))));
  writeJson(path.join(target, 'captions.json'), all);
  console.log(`Updated ${path.relative(process.cwd(), manifestFile)} and wrote captions.json (${all.length} words).`);
} else {
  const captions = await transcribeFile(target);
  const out = target.replace(path.extname(target), '.captions.json');
  writeJson(out, captions);
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${captions.length} words).`);
}
