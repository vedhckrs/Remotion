#!/usr/bin/env node
/**
 * Thumbnails for a topic package, from thumbs/thumbs.json: the long video's at 1280x720 (YouTube's size) and the
 * Short's cover at 1080x1920, JPEG under 2 MB. Offline, same fonts, colours and icons as the videos.
 *
 *   node scripts/package-thumbs.mjs <episode folder> [--video long|short|all] [--gl angle]
 *
 * Run it from the Remotion project root. Writes <folder>/renders/thumbs/<id>_<video>_thumbnail.jpg.
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {validatePackage} from './lib/package-schema.mjs';
import {chromiumFor, episodeEntry, loadRemotion, localBrowserExecutable, lowerPriority, packageId, readableErrors, syncPackage} from './lib/render-kit.mjs';

const args = parseArgs(process.argv.slice(2));
const src = path.resolve(String(args._[0] ?? ''));
const project = process.cwd();
if (!fs.existsSync(path.join(src, 'production.json')) || !fs.existsSync(path.join(project, 'src', 'episode', 'Thumbnail.tsx'))) {
  console.error('Usage (from the Remotion project root, updated with scaffold.sh --update): node scripts/package-thumbs.mjs <episode folder> [--video long|short|all]');
  process.exit(1);
}
lowerPriority();
readableErrors();
const report = validatePackage(src, {projectDir: project});
if (report.errors.length) {
  console.error(`ERROR Package has errors, fix them first: ${report.errors.join('; ')}`);
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
const production = JSON.parse(fs.readFileSync(path.join(src, 'production.json'), 'utf8'));
const id = packageId(pkg, src);
const videos = production.videos.filter((v) => !args.video || args.video === 'all' || v.id === args.video);
const chromiumOptions = chromiumFor(args.gl ?? process.env.REMOTION_GL ?? null);
syncPackage(src, project, id);
const {bundle, openBrowser, renderStill, selectComposition} = await loadRemotion(project);
const serveUrl = await bundle({entryPoint: episodeEntry(project), onProgress: () => undefined});
const browser = await openBrowser('chrome', {chromiumOptions, browserExecutable: localBrowserExecutable(), logLevel: 'error'});
const out = path.join(src, 'renders', 'thumbs');
fs.mkdirSync(out, {recursive: true});
try {
  for (const video of videos) {
    const inputProps = {packageId: id, video: video.id};
    const comp = await selectComposition({serveUrl, id: 'EpisodeThumbnail', inputProps, puppeteerInstance: browser, chromiumOptions, logLevel: 'error'});
    const scale = comp.width > comp.height ? 1280 / comp.width : 1;
    const file = path.join(out, `${id}_${video.id}_thumbnail.jpg`);
    // YouTube's limit is 2 MB: step the quality down until the file fits.
    for (const jpegQuality of [92, 85, 78, 70]) {
      await renderStill({composition: comp, serveUrl, frame: 0, output: file, imageFormat: 'jpeg', jpegQuality, scale, inputProps, puppeteerInstance: browser, chromiumOptions, overwrite: true, logLevel: 'error'});
      if (fs.statSync(file).size < 2 * 2 ** 20) break;
    }
    console.log(`${video.id}: ${path.relative(process.cwd(), file)} (${Math.round(comp.width * scale)}x${Math.round(comp.height * scale)}, ${Math.round(fs.statSync(file).size / 1024)} KB)`);
  }
} finally {
  await browser.close({silent: true}).catch(() => undefined);
}
