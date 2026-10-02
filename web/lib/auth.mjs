import crypto from 'node:crypto';
export const equalSecret=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||b.length<32)return false;
 const x=crypto.createHash('sha256').update(a).digest(),y=crypto.createHash('sha256').update(b).digest();
 return crypto.timingSafeEqual(x,y);
};
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('hex');
export function session(secret,now=Date.now()) {
 if(!secret||secret.length<32)throw new Error('Set a session secret of at least 32 characters');
 const value=String(now+8*3600000);return `${value}.${sign(value,secret)}`;
}
export function hasSession(req,secret,now=Date.now()) {
 if(!secret||secret.length<32)return false;
 const value=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nuradi_session='))?.slice(15);
 if(!value)return false;const [expiry,signature]=value.split('.');
 return /^\d+$/.test(expiry)&&Number(expiry)>now&&Number(expiry)<=now+8*3600000&&equalSecret(signature,sign(expiry,secret));
}
export const sameOrigin=req=>{
 const origin=req.headers.origin;return !!origin && origin===`https://${req.headers.host}`;
};
