import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { demo } from '@nuradi/video/demo';
import { SceneSpecSchema, sceneTypes } from '@nuradi/schemas/index';
const out = path.resolve('.cache/architecture-smoke');
fs.mkdirSync(out, {
    recursive: true
});
const chrome = process.env.REMOTION_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browserExecutable = fs.existsSync(chrome) ? chrome : undefined;
const serveUrl = await bundle({
    entryPoint: path.resolve('packages/video/src/index.tsx'), publicDir: path.resolve('packages/video/public')
});
const full = process.argv.includes('--gallery');
for (const type of full ? sceneTypes : ['PROCESS'] as const) {
    const scene = {
        ...demo.scenes[0], type, data: [{
                label: 'First', value: 35
            }, {
                label: 'Second', value: 70
            }, {
                label: 'Third', value: 95
            }], geo: [{
                id: 'india', label: 'India', longitude: 78, latitude: 22
            }, {
                id: 'europe', label: 'Europe', longitude: 10, latitude: 50
            }]
    };
    for (const ratio of ['16:9', '9:16'] as const) {
        const spec = SceneSpecSchema.parse({
            ...demo, ratio, scenes: [scene]
        });
        const props = {
            spec
        };
        const original = await selectComposition({
            serveUrl, id: 'SemanticExplainer', inputProps: props, browserExecutable, chromiumOptions: {
                gl: 'angle'
            }
        });
        const composition = {
            ...original, width: ratio === '9:16' ? 360 : 640, height: ratio === '9:16' ? 640 : 360
        };
        for (const frame of [15, 120, 210])
            await renderStill({
                serveUrl, composition, inputProps: props, frame, output: path.join(out, `${type}-${ratio.replace(':', 'x')}-${frame}.png`), browserExecutable, chromiumOptions: {
                    gl: 'angle'
                }
            });
        if (type === 'PROCESS')
            await renderMedia({
                serveUrl, composition: {
                    ...composition, durationInFrames: 120
                }, inputProps: props, outputLocation: path.join(out, `smoke-${ratio.replace(':', 'x')}.mp4`), codec: 'h264', browserExecutable, chromiumOptions: {
                    gl: 'angle'
                }, concurrency: 2, hardwareAcceleration: process.platform === 'darwin' ? 'if-possible' : 'disable', logLevel: 'error'
            });
    }
}
console.log('Architecture scene frames and clips rendered: ' + out);
