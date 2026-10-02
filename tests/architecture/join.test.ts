import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { joinScenes } from '../../apps/worker/src/scene-cache';
test('scene joining preserves exact video fps despite AAC encoder padding', async (t) => {
    if (spawnSync('ffmpeg', ['-version']).status !== 0) {
        t.skip('Install ffmpeg for encoded joining regression');
        return;
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nuradi-join-'));
    t.after(() => fs.rmSync(directory, {
        recursive: true, force: true
    }));
    const durations = [33 / 30, 38 / 30];
    const files = durations.map((duration, index) => {
        const file = path.join(directory, `scene-${index}.mp4`);
        const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=160x90:rate=30:duration=${duration}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`, '-c:v', 'libx264', '-c:a', 'aac', '-shortest', file], {
            encoding: 'utf8'
        });
        assert.equal(result.status, 0, result.stderr);
        return file;
    });
    const output = path.join(directory, 'joined.mp4');
    await joinScenes(files, output, new AbortController().signal, durations);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', output], {
        encoding: 'utf8'
    });
    assert.equal(probe.status, 0, probe.stderr);
    const video = JSON.parse(probe.stdout).streams.find((stream: {
        codec_type: string;
    }) => stream.codec_type === 'video');
    assert.equal(video.avg_frame_rate, '30/1');
    assert.equal(Number(video.nb_frames), 71);
    assert.ok(Math.abs(Number(video.duration) - 71 / 30) < .001);
});
import { verifyOutput } from '../../apps/worker/src/qc';
test('media QC keeps heartbeat timers responsive and honors cancellation', async (t) => {
    if (spawnSync('ffmpeg', ['-version']).status !== 0) {
        t.skip('Install ffmpeg for QC regression');
        return;
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nuradi-qc-'));
    t.after(() => fs.rmSync(directory, {
        recursive: true, force: true
    }));
    const file = path.join(directory, 'clip.mp4');
    assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=2', '-c:v', 'libx264', file]).status, 0);
    let heartbeats = 0;
    const timer = setInterval(() => heartbeats++, 5);
    try {
        const qc = await verifyOutput(file, {
            width: 320, height: 180, fps: 30, duration: 2, codec: 'h264', audio: false
        });
        assert.ok(qc.checks.fps);
        assert.ok(heartbeats > 0, 'Heartbeat was blocked by media inspection');
    }
    finally {
        clearInterval(timer);
    }
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(verifyOutput(file, {
        width: 320, height: 180, fps: 30, duration: 2, codec: 'h264', audio: false
    }, controller.signal), {
        name: 'AbortError'
    });
});
