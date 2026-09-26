#!/usr/bin/env node
/**
 * Generate per-scene voiceover from a script JSON.
 *
 *   node scripts/generate-voiceover.mjs --script public/script/<videoId>.json [options]
 *
 * Options
 *   --provider elevenlabs|openai|macos   default: script.voice.provider or elevenlabs
 *                                  macos = the built-in `say` command (free, offline, macOS only).
 *                                  Use it to lock timing and pacing before spending TTS credits;
 *                                  swap to elevenlabs for the final. `say -v '?'` lists voices.
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
 * Env: ELEVENLABS_API_KEY or OPENAI_API_KEY (read from .env in the project root). None for macos.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadEnv, parseArgs, requireEnv} from './lib/env.mjs';
import {ffmpeg, getDurationSeconds, trimSilence} from './lib/media.mjs';
import {loadScript, readManifest, sceneStarts, writeJson} from './lib/script-schema.mjs';
import {elevenLabsAlignmentToCaptions, shiftCaptions} from './lib/alignment.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));

if (!args.script) {
  console.error('Usage: node scripts/generate-voiceover.mjs --script public/script/<videoId>.json [--provider elevenlabs|openai|macos] [--only scene-01] [--gap 0.6] [--trim]');
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
  macos: {
    voiceId: 'Samantha', // Download "Enhanced"/"Premium" voices in System Settings > Accessibility > Spoken Content for better quality (e.g. Ava, Zoe, Evan).
    model: 'say',
    rate: 180, // words per minute; 170-190 reads like a creator voice
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
      // Auth, quota-config and validation errors do not fix themselves; surface them immediately.
      if (/\b(400|401|402|403|404|422)\b|only works on macOS/.test(error.message)) throw error;
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

const generateMacOS = async (scene) => {
  if (process.platform !== 'darwin') {
    throw new Error('The macos provider uses the built-in `say` command and only works on macOS. Use --provider elevenlabs or openai here.');
  }
  const rate = Number(args.rate ?? script.voice?.settings?.rate ?? DEFAULTS.macos.rate);
  const aiff = path.join(outDir, `${scene.id}.tmp.aiff`);
  const mp3 = path.join(outDir, `${scene.id}.tmp.mp3`);
  const say = spawnSync('say', ['-v', voiceId, '-r', String(rate), '-o', aiff, scene.voiceover], {encoding: 'utf8'});
  if (say.status !== 0) throw new Error(`say failed (voice "${voiceId}"?): ${say.stderr || say.stdout}. List voices with: say -v '?'`);
  const enc = ffmpeg(['-y', '-i', aiff, '-ar', '44100', '-codec:a', 'libmp3lame', '-q:a', '2', mp3]);
  if (enc.status !== 0) throw new Error(`ffmpeg failed to encode ${aiff}: ${enc.stderr}`);
  const audio = fs.readFileSync(mp3);
  fs.unlinkSync(aiff);
  fs.unlinkSync(mp3);
  return {audio, captions: null, extension: 'mp3'};
};

const generators = {elevenlabs: generateElevenLabs, openai: generateOpenAI, macos: generateMacOS};
if (!generators[provider]) {
  console.error(`Unknown provider "${provider}". Use elevenlabs, openai or macos, or add a generator in this file.`);
  process.exit(1);
}
if (provider === 'macos' && process.platform !== 'darwin' && !args['dry-run']) {
  console.error('The macos provider uses the built-in `say` command and only works on macOS. Use --provider elevenlabs or openai here.');
  process.exit(1);
}
process.on('unhandledRejection', (error) => {
  console.error(`\nVoiceover failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Fix the cause and rerun; scenes already written are kept and can be skipped with --only <ids>.');
  process.exit(1);
});

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
  console.log(`No word timing from ${provider}. For captions run: node scripts/transcribe-whisper.mjs ${path.relative(process.cwd(), outDir)}`);
  if (provider === 'macos') console.log('macos voices are for timing drafts; regenerate with --provider elevenlabs for the final.');
}

const total = manifestScenes.reduce((sum, s) => sum + s.durationSeconds + gap, 0);
console.log(`Done. ${manifestScenes.length} scenes, about ${total.toFixed(1)} s including ${gap} s gaps. Manifest: ${path.relative(process.cwd(), manifestFile)}`);
