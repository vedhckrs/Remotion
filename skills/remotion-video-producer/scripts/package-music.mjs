#!/usr/bin/env node
/**
 * Background music for a topic package, made locally and free. Nothing is downloaded and nothing can be
 * claimed: the default is an original bed synthesised on this machine from a seed (same package + video
 * = same music). Or import a track you have the rights to (YouTube Audio Library, a CC0 track) and its
 * licence is recorded with it.
 *
 *   node scripts/package-music.mjs <episode folder> [--video long|short|all] [--style pulse|glow|drive|calm]
 *        [--seed text] [--bpm 104] [--force]
 *   node scripts/package-music.mjs <episode folder> --video long --import track.mp3 --licence "YouTube Audio Library"
 *        [--title "Track"] [--artist "Name"] [--url https://...] [--attribution "text for the description"]
 *
 * Writes music/<video>.mp3 (48 kHz stereo 320k, -14 LUFS, peaks under -1 dBTP), music/credits.json, and the
 * package.json music entry {file, level}. Length follows the measured voice (or the estimate before voicing)
 * so the ending resolves as the video ends; the renderer loops it if the video grows later.
 * The bed is kept out of the voice's way: soft lowpassed pads, sub bass, a quiet high pluck, light drums.
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {sha256, validatePackage} from './lib/package-schema.mjs';
import {writeWav, readWav, normalizeLoudness} from './lib/audio.mjs';
import {ffmpeg} from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(String(args._[0] ?? ''));
if (!fs.existsSync(path.join(dir, 'production.json'))) {
  console.error('Usage: node scripts/package-music.mjs <episode folder> [--video long|short|all] [--style pulse|glow|drive|calm] [--import file --licence text]');
  process.exit(1);
}
const pkgFile = path.join(dir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const production = JSON.parse(fs.readFileSync(path.join(dir, 'production.json'), 'utf8'));
const report = validatePackage(dir);
const videos = production.videos.filter((v) => !args.video || args.video === 'all' || v.id === args.video);
const SR = 48000;
// Level under the voice (the renderer ducks it further while someone is speaking).
const LEVEL = {'9:16': 0.2, '16:9': 0.16};
const creditsFile = path.join(dir, 'music', 'credits.json');
const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, 'utf8')) : {};

// ---------------------------------------------------------------------------------------------------------
// Seeded randomness
const rng = (seedText) => {
  let h = parseInt(sha256(seedText).slice(0, 8), 16) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// Styles: tempo range, progression pool, which parts play, arpeggio density.
const STYLES = {
  pulse: {bpm: [100, 108], drums: 'soft', arp: 8, bright: 0.55}, // default long: steady, curious
  drive: {bpm: [112, 120], drums: 'full', arp: 16, bright: 0.7}, // default short: more forward motion
  glow: {bpm: [88, 96], drums: 'soft', arp: 8, bright: 0.45}, // warm, reflective
  calm: {bpm: [76, 84], drums: 'none', arp: 4, bright: 0.35}, // pads and pluck only
};
// Scale-degree progressions (semitones from the key root, chord quality m/M), 4 bars each.
const PROGRESSIONS = [
  [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], // i VI III VII
  [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'M']], // i iv VI V
  [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], // I V vi IV
  [[5, 'M'], [0, 'M'], [7, 'M'], [9, 'm']], // IV I V vi
  [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']], // i VII VI VII
  [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']], // vi IV I V
];
const ROOTS = [45, 46, 48, 50, 52, 53]; // A2 Bb2 C3 D3 E3 F3 (MIDI)

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// One-cycle wavetables, read with linear interpolation.
const TABLE = 4096;
const table = (harmonics) => {
  const t = new Float32Array(TABLE + 1);
  for (let i = 0; i <= TABLE; i++) {
    let v = 0;
    for (const [n, a] of harmonics) v += a * Math.sin((2 * Math.PI * n * i) / TABLE);
    t[i] = v;
  }
  let max = 0;
  for (const v of t) max = Math.max(max, Math.abs(v));
  for (let i = 0; i <= TABLE; i++) t[i] /= max;
  return t;
};
const SOFTSAW = table(Array.from({length: 10}, (_, k) => [k + 1, 1 / (k + 1) ** 1.3]));
const SINE = table([[1, 1]]);
const BASS = table([[1, 1], [2, 0.25], [3, 0.06]]);
const PLUCK = table([[1, 1], [2, 0.35], [3, 0.12], [4, 0.05]]);
const read = (tab, phase) => {
  const x = (phase - Math.floor(phase)) * TABLE;
  const i = x | 0;
  return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
};

/** Chord tones near the previous voicing (smooth voice leading). */
const voice = (root, quality, prev) => {
  const third = quality === 'm' ? 3 : 4;
  const base = [root, root + third, root + 7, root + (quality === 'm' ? 10 : 11)];
  let best = null;
  for (let inv = 0; inv < 4; inv++) {
    for (const oct of [48, 60]) {
      const notes = base.map((n, k) => ((n % 12) + oct + (k < inv ? 12 : 0))).sort((a, b) => a - b);
      const cost = prev ? notes.reduce((s, n, k) => s + Math.abs(n - prev[k]), 0) : Math.abs(notes[0] - 57);
      if (notes[0] >= 50 && notes[3] <= 74 && (!best || cost < best.cost)) best = {notes, cost};
    }
  }
  return best ? best.notes : base.map((n) => (n % 12) + 60);
};

/** Section plan in bars: intro, grooves, a breakdown every ~32 bars, final resolve. */
const plan = (bars, r) => {
  const out = [];
  const add = (name, n) => {
    for (let i = 0; i < n && out.length < bars; i++) out.push({name, first: i === 0, last: i === n - 1});
  };
  add('intro', Math.min(4, bars));
  let turn = 0;
  while (out.length < bars - 2) {
    add(turn % 2 === 0 ? 'A' : 'B', 8);
    add('B', 8);
    turn++;
    if (bars - out.length > 12) add(r() < 0.5 ? 'break' : 'A', 4);
  }
  while (out.length > bars - 2) out.pop();
  add('end', 2);
  return out.slice(0, bars);
};

const synth = (seconds, seedText, styleName, bpmArg) => {
  const r = rng(seedText);
  const style = STYLES[styleName] ?? STYLES.pulse;
  const bpm = Number(bpmArg) || Math.round(style.bpm[0] + r() * (style.bpm[1] - style.bpm[0]));
  const beat = 60 / bpm;
  const bar = beat * 4;
  const root = pick(r, ROOTS);
  const prog = pick(r, PROGRESSIONS);
  const bars = Math.max(4, Math.ceil(seconds / bar));
  const sections = plan(bars, r);
  const n = Math.ceil((bars * bar + 2.5) * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const arpL = new Float32Array(n);
  const arpR = new Float32Array(n);
  const pump = new Float32Array(n).fill(1);

  // Chords: one per bar, looping the 4-bar progression.
  let prev = null;
  const chords = sections.map((_, b) => {
    const [deg, q] = b === bars - 1 || b === bars - 2 ? prog[0] : prog[b % prog.length];
    const notes = voice(root + deg, q, prev);
    prev = notes;
    return {notes, hz: notes.map(hz), bass: ((root + deg) % 12) + 36, quality: q};
  });

  // Drums first (they drive the sidechain pump).
  const noise = rng(`${seedText}:noise`);
  const addKick = (t, amp) => {
    const s0 = Math.round(t * SR);
    let ph = 0;
    for (let i = 0; i < 0.32 * SR && s0 + i < n; i++) {
      const tt = i / SR;
      const f = 45 + 75 * Math.exp(-tt * 38);
      ph += f / SR;
      const v = amp * Math.sin(2 * Math.PI * ph) * Math.exp(-tt * 9) * Math.min(1, i / 48);
      L[s0 + i] += v;
      R[s0 + i] += v;
    }
    for (let i = 0; i < 0.3 * SR && s0 + i < n; i++) pump[s0 + i] = Math.min(pump[s0 + i], 0.55 + 0.45 * Math.min(1, i / (0.3 * SR)) ** 1.6);
  };
  const addHat = (t, amp, pan) => {
    const s0 = Math.round(t * SR);
    let lp = 0;
    for (let i = 0; i < 0.05 * SR && s0 + i < n; i++) {
      const w = noise() * 2 - 1;
      lp += 0.5 * (w - lp);
      const v = amp * (w - lp) * Math.exp(-(i / SR) * 90);
      L[s0 + i] += v * (1 - pan);
      R[s0 + i] += v * (1 + pan);
    }
  };
  const addClap = (t, amp) => {
    const s0 = Math.round(t * SR);
    let a = 0, b = 0;
    for (let i = 0; i < 0.18 * SR && s0 + i < n; i++) {
      const w = noise() * 2 - 1;
      a += 0.25 * (w - a); // lowpass
      b += 0.06 * (a - b); // remove lows -> band around 1-2 kHz
      const v = amp * (a - b) * Math.exp(-(i / SR) * 24);
      L[s0 + i] += v;
      R[s0 + i] += v;
    }
  };

  sections.forEach((sec, b) => {
    const t0 = b * bar;
    const groove = sec.name === 'A' || sec.name === 'B';
    if (style.drums === 'none' || !groove) return;
    for (let k = 0; k < 4; k++) {
      if (style.drums === 'full' || k % 2 === 0 || sec.name === 'B') addKick(t0 + k * beat, sec.name === 'B' ? 0.55 : 0.42);
      addHat(t0 + k * beat + beat / 2, sec.name === 'B' ? 0.07 : 0.05, k % 2 ? 0.3 : -0.3);
      if (sec.name === 'B' && (k === 1 || k === 3)) addClap(t0 + k * beat, 0.16);
    }
    if (style.drums === 'full' && sec.name === 'B') for (let k = 0; k < 8; k++) addHat(t0 + k * (beat / 2) + beat / 4, 0.025, 0);
  });

  // Pads: detuned soft saws per chord tone, slow attack, crossfaded bar to bar, lowpassed with a slow sweep.
  const detune = [0.9965, 1.0035];
  const phases = new Float64Array(8);
  let lpL = 0, lpR = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const b = Math.min(bars - 1, Math.floor(t / bar));
    const within = t - b * bar;
    const sec = sections[b];
    const xf = b === 0 ? 1 : Math.min(1, within / 0.35);
    let vl = 0, vr = 0;
    for (let k = 0; k < 4; k++) {
      for (let d = 0; d < 2; d++) {
        const idx = k * 2 + d;
        const f = (xf < 1 ? chords[Math.max(0, b - 1)].hz[k] * (1 - xf) + chords[b].hz[k] * xf : chords[b].hz[k]) * detune[d];
        phases[idx] += f / SR;
        const v = read(SOFTSAW, phases[idx]);
        if (d === 0) vl += v;
        else vr += v;
      }
    }
    const endFade = sec.name === 'end' ? Math.max(0, 1 - (t - (bars - 2) * bar) / (2 * bar + 2)) : 1;
    const introSwell = b < 2 ? Math.min(1, t / (bar * 1.5)) : 1;
    const lvl = (sec.name === 'break' ? 0.75 : 0.6) * introSwell * endFade;
    // Lowpass cutoff between ~700 Hz and ~1.6 kHz: warm, below the voice's presence band.
    const cutoff = 700 + 900 * style.bright * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / (bar * 8)));
    const g = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
    lpL += g * (vl - lpL);
    lpR += g * (vr - lpR);
    L[i] += 0.07 * lvl * lpL * pump[i];
    R[i] += 0.07 * lvl * lpR * pump[i];
  }

  // Bass: sub-heavy, root on beats (8ths in B sections), follows the pump.
  let bph = 0;
  sections.forEach((sec, b) => {
    if (sec.name === 'intro' || sec.name === 'break') return;
    const steps = sec.name === 'B' ? 8 : 4;
    const f = hz(chords[b].bass);
    for (let k = 0; k < steps; k++) {
      const s0 = Math.round((b * bar + k * (bar / steps)) * SR);
      const len = Math.round((bar / steps) * 0.92 * SR);
      const amp = sec.name === 'end' ? 0.18 * (k < 2 ? 1 : 0) : 0.2;
      if (!amp) continue;
      for (let i = 0; i < len && s0 + i < n; i++) {
        bph += f / SR;
        const env = Math.min(1, i / 120) * Math.min(1, (len - i) / 400) * (0.75 + 0.25 * Math.exp(-(i / SR) * 6));
        const v = amp * read(BASS, bph) * env * pump[s0 + i];
        L[s0 + i] += v;
        R[s0 + i] += v;
      }
    }
  });

  // Pluck arpeggio: high chord tones, short decay, ping-pong delay. Quiet and above the voice.
  const patterns = [[0, 1, 2, 3, 2, 1], [0, 2, 1, 3], [3, 2, 1, 0, 1, 2], [0, 1, 2, 1, 3, 2, 1, 2]];
  const pat = pick(r, patterns);
  let step = 0;
  sections.forEach((sec, b) => {
    if (sec.name === 'end' && b === bars - 1) return;
    const per = sec.name === 'intro' || sec.name === 'break' ? Math.max(4, style.arp / 2) : style.arp;
    for (let k = 0; k < per; k++) {
      const note = chords[b].notes[pat[step++ % pat.length]] + 24;
      if (note > 96) continue;
      const s0 = Math.round((b * bar + k * (bar / per)) * SR);
      const f = hz(note);
      const pan = Math.sin(step * 1.7) * 0.4;
      const amp = (sec.name === 'B' ? 0.05 : 0.04) * (k % 2 ? 0.75 : 1);
      let ph = 0;
      for (let i = 0; i < 0.45 * SR && s0 + i < n; i++) {
        ph += f / SR;
        const v = amp * read(PLUCK, ph) * Math.exp(-(i / SR) * 11) * Math.min(1, i / 60);
        arpL[s0 + i] += v * (1 - pan);
        arpR[s0 + i] += v * (1 + pan);
      }
    }
  });
  const delay = Math.round(beat * 0.75 * SR);
  for (let i = delay; i < n; i++) {
    // Ping-pong: left echoes into right and back, feedback 0.38, darkened.
    arpL[i] += 0.38 * arpR[i - delay] * 0.9;
    arpR[i] += 0.38 * arpL[i - delay] * 0.9;
  }
  for (let i = 0; i < n; i++) {
    L[i] += arpL[i];
    R[i] += arpR[i];
  }

  // Master: gentle high-pass (clears rumble), soft saturation, fade out at the very end.
  let hl = 0, hr = 0, pl = 0, pr = 0;
  const a = Math.exp((-2 * Math.PI * 30) / SR);
  const fadeFrom = n - Math.round(2.5 * SR);
  for (let i = 0; i < n; i++) {
    hl = a * (hl + L[i] - pl); pl = L[i];
    hr = a * (hr + R[i] - pr); pr = R[i];
    const fade = i > fadeFrom ? 1 - (i - fadeFrom) / (n - fadeFrom) : 1;
    L[i] = Math.tanh(hl * 1.2) * fade;
    R[i] = Math.tanh(hr * 1.2) * fade;
  }
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  return {audio: {sampleRate: SR, channels: [L, R]}, info: {bpm, key: `${names[root % 12]} ${prog[0][1] === 'm' ? 'minor' : 'major'}`, bars, seconds: +(n / SR).toFixed(2)}};
};

/** Save as 320k MP3 (a WAV bed for an 8-minute video is over 100 MB). */
const save = (out, audio) => {
  const tmp = `${out}.tmp.wav`;
  writeWav(tmp, audio.channels, SR);
  const res = ffmpeg(['-y', '-v', 'error', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', String(SR), out]);
  fs.rmSync(tmp);
  if (res.status !== 0) throw new Error(`MP3 encode failed: ${res.stderr}`);
};

// ---------------------------------------------------------------------------------------------------------
fs.mkdirSync(path.join(dir, 'music'), {recursive: true});
pkg.music = pkg.music ?? {};
for (const video of videos) {
  const file = `music/${video.id}.mp3`;
  const out = path.join(dir, file);
  const vr = report.videos?.[video.id] ?? {};
  const seconds = (vr.measuredSeconds ?? vr.estimatedSeconds ?? video.targetSeconds?.[1] ?? 60) + 0.5;
  const style = String(args.style ?? pkg.musicStyle?.[video.id] ?? (video.ratio === '9:16' ? 'drive' : 'pulse'));
  const level = pkg.music[video.id]?.level ?? LEVEL[video.ratio] ?? 0.16;

  if (args.import) {
    if (!args.licence) {
      console.error('--import needs --licence (for example "YouTube Audio Library" or "CC0"), so the rights are on record.');
      process.exit(1);
    }
    const src = path.resolve(String(args.import));
    const tmp = `${out}.tmp.wav`;
    const res = ffmpeg(['-y', '-v', 'error', '-i', src, '-vn', '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_s16le', tmp]);
    if (res.status !== 0) throw new Error(`Could not read ${src}: ${res.stderr}`);
    const audio = readWav(tmp);
    fs.rmSync(tmp);
    const m = normalizeLoudness(audio, {target: -14, ceiling: -1});
    save(out, audio);
    credits[video.id] = {source: 'import', file: path.basename(src), sha256: sha256(fs.readFileSync(src)), title: args.title ?? null, artist: args.artist ?? null, licence: String(args.licence), url: args.url ?? null, attribution: args.attribution ?? null, loudness: +m.after.toFixed(1), importedAt: new Date().toISOString()};
    console.log(`${video.id}: imported ${path.basename(src)} (${(audio.channels[0].length / SR).toFixed(1)} s, ${m.after.toFixed(1)} LUFS); the renderer loops it if shorter than the video`);
  } else {
    const seed = String(args.seed ?? `${pkg.id ?? path.basename(dir)}:${video.id}`);
    const key = sha256(JSON.stringify({seed, style, bpm: args.bpm ?? null, seconds: Math.ceil(seconds), v: 1}));
    if (!args.force && credits[video.id]?.key === key && fs.existsSync(out)) {
      console.log(`${video.id}: music unchanged (${credits[video.id].style}, ${credits[video.id].key_signature}, ${credits[video.id].bpm} BPM)`);
    } else {
      const t = Date.now();
      const {audio, info} = synth(seconds, seed, style, args.bpm);
      const m = normalizeLoudness(audio, {target: -14, ceiling: -1});
      save(out, audio);
      credits[video.id] = {source: 'generated', generator: 'package-music v1', licence: 'Original, generated locally. No third-party rights.', key, seed, style, bpm: info.bpm, key_signature: info.key, seconds: info.seconds, loudness: +m.after.toFixed(1), truePeak: +m.truePeakDb.toFixed(1), generatedAt: new Date().toISOString()};
      console.log(`${video.id}: ${info.seconds} s ${style} bed, ${info.key}, ${info.bpm} BPM, ${m.after.toFixed(1)} LUFS, peak ${m.truePeakDb.toFixed(1)} dBTP (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    }
  }
  pkg.music[video.id] = {file, level};
  const oldWav = path.join(dir, 'music', `${video.id}.wav`);
  if (fs.existsSync(oldWav)) fs.rmSync(oldWav);
}
fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 1) + '\n');
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
