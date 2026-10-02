import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const baseline = 'tests/architecture/baselines', actual = '.cache/architecture-smoke';
function pixels(file: string) {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
        maxBuffer: 1024 ** 2
    });
    if (result.status !== 0 || result.stdout.length !== 320 * 320 * 3)
        throw new Error('Cannot decode regression frame ' + file);
    return result.stdout;
}
const results = fs.readdirSync(baseline).filter(name => name.endsWith('.png')).map(name => {
    const a = pixels(path.join(baseline, name)), b = pixels(path.join(actual, name));
    let difference = 0;
    for (let i = 0; i < a.length; i++)
        difference += Math.abs(a[i] - b[i]);
    const normalizedDifference = difference / a.length / 255;
    return {
        name, normalizedDifference, passed: normalizedDifference < .035
    };
});
if (!results.length)
    throw new Error('Missing visual regression baselines');
fs.writeFileSync(path.join(actual, 'visual-regression.json'), JSON.stringify({
    threshold: .035, results
}, null, 2));
for (const result of results)
    console.log(result.name, (result.normalizedDifference * 100).toFixed(3) + '%', result.passed ? 'passed' : 'FAILED');
if (results.some(result => !result.passed))
    throw new Error('Visual regression changed; review frames before replacing baselines');
