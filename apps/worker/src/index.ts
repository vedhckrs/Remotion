import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { queuePoller } from '@nuradi/shared/transport';
import { JobSchema, type RenderJob } from '@nuradi/schemas/index';
import { prepareRelease, run } from './release';
import { execute } from './render';
if (process.versions.node.split('.')[0] !== '24')
    throw new Error('The architecture worker requires Node 24');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const site = process.env.NURADI_SITE_URL || 'https://nuradi.co.in', token = process.env.NURADI_WORKER_TOKEN;
const u = new URL(site), loopback = process.env.NURADI_LOCAL_TEST === 'true' && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
if ((!site.startsWith('https://') && !loopback) || !token || token.length < 32)
    throw new Error('Configure HTTPS site and worker token');
const home = path.join(repo, '.worker');
fs.mkdirSync(home, { recursive: true });
const lock = path.join(home, 'process.lock');
if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    try {
        process.kill(pid, 0);
        throw new Error('Architecture worker already running');
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ESRCH')
            throw e;
        fs.unlinkSync(lock);
    }
}
fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
process.on('exit', () => { try {
    fs.unlinkSync(lock);
}
catch { } });
const identity = path.join(home, 'worker-id');
if (!fs.existsSync(identity))
    fs.writeFileSync(identity, crypto.randomUUID(), { mode: 0o600 });
const workerId = fs.readFileSync(identity, 'utf8').trim();
let stopped = false;
let active: AbortController | null = null;
for (const s of ['SIGTERM', 'SIGINT'])
    process.on(s, () => { stopped = true; active?.abort(); });
async function api(data: object) { const res = await fetch(site + '/api/worker', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, workerId }), signal: AbortSignal.timeout(20000) }); const value = await res.json(); if (!res.ok)
    throw new Error(value.error || `Worker HTTP ${res.status}`); return value; }
async function heartbeat() { const gitSha = (await run('git', ['rev-parse', 'HEAD'], repo)).trim(); await api({ op: 'heartbeat', name: os.hostname(), node: process.versions.node, gitSha, machine: { platform: os.platform(), arch: os.arch(), cores: os.cpus().length, memoryGiB: os.totalmem() / 1024 ** 3, freeMemoryGiB: os.freemem() / 1024 ** 3 } }); }
const transport = queuePoller(async (id?: string) => (await api({ op: 'claim', id })).job);
const journal = path.join(home, 'active.json');
console.log('Architecture worker connected outbound to ' + site);
while (!stopped) {
    try {
        await heartbeat();
        const candidate = await transport.nextJob();
        if (!candidate) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }
        const job: RenderJob = JobSchema.parse(candidate);
        active = new AbortController();
        fs.writeFileSync(journal, JSON.stringify({ id: job.id, gitSha: job.gitSha, leaseToken: job.leaseToken, at: Date.now() }), { mode: 0o600 });
        let renewing = false;
        const controller = active;
        const timer = setInterval(async () => { if (renewing)
            return; renewing = true; try {
            await heartbeat();
            const result = await api({ op: 'renew', id: job.id, leaseToken: job.leaseToken });
            if (result.status === 'CANCEL_REQUESTED' || result.status === 'LOST')
                controller.abort();
        }
        catch {
            controller.abort();
        }
        finally {
            renewing = false;
        } }, 15000);
        const report = async (status: RenderJob['status'], progress: number, stage: string, artifacts?: RenderJob['artifacts']) => { await api({ op: 'progress', id: job.id, leaseToken: job.leaseToken, status, progress, stage, artifacts }); };
        try {
            await report('PREPARING', 0, 'release checkout');
            const release = await prepareRelease(repo, job.gitSha, controller.signal);
            await execute(job, release, report, controller.signal);
            console.log('Completed ' + job.id);
        }
        catch (error) {
            const result = await api({ op: 'renew', id: job.id, leaseToken: job.leaseToken }).catch(() => ({ status: 'LOST' }));
            if (result.status !== 'LOST')
                await api({ op: 'progress', id: job.id, leaseToken: job.leaseToken, status: result.status === 'CANCEL_REQUESTED' ? 'CANCELLED' : 'FAILED', progress: 0, stage: controller.signal.aborted ? 'interrupted' : 'failed', error: error instanceof Error ? error.message : 'Render failed' }).catch(() => { });
            console.error('Job ' + job.id + ' stopped: ' + (error instanceof Error ? error.message : 'error'));
        }
        finally {
            clearInterval(timer);
            active = null;
            fs.unlinkSync(journal);
        }
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : 'Connection failed');
        await new Promise(r => setTimeout(r, 10000));
    }
}
