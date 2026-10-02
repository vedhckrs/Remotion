import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition} from '@remotion/renderer';
import './prepare-reference.mjs';
const project=path.resolve('.cache/reference');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromiumOptions={gl:'angle'};
const browser=await openBrowser('chrome',{browserExecutable:fs.existsSync(chrome)?chrome:undefined,chromiumOptions});
try {
 const serveUrl=await bundle({entryPoint:path.join(project,'src/index.ts'),publicDir:path.join(project,'public')});
 await assert.rejects(selectComposition({serveUrl,id:'Shorts',inputProps:{videoId:'example'},puppeteerInstance:browser,chromiumOptions}),/Final render requires current narration/);
 const draft=await selectComposition({serveUrl,id:'Shorts',inputProps:{videoId:'example',allowSilentDraft:true},puppeteerInstance:browser,chromiumOptions});
 assert.ok(draft.durationInFrames>0);console.log('PASS: final exports reject missing narration; explicit silent layout drafts resolve');
}finally{await browser.close({silent:true});}
