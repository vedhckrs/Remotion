#!/usr/bin/env node
/**
 * Transcribe audio locally with Whisper.cpp into Remotion Caption[] JSON.
 *
 *   node scripts/transcribe-whisper.mjs <file-or-folder> [--model medium.en] [--gap 0.6] [--offset -40] [--replace "remotion=Remotion,ai=AI"]
 *
 * - A folder with manifest.json: every scene is transcribed, per-scene captions are stored in the
 *   manifest and an absolute captions.json is written using the manifest gap.
 * - A single file: writes <file>.captions.json next to it.
 *
 * Requires @remotion/install-whisper-cpp in the project: npx remotion add @remotion/install-whisper-cpp
 * First run downloads Whisper.cpp and the model into ./whisper.cpp (gitignore it).
 */
import fs from 'node:fs';
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
const version = '1.7.4';
const whisperPath = path.join(process.cwd(), 'whisper.cpp');
const offsetMs = Number(args.offset ?? 0);
const replacements = {};
if (args.replace) {
  for (const pair of String(args.replace).split(',')) {
    const [from, to] = pair.split('=');
    if (from && to) replacements[from.trim()] = to.trim();
  }
}

console.log(`Installing Whisper.cpp ${version} and model ${model} (cached after the first run)...`);
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
