#!/usr/bin/env node
/**
 * Voice a topic package: one ElevenLabs request per chunk of whole scenes (about 4,000 characters, so a
 * short is one request and a long video a few), with the neighbouring text passed along so the voice stays
 * continuous. Writes voice/<video>/voice-NN.mp3 and voice/<video>/timing.json with each scene's slice of the
 * audio and word timings measured from the recording (the renderer sizes every scene to it).
 *
 *   node scripts/package-voice.mjs <episode folder> [--video long|short|all] [--provider elevenlabs|macos]
 *        [--voice <id>] [--preset young-male-pro] [--model eleven_multilingual_v2] [--force] [--dry-run]
 *
 * Nothing is paid for twice: a chunk whose text, voice and model are unchanged is kept. Change one scene and
 * only its chunk is regenerated. Pronunciations from package.json (voice.pronunciations: [{word, say}]) are
 * applied to what is spoken only; captions keep the written word.
 * macos uses the built-in `say` (free, offline) with estimated word timing: for drafts and timing checks.
 * Env: ELEVENLABS_API_KEY in the project's .env (never in the package).
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadEnv, parseArgs, requireEnv} from './lib/env.mjs';
import {sha256} from './lib/package-schema.mjs';
import {VOICE_PRESETS, fetchVoices} from './lib/voice-presets.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(String(args._?.[0] ?? process.argv.slice(2).find((a) => !a.startsWith('--')) ?? ''));
if (!fs.existsSync(path.join(dir, 'production.json'))) {
  console.error('Usage: node scripts/package-voice.mjs <episode folder> [--video long|short|all] [--provider elevenlabs|macos] [--force] [--dry-run]');
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const production = JSON.parse(fs.readFileSync(path.join(dir, 'production.json'), 'utf8'));
const cfg = pkg.voice ?? {};
const provider = String(args.provider ?? cfg.provider ?? 'elevenlabs');
const model = String(args.model ?? cfg.model ?? 'eleven_multilingual_v2');
const presetName = String(args.preset ?? cfg.preset ?? 'young-male-pro');
const preset = VOICE_PRESETS[presetName];
const CHUNK = 4000;
const TAIL = 0.12; // seconds kept after the last word (breath and decay)
const videos = production.videos.filter((v) => !args.video || args.video === 'all' || v.id === args.video);

// Pronunciation: replace words in the spoken text only, remembering which written word each piece belongs to.
const pron = (cfg.pronunciations ?? []).map((p) => ({re: new RegExp(`^${p.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([.,!?;:’']*)$`), say: p.say}));
const spokenWords = (text) =>
  text.split(/\s+/).filter(Boolean).map((written) => {
    for (const p of pron) {
      const m = written.match(p.re);
      if (m) return {written, spoken: p.say + (m[1] ?? '')};
    }
    return {written, spoken: written};
  });

const resolveVoiceId = async () => {
  if (args.voice) return String(args.voice);
  if (cfg.voiceId) return cfg.voiceId;
  if (provider !== 'elevenlabs') return null;
  // A dry run stays offline: the voice used last time (from timing.json) or the preset's default.
  if (args['dry-run']) return null;
  try {
    const voices = await fetchVoices();
    const hit = voices.find((v) => v.category !== 'premade' && preset?.match(v)) ?? voices.find((v) => preset?.match(v));
    if (hit) return hit.id;
  } catch (e) {
    console.warn(`  could not list voices (${e.message.slice(0, 80)}); using the preset's default voice`);
  }
  return preset?.fallback ?? 'JBFqnCBsd6RMkjVDRZzb';
};

let format = 'mp3_44100_192';
const eleven = async (voiceId, text, previousText, nextText) => {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${format}`, {
    method: 'POST',
    headers: {'xi-api-key': requireEnv('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json'},
    body: JSON.stringify({text, model_id: model, voice_settings: {...(preset?.settings ?? {}), ...(cfg.settings ?? {})}, previous_text: previousText || undefined, next_text: nextText || undefined}),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && /output_format/i.test(body) && format !== 'mp3_44100_128') {
      format = 'mp3_44100_128';
      return eleven(voiceId, text, previousText, nextText);
    }
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return {audio: Buffer.from(json.audio_base64, 'base64'), alignment: json.alignment};
};

/** Word timings for `pieces` spoken as `text`, from ElevenLabs character alignment of exactly that text. */
const wordsFromAlignment = (pieces, alignment) => {
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  let offset = 0;
  return pieces.map((p) => {
    const at = offset;
    offset += p.spoken.length + 1; // the joining space
    const last = Math.min(at + p.spoken.length - 1, ends.length - 1);
    return {text: p.written, start: starts[Math.min(at, starts.length - 1)] ?? 0, end: ends[last] ?? 0};
  });
};

const macSay = (text, file) => {
  const r = spawnSync('say', ['-v', String(args.voice ?? 'Samantha'), '-r', '175', '-o', file, '--file-format=WAVE', '--data-format=LEI16@24000', text], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`say failed: ${r.stderr || r.error?.message}`);
  const bytes = fs.statSync(file).size;
  return (bytes - 44) / (24000 * 2);
};

const resolvedVoice = await resolveVoiceId();
for (const video of videos) {
  const out = path.join(dir, 'voice', video.id);
  const timingFile = path.join(out, 'timing.json');
  const previous = fs.existsSync(timingFile) ? JSON.parse(fs.readFileSync(timingFile, 'utf8')) : null;
  const voiceId = resolvedVoice ?? (provider === 'elevenlabs' ? (previous?.voiceId ?? preset?.fallback ?? 'JBFqnCBsd6RMkjVDRZzb') : null);
  // Chunks of whole scenes.
  const chunks = [];
  for (const scene of video.scenes) {
    const pieces = spokenWords(scene.narration);
    const spoken = pieces.map((p) => p.spoken).join(' ');
    const last = chunks[chunks.length - 1];
    if (provider === 'macos' || !last || last.text.length + spoken.length + 1 > CHUNK) chunks.push({scenes: [], text: ''});
    const c = chunks[chunks.length - 1];
    c.scenes.push({scene, pieces, from: c.text ? c.text.length + 1 : 0});
    c.text = c.text ? `${c.text} ${spoken}` : spoken;
  }
  const timing = {provider, voiceId, model: provider === 'elevenlabs' ? model : 'say', format, generatedAt: new Date().toISOString(), chunks: [], scenes: {}};
  let spent = 0;
  let reused = 0;
  for (const [i, c] of chunks.entries()) {
    const file = `voice-${String(i + 1).padStart(2, '0')}.${provider === 'macos' ? 'wav' : 'mp3'}`;
    const key = sha256(JSON.stringify({provider, voiceId, model, text: c.text, settings: cfg.settings ?? null}));
    const reuse = !args.force && previous?.chunks?.find((pc) => pc.key === key && fs.existsSync(path.join(out, pc.file)));
    if (reuse) {
      timing.chunks.push(reuse);
      reused++;
      for (const {scene} of c.scenes) timing.scenes[scene.id] = previous.scenes[scene.id];
      continue;
    }
    if (args['dry-run']) {
      console.log(`  ${video.id} ${file}: ${c.scenes.length} scenes, ${c.text.length} characters would be generated`);
      spent += c.text.length;
      continue;
    }
    fs.mkdirSync(out, {recursive: true});
    if (provider === 'macos') {
      const {scene, pieces} = c.scenes[0];
      const seconds = macSay(c.text, path.join(out, file));
      // Estimated word timing: proportional to characters.
      const total = pieces.reduce((a, p) => a + p.spoken.length + 1, 0);
      let t = 0.05;
      const words = pieces.map((p) => {
        const d = ((p.spoken.length + 1) / total) * (seconds - 0.1);
        const w = {text: p.written, start: +t.toFixed(3), end: +(t + d * 0.9).toFixed(3)};
        t += d;
        return w;
      });
      timing.scenes[scene.id] = {file, start: 0, end: +seconds.toFixed(3), words};
    } else {
      const prevText = i > 0 ? chunks[i - 1].text.slice(-600) : '';
      const nextText = chunks[i + 1]?.text.slice(0, 600) ?? '';
      console.log(`  ${video.id} ${file}: ${c.scenes.length} scenes, ${c.text.length} characters`);
      const {audio, alignment} = await eleven(voiceId, c.text, prevText, nextText);
      fs.writeFileSync(path.join(out, file), audio);
      const all = wordsFromAlignment(c.scenes.flatMap((s) => s.pieces), alignment);
      let k = 0;
      for (const {scene, pieces} of c.scenes) {
        const words = all.slice(k, k + pieces.length);
        k += pieces.length;
        const start = Math.max(0, words[0].start - 0.04);
        const end = words[words.length - 1].end + TAIL;
        timing.scenes[scene.id] = {file, start: +start.toFixed(3), end: +end.toFixed(3), words: words.map((w) => ({text: w.text, start: +(w.start - start).toFixed(3), end: +(w.end - start).toFixed(3)}))};
      }
      spent += c.text.length;
    }
    timing.chunks.push({file, key, characters: c.text.length});
  }
  if (!args['dry-run']) {
    fs.writeFileSync(timingFile, JSON.stringify(timing, null, 1) + '\n');
    const secs = Object.values(timing.scenes).reduce((a, s) => a + (s.end - s.start), 0);
    console.log(`${video.id}: ${Object.keys(timing.scenes).length} scenes voiced, ${Math.round(secs)} s of speech, ${spent} new characters${spent ? '' : ' (nothing regenerated)'}`);
  } else {
    console.log(`${video.id}: ${spent} characters would be spent (voice ${voiceId ?? provider})`);
    console.log(`ESTIMATE ${JSON.stringify({video: video.id, provider, characters: provider === 'elevenlabs' ? spent : 0, chunks: chunks.length, reused})}`);
  }
}
