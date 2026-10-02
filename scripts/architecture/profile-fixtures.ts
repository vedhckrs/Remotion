import fs from 'node:fs';
import crypto from 'node:crypto';
import {prepareRelease, run} from '../../apps/worker/src/release';
import {execute} from '../../apps/worker/src/render';
import {JobSchema, SceneSpecSchema} from '@nuradi/schemas/index';
import {demo} from '@nuradi/video/demo';

const sha = (await run('git', ['rev-parse', 'HEAD'], process.cwd())).trim();
const release = await prepareRelease(process.cwd(), sha);
const spec = SceneSpecSchema.parse({...demo, title: 'Non-narrated codec acceptance', scenes: [{...demo.scenes[0], narration: '', duration: .5, beats: [], camera: []}]});
const results = [];
for (const profile of ['final-4k60', 'delivery-hevc', 'master-prores']) {
    const job = JobSchema.parse({id: crypto.randomUUID(), projectId: '00000000-0000-4000-8000-000000000001', compositionId: 'SemanticExplainer', sceneSpec: spec, profile, gitSha: sha, schemaVersion: 1, status: 'CLAIMED', workerId: crypto.randomUUID(), leaseToken: crypto.randomUUID(), progress: 0, stage: 'codec fixture', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null});
    const result = await execute(job, release, async (status, progress, stage) => console.log(profile, status, Math.round(progress * 100), stage), AbortSignal.timeout(600000));
    results.push({profile, ...result, manifest: JSON.parse(fs.readFileSync(result.manifest, 'utf8'))});
}
fs.writeFileSync('.worker/profile-acceptance.json', JSON.stringify({gitSha: sha, scope: 'Half-second non-narrated codec/private-delivery fixtures; not a long-render acceptance', results}, null, 2));
console.log('All three 4K60 delivery codecs passed isolated release rendering, QC and private upload.');
