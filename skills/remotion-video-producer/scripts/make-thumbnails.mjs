#!/usr/bin/env node
/**
 * Render click-through thumbnails and covers for a video from the Thumbnail compositions.
 *
 *   node scripts/make-thumbnails.mjs --video <id> [--text "3 to 5 words"] [--highlight word] [--image path/under/public.jpg]
 *        [--variants "TEXT A|TEXT B"] [--only youtube,cover,square] [--out out/<id>] [--quality 90]
 *
 * Writes out/<id>/thumbnail.jpg (1280x720, <= 2 MB as YouTube requires), cover.jpg (1080x1920 for
 * Shorts / Reels), square.jpg (1080x1080 for Feed / Facebook). With --variants each text becomes
 * thumbnail-a.jpg, thumbnail-b.jpg... for A/B testing. Text defaults to script.seo.thumbnailText.
 * GL backend comes from remotion.config.ts (REMOTION_GL overrides).
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs} from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
const videoId = args.video || args._[0];
if (!videoId) {
  console.error('Usage: node scripts/make-thumbnails.mjs --video <id> [--text "..."] [--variants "A|B"] [--only youtube,cover]');
  process.exit(1);
}
const scriptFile = path.join('public', 'script', `${videoId}.json`);
if (!fs.existsSync(scriptFile)) {
  console.error(`Missing ${scriptFile}`);
  process.exit(1);
}
const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
const outDir = path.resolve(args.out || path.join('out', videoId));
fs.mkdirSync(outDir, {recursive: true});

const COMPS = {youtube: {id: 'Thumbnail', file: 'thumbnail', maxBytes: 2 * 1024 * 1024}, cover: {id: 'Cover', file: 'cover', maxBytes: 8 * 1024 * 1024}, square: {id: 'SquareCover', file: 'square', maxBytes: 8 * 1024 * 1024}};
const only = args.only ? String(args.only).split(',') : Object.keys(COMPS);
const texts = args.variants ? String(args.variants).split('|').map((t) => t.trim()).filter(Boolean) : [args.text || null];
const entry = fs.existsSync('src/index.ts') ? 'src/index.ts' : 'src/index.tsx';
const gl = process.env.REMOTION_GL ? [`--gl=${process.env.REMOTION_GL}`] : [];
const extra = process.env.REMOTION_IGNORE_CERTS === '1' ? ['--ignore-certificate-errors'] : [];

const renderStill = (compId, outFile, props, quality) => {
  const propsFile = path.join(outDir, `.props-${compId}.json`);
  fs.writeFileSync(propsFile, JSON.stringify(props));
  const res = spawnSync('npx', ['remotion', 'still', entry, compId, outFile, `--props=${propsFile}`, '--image-format=jpeg', `--jpeg-quality=${quality}`, '--overwrite', '--log=error', ...gl, ...extra], {stdio: 'inherit'});
  fs.rmSync(propsFile, {force: true});
  return res.status === 0;
};

const results = [];
for (const variant of only) {
  const comp = COMPS[variant];
  if (!comp) {
    console.error(`Unknown variant ${variant}; use ${Object.keys(COMPS).join(', ')}`);
    continue;
  }
  texts.forEach((text, i) => {
    const suffix = texts.length > 1 ? `-${String.fromCharCode(97 + i)}` : '';
    const outFile = path.join(outDir, `${comp.file}${suffix}.jpg`);
    const props = {
      videoId,
      variant,
      style: args.style || 'auto',
      accent: args.accent || null,
      text,
      highlight: args.highlight || null,
      image: args.image || null,
      showLogos: args['no-logos'] ? false : true,
      backgroundFrame: 90 + i * 40,
    };
    let quality = Number(args.quality || 90);
    let ok = renderStill(comp.id, outFile, props, quality);
    // YouTube rejects thumbnails over 2 MB: step the JPEG quality down until it fits.
    while (ok && fs.statSync(outFile).size > comp.maxBytes && quality > 50) {
      quality -= 10;
      ok = renderStill(comp.id, outFile, props, quality);
    }
    if (ok) {
      const kb = Math.round(fs.statSync(outFile).size / 1024);
      results.push({variant, file: path.relative(process.cwd(), outFile), kb, text: text ?? script.seo?.thumbnailText ?? script.title ?? null});
      console.log(`  ${path.relative(process.cwd(), outFile)}  ${kb} KB`);
    } else {
      console.error(`  failed: ${variant}`);
    }
  });
}
fs.writeFileSync(path.join(outDir, 'thumbnails.json'), JSON.stringify({videoId, generatedAt: new Date().toISOString(), results}, null, 2));
console.log(`\n${results.length} file(s) in ${path.relative(process.cwd(), outDir)}. Tip: --variants "A|B" for two texts, --image public/... for a face or product.`);
process.exit(results.length ? 0 : 1);
