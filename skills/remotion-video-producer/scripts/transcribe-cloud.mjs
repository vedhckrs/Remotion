#!/usr/bin/env node
/**
 * Transcribe audio with a cloud API into Remotion Caption[] JSON.
 *
 *   node scripts/transcribe-cloud.mjs <file-or-folder> --provider openai|elevenlabs [--language en] [--gap 0.6] [--offset -40] [--replace "a=b"]
 *
 * openai:     POST /v1/audio/transcriptions (whisper-1, verbose_json, word timestamps). OPENAI_API_KEY.
 * elevenlabs: POST /v1/speech-to-text (scribe_v2, word timestamps). ELEVENLABS_API_KEY.
 * Uses @remotion/openai-whisper or @remotion/elevenlabs converters when installed, otherwise built-in fallbacks.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadEnv, parseArgs, requireEnv} from './lib/env.mjs';
import {isMediaFile} from './lib/media.mjs';
import {readManifest, sceneStarts, writeJson} from './lib/script-schema.mjs';
import {applyReplacements, elevenLabsTranscriptToCaptionsFallback, normalizeSpacing, openAiWordsToCaptions, shiftCaptions} from './lib/alignment.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const target = args._[0];
const provider = args.provider || 'openai';
if (!target || !fs.existsSync(target) || ['openai', 'elevenlabs'].indexOf(provider) === -1) {
  console.error('Usage: node scripts/transcribe-cloud.mjs <audio-file | voiceover-folder> --provider openai|elevenlabs');
  process.exit(1);
}

const require = createRequire(path.join(process.cwd(), 'package.json'));
const tryImport = async (name) => {
  try {
    return await import(require.resolve(name));
  } catch {
    return null;
  }
};

const offsetMs = Number(args.offset ?? 0);
const replacements = {};
if (args.replace) {
  for (const pair of String(args.replace).split(',')) {
    const [from, to] = pair.split('=');
    if (from && to) replacements[from.trim()] = to.trim();
  }
}

const transcribeOpenAI = async (file) => {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  form.append('model', args.model || 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  if (args.language) form.append('language', String(args.language));
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {method: 'POST', headers: {Authorization: `Bearer ${apiKey}`}, body: form});
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const transcription = await res.json();
  const mod = await tryImport('@remotion/openai-whisper');
  return mod ? mod.openAiWhisperApiToCaptions({transcription}).captions : openAiWordsToCaptions(transcription);
};

const transcribeElevenLabs = async (file) => {
  const apiKey = requireEnv('ELEVENLABS_API_KEY');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  form.append('model_id', args.model || 'scribe_v2');
  form.append('timestamps_granularity', 'word');
  if (args.language) form.append('language_code', String(args.language));
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {method: 'POST', headers: {'xi-api-key': apiKey}, body: form});
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const transcript = await res.json();
  const mod = await tryImport('@remotion/elevenlabs');
  return mod ? mod.elevenLabsTranscriptToCaptions({transcript}).captions : elevenLabsTranscriptToCaptionsFallback(transcript);
};

const transcribe = async (file) => {
  const raw = provider === 'openai' ? await transcribeOpenAI(file) : await transcribeElevenLabs(file);
  return normalizeSpacing(applyReplacements(shiftCaptions(raw, offsetMs), replacements));
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
    scene.captions = await transcribe(file);
    console.log(`${scene.captions.length} words`);
    writeJson(manifestFile, manifest);
  }
  const starts = sceneStarts(manifest.scenes, gap);
  const all = [];
  manifest.scenes.forEach((s, i) => all.push(...shiftCaptions(s.captions || [], Math.round(starts[i] * 1000))));
  writeJson(path.join(target, 'captions.json'), all);
  console.log(`Updated ${path.relative(process.cwd(), manifestFile)} and wrote captions.json (${all.length} words).`);
} else {
  const captions = await transcribe(target);
  const out = target.replace(path.extname(target), '.captions.json');
  writeJson(out, captions);
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${captions.length} words).`);
}
