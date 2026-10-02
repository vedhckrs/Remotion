import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const atomicWrite = (file, data, mode = 0o600) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(tmp, data, {mode, flag: 'wx'}); fs.renameSync(tmp, file); }
  finally { fs.rmSync(tmp, {force: true}); }
};
export const atomicJson = (file, data) => atomicWrite(file, JSON.stringify(data, null, 2) + '\n');
export const safeId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
export const inside = (root, name) => {
  if (typeof name !== 'string' || !name || path.isAbsolute(name)) return null;
  const full = path.resolve(root, name);
  if (!full.startsWith(path.resolve(root) + path.sep)) return null;
  if (fs.existsSync(root)) {
    let ancestor=full;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
    const realRoot=fs.realpathSync(root),realAncestor=fs.realpathSync(ancestor);
    if(realAncestor!==realRoot && !realAncestor.startsWith(realRoot+path.sep))return null;
  }
  return full;
};

export function sha256File(file) {
  const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(8*1024*1024);
  try { let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count)); }
  finally {fs.closeSync(fd);}
  return hash.digest('hex');
}
