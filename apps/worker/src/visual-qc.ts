import crypto from 'node:crypto';
import { mediaCommand } from './media-command';
export async function visualQc(file: string, duration: number, expectMotion: boolean, signal?: AbortSignal) {
    const samples: {
        at: number;
        mean: number;
        sha256: string;
    }[] = [];
    for (const at of [0, Math.min(.25, duration * .1), duration * .45, Math.max(0, duration - .1)]) {
        const result = await mediaCommand('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], signal);
        if (result.code !== 0 || result.stdout.length !== 160 * 90 * 3)
            throw new Error('Visual sample could not be decoded');
        const bytes = result.stdout, mean = bytes.reduce((sum, value) => sum + value, 0) / bytes.length;
        samples.push({
            at, mean, sha256: crypto.createHash('sha256').update(bytes).digest('hex')
        });
    }
    if (samples.some(sample => sample.mean < 1 || sample.mean > 254))
        throw new Error('Blank black or white picture detected');
    if (expectMotion && new Set(samples.map(sample => sample.sha256)).size < 2)
        throw new Error('Motion scene is stuck at a single picture');
    return {
        blankFrames: false, motion: !expectMotion || new Set(samples.map(sample => sample.sha256)).size >= 2, samples
    };
}
