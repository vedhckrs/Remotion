#!/usr/bin/env node
/**
 * Storyboard stills: one picture per scene, taken after the scene's last beat, so the whole video can be
 * checked before paying for a voice or spending an hour rendering. Works before voicing (timing estimated).
 *
 *   node scripts/package-stills.mjs <episode folder> [--video long|short|all] [--scale 0.5] [--gl angle] [--force]
 *
 * Run it from the Remotion project root. Writes <folder>/renders/<video>/stills/<NN>-<scene>.jpg and
 * stills.json; unchanged scenes keep their picture.
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {sha256, validatePackage} from './lib/package-schema.mjs';
import {chromiumFor, loadRemotion, lowerPriority, packageId, rendererHash, syncPackage} from './lib/render-kit.mjs';

const args = parseArgs(process.argv.slice(2));
const src = path.resolve(String(args._[0] ?? ''));
const project = process.cwd();
if (!fs.existsSync(path.join(src, 'production.json')) || !fs.existsSync(path.join(project, 'src', 'episode'))) {
  console.error('Usage (from the Remotion project root): node scripts/package-stills.mjs <episode folder> [--video long|short|all] [--scale 0.5]');
  process.exit(1);
}
lowerPriority();
const report = validatePackage(src, {projectDir: project});
// Stills need no voice or music (timing is estimated until the voice exists).
if (report.errors.length) {
  console.error(`Package has errors, fix them first:\n  ${report.errors.join('\n  ')}`);
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
const production = JSON.parse(fs.readFileSync(path.join(src, 'production.json'), 'utf8'));
const id = packageId(pkg, src);
const videos = production.videos.filter((v) => !args.video || args.video === 'all' || v.id === args.video);
const scale = Number(args.scale ?? 0.5) || 0.5;
const chromiumOptions = chromiumFor(args.gl ?? process.env.REMOTION_GL ?? null);
syncPackage(src, project, id);
const rh = rendererHash(project);
const {bundle, openBrowser, renderStill, selectComposition} = await loadRemotion(project);

console.log('Bundling the project...');
const serveUrl = await bundle({entryPoint: path.join(project, 'src', 'index.ts'), onProgress: () => undefined});
const browser = await openBrowser('chrome', {chromiumOptions, logLevel: 'error'});
// Cancel from the dashboard (SIGTERM) or Ctrl+C: close Chrome; finished scenes stay for the next run.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    browser.close({silent: true}).finally(() => process.exit(130));
    setTimeout(() => process.exit(130), 3000).unref();
  });
}
try {
  for (const video of videos) {
    const vertical = video.ratio === '9:16';
    const inputProps = {packageId: id, video: video.id, captions: true, music: false, onlyScenes: []};
    const comp = await selectComposition({serveUrl, id: vertical ? 'EpisodeShort' : 'EpisodeLong', inputProps, puppeteerInstance: browser, chromiumOptions, logLevel: 'error'});
    const out = path.join(src, 'renders', video.id, 'stills');
    fs.mkdirSync(out, {recursive: true});
    const indexFile = path.join(out, 'stills.json');
    const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
    const next = {};
    let made = 0;
    for (const [i, scene] of comp.props.data.scenes.entries()) {
      const lastBeat = scene.beatFrames.length ? scene.beatFrames[scene.beatFrames.length - 1].frame : 0;
      const at = Math.min(scene.frames - 1, Math.max(Math.round(scene.frames * 0.7), lastBeat + 36));
      const frame = scene.from + at;
      const key = sha256(JSON.stringify({s: report.videos[video.id].scenes[scene.id], at, scale, rh})).slice(0, 16);
      const file = `${String(i + 1).padStart(2, '0')}-${scene.id}.jpg`;
      next[scene.id] = {file, key, frame, seconds: +(frame / comp.fps).toFixed(2), headline: scene.headline, narration: scene.narration, kind: scene.visual.kind};
      if (!args.force && index[scene.id]?.key === key && fs.existsSync(path.join(out, file))) continue;
      await renderStill({composition: comp, serveUrl, frame, output: path.join(out, file), imageFormat: 'jpeg', jpegQuality: 82, scale, inputProps, puppeteerInstance: browser, chromiumOptions, overwrite: true, logLevel: 'error'});
      made++;
      console.log(`PROGRESS ${JSON.stringify({video: video.id, scene: scene.id, index: i + 1, of: comp.props.data.scenes.length, status: 'done'})}`);
    }
    for (const f of fs.readdirSync(out)) if (f.endsWith('.jpg') && !Object.values(next).some((n) => n.file === f)) fs.rmSync(path.join(out, f));
    fs.writeFileSync(indexFile, JSON.stringify(next, null, 1) + '\n');
    console.log(`${video.id}: ${made} stills made, ${Object.keys(next).length - made} unchanged (${path.relative(process.cwd(), out)})`);
  }
} finally {
  await browser.close({silent: true}).catch(() => undefined);
}
