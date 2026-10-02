import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { JobStore, database } from '@nuradi/database/jobs';
import { RenderRequestSchema } from '@nuradi/schemas/index';
import { demo } from '@nuradi/video/demo';
test('Postgres: duplicate IDs, atomic claims, fenced transitions, cancellation and offline queue', async (t) => {
    if (!process.env.NURADI_TEST_DATABASE) {
        t.skip('Set NURADI_TEST_DATABASE for real isolated database checks');
        return;
    }
    process.env.DATABASE_URL = process.env.NURADI_TEST_DATABASE;
    const sql = database(), store = new JobStore(sql), project = crypto.randomUUID(), worker = crypto.randomUUID(), other = crypto.randomUUID(), id = crypto.randomUUID(), offline = crypto.randomUUID();
    await sql('INSERT INTO projects(id,name) VALUES($1,$2)', [project, 'Architecture integration check']);
    t.after(async () => {
        await sql('DELETE FROM render_events WHERE render_id IN (SELECT id FROM render_jobs WHERE project_id=$1)', [project]);
        await sql('DELETE FROM queue_outbox WHERE render_id IN (SELECT id FROM render_jobs WHERE project_id=$1)', [project]);
        await sql('DELETE FROM render_jobs WHERE project_id=$1', [project]);
        await sql('DELETE FROM projects WHERE id=$1', [project]);
        await sql('DELETE FROM render_workers WHERE id=ANY($1::uuid[])', [[worker, other]]);
    });
    const request = RenderRequestSchema.parse({
        id, projectId: project, compositionId: 'SemanticExplainer', profile: 'preview', sceneSpec: demo
    });
    const sha = 'a'.repeat(40);
    await store.create(request, sha);
    await store.create(request, sha);
    assert.equal((await sql('SELECT count(*) AS n FROM render_jobs WHERE id=$1', [id]))[0].n, '1');
    await assert.rejects(store.create({
        ...request, profile: 'final-4k60'
    }, sha));
    await store.heartbeat(worker, 'test', '24.21.0', sha, {});
    await store.heartbeat(other, 'test2', '24.21.0', sha, {});
    const claims = await Promise.all([store.claim(worker, id), store.claim(other, id)]);
    assert.equal(claims.filter(Boolean).length, 1);
    const claimed = claims.find(Boolean)!;
    await assert.rejects(store.update(id, claimed.workerId!, crypto.randomUUID(), 'PREPARING', 0, 'fake'));
    await store.update(id, claimed.workerId!, claimed.leaseToken!, 'PREPARING', 0, 'release');
    await store.update(id, claimed.workerId!, claimed.leaseToken!, 'RENDERING', .3, 'frames');
    assert.equal((await store.cancel(id))!.status, 'CANCEL_REQUESTED');
    await assert.rejects(store.update(id, claimed.workerId!, claimed.leaseToken!, 'RENDERING', .4, 'frames'));
    await store.update(id, claimed.workerId!, claimed.leaseToken!, 'CANCELLED', .3, 'cancelled');
    await store.create({
        ...request, id: offline
    }, sha);
    assert.equal((await store.get(offline))!.status, 'QUEUED');
    await store.failExpired();
    assert.equal((await store.get(offline))!.status, 'QUEUED');
    assert.equal((await store.cancel(offline))!.status, 'CANCELLED');
    assert.ok((await store.events(id)).length >= 5);
    const low = crypto.randomUUID(), high = crypto.randomUUID(), future = crypto.randomUUID();
    await store.create({
        ...request, id: low, priority: 1
    }, sha);
    await store.create({
        ...request, id: high, priority: 9
    }, sha);
    await store.create({
        ...request, id: future, priority: 10, scheduledAt: new Date(Date.now() + 3600000).toISOString()
    }, sha);
    assert.equal(await store.claim(worker, future, project), null, 'Future jobs must remain queued');
    const first = await store.claim(worker, undefined, project);
    assert.equal(first?.id, high, 'Highest eligible priority must run first');
    await sql("UPDATE render_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [high]);
    await assert.rejects(store.update(high, worker, first!.leaseToken!, 'PREPARING', 0, 'expired'));
    await store.failExpired();
    assert.equal((await store.get(high))!.status, 'FAILED');
    assert.equal((await store.claim(worker, undefined, project))?.id, low);
    await store.cancel(low);
    const lowJob = (await store.get(low))!;
    await store.update(low, worker, lowJob.leaseToken!, 'CANCELLED', 0, 'cancelled');
    assert.equal((await store.get(future))!.status, 'QUEUED');
    await store.cancel(future);
    assert.ok((await store.analytics()).some(row => row.status === 'FAILED'));
    const summary = (await store.list()).find(job => job.id === high)!;
    assert.deepEqual(Object.keys(summary.sceneSpec).sort(), ['ratio', 'title']);
    assert.equal((await store.get(high))!.sceneSpec.scenes.length, demo.scenes.length);
});
