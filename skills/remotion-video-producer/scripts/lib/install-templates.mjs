import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJson,atomicWrite} from './files.mjs';
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const installTemplates = (skill,project,{fresh=false}={}) => {
  const baseline=JSON.parse(fs.readFileSync(path.join(skill,'assets/template-baseline.json'),'utf8'));
  const manifestFile=path.join(project,'.skill-owned-files.json');
  const previous=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{};
  const planned=[];
  const walk=(src,dest)=>{for(const e of fs.readdirSync(src,{withFileTypes:true})){
    if(e.name==='settings.json' || dest==='src/lib' && e.name==='brand-styles.ts')continue;
    const a=path.join(src,e.name),b=path.join(dest,e.name);
    if(e.isDirectory())walk(a,b);else if(e.isFile())planned.push({relative:b,bytes:fs.readFileSync(a)});
  }};
  walk(path.join(skill,'assets/templates/src'),'src');walk(path.join(skill,'assets/dashboard'),'tools/dashboard');
  planned.push({relative:'remotion.config.ts',bytes:fs.readFileSync(path.join(skill,'assets/templates/remotion.config.ts'))});
  const conflicts=planned.filter(({relative,bytes})=>{const f=path.join(project,relative);if(!fs.existsSync(f)||fresh)return false;const current=hash(fs.readFileSync(f));return current!==hash(bytes)&&current!==previous[relative]&&current!==baseline[relative];});
  if(conflicts.length)throw new Error('Customized files need merging before upgrade (nothing overwritten): '+conflicts.map(c=>c.relative).join(', '));
  const backup=path.join(project,'.skill-backup',Date.now()+'-'+crypto.randomUUID());
  const manifest={...previous};
  for(const {relative,bytes} of planned){
    const f=path.join(project,relative);
    if(fs.existsSync(f)){const b=path.join(backup,relative);fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(f,b);}
    atomicWrite(f,bytes,0o644);manifest[relative]=hash(bytes);
  }
  for(const name of ['package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lock','src/index.ts','src/Root.tsx']){
    const f=path.join(project,name);if(fs.existsSync(f)){const b=path.join(backup,name);fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(f,b);}
  }
  const brand=path.join(project,'src/lib/brand-styles.ts');if(!fs.existsSync(brand))atomicWrite(brand,fs.readFileSync(path.join(skill,'assets/templates/src/lib/brand-styles.ts')),0o644);
  atomicJson(manifestFile,manifest);
  return {backup,files:planned.length};
};
