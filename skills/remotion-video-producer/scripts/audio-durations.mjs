#!/usr/bin/env node
/**
 * Build (or refresh) public/voiceover/<videoId>/manifest.json from audio files you already have.
 *
 *   node scripts/audio-durations.mjs public/voiceover/<videoId> [--script public/script/<videoId>.json] [--gap 0.6]
 *
 * Files are matched to scenes by name (<sceneId>.mp3|wav|m4a). Without a script, files are
 * ordered alphabetically and the file name (without extension) becomes the scene id.
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {getDurationSeconds, isMediaFile} from './lib/media.mjs';
import {loadScript, readManifest, writeJson} from './lib/script-schema.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = args._[0];
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node scripts/audio-durations.mjs public/voiceover/<videoId> [--script public/script/<videoId>.json] [--gap 0.6]');
  process.exit(1);
}

const gap = Number(args.gap ?? 0.6);
const script = args.script ? loadScript(args.script) : null;
const files = fs.readdirSync(dir).filter((f) => isMediaFile(f) && !f.endsWith('.trim.mp3')).sort();
const manifestFile = path.join(dir, 'manifest.json');
const previous = readManifest(manifestFile);

const order = script ? script.scenes.map((s) => s.id) : files.map((f) => path.parse(f).name);
const scenes = [];
for (const id of order) {
  const file = files.find((f) => path.parse(f).name === id);
  if (!file) {
    console.warn(`  ! no audio for scene "${id}"`);
    continue;
  }
  const durationSeconds = getDurationSeconds(path.join(dir, file));
  const scriptScene = script?.scenes.find((s) => s.id === id);
  const prev = previous?.scenes?.find((s) => s.id === id);
  scenes.push({
    id,
    file,
    durationSeconds,
    text: scriptScene?.voiceover ?? prev?.text ?? '',
    minSeconds: scriptScene?.minSeconds,
    ...(prev?.captions ? {captions: prev.captions} : {}),
  });
  console.log(`  ${id}: ${durationSeconds.toFixed(2)} s (${file})`);
}

writeJson(manifestFile, {
  videoId: script?.videoId ?? previous?.videoId ?? path.basename(dir),
  provider: previous?.provider ?? 'external',
  gapSeconds: gap,
  generatedAt: new Date().toISOString(),
  scenes,
});
console.log(`Wrote ${path.relative(process.cwd(), manifestFile)} with ${scenes.length} scenes.`);
