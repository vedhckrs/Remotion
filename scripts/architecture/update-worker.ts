import fs from 'node:fs';
import { run } from '../../apps/worker/src/release';
const repo = process.cwd();
if (fs.existsSync('.worker/active.json'))
    throw new Error('Wait for the current job before updating worker code');
if ((await run('git', ['status', '--porcelain', '--untracked-files=no'], repo)).trim())
    throw new Error('Commit or preserve local changes before updating');
await run('git', ['fetch', 'origin'], repo);
const ref = process.env.NURADI_RELEASE_REF || 'origin/main';
const sha = (await run('git', ['rev-parse', ref], repo)).trim();
if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error('Invalid release reference');
await run('git', ['merge-base', '--is-ancestor', 'HEAD', ref], repo);
if (!process.argv.includes('--apply'))
    console.log('Verified fast-forward update available: ' + sha);
else {
    await run('git', ['merge', '--ff-only', ref], repo);
    await run(process.execPath, ['node_modules/pnpm/bin/pnpm.cjs', 'install', '--frozen-lockfile', '--ignore-scripts'], repo);
    console.log('Dependencies updated. Run the checked installer to restart the login service.');
}
