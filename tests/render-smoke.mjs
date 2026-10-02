import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import './prepare-reference.mjs';
const project=path.resolve('.cache/reference');
const dir=path.resolve('.cache/render-smoke');fs.mkdirSync(dir,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromiumOptions={gl:'angle'};
const browser=await openBrowser('chrome',{browserExecutable:fs.existsSync(chrome)?chrome:undefined,chromiumOptions});
try {
 const serveUrl=await bundle({entryPoint:path.join(project,'src/episode/entry.ts'),publicDir:path.join(project,'public')});
 for(const video of ['long','short']) {
  const inputProps={packageId:'demo-kinds',video,captions:true,music:false,onlyScenes:[]};
  const comp=await selectComposition({serveUrl,id:video==='long'?'EpisodeLong':'EpisodeShort',inputProps,puppeteerInstance:browser,chromiumOptions});
  for(const scene of comp.props.data.scenes){
   const output=path.join(dir,`${video}-${scene.id}-${scene.visual.kind}.png`);
   await renderStill({serveUrl,composition:comp,inputProps,output,frame:Math.min(scene.from+180,scene.from+scene.frames-1),scale:0.5,puppeteerInstance:browser,chromiumOptions,logLevel:'error'});
   console.log('STILL',path.basename(output));
  }
  await renderMedia({serveUrl,composition:comp,inputProps,outputLocation:path.join(dir,`${video}-clip.mp4`),codec:'h264',frameRange:[0,119],scale:0.5,concurrency:2,puppeteerInstance:browser,chromiumOptions,logLevel:'error'});
  console.log('CLIP',video);
 }
} finally {await browser.close({silent:true});}
