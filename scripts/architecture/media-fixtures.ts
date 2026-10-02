import {openFixtureBrowser} from './browser';
import { verifyAudioFixture } from '../../apps/worker/src/audio-qc';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';
import { SceneSpecSchema } from '@nuradi/schemas/index';
import { demo } from '@nuradi/video/demo';
import { verifyOutput } from '../../apps/worker/src/qc';
import { validateAssetFile } from '../../apps/worker/src/assets';
const out = path.resolve('.cache/media-fixtures'), pub = path.join(out, 'public');
fs.mkdirSync(path.join(pub, 'assets'), {
    recursive: true
});
fs.cpSync('packages/video/public/fonts', path.join(pub, 'fonts'), {
    recursive: true
});
const asset = (name: string, data: Buffer, type: string) => {
    const p = path.join(pub, 'assets', name);
    fs.writeFileSync(p, data);
    return {
        id: name.split('.')[0], path: 'assets/' + name, sha256: crypto.createHash('sha256').update(data).digest('hex'), type
    };
};
function tone(freq: number, duration: number) {
    const samples = Math.round(duration * 48000), b = Buffer.alloc(44 + samples * 2);
    b.write('RIFF');
    b.writeUInt32LE(b.length - 8, 4);
    b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(48000, 24);
    b.writeUInt32LE(96000, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++)
        b.writeInt16LE(Math.round(Math.sin(i / 48000 * freq * Math.PI * 2) * 4000), 44 + i * 2);
    return b;
}
const audio = [asset('voice.wav', tone(440, 4), 'voice'), asset('music.wav', tone(220, 4), 'music'), asset('impact.wav', tone(880, .25), 'sfx')];
const svg = asset('vector.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 10 L90 90 L10 90 Z" fill="#ffd34f"/></svg>'), 'svg');
validateAssetFile(path.join(pub, svg.path), 'svg');
const vertices = Buffer.alloc(36);
[-.5, -.5, 0, .5, -.5, 0, 0, .5, 0].forEach((v, i) => vertices.writeFloatLE(v, i * 4));
const json = Buffer.from(JSON.stringify({
    asset: {
        version: '2.0'
    }, scene: 0, scenes: [{
            nodes: [0]
        }], nodes: [{
            mesh: 0
        }], meshes: [{
            primitives: [{
                    attributes: {
                        POSITION: 0
                    }, material: 0
                }]
        }], materials: [{
            doubleSided: true, pbrMetallicRoughness: {
                baseColorFactor: [1, .8, .3, 1]
            }
        }], buffers: [{
            byteLength: 36
        }], bufferViews: [{
            buffer: 0, byteOffset: 0, byteLength: 36
        }], accessors: [{
            bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-.5, -.5, 0], max: [.5, .5, 0]
        }]
}));
const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const h = Buffer.alloc(20);
h.writeUInt32LE(0x46546c67, 0);
h.writeUInt32LE(2, 4);
h.writeUInt32LE(28 + padded.length + vertices.length, 8);
h.writeUInt32LE(padded.length, 12);
h.writeUInt32LE(0x4e4f534a, 16);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(vertices.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
const glb = asset('model.glb', Buffer.concat([h, padded, bh, vertices]), 'glb');
validateAssetFile(path.join(pub, glb.path), 'glb');
const videoPath = path.join(pub, 'assets/background.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=60:duration=4', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', videoPath]);
const video = asset('background.mp4', fs.readFileSync(videoPath), 'video');
const serveUrl = await bundle({
    entryPoint: path.resolve('packages/video/src/index.tsx'), publicDir: pub
});
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browserInstance = await openFixtureBrowser(browserExecutable);
try {
const kinds = ['audio', 'extrusion', 'glb', 'blur', 'portrait3d', 'video', 'mixed', 'funnel', 'map-poles', 'editorial'];
const only = process.argv.find(value => value.startsWith('--only='))?.slice(7);
if (only && !kinds.includes(only)) throw new Error('Unknown media fixture: ' + only);
for (const kind of only ? [only] : kinds) {
    const scene = {
        ...demo.scenes[0]
    };
    if (kind === 'audio') {
        scene.narration = 'A test narration.';
        scene.audio = {
            voiceAssetId: 'voice', musicAssetId: 'music', sfx: [{
                    at: 1.2, assetId: 'impact', volume: .4
                }]
        };
        scene.words = [{
                text: 'Gateway', start: 1, end: 2
            }];
    }
    else if (kind === 'video' || kind === 'mixed') {
        scene.backgroundAssetId = 'background';
        if (kind === 'mixed') {
            scene.type = 'THREE_D';
            scene.relationships = [];
            scene.beats = [];
        }
    }
    else if (kind === 'funnel') {
        scene.type = 'DATA';
        scene.chart = 'funnel';
        scene.data = [{label: 'Input', value: 100}, {label: 'Output', value: 20}];
    }
    else if (kind === 'map-poles') {
        scene.type = 'MAP';
        scene.geo = [{id: 'north', label: 'North', longitude: 180, latitude: 90}, {id: 'south', label: 'South', longitude: -180, latitude: -90}];
    }
    else if (kind === 'editorial') {
        scene.type = 'QUOTE';
    }
    else if (kind === 'blur')
        scene.motionBlur = true;
    else {
        scene.type = 'THREE_D';
        scene.entities = [{
                ...scene.entities[1], x: .5, y: .5, assetId: kind === 'extrusion' ? 'vector' : kind === 'glb' ? 'model' : undefined
            }];
        scene.beats = [];
        scene.relationships = [];
    }
    const spec = SceneSpecSchema.parse({
        ...demo, ratio: kind === 'portrait3d' ? '9:16' : '16:9', scenes: [scene], assets: kind === 'audio' ? audio : kind === 'extrusion' ? [svg] : kind === 'glb' ? [glb] : kind === 'video' || kind === 'mixed' ? [video] : []
    });
    const inputProps = {
        spec
    };
    const original = await selectComposition({
        puppeteerInstance: browserInstance, serveUrl, id: 'SemanticExplainer', inputProps, browserExecutable, chromiumOptions: {
            gl: process.platform === 'darwin' ? 'angle' : 'swangle'
        }
    });
    const composition = {
        ...original, width: kind === 'portrait3d' ? 360 : 640, height: kind === 'portrait3d' ? 640 : 360
    };
    await renderStill({
        puppeteerInstance: browserInstance, serveUrl, composition, inputProps, frame: 120, output: path.join(out, kind + '.png'), browserExecutable, chromiumOptions: {
            gl: process.platform === 'darwin' ? 'angle' : 'swangle'
        }
    });
    if (['audio', 'video', 'mixed'].includes(kind)) {
        const file = path.join(out, kind + '.mp4');
        await renderMedia({
            puppeteerInstance: browserInstance, serveUrl, composition, inputProps, outputLocation: file, codec: 'h264', hardwareAcceleration: process.platform === 'darwin' ? 'if-possible' : 'disable', browserExecutable, chromiumOptions: {
                gl: process.platform === 'darwin' ? 'angle' : 'swangle'
            }, concurrency: 2, logLevel: 'error'
        });
        const qc = await verifyOutput(file, {
            width: 640, height: 360, fps: 60, duration: 4, codec: 'h264', audio: kind === 'audio'
        });
        fs.writeFileSync(path.join(out, kind + '-qc.json'), JSON.stringify({
            ...qc, ...(kind === 'audio' ? {mix: verifyAudioFixture(file)} : {})
        }, null, 2));
    }
    console.log(kind + ' passed');
}

} finally { await browserInstance.close({silent: true}); }
