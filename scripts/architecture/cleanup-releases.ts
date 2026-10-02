import fs from 'node:fs';
import path from 'node:path';
import { run } from '../../apps/worker/src/release';
const repo = process.cwd(), root = path.join(repo, '.worker/releases'), keep = Number(process.env.NURADI_KEEP_RELEASES || 3);
if (!Number.isSafeInteger(keep) || keep < 1)
    throw new Error('Keep at least one release');
if (fs.existsSync('.worker/active.json'))
    throw new Error('Worker has an active job; cleanup deferred');
if (fs.existsSync(root)) {
    const releases = fs.readdirSync(root).filter(s => /^[a-f0-9]{40}$/.test(s)).map(name => ({ name, at: fs.statSync(path.join(root, name)).mtimeMs })).sort((a, b) => b.at - a.at);
    for (const release of releases.slice(keep)) {
        const dir = path.join(root, release.name);
        if (!process.argv.includes('--apply'))
            console.log('Would remove ' + dir);
        else
            await run('git', ['worktree', 'remove', dir], repo);
    }
}
