import path from 'node:path';
import {integratedLoudness,peaks,readWav} from './audio.mjs';
import {ffmpegBuffer,ffprobe} from './media.mjs';
export function runQc({file, master, W, H, fps, total, scenes, vertical}) {
  const checks = [];
  const check = (name, pass, detail, level = 'error') => checks.push({name, pass: Boolean(pass), detail, level});
  const probe = JSON.parse(ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).stdout || '{}');
  const v = probe.streams?.find((s) => s.codec_type === 'video');
  const a = probe.streams?.find((s) => s.codec_type === 'audio');
  const [num, den] = String(v?.r_frame_rate ?? '0/1').split('/').map(Number);
  const duration = Number(probe.format?.duration ?? 0);
  check('picture size', v?.width === W && v?.height === H, `${v?.width}x${v?.height} (expected ${W}x${H})`);
  check('frame rate', Math.abs(num / den - fps) < 0.01, `${(num / den).toFixed(3)} fps`);
  check('video codec', v?.codec_name === 'h264' && v?.pix_fmt === 'yuv420p', `${v?.codec_name} ${v?.pix_fmt} ${v?.color_space ?? ''}`.trim());
  check('length', Math.abs(duration - total / fps) <= 2 / fps + 0.05, `${duration.toFixed(3)} s (expected ${(total / fps).toFixed(3)} s)`);
  check('sound codec', a?.codec_name === 'aac' && Number(a?.sample_rate) === 48000 && a?.channels === 2, `${a?.codec_name} ${a?.sample_rate} Hz ${a?.channels} ch`);

  const audio = readWav(master);
  const lufs = integratedLoudness(audio);
  const pk = peaks(audio);
  check('loudness', Math.abs(lufs + 14) <= 1, `${lufs.toFixed(1)} LUFS (target -14 ±1)`);
  check('true peak', pk.truePeakDb <= -0.9, `${pk.truePeakDb.toFixed(1)} dBTP (limit -1)`);
  // Speech present in every scene that has a voice; no long silent stretch anywhere.
  const sr = audio.sampleRate;
  const ch = audio.channels[0];
  const rmsDb = (from, to) => {
    let e = 0;
    const a0 = Math.max(0, Math.floor(from * sr));
    const a1 = Math.min(ch.length, Math.floor(to * sr));
    for (let i = a0; i < a1; i++) e += ch[i] * ch[i];
    return a1 > a0 ? 10 * Math.log10(e / (a1 - a0) + 1e-12) : -120;
  };
  const quiet = scenes.filter((s) => s.voice && rmsDb(s.from / fps + 0.25, (s.from + s.frames) / fps) < -40).map((s) => s.id);
  check('voice in every scene', quiet.length === 0, quiet.length ? `no speech heard in ${quiet.join(', ')}` : `${scenes.filter((s) => s.voice).length} scenes`);
  let longest = 0;
  let run = 0;
  for (let t = 0; t < ch.length / sr; t += 0.1) {
    run = rmsDb(t, t + 0.1) < -55 ? run + 0.1 : 0;
    longest = Math.max(longest, run);
  }
  check('no dead air', longest < 2, `longest silence ${longest.toFixed(1)} s`, 'warning');

  // Pictures: decode one raw yuv420p frame at two points per scene (the bundled ffmpeg has no scale or select
  // filters, so no conversion), and read the luma plane: blank = almost no variation, frozen = no change.
  const luma = (t) => {
    const r = ffmpegBuffer(['-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'rawvideo', 'pipe:1']);
    return r.status === 0 && r.stdout.length >= W * H ? r.stdout : null;
  };
  const stats = (buf) => {
    const n = W * H;
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i += 7) {
      sum += buf[i];
      sq += buf[i] * buf[i];
    }
    const m = sum / Math.ceil(n / 7);
    return {mean: m, sd: Math.sqrt(Math.max(0, sq / Math.ceil(n / 7) - m * m))};
  };
  const blank = [];
  const frozen = [];
  for (const s of scenes) {
    const a1 = s.from / fps + (s.frames / fps) * 0.3;
    const b1 = s.from / fps + (s.frames / fps) * 0.85;
    const fa = luma(a1);
    const fb = luma(b1);
    if (!fa || !fb) {
      blank.push(`${s.id} (could not decode)`);
      continue;
    }
    if (stats(fa).sd < 2 || stats(fb).sd < 2) blank.push(s.id);
    let diff = 0;
    for (let i = 0; i < W * H; i += 5) diff += Math.abs(fa[i] - fb[i]);
    if (s.frames / fps > 3 && diff / Math.ceil((W * H) / 5) < 0.05) frozen.push(s.id);
  }
  check('no blank pictures', blank.length === 0, blank.length ? blank.join(', ') : `${scenes.length * 2} frames sampled`);
  check('picture changes within scenes', frozen.length === 0, frozen.length ? `unchanged in ${frozen.join(', ')}` : 'captions and beats move in every scene', 'warning');
  return {file: path.basename(file), checkedAt: new Date().toISOString(), loudness: +lufs.toFixed(2), truePeak: +pk.truePeakDb.toFixed(2), duration, checks};
}
