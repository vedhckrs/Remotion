export async function redis(...args) {
 const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!token)throw new Error('Durable queue is not configured');
 if(!url.startsWith('https://'))throw new Error('Redis REST URL must use HTTPS');
 const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
 if(!res.ok)throw new Error('Durable queue request failed');const data=await res.json();
 if(data.error)throw new Error('Durable queue rejected request');return data.result;
}
export const enqueueScript=`if redis.call('SET',KEYS[1],ARGV[1],'NX','EX',86400) then redis.call('RPUSH',KEYS[2],ARGV[2]); return 1 else return 0 end`;
// Pop and record acceptance atomically. A command is never silently requeued after losing a worker.
export const claimScript=`local id=redis.call('LPOP',KEYS[1]); if not id then return nil end; local body=redis.call('GET',ARGV[1]..id); if body then redis.call('SET',ARGV[2]..id,'processing','EX',86400); return body end; return nil`;
export const workerLeaseScript=`local owner=redis.call('GET',KEYS[1]); if not owner or owner==ARGV[1] then redis.call('SET',KEYS[1],ARGV[1],'EX',30); return 1 else return 0 end`;
