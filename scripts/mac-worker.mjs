#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {localRequest} from '../web/lib/protocol.mjs';
import {atomicJson} from '../skills/remotion-video-producer/scripts/lib/files.mjs';
import {loadEnv} from '../skills/remotion-video-producer/scripts/lib/env.mjs';
loadEnv();
const site=process.env.NURADI_SITE_URL||'https://nuradi.co.in';
const token=process.env.NURADI_WORKER_TOKEN;
const local=process.env.NURADI_LOCAL_URL||'http://127.0.0.1:4545';
if(!site.startsWith('https://')||!token||token.length<32)throw new Error('Set NURADI_SITE_URL (HTTPS) and NURADI_WORKER_TOKEN (32+ characters) in your local .env');
const localURL=new URL(local);if(localURL.protocol!=='http:'||!['127.0.0.1','localhost'].includes(localURL.hostname)||localURL.username||localURL.password)throw new Error('Local dashboard must be a loopback HTTP URL');
const file=path.resolve(process.env.NURADI_WORKER_JOURNAL||'automation/remote-worker.json');
const journal=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{workerId:crypto.randomUUID(),requests:{}};
const lock=file+'.lock';fs.mkdirSync(path.dirname(file),{recursive:true});
if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));try{process.kill(pid,0);throw new Error('Worker is already running');}catch(e){if(e.code!=='ESRCH')throw e;fs.unlinkSync(lock);}}
fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});process.on('exit',()=>{try{fs.unlinkSync(lock);}catch{}});
atomicJson(file,journal);
const save=()=>{const ids=Object.keys(journal.requests);for(const id of ids.slice(0,Math.max(0,ids.length-200)))if(journal.requests[id].sent)delete journal.requests[id];atomicJson(file,journal);};
async function remote(body){const response=await fetch(site+'/api/control',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...body,workerId:journal.workerId}),signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw new Error(data.error||`Cloud HTTP ${response.status}`);return data;}
let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
console.log(`Mac worker: ${site} -> ${local} (renders remain local)`);
while(!stopping){
 try {
  // Recover acknowledgements without repeating an accepted local command.
  for(const [id,record] of Object.entries(journal.requests))if(!record.sent){
   record.result??={error:'Worker interrupted after accepting request; review local job history before retrying'};
   await remote({op:'worker-result',id,result:record.result});record.sent=true;save();
  }
  // Never claim work unless the local dashboard is reachable.
  const health=await fetch(local+'/api/state',{signal:AbortSignal.timeout(5000)});if(!health.ok)throw new Error('Local dashboard is unavailable');
  const state=await health.json();
  const {command:request}=await remote({op:'worker-claim',project:state.project});
  if(request){
   if(Date.now()-request.at>120000){journal.requests[request.id]={result:{error:'Request expired; submit again'},sent:false};save();continue;}
   if(journal.requests[request.id])continue;
   journal.requests[request.id]={acceptedAt:Date.now(),sent:false};save();
   try {
    const spec=localRequest(request.command);
    const response=await fetch(local+spec.path,{method:spec.method,headers:{'X-Dashboard':'1','Content-Type':'application/json'},body:spec.body?JSON.stringify(spec.body):undefined,signal:AbortSignal.timeout(15000)});
    const text=await response.text();if(Buffer.byteLength(text)>500000)throw new Error('Local response too large');
    const value=JSON.parse(text);if(!response.ok)throw new Error(value.error||`Local HTTP ${response.status}`);
    journal.requests[request.id].result=value;
   }catch(error){journal.requests[request.id].result={error:error.message};}
   save();
  }
 }catch(error){console.error(`Connection: ${error.message}`);}
 await new Promise(resolve=>setTimeout(resolve,2000));
}
