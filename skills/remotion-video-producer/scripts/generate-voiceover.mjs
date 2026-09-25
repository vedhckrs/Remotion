#!/usr/bin/env node
/**
 * Generate per-scene voiceover from a script JSON.
 *
 *   node scripts/generate-voiceover.mjs --script public/script/<videoId>.json [options]
 *
 * Options
 *   --provider elevenlabs|openai   default: script.voice.provider or elevenlabs
 *   --voice <id>                   override voice id / name
 *   --model <id>                   override model id
 *   --gap 0.6                      seconds of air after each line (must match the composition)
 *   --only scene-03[,scene-04]     regenerate only these scene ids
 *   --out <dir>                    default public/voiceover/<videoId>
 *   --trim                         strip leading/trailing silence with ffmpeg
 *   --format mp3_44100_192         ElevenLabs output_format
 *   --dry-run                      print what would be generated
 *
 * Output: <out>/<sceneId>.mp3, <out>/manifest.json, <out>/captions.json (when word timing is available)
 * Env: ELEVENLABS_API_KEY or OPENAI_API_KEY (read from .env in the project root).
 */
import fs from 'node:fs';
import path from 'node:path';
import {loadEnv, parseArgs, requireEnv} from './lib/env.mjs';
import {getDurationSeconds, trimSilence} from './lib/media.mjs';
import {loadScript, readManifest, sceneStarts, writeJson} from './lib/script-schema.mjs';
import {elevenLabsAlignmentToCaptions, shiftCaptions} from './lib/alignment.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));

if (!args.script) {
  console.error('Usage: node scripts/generate-voiceover.mjs --script public/script/<videoId>.json [--provider elevenlabs|openai] [--only scene-01] [--gap 0.6] [--trim]');
  process.exit(1);
}

const script = loadScript(args.script);
const provider = args.provider || script.voice?.provider || 'elevenlabs';
const gap = Number(args.gap ?? 0.6);
const outDir = path.resolve(args.out || path.join('public', 'voiceover', script.videoId));
const only = args.only ? String(args.only).split(',').map((s) => s.trim()) : null;
const manifestFile = path.join(outDir, 'manifest.json');
const previous = readManifest(manifestFile);

fs.mkdirSync(outDir, {recursive: true});

const DEFAULTS = {
  elevenlabs: {
    voiceId: 'JBFqnCBsd6RMkjVDRZzb', // "George", a warm narrator. Replace per brief.
    model: 'eleven_multilingual_v2',
    settings: {stability: 0.45, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.0},
    format: 'mp3_44100_192',
  },
  openai: {
    voiceId: 'marin',
    model: 'gpt-4o-mini-tts',
    instructions: 'Confident, warm creator voice. Conversational pace, crisp consonants, natural emphasis on key words, no vocal fry.',
  },
};

const voiceId = args.voice || script.voice?.voiceId || DEFAULTS[provider].voiceId;
const model = args.model || script.voice?.model || DEFAULTS[provider].model;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withRetry = async (fn, label) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const wait = 1500 * attempt;
      console.warn(`  ${label}: attempt ${attempt} failed (${error.message}). Retrying in ${wait} ms`);
      await sleep(wait);
    }
  }
  throw lastError;
};

const generateElevenLabs = async (scene) => {
  const apiKey = requireEnv('ELEVENLABS_API_KEY');
  const format = args.format || DEFAULTS.elevenlabs.format;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${encodeURIComponent(format)}`;
  const body = {
    text: scene.voiceover,
    model_id: model,
    voice_settings: {...DEFAULTS.elevenlabs.settings, ...(script.voice?.settings || {})},
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {'xi-api-key': apiKey, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const audio = Buffer.from(json.audio_base64, 'base64');
  const alignment = json.normalized_alignment || json.alignment;
  const captions = alignment ? elevenLabsAlignmentToCaptions(alignment) : null;
  return {audio, captions, extension: format.startsWith('mp3') ? 'mp3' : format.startsWith('pcm') || format.startsWith('wav') ? 'wav' : 'mp3'};
};

const generateOpenAI = async (scene) => {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const body = {
    model,
    voice: voiceId,
    input: scene.voiceover,
    response_format: 'mp3',
  };
  const instructions = script.voice?.instructions || (model.indexOf('gpt-4o') !== -1 ? DEFAULTS.openai.instructions : null);
  if (instructions) body.instructions = instructions;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return {audio: Buffer.from(await res.arrayBuffer()), captions: null, extension: 'mp3'};
};

const generators = {elevenlabs: generateElevenLabs, openai: generateOpenAI};
if (!generators[provider]) {
  console.error(`Unknown provider "${provider}". Use elevenlabs or openai, or add a generator in this file.`);
  process.exit(1);
}

console.log(`Voiceover for "${script.videoId}" via ${provider} (voice ${voiceId}, model ${model}) -> ${path.relative(process.cwd(), outDir)}`);

const manifestScenes = [];
for (const scene of script.scenes) {
  const keep = only && only.indexOf(scene.id) === -1;
  const prev = previous?.scenes?.find((s) => s.id === scene.id);
  if (keep && prev && fs.existsSync(path.join(outDir, prev.file))) {
    manifestScenes.push(prev);
    console.log(`  = ${scene.id} (kept, ${prev.durationSeconds.toFixed(2)} s)`);
    continue;
  }
  if (args['dry-run']) {
    console.log(`  ~ ${scene.id}: "${scene.voiceover}"`);
    manifestScenes.push({id: scene.id, file: `${scene.id}.mp3`, durationSeconds: 0.8 + scene.voiceover.split(/\s+/).length * 0.42, text: scene.voiceover});
    continue;
  }
  const result = await withRetry(() => generators[provider](scene), scene.id);
  const file = `${scene.id}.${result.extension}`;
  const abs = path.join(outDir, file);
  fs.writeFileSync(abs, result.audio);
  if (args.trim) trimSilence(abs);
  const durationSeconds = getDurationSeconds(abs);
  const entry = {id: scene.id, file, durationSeconds, text: scene.voiceover, minSeconds: scene.minSeconds};
  if (result.captions && !args.trim) entry.captions = result.captions; // trimming shifts timing; re-transcribe if you trim
  manifestScenes.push(entry);
  console.log(`  + ${scene.id}: ${durationSeconds.toFixed(2)} s${entry.captions ? `, ${entry.captions.length} words aligned` : ''}`);

  // Write incrementally so a failure midway keeps what was generated.
  writeJson(manifestFile, {videoId: script.videoId, provider, voiceId, model, gapSeconds: gap, generatedAt: new Date().toISOString(), scenes: manifestScenes});
}

const manifest = {videoId: script.videoId, provider, voiceId, model, gapSeconds: gap, generatedAt: new Date().toISOString(), scenes: manifestScenes};
writeJson(manifestFile, manifest);

// Absolute captions for convenience (the composition recomputes these from the manifest as well).
if (manifestScenes.every((s) => s.captions)) {
  const starts = sceneStarts(manifestScenes, gap);
  const all = [];
  manifestScenes.forEach((s, i) => {
    all.push(...shiftCaptions(s.captions, Math.round(starts[i] * 1000)));
  });
  writeJson(path.join(outDir, 'captions.json'), all);
  console.log(`Wrote captions.json (${all.length} words)`);
} else if (!args['dry-run']) {
  console.log('No word timing from this provider. Run scripts/transcribe-whisper.mjs or transcribe-cloud.mjs on the output folder for captions.');
}

const total = manifestScenes.reduce((sum, s) => sum + s.durationSeconds + gap, 0);
console.log(`Done. ${manifestScenes.length} scenes, about ${total.toFixed(1)} s including ${gap} s gaps. Manifest: ${path.relative(process.cwd(), manifestFile)}`);
