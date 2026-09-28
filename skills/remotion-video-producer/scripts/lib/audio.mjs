/**
 * Audio in plain JS (no extra installs): 16-bit/float WAV read and write, integrated loudness per
 * ITU-R BS.1770-4 / EBU R128 (K-weighting, 400 ms blocks, absolute and relative gating), sample and
 * approximate true peak (4x oversampling), and gain. Remotion's bundled ffmpeg has no loudnorm filter,
 * so loudness is measured and set here.
 */
import fs from 'node:fs';

/** Write interleaved-free channel arrays (Float32Array per channel, -1..1) as 16-bit PCM WAV. */
export const writeWav = (file, channels, sampleRate) => {
  const n = channels[0].length;
  const ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), o);
      o += 2;
    }
  }
  fs.writeFileSync(file, buf);
};

/** Read a PCM (16/24/32-bit int or 32-bit float) WAV into {sampleRate, channels: Float32Array[]}. */
export const readWav = (file) => {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file} is not a WAV file`);
  let o = 12;
  let fmt = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    const body = o + 8;
    if (id === 'fmt ') {
      fmt = {format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14)};
      if (fmt.format === 0xfffe) fmt.format = buf.readUInt16LE(body + 24);
    } else if (id === 'data' && fmt) {
      const bytes = fmt.bits / 8;
      const end = Math.min(buf.length, body + (size === 0xffffffff || size === 0 ? buf.length : size));
      const frames = Math.floor((end - body) / (bytes * fmt.channels));
      const channels = Array.from({length: fmt.channels}, () => new Float32Array(frames));
      let p = body;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < fmt.channels; c++) {
          let v;
          if (fmt.format === 3) v = bytes === 4 ? buf.readFloatLE(p) : buf.readDoubleLE(p);
          else if (bytes === 2) v = buf.readInt16LE(p) / 32768;
          else if (bytes === 3) v = buf.readIntLE(p, 3) / 8388608;
          else if (bytes === 4) v = buf.readInt32LE(p) / 2147483648;
          else v = (buf[p] - 128) / 128;
          channels[c][i] = v;
          p += bytes;
        }
      }
      return {sampleRate: fmt.sampleRate, channels};
    }
    o = body + size + (size % 2);
  }
  throw new Error(`${file}: no audio data found`);
};

/** Biquad coefficients (RBJ) for the two K-weighting stages at any sample rate (BS.1770 Annex 1). */
const kWeighting = (fs) => {
  // Stage 1: high shelf, +4 dB above ~1.5 kHz (head effect).
  const shelf = (() => {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / fs);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    return {b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]};
  })();
  // Stage 2: high pass at ~38 Hz (RLB).
  const hp = (() => {
    const f0 = 38.13547087602444, Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / fs);
    const a0 = 1 + K / Q + K * K;
    return {b: [1, -2, 1], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]};
  })();
  return [shelf, hp];
};

const biquad = (x, {b, a}) => {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
};

/** Integrated loudness in LUFS (gated), or -Infinity for silence. Channels are treated as L/R (weight 1). */
export const integratedLoudness = ({sampleRate, channels}) => {
  const stages = kWeighting(sampleRate);
  const weighted = channels.map((c) => stages.reduce((sig, st) => biquad(sig, st), c));
  // 400 ms blocks with 75% overlap = sums of four consecutive 100 ms quarters.
  const hop = Math.round(0.1 * sampleRate);
  const n = channels[0].length;
  const quarters = Math.floor(n / hop);
  const q = new Float64Array(quarters);
  for (const w of weighted) {
    for (let k = 0; k < quarters; k++) {
      let e = 0;
      for (let i = k * hop; i < (k + 1) * hop; i++) e += w[i] * w[i];
      q[k] += e;
    }
  }
  const powers = [];
  for (let k = 0; k + 4 <= quarters; k++) powers.push((q[k] + q[k + 1] + q[k + 2] + q[k + 3]) / (4 * hop));
  if (!powers.length) return -Infinity;
  const lufs = (p) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lufs(p) > -70);
  if (!abs.length) return -Infinity;
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const rel = lufs(mean(abs)) - 10;
  const gated = abs.filter((p) => lufs(p) > rel);
  return gated.length ? lufs(mean(gated)) : -Infinity;
};

/** Sample peak and an approximate true peak (4x oversampling, windowed-sinc) in dBFS. */
export const peaks = ({channels}) => {
  const taps = 12;
  const ratio = 4;
  const kernel = [];
  for (let ph = 1; ph < ratio; ph++) {
    const k = [];
    for (let t = -taps + 1; t <= taps; t++) {
      const x = t - ph / ratio;
      const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / taps);
      k.push(sinc * w);
    }
    kernel.push(k);
  }
  let sample = 0;
  let truePeak = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i]);
      if (a > sample) sample = a;
      // Oversample only near loud samples (inter-sample overs happen next to them).
      if (a > 0.5 && i >= taps && i + taps < c.length) {
        for (const k of kernel) {
          let v = 0;
          for (let t = 0; t < k.length; t++) v += c[i - taps + 1 + t] * k[t];
          if (Math.abs(v) > truePeak) truePeak = Math.abs(v);
        }
      }
    }
  }
  truePeak = Math.max(truePeak, sample);
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  return {samplePeakDb: db(sample), truePeakDb: db(truePeak)};
};

/** Multiply every sample by `gain` (linear), in place. */
export const applyGain = ({channels}, gain) => {
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= gain;
};

/**
 * Bring audio to `target` LUFS without the true peak going above `ceiling` dBTP: gain first, then a
 * gentle soft limiter on anything that would still exceed the ceiling. Returns the measurements.
 */
export const normalizeLoudness = (audio, {target = -14, ceiling = -1} = {}) => {
  const before = integratedLoudness(audio);
  if (!Number.isFinite(before)) return {before, after: before, gainDb: 0, ...peaks(audio)};
  const gainDb = target - before;
  applyGain(audio, Math.pow(10, gainDb / 20));
  const limit = Math.pow(10, (ceiling - 0.3) / 20);
  let {truePeakDb} = peaks(audio);
  if (truePeakDb > ceiling) {
    // Soft knee above 70% of the limit: tanh keeps the shape musical and never exceeds `limit`.
    const knee = limit * 0.7;
    for (const c of audio.channels) {
      for (let i = 0; i < c.length; i++) {
        const a = Math.abs(c[i]);
        if (a > knee) c[i] = Math.sign(c[i]) * (knee + (limit - knee) * Math.tanh((a - knee) / (limit - knee)));
      }
    }
    truePeakDb = peaks(audio).truePeakDb;
  }
  return {before, after: integratedLoudness(audio), gainDb, ...peaks(audio)};
};
