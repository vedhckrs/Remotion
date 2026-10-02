import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function loadJobs(file) {
  if (!fs.existsSync(file)) return [];
  const jobs=JSON.parse(fs.readFileSync(file,'utf8'));
  if (!Array.isArray(jobs)) throw new Error('Invalid dashboard job history');
  return jobs.map(job=>['queued','bundling','selecting','rendering','running'].includes(job.status)
    ? {...job,status:'failed',endedAt:Date.now(),error:'Dashboard restarted; review inputs and retry this job'} : job);
}
export function saveJobs(file,jobs) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=`${file}.${crypto.randomUUID()}.tmp`;
  try {fs.writeFileSync(temp,JSON.stringify(jobs,null,2),{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}
  finally {fs.rmSync(temp,{force:true});}
}
