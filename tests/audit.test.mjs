import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePackage,renderInputs} from '../skills/remotion-video-producer/scripts/lib/package-schema.mjs';
import {validateScript,voiceManifestComplete} from '../skills/remotion-video-producer/scripts/lib/script-schema.mjs';
import {syncPackage} from '../skills/remotion-video-producer/scripts/lib/render-kit.mjs';
import {computeSceneTimings,absoluteCaptions} from '../skills/remotion-video-producer/assets/templates/src/lib/timeline.mjs';
import {visibilityAt} from '../skills/remotion-video-producer/assets/templates/src/episode/beat-state.mjs';
import {parseRange} from '../skills/remotion-video-producer/assets/dashboard/ranges.mjs';
import {createLibrary} from '../skills/remotion-video-producer/assets/dashboard/library.mjs';
import {installTemplates} from '../skills/remotion-video-producer/scripts/lib/install-templates.mjs';
import {resumableUpload} from '../skills/remotion-video-producer/scripts/lib/resumable-upload.mjs';
const skill=fileURLToPath(new URL('../skills/remotion-video-producer',import.meta.url));
const temp=(t)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'remotion-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const json=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
const cli=(name,args,cwd,env={})=>spawnSync(process.execPath,[path.join(skill,'scripts',name),...args],{cwd,env:{...process.env,...env},encoding:'utf8',timeout:20000});
const scene=(id='a')=>({id,headline:'Example',narration:`${id} spoken words.`,visual:{kind:'hero',icon:'cpu'}});
const fixture=(dir,scenes=[scene()])=>{
 json(path.join(dir,'package.json'),{id:'episode',topic:'Example',title:'Example'});
 json(path.join(dir,'research/sources.json'),[{id:'ref',title:'Reference',url:'https://example.com',accessed:'2026-10-02'}]);
 json(path.join(dir,'production.json'),{schema:'wiresplained.production/1',videos:[{id:'short',ratio:'9:16',targetSeconds:[1,30],scenes}]});
};
const timings=(dir,scenes)=>{
 const entries={};for(const s of scenes){fs.mkdirSync(path.join(dir,'voice/short'),{recursive:true});fs.writeFileSync(path.join(dir,'voice/short',`${s.id}.wav`),'audio');entries[s.id]={file:`${s.id}.wav`,start:0,end:1,words:s.narration.split(' ').map((text,i)=>({text,start:i*.1,end:(i+1)*.1}))};}
 json(path.join(dir,'voice/short/timing.json'),{scenes:entries});
};
test('F01: inserting a scene cannot overwrite cached narration',t=>{
 const dir=temp(t);fixture(dir);const bin=path.join(dir,'bin');fs.mkdirSync(bin);
 const say=path.join(bin,'say');fs.writeFileSync(say,`#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);fs.writeFileSync(a[a.indexOf('-o')+1],Buffer.concat([Buffer.alloc(44),Buffer.alloc(48000,a.at(-1).charCodeAt(0))]));`);fs.chmodSync(say,0o755);
 const env={PATH:bin+path.delimiter+process.env.PATH};let result=cli('package-voice.mjs',[dir,'--provider','macos'],dir,env);assert.equal(result.status,0,result.stderr);
 const first=JSON.parse(fs.readFileSync(path.join(dir,'voice/short/timing.json')));const old=first.scenes.a.file;
 fixture(dir,[scene('x'),scene('a')]);result=cli('package-voice.mjs',[dir,'--provider','macos'],dir,env);assert.equal(result.status,0,result.stderr);
 const second=JSON.parse(fs.readFileSync(path.join(dir,'voice/short/timing.json')));assert.equal(second.scenes.a.file,old);assert.notEqual(second.scenes.x.file,old);assert.equal(fs.readFileSync(path.join(dir,'voice/short',old))[44],97);
});
test('F02: absent requested video never falls back to another output',t=>{
 const dir=temp(t);json(path.join(dir,'out/requested/publish/youtube-shorts.json'),{title:'Requested',description:'Requested',tags:[]});fs.writeFileSync(path.join(dir,'out/Shorts_unrelated.mp4'),'dummy');const r=cli('publish.mjs',['--video','requested','--platform','youtube-shorts','--dry-run'],dir);assert.equal(r.status,1);assert.match(r.stderr,/No rendered file/);
});
test('F03: autopilot dry-run leaves queue and files unchanged',t=>{
 const dir=temp(t);const q=path.join(dir,'automation/queue.json');json(q,{items:[{id:'requested',status:'planned',publishAt:'2099-01-01',platforms:{youtube:{status:'pending'}}}]});const before=fs.readFileSync(q);const r=cli('autopilot.mjs',['run','--dry-run'],dir);assert.equal(r.status,0,r.stderr);assert.deepEqual(fs.readFileSync(q),before);assert.deepEqual(fs.readdirSync(dir),['automation']);assert.deepEqual(fs.readdirSync(path.join(dir,'automation')),['queue.json']);
});
test('F04/F12: incomplete voice and empty scenes cannot pass final validation',t=>{
 const dir=temp(t);const scenes=[scene('a'),scene('b')];fixture(dir,scenes);timings(dir,[scenes[0]]);let r=validatePackage(dir);assert.ok(r.todo.some(x=>x.includes('b')));assert.notEqual(r.stage,'render-ready');
 fs.mkdirSync(path.join(dir,'src/episode'),{recursive:true});const render=cli('package-render.mjs',[dir],dir);assert.equal(render.status,1);assert.match(render.stderr,/Not ready/);
 fixture(dir,[]);r=validatePackage(dir);assert.ok(r.errors.some(x=>x.includes('nonempty')));assert.notEqual(r.stage,'render-ready');
});
test('F04: partial script manifest is never considered complete',t=>{
 const dir=temp(t);const script={videoId:'v',scenes:[{id:'a',voiceover:'A'},{id:'b',voiceover:'B'}]};const f=path.join(dir,'manifest.json');fs.writeFileSync(path.join(dir,'a.mp3'),'audio');json(f,{provider:'macos',scriptVoice:null,scenes:[{id:'a',file:'a.mp3',durationSeconds:1,text:'A'}]});assert.equal(voiceManifestComplete(script,f),false);
});
test('F05: encoded-file QC identifies blocking format and missing sound failures',async t=>{
 const {runQc}=await import('../skills/remotion-video-producer/scripts/lib/package-qc.mjs');
 const {writeWav}=await import('../skills/remotion-video-producer/scripts/lib/audio.mjs');
 const available=spawnSync('ffmpeg',['-version']);if(available.error){t.skip('External ffmpeg is required for encoded-file test');return;}
 const dir=temp(t),file=path.join(dir,'wrong.mp4'),master=path.join(dir,'silent.wav');
 const encode=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=160x90:r=30:d=1','-an','-c:v','libx264','-pix_fmt','yuv420p',file]);assert.equal(encode.status,0);
 writeWav(master,[new Float32Array(48000),new Float32Array(48000)],48000);
 const qc=runQc({file,master,W:320,H:180,fps:60,total:60,scenes:[],vertical:false});
 assert.ok(qc.checks.some(c=>c.name==='picture size'&&!c.pass&&c.level==='error'));
 assert.ok(qc.checks.some(c=>c.name==='sound codec'&&!c.pass));assert.ok(qc.checks.some(c=>c.name==='loudness'&&!c.pass));
});
test('F06: provider switch discards ElevenLabs voice and model',t=>{
 const dir=temp(t);const f=path.join(dir,'script.json');json(f,{videoId:'v',voice:{provider:'elevenlabs',preset:'young-male-pro',model:'eleven_multilingual_v2'},scenes:[{id:'a',headline:'Example',voiceover:'Example.'}]});const r=cli('generate-voiceover.mjs',['--script',f,'--provider','macos','--dry-run'],dir);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/voice Samantha, model say/);
});
test('F07: lost final upload response resumes the existing completed video',async t=>{
 const dir=temp(t);const file=path.join(dir,'video.mp4');fs.writeFileSync(file,'video');const state={session:'https://example.com/session'};let probes=0,writes=0,saves=0;
 const res=(status,data,range)=>({status,ok:status===200,headers:new Headers(range?{Range:range}:{}),json:async()=>data});
 const result=await resumableUpload({file,headers:{},state,save:()=>saves++,wait:async()=>{},fetchImpl:async(url,opts)=>{
  if(opts.headers['Content-Range'].startsWith('bytes */'))return ++probes===1?res(308,null):res(200,{id:'already-uploaded'});
  writes++;throw new Error('response lost');
 }});assert.equal(result.id,'already-uploaded');assert.equal(writes,1);assert.equal(state.video.id,result.id);assert.ok(saves>=2);
 await resumableUpload({file,headers:{},state,save:()=>{},fetchImpl:()=>{throw new Error('must not upload again');}});
});
test('F07: server offset is queried and used after interrupted chunks',async t=>{
 const dir=temp(t),file=path.join(dir,'video.mp4');fs.writeFileSync(file,'1234567890');const state={session:'session',offset:0};const ranges=[];let n=0;
 const result=await resumableUpload({file,headers:{},state,save:()=>{},wait:async()=>{},fetchImpl:async(url,opts)=>{
  ranges.push(opts.headers['Content-Range']);n++;
  if(n===1)return {status:308,ok:false,headers:new Headers()};
  if(n===2)throw new Error('connection lost');
  if(n===3)return {status:308,ok:false,headers:new Headers({Range:'bytes=0-4'})};
  return {status:200,ok:true,json:async()=>({id:'v'})};
 }});assert.equal(result.id,'v');assert.equal(ranges[3],'bytes 5-9/10');
});
test('F08: caller contracts pass an explicit music path and off clears the source',()=>{
 for(const name of ['scripts/autopilot.mjs','assets/dashboard/episodes.mjs'])assert.match(fs.readFileSync(path.join(skill,name),'utf8'),/'--out', path.join/);
 assert.match(fs.readFileSync(path.join(skill,'assets/dashboard/episodes.mjs'),'utf8'),/musicMode === 'off'.*delete script.music/);
});
test('F09: exact synchronization removes deleted owned files and copies same-mtime edits',t=>{
 const dir=temp(t),src=path.join(dir,'source'),project=path.join(dir,'project');fs.mkdirSync(src);fs.writeFileSync(path.join(src,'asset.txt'),'AAAA');fs.utimesSync(path.join(src,'asset.txt'),100,100);const pub=syncPackage(src,project,'pkg');fs.writeFileSync(path.join(src,'asset.txt'),'BBBB');fs.utimesSync(path.join(src,'asset.txt'),100,100);syncPackage(src,project,'pkg');assert.equal(fs.readFileSync(path.join(pub,'asset.txt'),'utf8'),'BBBB');fs.writeFileSync(path.join(pub,'unowned.txt'),'keep');fs.unlinkSync(path.join(src,'asset.txt'));syncPackage(src,project,'pkg');assert.equal(fs.existsSync(path.join(pub,'asset.txt')),false);assert.ok(fs.existsSync(path.join(pub,'unowned.txt')));
});
test('F10: replacing voice bytes invalidates finished render inputs',t=>{
 const dir=temp(t);fixture(dir);timings(dir,[scene()]);const first=renderInputs(dir,'short',{a:'hash'},null);fs.writeFileSync(path.join(dir,'voice/short/a.wav'),'new audio');assert.notDeepEqual(renderInputs(dir,'short',{a:'hash'},null),first);
});
test('F11: caption offsets follow minimum durations, ids and frame rounding',()=>{
 const timings=computeSceneTimings([{id:'a',durationSeconds:1,minSeconds:2},{id:'b',durationSeconds:1.001}],60,.35);
 const captions=absoluteCaptions({scenes:[{id:'b',captions:[{text:'B',startMs:0,endMs:100,timestampMs:null}]},{id:'a',captions:[{text:'A',startMs:0,endMs:100}]}]},timings,60);
 assert.equal(captions[1].startMs,2000);assert.equal(timings[1].baseFrames,82);assert.equal(captions[0].text,'A');
});
test('F11: actual exported SRT matches the canonical minimum scene duration',t=>{
 const dir=temp(t);json(path.join(dir,'public/script/v.json'),{videoId:'v',pacing:'fast',scenes:[{id:'a',headline:'A',voiceover:'A.',minSeconds:2},{id:'b',headline:'B',voiceover:'B.'}]});json(path.join(dir,'public/voiceover/v/manifest.json'),{gapSeconds:.6,scenes:[{id:'a',durationSeconds:1,captions:[{text:'A.',startMs:0,endMs:1000}]},{id:'b',durationSeconds:1,captions:[{text:'B.',startMs:0,endMs:1000}]}]});const result=cli('make-publish-pack.mjs',['--video','v'],dir);assert.equal(result.status,0,result.stderr);assert.match(fs.readFileSync(path.join(dir,'out/v/publish/v.srt'),'utf8'),/00:00:02,000 --> 00:00:03,000/);
});
test('F12: malformed scripts return validation errors rather than TypeError',()=>{
 for(const data of [null,{videoId:'v',scenes:{}},{videoId:'v',scenes:[null]}])assert.throws(()=>validateScript(data),e=>e instanceof Error&&!(e instanceof TypeError)&&/Invalid script/.test(e.message));
});
test('F12: unsafe ids, invalid targets and malformed nested arrays are rejected',t=>{
 const dir=temp(t);fixture(dir);const f=path.join(dir,'production.json');const p=JSON.parse(fs.readFileSync(f));p.videos[0].id='../outside';p.videos[0].targetSeconds=[10,1];p.videos[0].scenes[0].visual={kind:'flow',nodes:{}};json(f,p);assert.ok(validatePackage(dir).errors.length>=3);
});
test('F13: abandoned producing item is eligible for recovery and lock is exclusive',()=>{
 const src=fs.readFileSync(path.join(skill,'scripts/autopilot.mjs'),'utf8');assert.match(src,/flag: 'wx'/);assert.match(src,/'produced', 'producing'/);assert.match(src,/queue = loadQueue\(\);/);
});
test('F14: chronological reveal/hide works while seeking in either direction',()=>{
 const beats=[{frame:0,show:['a']},{frame:10,hide:['a']},{frame:20,show:['a']},{frame:30,hide:['a']}];assert.equal(visibilityAt(beats,15,'a').visible,false);assert.equal(visibilityAt(beats,25,'a').since,5);assert.equal(visibilityAt(beats,35,'a').visible,false);assert.equal(visibilityAt(beats,5,'a').since,5);
});
test('F15: unsupported negative/percentage chart values are rejected',()=>{
 for(const [kind,data] of [['bar',[{label:'A',value:-1}]],['donut',[{label:'A',value:101}]],['line',[{label:'A',value:NaN}]]])assert.throws(()=>validateScript({videoId:'v',scenes:[{id:'a',headline:'A',voiceover:'A.',visual:{type:'chart',chart:{kind,data}}}]}));
 for(const file of ['BarChart.tsx','DonutChart.tsx'])assert.match(fs.readFileSync(path.join(skill,'assets/templates/src/components/charts',file),'utf8'),/Math.max\(1,/);
});
test('F16: portrait layer-label geometry fits every allowed layer count',()=>{
 for(let n=1;n<=6;n++){const h=720,w=900,step=Math.min(70,h*.48/n),R=Math.min(w*.42,Math.max(60,(h-80-n*step)/2)),cy=R+20;assert.ok(cy+R+40+(n-1)*step<h);}
});
test('F17: upgrade detects customized files before overwriting anything',t=>{
 const dir=temp(t);fs.mkdirSync(path.join(dir,'src'),{recursive:true});fs.writeFileSync(path.join(dir,'src/Root.tsx'),'existing root');installTemplates(skill,dir,{fresh:true});const f=path.join(dir,'src/components/Counter.tsx');fs.writeFileSync(f,'my custom code');const config=fs.readFileSync(path.join(dir,'remotion.config.ts'));assert.throws(()=>installTemplates(skill,dir),/Customized files/);assert.equal(fs.readFileSync(f,'utf8'),'my custom code');assert.deepEqual(fs.readFileSync(path.join(dir,'remotion.config.ts')),config);assert.ok(fs.readdirSync(path.join(dir,'.skill-backup')).length);
});
test('F18: dashboard job spawn failures have error handlers',()=>{
 const server=fs.readFileSync(path.join(skill,'assets/dashboard/server.mjs'),'utf8');assert.match(server,/child.on\('error', \(error\)/);assert.match(server,/studio.on\('error'/);assert.match(fs.readFileSync(path.join(skill,'assets/dashboard/library.mjs'),'utf8'),/child.on\('error'/);
});
test('F19: media byte ranges have correct suffix and unsatisfiable behavior',()=>{
 assert.deepEqual(parseRange('bytes=-500',1000),{start:500,end:999});assert.deepEqual(parseRange('bytes=100-',1000),{start:100,end:999});for(const r of ['bytes=2000-','bytes=x-y','bytes=-0','bytes=5-2','bytes=0-2,5-8'])assert.equal(parseRange(r,1000),null);
});
test('F20: OAuth callback uses state, loopback binding and restricted persistence',()=>{
 const src=fs.readFileSync(path.join(skill,'scripts/auth-youtube.mjs'),'utf8');assert.match(src,/get\('state'\) !== state/);assert.match(src,/server.listen\(port, '127.0.0.1'/);assert.match(src,/chmodSync\('.env',0o600\)/);assert.match(src,/if \(args\['show-token'\]\)/);
});
test('F21: effective hardware fallback is exported for config',()=>{assert.match(fs.readFileSync(path.join(skill,'scripts/render-preset.sh'),'utf8'),/export REMOTION_HW="\$HW"/);});
test('F22: automation labels depend on project and plist uses escaped arguments',()=>{
 const src=fs.readFileSync(path.join(skill,'scripts/install-autopilot.sh'),'utf8');assert.match(src,/com.remotion.autopilot.\$PROJECT_KEY.produce/);assert.match(src,/const xml=/);assert.doesNotMatch(src,/<string>cd "\$PROJECT"/);
});
test('F23: choosing a package directly as library root is supported',t=>{
 const dir=temp(t);fixture(dir);const library=createLibrary({cwd:dir,SKILL_DIR:skill,getSettings:()=>({libraryDir:dir}),log:()=>{},send:()=>{},cancelSignals:new Map(),jobs:[]});assert.equal(library.dirOf('@root'),dir);assert.equal(library.dirOf('../outside'),null);
});

test('F13: dashboard restart preserves history and interrupts active work without replay',async t=>{
 const {loadJobs,saveJobs}=await import('../skills/remotion-video-producer/assets/dashboard/job-store.mjs');
 const dir=temp(t),f=path.join(dir,'jobs.json');
 saveJobs(f,[{id:1,status:'done'},{id:2,status:'running'},{id:3,status:'queued'}]);
 const jobs=loadJobs(f);assert.equal(jobs[0].status,'done');assert.equal(jobs[1].status,'failed');assert.equal(jobs[2].status,'failed');assert.match(jobs[2].error,/retry/);
});

test('F12: malformed device brand list returns errors',t=>{
 const dir=temp(t);fixture(dir);const f=path.join(dir,'production.json');const p=JSON.parse(fs.readFileSync(f));p.videos[0].scenes[0].visual={kind:'device',device:'phone',screen:{brands:{}}};json(f,p);assert.ok(validatePackage(dir).errors.some(e=>e.includes('screen.brands')));
});

test('F12: numeric identifiers and paths through escaping symlinks are rejected',async t=>{
 assert.throws(()=>validateScript({videoId:123,scenes:[{id:1,headline:'A',voiceover:'A'}]}));
 const {inside}=await import('../skills/remotion-video-producer/scripts/lib/files.mjs');
 const root=temp(t),outside=temp(t);fs.symlinkSync(outside,path.join(root,'link'));assert.equal(inside(root,'link/not-created.wav'),null);
});
