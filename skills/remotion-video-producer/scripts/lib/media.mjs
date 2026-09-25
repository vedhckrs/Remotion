import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const run = (cmd, args, options = {}) => spawnSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options});

/** Prefer Remotion's bundled ffmpeg/ffprobe; fall back to system binaries. */
const tool = (name) => {
  const local = path.join(process.cwd(), 'node_modules', '.bin', 'remotion');
  if (fs.existsSync(local)) return {cmd: local, prefix: [name]};
  const sys = run(process.platform === 'win32' ? 'where' : 'which', [name]);
  if (sys.status === 0) return {cmd: name, prefix: []};
  return {cmd: 'npx', prefix: ['remotion', name]};
};

export const ffprobe = (args) => {
  const t = tool('ffprobe');
  return run(t.cmd, [...t.prefix, ...args]);
};

export const ffmpeg = (args) => {
  const t = tool('ffmpeg');
  return run(t.cmd, [...t.prefix, ...args]);
};

/** Duration in seconds of an audio or video file. */
export const getDurationSeconds = (file) => {
  const res = ffprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const value = parseFloat((res.stdout || '').trim().split('\n').pop());
  if (!Number.isFinite(value)) {
    throw new Error(`Could not read duration of ${file}: ${res.stderr || res.stdout}`);
  }
  return value;
};

/** Trim leading/trailing silence in place (re-encodes to MP3 or WAV depending on extension). */
export const trimSilence = (file, thresholdDb = -45, minSilence = 0.25) => {
  const ext = path.extname(file);
  const tmp = file.replace(ext, `.trim${ext}`);
  const filter = `silenceremove=start_periods=1:start_threshold=${thresholdDb}dB:start_silence=${minSilence},areverse,silenceremove=start_periods=1:start_threshold=${thresholdDb}dB:start_silence=${minSilence},areverse`;
  const res = ffmpeg(['-y', '-i', file, '-af', filter, tmp]);
  if (res.status !== 0) throw new Error(`ffmpeg trim failed: ${res.stderr}`);
  fs.renameSync(tmp, file);
};

/** Convert any audio/video file to 16 kHz mono WAV for Whisper. */
export const toWhisperWav = (input, output) => {
  const res = ffmpeg(['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', output]);
  if (res.status !== 0) throw new Error(`ffmpeg convert failed: ${res.stderr}`);
  return output;
};

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.mp4', '.mov', '.webm'];

export const isMediaFile = (file) => AUDIO_EXTENSIONS.indexOf(path.extname(file).toLowerCase()) !== -1;
