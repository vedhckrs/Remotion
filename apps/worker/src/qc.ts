import fs from 'node:fs';
import crypto from 'node:crypto';
import { mediaCommand } from './media-command';
export function checksum(file: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    return new Promise<string>((resolve, reject) => {
        const hash = crypto.createHash('sha256'), stream = fs.createReadStream(file);
        const abort = () => stream.destroy(new Error('Checksum cancelled'));
        signal?.addEventListener('abort', abort, {
            once: true
        });
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('close', () => signal?.removeEventListener('abort', abort));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}
export async function verifyOutput(file: string, expected: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    codec: string;
    audio: boolean;
}, signal?: AbortSignal) {
    if (!fs.existsSync(file) || fs.statSync(file).size < 1000)
        throw new Error('Output is missing or empty');
    const probe = await mediaCommand('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], signal);
    if (probe.code !== 0)
        throw new Error('Output cannot be decoded');
    const data = JSON.parse(probe.stdout.toString()), video = data.streams.find((stream: any) => stream.codec_type === 'video'), audio = data.streams.find((stream: any) => stream.codec_type === 'audio');
    const [numerator, denominator] = String(video?.avg_frame_rate).split('/').map(Number), actualCodec = expected.codec === 'h265' ? 'hevc' : expected.codec;
    const volume = expected.audio ? await mediaCommand('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], signal) : null;
    const mean = volume ? Number(volume.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? '-Infinity') : 0;
    const checks = {
        audible: !expected.audio || (volume?.code === 0 && mean > -60), dimensions: video?.width === expected.width && video?.height === expected.height, fps: Math.abs(numerator / denominator - expected.fps) < .01, duration: Math.abs(Number(data.format.duration) - expected.duration) < Math.max(.1, 2 / expected.fps), codec: video?.codec_name === actualCodec, audio: !expected.audio || Boolean(audio)
    };
    if (Object.values(checks).some(value => !value))
        throw new Error('Output QC failed: ' + JSON.stringify(checks));
    const decode = await mediaCommand('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], signal);
    if (decode.code !== 0 || decode.stderr.trim())
        throw new Error('Encoded stream has decoding errors');
    return {
        checks, streams: data.streams, duration: Number(data.format.duration), size: fs.statSync(file).size
    };
}
