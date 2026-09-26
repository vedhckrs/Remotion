#!/usr/bin/env node
/**
 * Background music for a video: ElevenLabs Music API (instrumental, exact length) or guidance to
 * free libraries when no key is present.
 *
 *   node scripts/generate-music.mjs --id <videoId> [--mood energetic-tech] [--seconds 34] [--prompt "..."]
 *        [--model music_v2] [--out public/music/<videoId>-<mood>.mp3] [--bpm 124]
 *
 * Length defaults to the voiceover manifest total (plus 6 s tail) when public/voiceover/<id>/manifest.json
 * exists. Moods map to prompts tuned for narration beds: they stay instrumental, low in the midrange
 * where the voice sits, and end with a clean resolve so the fade-out lands.
 * Env: ELEVENLABS_API_KEY (.env). Music generated with your key is licensed to you per ElevenLabs terms.
 */
import fs from 'node:fs';
import path from 'node:path';
import {loadEnv, parseArgs} from './lib/env.mjs';
import {readManifest} from './lib/script-schema.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));
if (!args.id && !args.prompt) {
  console.error('Usage: node scripts/generate-music.mjs --id <videoId> [--mood energetic-tech|cinematic|lofi|corporate|hype|ambient|luxury] [--seconds 34]');
  process.exit(1);
}

const MOODS = {
  'energetic-tech': {bpm: 124, prompt: 'Energetic modern electronic track for a fast-paced tech explainer: punchy four-on-the-floor kick, tight sidechained synth bass, bright plucks, subtle risers before each 8-bar phrase, no vocals, minimal midrange so a voiceover sits on top, clean ending.'},
  hype: {bpm: 140, prompt: 'High-energy trap-influenced hype beat for social media: hard 808s, crisp hi-hat rolls, short brass stabs, dramatic drops every 8 bars, instrumental, leaves space in the vocal range, clean ending.'},
  corporate: {bpm: 110, prompt: 'Uplifting corporate background music: warm piano chords, light acoustic guitar, soft driving drums, optimistic strings swell, instrumental, unobtrusive under narration, clean resolve at the end.'},
  cinematic: {bpm: 90, prompt: 'Cinematic trailer-style underscore: low pulsing synth bass, building percussion, wide atmospheric pads, a single emotional string motif, instrumental, restrained midrange for voiceover, ends on a held chord.'},
  lofi: {bpm: 82, prompt: 'Chill lo-fi hip hop bed: dusty drums, warm Rhodes chords, vinyl texture, mellow bass, instrumental, relaxed and steady, minimal melody so speech stays clear, soft ending.'},
  ambient: {bpm: 70, prompt: 'Calm ambient background: evolving pads, gentle piano notes, airy textures, no drums, instrumental, very low dynamic range, ideal under a calm narration, fades naturally.'},
  luxury: {bpm: 100, prompt: 'Elegant luxury brand music: deep house groove, silky electric piano, refined percussion, sophisticated and confident, instrumental, spacious mix for voiceover, tasteful ending.'},
};

const mood = String(args.mood || 'energetic-tech');
const preset = MOODS[mood] || MOODS['energetic-tech'];
const manifest = args.id ? readManifest(path.join('public', 'voiceover', String(args.id), 'manifest.json')) : null;
const manifestSeconds = manifest ? manifest.scenes.reduce((s, sc) => s + sc.durationSeconds + (manifest.gapSeconds ?? 0.6), 0) : null;
const seconds = Number(args.seconds || (manifestSeconds ? Math.ceil(manifestSeconds + 6) : 40));
const lengthMs = Math.max(3000, Math.min(600000, Math.round(seconds * 1000)));
const bpm = Number(args.bpm || preset.bpm);
const prompt = args.prompt || `${preset.prompt} Around ${bpm} BPM. Duration ${seconds} seconds.`;
const out = args.out || path.join('public', 'music', `${args.id || 'track'}-${mood}.mp3`);

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.log('No ELEVENLABS_API_KEY in .env. Free alternatives (check each license before commercial use):');
  console.log('  - Pixabay Music        https://pixabay.com/music/        Pixabay Content License, no attribution');
  console.log('  - Mixkit               https://mixkit.co/free-stock-music/  Mixkit License, no attribution');
  console.log('  - Free Music Archive   https://freemusicarchive.org/     per-track CC licenses (filter CC0 / CC BY)');
  console.log('  - Chosic CC0 list      https://www.chosic.com/free-music/all/?attribution=no');
  console.log('  - YouTube Audio Library (YouTube uploads only)   https://studio.youtube.com -> Audio library');
  console.log(`Save the file as ${out} and set "music": {"src": "${path.relative('public', out)}", "level": 0.18} in the script JSON.`);
  process.exit(2);
}

console.log(`Composing ${seconds}s of "${mood}" (${bpm} BPM) with ElevenLabs Music...`);
const compose = async (modelId) => {
  const url = `https://api.elevenlabs.io/v1/music?output_format=${encodeURIComponent(args.format || 'mp3_44100_192')}`;
  const body = {prompt, music_length_ms: lengthMs, force_instrumental: true};
  if (modelId) body.model_id = modelId;
  const res = await fetch(url, {method: 'POST', headers: {'xi-api-key': key, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs Music ${res.status}: ${text.slice(0, 400)}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

let audio;
try {
  audio = await compose(args.model || 'music_v2');
} catch (error) {
  if (/model/i.test(error.message) && !args.model) {
    console.warn('  model_id rejected; retrying with the account default model');
    audio = await compose(null);
  } else {
    console.error(error.message);
    process.exit(1);
  }
}

fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, audio);
console.log(`Wrote ${out} (${(audio.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Script JSON: "music": {"src": "${path.relative('public', out).split(path.sep).join('/')}", "level": 0.18}`);
console.log('The MusicBed component ducks it under the voice automatically.');
