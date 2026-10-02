import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
export async function run(command: string, args: string[], cwd: string, signal?: AbortSignal) { return new Promise<string>((resolve, reject) => { const child = spawn(command, args, { cwd, signal, env: process.env }); let out = '', err = ''; child.stdout.on('data', d => { out = (out + d).slice(-100000); }); child.stderr.on('data', d => { err = (err + d).slice(-100000); }); child.on('error', reject); child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${command} failed (${code}): ${err.slice(-1000)}`))); }); }
export async function prepareRelease(repo: string, sha: string, signal?: AbortSignal) { if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error('Invalid Git SHA'); await run('git', ['fetch', 'origin'], repo, signal); const allowed = process.env.NURADI_RELEASE_REF || 'origin/main'; await run('git', ['merge-base', '--is-ancestor', sha, allowed], repo, signal); const root = path.join(repo, '.worker/releases', sha); fs.mkdirSync(path.dirname(root), { recursive: true }); if (!fs.existsSync(root))
    await run('git', ['worktree', 'add', '--detach', root, sha], repo, signal); const head = (await run('git', ['rev-parse', 'HEAD'], root, signal)).trim(); if (head !== sha)
    throw new Error('Release checkout has wrong revision'); const status = (await run('git', ['status', '--porcelain', '--untracked-files=no'], root, signal)).trim(); if (status)
    throw new Error('Release worktree was modified'); const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml')); const key = crypto.createHash('sha256').update(sha).update(lock).update(process.versions.node.split('.')[0]).update('4.0.532').digest('hex'); const installed = path.join(root, '.dependencies-ready'); if (!fs.existsSync(installed) || fs.readFileSync(installed, 'utf8') !== key) {
    await run(process.execPath, [path.join(repo, 'node_modules/pnpm/bin/pnpm.cjs'), 'install', '--frozen-lockfile', '--ignore-scripts'], root, signal);
    fs.writeFileSync(installed, key);
} return { root, key }; }
export function releaseCacheKey(sha: string, lock: string, nodeMajor: string, remotion: string) { return crypto.createHash('sha256').update([sha, lock, nodeMajor, remotion].join('\0')).digest('hex'); }
