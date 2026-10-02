import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { SceneSpecSchema } from '@nuradi/schemas/index';
import { demo } from '@nuradi/video/demo';
import { checksum, verifyOutput } from '../../apps/worker/src/qc';
const smoke = process.argv.includes('--smoke'), resume = process.argv.includes('--resume');
const seconds = smoke ? 1 : 15, width = smoke ? 640 : 3840, height = smoke ? 360 : 2160;
const root = path.resolve('.worker/benchmarks');
fs.mkdirSync(root, {
    recursive: true
});
const resultsFile = path.join(root, smoke ? 'smoke-results.json' : 'results.json');
const results: any[] = resume && fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')).results : [];
function pressure() {
    return spawnSync('memory_pressure', ['-Q'], {
        encoding: 'utf8'
    }).stdout || '';
}
function pressurePercent(text: string) {
    const value = text.match(/System-wide memory free percentage:\s*(\d+)%/);
    return value ? Number(value[1]) : null;
}
function swap() {
    return spawnSync('sysctl', ['vm.swapusage'], {
        encoding: 'utf8'
    }).stdout || '';
}
function swapMiB(text: string) {
    const value = text.match(/used\s*=\s*([\d.]+)([MG])/);
    return value ? Number(value[1]) * (value[2] === 'G' ? 1024 : 1) : null;
}
const publicDir = path.join(root, 'public');
fs.mkdirSync(path.join(publicDir, 'assets'), {
    recursive: true
});
fs.cpSync('packages/video/public/fonts', path.join(publicDir, 'fonts'), {
    recursive: true
});
let videoAsset: any;
if (!smoke) {
    const source = path.join(publicDir, 'assets', 'benchmark.mp4');
    if (!fs.existsSync(source)) {
        console.log('Preparing 4K60 decoded-video fixture');
        const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=3840x2160:rate=60:duration=${seconds}`, '-c:v', process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264', '-b:v', '25M', '-pix_fmt', 'yuv420p', source], {
            encoding: 'utf8'
        });
        if (result.status !== 0)
            throw new Error('Cannot prepare video fixture: ' + result.stderr);
    }
    await verifyOutput(source, {
        width: 3840, height: 2160, fps: 60, duration: seconds, codec: 'h264', audio: false
    });
    videoAsset = {
        id: 'benchmarkVideo', path: 'assets/benchmark.mp4', sha256: await checksum(source), type: 'video'
    };
}
const serveUrl = await bundle({
    entryPoint: path.resolve('packages/video/src/index.tsx'), publicDir
});
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const families = smoke ? ['svg'] : ['svg', 'd3', 'three', 'video', 'mixed'];
for (const family of families) {
    const spec = SceneSpecSchema.parse({
        ...demo, assets: ['video', 'mixed'].includes(family) ? [videoAsset] : [], scenes: [{
                ...demo.scenes[0], duration: seconds, beats: demo.scenes[0].beats.filter(b => b.at < seconds), camera: [], backgroundAssetId: ['video', 'mixed'].includes(family) ? 'benchmarkVideo' : undefined, type: ['three', 'mixed'].includes(family) ? 'THREE_D' : family === 'd3' ? 'DATA' : 'PROCESS', data: [{
                        label: 'A', value: 20
                    }, {
                        label: 'B', value: 55
                    }, {
                        label: 'C', value: 90
                    }]
            }]
    });
    const original = await selectComposition({
        serveUrl, id: 'SemanticExplainer', inputProps: {
            spec
        }, browserExecutable
    });
    for (const concurrency of smoke ? [2] : [2, 3, 4, 5, 6])
        for (const cacheGiB of smoke ? [1] : [1, 2, 3, 4]) {
            if (results.some(result => result.family === family && result.concurrency === concurrency && result.cacheGiB === cacheGiB && !result.error)) {
                console.log('Resume:', family, concurrency, cacheGiB, 'already passed');
                continue;
            }
            const file = path.join(root, `${family}-${concurrency}-${cacheGiB}.mp4`), start = performance.now();
            const beforeSwap = swap();
            let peakNode = 0, minFree = os.freemem(), minPressure = pressurePercent(pressure());
            const sample = setInterval(() => {
                peakNode = Math.max(peakNode, process.memoryUsage().rss);
                minFree = Math.min(minFree, os.freemem());
            }, 500);
            const pressureSample = setInterval(() => {
                const next = pressurePercent(pressure());
                if (next !== null)
                    minPressure = minPressure === null ? next : Math.min(minPressure, next);
            }, 5000);
            const cancellation = (await import('@remotion/renderer')).makeCancelSignal();
            let memoryUnsafe = false;
            let error: string | null = null, qc: unknown = null;
            const safety = setInterval(() => {
                const percent = pressurePercent(pressure()), before = swapMiB(beforeSwap), after = swapMiB(swap());
                if ((percent !== null && percent < 10) || (before !== null && after !== null && after - before > 512)) {
                    memoryUnsafe = true;
                    cancellation.cancel();
                }
            }, 5000);
            try {
                await renderMedia({
                    serveUrl, composition: {
                        ...original, width, height, fps: 60, durationInFrames: seconds * 60
                    }, inputProps: {
                        spec
                    }, outputLocation: file, codec: 'h264', hardwareAcceleration: process.platform === 'darwin' ? 'if-possible' : 'disable', videoBitrate: smoke ? '4M' : '35M', browserExecutable, chromiumOptions: {
                        gl: 'angle'
                    }, concurrency, mediaCacheSizeInBytes: cacheGiB * 1024 ** 3, offthreadVideoCacheSizeInBytes: cacheGiB * 1024 ** 3, offthreadVideoThreads: 2, cancelSignal: cancellation.cancelSignal, logLevel: 'error'
                });
                qc = await verifyOutput(file, {
                    width, height, fps: 60, duration: seconds, codec: 'h264', audio: false
                });
            }
            catch (e) {
                error = memoryUnsafe ? 'Stopped at unsafe memory pressure or swap growth' : e instanceof Error ? e.message : 'failure';
            }
            finally {
                clearInterval(sample);
                clearInterval(pressureSample);
                clearInterval(safety);
            }
            const result = {
                family, concurrency, cacheGiB, seconds: Math.round((performance.now() - start) / 10) / 100, peakNodeGiB: peakNode / 1024 ** 3, minFreeGiB: minFree / 1024 ** 3, minPressurePercent: minPressure, beforeSwap, afterSwap: swap(), memoryPressure: pressure(), qc, error
            };
            const previous = results.findIndex(row => row.family === family && row.concurrency === concurrency && row.cacheGiB === cacheGiB);
            if (previous >= 0)
                results[previous] = result;
            else
                results.push(result);
            fs.writeFileSync(resultsFile, JSON.stringify({
                smoke, machine: os.hostname(), cpu: os.cpus()[0]?.model, memoryGiB: os.totalmem() / 1024 ** 3, node: process.versions.node, secondsPerFixture: seconds, results
            }, null, 2));
            console.log(family, concurrency, cacheGiB, result.seconds, error || 'QC passed', 'min pressure', minPressure);
        }
}
if (!smoke) {
    const profiles: Record<string, unknown> = {};
    for (const family of families) {
        const passing = results.filter(row => {
            const before = swapMiB(row.beforeSwap), after = swapMiB(row.afterSwap);
            return row.family === family && !row.error && row.minPressurePercent !== undefined && row.minPressurePercent !== null && row.minPressurePercent >= 20 && before !== null && after !== null && after - before <= 128;
        }).sort((a, b) => a.seconds - b.seconds);
        if (passing[0])
            profiles[family] = {
                concurrency: passing[0].concurrency, cacheGiB: passing[0].cacheGiB, measuredSeconds: passing[0].seconds
            };
    }
    fs.writeFileSync(path.resolve('.worker/machine-profile.json'), JSON.stringify({
        machine: os.hostname(), cpu: os.cpus()[0]?.model, node: process.versions.node, measuredAt: new Date().toISOString(), durationSeconds: seconds, memoryCriteria: {
            minimumPressurePercent: 20, maximumSwapGrowthMiB: 128
        }, profiles
    }, null, 2));
    if (Object.keys(profiles).length !== families.length)
        throw new Error('Some scene families have no accepted memory-safe profile; inspect results');
}
console.log(smoke ? 'Smoke only; no sustained hardware profile published.' : 'Measured profiles saved. Results describe this fixture matrix and current system load; a single uninterrupted long render still needs acceptance.');
