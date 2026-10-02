import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checksum } from './qc';
import { run } from './release';
import type { SceneSpec } from '@nuradi/schemas/index';
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
    return JSON.stringify(value);
}
export function bundleAssetKey(assets: SceneSpec['assets']) {
    return crypto.createHash('sha256').update(canonical([...assets].sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id)))).digest('hex');
}
export function sceneKey(releaseKey: string, spec: SceneSpec, sceneIndex: number, settings: object) {
    return crypto.createHash('sha256').update(canonical({
        releaseKey, style: spec.style, ratio: spec.ratio, seed: spec.seed, assets: spec.assets, scene: spec.scenes[sceneIndex], settings
    })).digest('hex');
}
export async function reuseScene(file: string) {
    try {
        const receipt = JSON.parse(fs.readFileSync(file + '.json', 'utf8'));
        return fs.statSync(file).size === receipt.size && await checksum(file) === receipt.sha256;
    }
    catch {
        return false;
    }
}
export async function recordScene(file: string) {
    const receipt = {
        sha256: await checksum(file), size: fs.statSync(file).size
    };
    fs.writeFileSync(file + '.json.tmp', JSON.stringify(receipt));
    fs.renameSync(file + '.json.tmp', file + '.json');
}
export async function joinScenes(files: string[], output: string, signal: AbortSignal, durations: number[]) {
    if (files.length === 1) {
        fs.copyFileSync(files[0], output);
        return;
    }
    const list = path.join(path.dirname(output), 'segments.txt');
    fs.writeFileSync(list, files.map((file, i) => "file '" + file.replaceAll("'", "'\\''") + "'\nduration " + durations[i]).join('\n'));
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output], process.cwd(), signal);
}
