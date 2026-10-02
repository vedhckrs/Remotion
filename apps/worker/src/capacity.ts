import fs from 'node:fs';
export function freeDiskBytes(root: string) {
    const disk = fs.statfsSync(root);
    return disk.bavail * disk.bsize;
}
export function estimatedWorkingBytes(settings: {
    width: number;
    height: number;
    fps: number;
    codec: string;
    bitrate?: string;
}, duration: number) {
    const bitrate = settings.codec === 'prores' ? settings.width * settings.height * settings.fps * 3.5 : parseFloat(settings.bitrate || '35M') * 1000000;
    // Scene segments and joined delivery coexist; retain extra space for encoding and upload staging.
    return Math.ceil(duration * bitrate / 8 * 2.2 + 1024 ** 3);
}
export function assertCapacity(root: string, settings: {
    width: number;
    height: number;
    fps: number;
    codec: string;
    bitrate?: string;
}, duration: number) {
    const available = freeDiskBytes(root), required = estimatedWorkingBytes(settings, duration);
    if (available < required)
        throw new Error(`Insufficient free disk: estimated ${(required / 1024 ** 3).toFixed(1)} GiB required, ${(available / 1024 ** 3).toFixed(1)} GiB available. Preserve or clear completed local caches before retrying.`);
    return {
        available, required
    };
}
