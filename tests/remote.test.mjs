import test from 'node:test';
import assert from 'node:assert/strict';
import {localRequest,validPackage,validRequestId} from '../web/lib/protocol.mjs';
import {session,hasSession,sameOrigin,equalSecret} from '../web/lib/auth.mjs';
import handler from '../api/control.mjs';
test('remote rendering only uses the allowlist and forces paid APIs off',()=>{
 const request=localRequest({action:'render',id:'week-01/topic',videos:['short'],voice:true,music:true,force:true,path:'/etc/passwd'});
 assert.equal(request.path,'/api/library/run');assert.equal(request.body.voice,false);assert.equal(request.body.music,false);assert.equal(request.body.force,false);assert.equal(request.body.path,undefined);
 for(const command of [{action:'render',id:'../bad',videos:['short']},{action:'render',id:'ok',videos:[]},{action:'render',id:'ok',videos:['../../bad']},{action:'shell',command:'rm -rf /'},{action:'cancel',id:-1}])assert.throws(()=>localRequest(command));
 assert.ok(validPackage('@root'));assert.ok(!validPackage('a//b'));assert.ok(!validRequestId('anything'));
});
test('signed sessions reject tampering, expiration and missing configuration',()=>{
 const secret='a'.repeat(64),now=100000,token=session(secret,now),req={headers:{cookie:`nuradi_session=${token}`}};
 assert.ok(hasSession(req,secret,now+1));assert.equal(hasSession(req,secret,now+9*3600000),false);
 assert.equal(hasSession(req,'b'.repeat(64),now),false);assert.equal(hasSession(req,'',now),false);
 assert.equal(hasSession({headers:{cookie:`nuradi_session=${token}x`}},secret,now),false);
 assert.equal(equalSecret('',undefined),false);assert.equal(equalSecret('test','test'),false);
 assert.equal(sameOrigin({headers:{origin:'https://evil.test',host:'nuradi.co.in'}}),false);
 assert.equal(sameOrigin({headers:{origin:'https://nuradi.co.in',host:'nuradi.co.in'}}),true);
});
async function call(body,headers={}) {let data,status;const res={setHeader(){},status(s){status=s;return this;},json(d){data=d;}};await handler({method:'POST',body,headers},res);return {status,data};}
test('hosted control API denies unauthenticated users and workers before queue access',async()=>{
 assert.equal((await call({op:'connection'},{host:'nuradi.co.in',origin:'https://nuradi.co.in'})).status,401);
 assert.equal((await call({op:'command'})).status,403);
 assert.equal((await call({op:'worker-claim',workerId:'x'},{authorization:'Bearer bad'})).status,401);
});
test('hosted requests remain idempotent and deliver worker results to an authenticated session',async()=>{
 const oldFetch=global.fetch,old={...process.env};
 const secret='s'.repeat(64),workerToken='w'.repeat(64),workerId='f'.repeat(8)+'-ffff-ffff-ffff-'+ 'f'.repeat(12),id='a'.repeat(8)+'-aaaa-aaaa-aaaa-'+ 'a'.repeat(12);
 Object.assign(process.env,{NURADI_SESSION_SECRET:secret,NURADI_WORKER_TOKEN:workerToken,UPSTASH_REDIS_REST_URL:'https://test.invalid',UPSTASH_REDIS_REST_TOKEN:'test'});
 const data=new Map(),queue=[];
 global.fetch=async(url,options)=>{
  const args=JSON.parse(options.body);let result=null;
  switch(args[0]){
   case 'EVAL': if(args[1].includes('worker-owner')||args[1].includes("local owner=")){const previous=data.get(args[3]);result=!previous||previous===args[4]?1:0;if(result)data.set(args[3],args[4]);}
   else if(args[1].includes('RPUSH')){result=data.has(args[3])?0:1;if(result){data.set(args[3],args[5]);queue.push(args[6]);}}
   else {const requestId=queue.shift();result=requestId?data.get(args[4]+requestId):null;}break;
   case 'SET': data.set(args[1],args[2]);result='OK';break;
   case 'GET': result=data.get(args[1])||null;break;
   case 'EXISTS': result=data.has(args[1])?1:0;break;
   default: throw new Error('Unexpected Redis operation '+args[0]);
  }
  return {ok:true,json:async()=>({result})};
 };
 try {
  const headers={host:'nuradi.co.in',origin:'https://nuradi.co.in',cookie:`nuradi_session=${session(secret)}`},worker={authorization:`Bearer ${workerToken}`};
  assert.equal((await call({op:'worker-claim',workerId,project:'Example'},worker)).status,200);
  assert.equal((await call({op:'command',id,command:{action:'state'}},headers)).data.created,true);
  assert.equal((await call({op:'command',id,command:{action:'state'}},headers)).data.created,false);
  assert.equal(queue.length,1);
  assert.equal((await call({op:'worker-claim',workerId},worker)).data.command.id,id);
  assert.equal((await call({op:'worker-result',workerId,id,result:{project:'Example'}},worker)).status,200);
  const reply=await call({op:'result',id},headers);assert.ok(reply.data.done);assert.equal(reply.data.result.project,'Example');
  assert.equal((await call({op:'worker-claim',workerId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},worker)).status,409);
 }finally {global.fetch=oldFetch;for(const key of ['NURADI_SESSION_SECRET','NURADI_WORKER_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'])if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
});
