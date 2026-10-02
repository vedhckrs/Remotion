import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
export function visualQc(file: string, duration: number, expectMotion: boolean) { const samples = [Math.min(.25, duration * .1), duration * .45, Math.max(0, duration - .1)].map(at => { const result = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1024 ** 2 }); if (result.status !== 0 || result.stdout.length !== 160 * 90 * 3)
    throw new Error('Visual sample could not be decoded'); const bytes = result.stdout; const mean = bytes.reduce((n, b) => n + b, 0) / bytes.length; return { at, mean, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; }); if (samples.some(s => s.mean < 1 || s.mean > 254))
    throw new Error('Blank black or white picture detected'); if (expectMotion && new Set(samples.map(s => s.sha256)).size < 2)
    throw new Error('Motion scene is stuck at a single picture'); return { blankFrames: false, motion: !expectMotion || new Set(samples.map(s => s.sha256)).size >= 2, samples }; }
