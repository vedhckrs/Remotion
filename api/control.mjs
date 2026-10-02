import {session,hasSession,equalSecret,sameOrigin} from '../web/lib/auth.mjs';
import {redis,enqueueScript,claimScript,workerLeaseScript} from '../web/lib/redis.mjs';
import {localRequest,validRequestId} from '../web/lib/protocol.mjs';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,data)=>res.status(status).json(data);
 try {
  if(req.method!=='POST')return send(405,{error:'Use POST'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body||Buffer.byteLength(JSON.stringify(body))>600000)return send(413,{error:'Invalid or oversized request'});
  const worker=body.op?.startsWith('worker-');
  if(worker) {
   if(!equalSecret(req.headers.authorization?.replace(/^Bearer /,''),process.env.NURADI_WORKER_TOKEN))return send(401,{error:'Unauthorized worker'});
   if(!validRequestId(body.workerId))return send(400,{error:'Invalid worker identity'});
   if(!await redis('EVAL',workerLeaseScript,1,'nuradi:worker-owner',body.workerId))return send(409,{error:'Another Mac worker is connected'});
   if(body.op==='worker-claim') {
    await redis('SET','nuradi:heartbeat',JSON.stringify({at:Date.now(),project:body.project||''}),'EX',40);
    const raw=await redis('EVAL',claimScript,1,'nuradi:pending','nuradi:request:','nuradi:status:');return send(200,{command:raw?JSON.parse(raw):null});
   }
   if(body.op==='worker-result'&&validRequestId(body.id)) {
    if(!await redis('EXISTS','nuradi:request:'+body.id))return send(404,{error:'Unknown request'});
    await redis('SET','nuradi:result:'+body.id,JSON.stringify(body.result),'EX',86400);
    await redis('SET','nuradi:status:'+body.id,'complete','EX',86400);return send(200,{ok:true});
   }
   return send(400,{error:'Invalid worker operation'});
  }
  if(!sameOrigin(req))return send(403,{error:'Invalid origin'});
  if(body.op==='login') {
   // Account-wide short rate limit; no passwords, tokens or session values are logged.
   const attempts=await redis('INCR','nuradi:login-attempts');if(attempts===1)await redis('EXPIRE','nuradi:login-attempts',60);
   if(attempts>10)return send(429,{error:'Try again in a minute'});
   if(!equalSecret(body.password,process.env.NURADI_ADMIN_PASSWORD))return send(401,{error:'Incorrect password'});
   res.setHeader('Set-Cookie',`nuradi_session=${session(process.env.NURADI_SESSION_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{ok:true});
  }
  if(!hasSession(req,process.env.NURADI_SESSION_SECRET))return send(401,{error:'Sign in'});
  if(body.op==='logout'){res.setHeader('Set-Cookie','nuradi_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
  const raw=await redis('GET','nuradi:heartbeat');const heartbeat=raw?JSON.parse(raw):null;
  if(body.op==='connection')return send(200,{online:!!heartbeat&&Date.now()-heartbeat.at<30000,heartbeat});
  if(body.op==='result'&&validRequestId(body.id)) {
   const result=await redis('GET','nuradi:result:'+body.id);
   return send(200,result?{done:true,result:JSON.parse(result)}:{done:false,status:await redis('GET','nuradi:status:'+body.id)});
  }
  if(body.op==='command'&&validRequestId(body.id)) {
   localRequest(body.command);
   if(!heartbeat||Date.now()-heartbeat.at>30000)return send(503,{error:'Mac is offline. Wake it and start the worker.'});
   const command={id:body.id,command:body.command,at:Date.now()};
   const created=await redis('EVAL',enqueueScript,2,'nuradi:request:'+body.id,'nuradi:pending',JSON.stringify(command),body.id);
   return send(202,{id:body.id,created:created===1});
  }
  return send(400,{error:'Invalid operation'});
 }catch(error){return send(500,{error:error.message==='Durable queue is not configured'?error.message:'Control request failed; check server configuration'});}
}
