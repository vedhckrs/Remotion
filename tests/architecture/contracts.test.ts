import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneSpecSchema, RenderRequestSchema, outputSettings, transitions, shouldReport } from '@nuradi/schemas/index';
import { demo } from '@nuradi/video/demo';
import { stateAt, cameraAt, sceneTimeline, semanticCues } from '@nuradi/video/motion';
import { networkGeometry, chartGeometry } from '@nuradi/video/geometry';
import { direct, validateDirectorOutput } from '@nuradi/video/director';
import { releaseCacheKey } from '../../apps/worker/src/release';
test('scene contracts reject unknown executable fields, traversal and invalid references', () => {
    for (const override of [{
            javascript: 'evil()'
        }, {
            assets: [{
                    id: 'x', path: 'assets/../secret', sha256: 'a'.repeat(64), type: 'voice'
                }]
        }, {
            scenes: [{
                    ...demo.scenes[0], relationships: [{
                            id: 'bad', from: 'missing', to: 'service'
                        }]
                }]
        }, {
            scenes: [{
                    ...demo.scenes[0], duration: Infinity
                }]
        }])
        assert.equal(SceneSpecSchema.safeParse({
            ...demo, ...override
        }).success, false);
});
test('render revisions and filesystem paths cannot be supplied by a user', () => {
    const valid = {
        id: crypto.randomUUID(), projectId: crypto.randomUUID(), compositionId: 'SemanticExplainer', profile: 'preview', sceneSpec: demo
    };
    assert.equal(RenderRequestSchema.safeParse(valid).success, true);
    for (const extra of [{
            gitSha: 'a'.repeat(40)
        }, {
            file: '/etc/passwd'
        }, {
            compositionId: 'ExecuteUserCode'
        }])
        assert.equal(RenderRequestSchema.safeParse({
            ...valid, ...extra
        }).success, false);
});
test('portrait profiles preserve resolution, fps and codec', () => {
    const spec = {
        ...demo, ratio: '9:16' as const
    };
    assert.deepEqual([outputSettings(spec, 'final-4k60').width, outputSettings(spec, 'final-4k60').height], [2160, 3840]);
    assert.equal(outputSettings(spec, 'preview').fps, 30);
    assert.equal(outputSettings(spec, 'master-prores').codec, 'prores');
});
test('arbitrary frame seeking produces deterministic choreography and camera', () => {
    const s = demo.scenes[0], entity = s.entities[1];
    const at = stateAt(s, entity, 2.7);
    stateAt(s, entity, .1);
    stateAt(s, entity, 3.9);
    assert.deepEqual(stateAt(s, entity, 2.7), at);
    assert.equal(at.variant, 'authenticated');
    assert.deepEqual(cameraAt(s, 2.7), cameraAt(s, 2.7));
});
test('preview and final preserve wall-clock scene durations', () => {
    const scenes = [...demo.scenes, {
            ...demo.scenes[0], id: 'second', duration: 1.017
        }];
    const a = sceneTimeline(scenes, 30), b = sceneTimeline(scenes, 60);
    assert.equal(a[1].from / 30, b[1].from / 60);
    assert.ok(Math.abs(a[1].duration / 30 - b[1].duration / 60) <= 1 / 30);
});
test('D3 layouts use seeded stopped simulation and handle zero data', () => {
    const ids = ['a', 'b', 'c'], links = [{
            from: 'a', to: 'b'
        }, {
            from: 'b', to: 'c'
        }];
    assert.deepEqual(networkGeometry(ids, links, 12), networkGeometry(ids, links, 12));
    const g = chartGeometry([{
            label: 'A', value: 0
        }], 300, 200);
    assert.ok(g.bars.every(b => Number.isFinite(b.height)));
});
test('director compiles semantic routing to validated declarative scenes', () => {
    const spec = direct('The gateway authenticates the request.');
    assert.equal(spec.scenes[0].type, 'PROCESS');
    assert.ok(spec.scenes[0].relationships.length);
    assert.throws(() => validateDirectorOutput({
        ...spec, javascript: 'evil'
    }));
});
test('spoken entity timestamps add emphasis cues', () => {
    const scene = {
        ...demo.scenes[0], words: [{
                text: 'Gateway', start: 3, end: 3.4
            }]
    };
    assert.ok(semanticCues(scene).some(b => b.at === 3 && b.target === 'gateway'));
});
test('progress is throttled with immediate stage and percentage changes', () => {
    const prev = {
        at: 1000, progress: .2, stage: 'frames'
    };
    assert.equal(shouldReport(prev, {
        progress: .201, stage: 'frames'
    }, 1100), false);
    assert.equal(shouldReport(prev, {
        progress: .22, stage: 'frames'
    }, 1100), true);
    assert.equal(shouldReport(prev, {
        progress: .2, stage: 'upload'
    }, 1100), true);
});
test('terminal states have no replay transitions and cache keys include exact dependencies', () => {
    for (const s of ['COMPLETED', 'FAILED', 'CANCELLED'] as const)
        assert.deepEqual(transitions[s], []);
    const key = releaseCacheKey('a'.repeat(40), 'lock', '24', '4.0.532');
    for (const args of [['b'.repeat(40), 'lock', '24', '4.0.532'], ['a'.repeat(40), 'other', '24', '4.0.532'], ['a'.repeat(40), 'lock', '26', '4.0.532']])
        assert.notEqual(releaseCacheKey(...args as [
            string,
            string,
            string,
            string
        ]), key);
});
test('untrusted SVG and GLB external dependencies are rejected', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { validateAssetFile } = await import('../../apps/worker/src/assets');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuradi-assets-'));
    try {
        const svg = path.join(dir, 'asset.svg');
        fs.writeFileSync(svg, '<svg><script>alert(1)</script></svg>');
        assert.throws(() => validateAssetFile(svg, 'svg'));
        fs.writeFileSync(svg, '<svg><path d="M0 0 L10 10"/></svg>');
        assert.doesNotThrow(() => validateAssetFile(svg, 'svg'));
        const json = Buffer.from(JSON.stringify({
            asset: {
                version: '2.0'
            }, buffers: [{
                    uri: 'https://example.com/data.bin'
                }]
        }));
        const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
        const header = Buffer.alloc(20);
        header.writeUInt32LE(0x46546c67, 0);
        header.writeUInt32LE(2, 4);
        header.writeUInt32LE(20 + padded.length, 8);
        header.writeUInt32LE(padded.length, 12);
        header.writeUInt32LE(0x4e4f534a, 16);
        const glb = path.join(dir, 'model.glb');
        fs.writeFileSync(glb, Buffer.concat([header, padded]));
        assert.throws(() => validateAssetFile(glb, 'glb'), /external/);
    }
    finally {
        fs.rmSync(dir, {
            recursive: true, force: true
        });
    }
});
test('scene cache invalidates changed semantics and rejects damaged receipts', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { sceneKey, reuseScene, recordScene } = await import('../../apps/worker/src/scene-cache');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuradi-scene-'));
    try {
        const file = path.join(dir, 'clip.mp4');
        fs.writeFileSync(file, 'encoded-fixture');
        await recordScene(file);
        assert.equal(await reuseScene(file), true);
        fs.writeFileSync(file, 'damaged-fixture');
        assert.equal(await reuseScene(file), false);
        const first = sceneKey('release', demo, 0, {
            fps: 60
        });
        assert.notEqual(sceneKey('release', {
            ...demo, scenes: [{
                    ...demo.scenes[0], headline: 'Changed'
                }]
        }, 0, {
            fps: 60
        }), first);
        assert.notEqual(sceneKey('release', demo, 0, {
            fps: 30
        }), first);
    }
    finally {
        fs.rmSync(dir, {
            recursive: true, force: true
        });
    }
});
test('SVG validation rejects encoded references, namespaces, external CSS and active timelines', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { validateAssetFile } = await import('../../apps/worker/src/assets');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nuradi-svg-'));
    const file = path.join(directory, 'test.svg');
    try {
        for (const source of ['<svg><use href="&#x68;ttps://example.com/a"/></svg>', '<svg><x:script>evil</x:script></svg>', '<svg><style>@import "other.css";</style></svg>', '<svg><animate attributeName="href"/></svg>', '<svg><image href="other.svg"/></svg>']) {
            fs.writeFileSync(file, source);
            assert.throws(() => validateAssetFile(file, 'svg'));
        }
        fs.writeFileSync(file, '<svg><defs><path id="safe"/></defs><use href="#safe"/></svg>');
        assert.doesNotThrow(() => validateAssetFile(file, 'svg'));
    }
    finally {
        fs.rmSync(directory, {
            recursive: true, force: true
        });
    }
});
test('bundle cache includes asset paths and scene contracts enforce media types', async () => {
    const { bundleAssetKey } = await import('../../apps/worker/src/scene-cache');
    const audio = {
        id: 'voice', path: 'assets/voice.wav', sha256: 'a'.repeat(64), type: 'voice' as const
    };
    assert.notEqual(bundleAssetKey([audio]), bundleAssetKey([{
            ...audio, path: 'assets/nested/voice.wav'
        }]));
    const image = {
        id: 'image', path: 'assets/image.svg', sha256: 'b'.repeat(64), type: 'svg' as const
    };
    const spoken = {
        ...demo, assets: [image], scenes: [{
                ...demo.scenes[0], audio: {
                    voiceAssetId: 'image', sfx: []
                }
            }]
    };
    assert.equal(SceneSpecSchema.safeParse(spoken).success, false);
    assert.equal(SceneSpecSchema.safeParse({
        ...demo, assets: [{
                ...audio, path: 'assets/run.js'
            }]
    }).success, false);
    assert.equal(SceneSpecSchema.safeParse({
        ...demo, assets: [audio, {
                ...audio, id: 'duplicate', sha256: 'b'.repeat(64)
            }]
    }).success, false);
    assert.equal(SceneSpecSchema.safeParse({
        ...demo, assets: [audio], scenes: [{
                ...demo.scenes[0], audio: {
                    voiceAssetId: 'voice', sfx: []
                }
            }]
    }).success, true);
});
test('funnel widths represent values and extreme map/network geometry stays in bounds', async () => {
    const { funnelGeometry, geoGeometry } = await import('@nuradi/video/geometry');
    const funnel = funnelGeometry([{
            label: 'A', value: 100
        }, {
            label: 'B', value: 20
        }], 1000, 400);
    assert.ok(funnel[0].path.includes('75'));
    assert.ok(funnel[1].path.includes('415'));
    const points = geoGeometry([{
            id: 'pole', label: 'Pole', longitude: 180, latitude: 90
        }], 640, 360);
    assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 640 && point.y >= 0 && point.y <= 360));
    const nodes = networkGeometry(Array.from({
        length: 50
    }, (_, index) => 'n' + index), [], 1);
    assert.ok(nodes.every(node => node.x >= .1 && node.x <= .9 && node.y >= .1 && node.y <= .9));
});
test('director never fabricates chart values and empty map/data scenes are rejected', () => {
    assert.equal(direct('Show statistics about growth.').scenes[0].type, 'EXPLAIN');
    const chart = direct('Growth moved from 20% to 40%.').scenes[0];
    assert.equal(chart.type, 'DATA');
    assert.deepEqual(chart.data.map(point => point.value), [20, 40]);
    const map = direct('Data travels from India to servers.').scenes[0];
    assert.equal(map.type, 'MAP');
    assert.equal(map.geo[0].id, 'india');
    for (const type of ['MAP', 'DATA'])
        assert.equal(SceneSpecSchema.safeParse({
            ...demo, scenes: [{
                    ...demo.scenes[0], type
                }]
        }).success, false);
});

test('director preserves long scripts and rejects oversized episodes explicitly', () => {
    const sentences = Array.from({length: 120}, (_, index) => `Sentence ${index} preserves its narration.`);
    assert.deepEqual(direct(sentences.join(' ')).scenes.map(scene => scene.narration), sentences);
    const long = Array.from({length: 170}, (_, index) => `word${index}`).join(' ');
    assert.equal(direct(long).scenes.map(scene => scene.narration).join(' '), long);
    assert.throws(() => direct(Array.from({length: 301}, () => 'A sentence.').join(' ')), /300 scenes/);
});
