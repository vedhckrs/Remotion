#!/usr/bin/env node
/**
 * Fetch SVG icons and real brand logos into public/icons/<set>/<name>.svg with a credits file.
 *
 *   node scripts/fetch-icons.mjs --brands youtube,instagram,facebook [--logos react,figma] [--lucide zap,rocket]
 *        [--tabler ...] [--emoji rocket,fire] [--from-script public/script/<id>.json] [--out public/icons]
 *
 * Sources (all free to use; brand marks remain trademarks of their owners):
 *   simple-icons     monochrome brand marks + official hex + source URL. CC0. From the `simple-icons`
 *                    npm package when installed (exact data), otherwise jsDelivr.
 *   logos            full-color brand logos (SVG Logos by gilbarbara). CC0.
 *   lucide           UI stroke icons. ISC.            tabler  UI icons. MIT.
 *   fluent-emoji-flat colorful flat emoji (Microsoft). MIT.
 * Iconify sets come from a local @iconify-json/<set> package if present, else api.iconify.design.
 *
 * public/icons/credits.json feeds <AttributionBar> and the publish packs (description credits).
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseArgs} from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || path.join('public', 'icons'));
const require = createRequire(path.join(process.cwd(), 'package.json'));

const LICENSES = {
  'simple-icons': 'CC0 1.0',
  logos: 'CC0 1.0',
  lucide: 'ISC',
  tabler: 'MIT',
  'fluent-emoji-flat': 'MIT',
};
const SET_FLAGS = {brands: 'simple-icons', logos: 'logos', lucide: 'lucide', tabler: 'tabler', emoji: 'fluent-emoji-flat'};

const wanted = new Map(); // set -> Set(names)
const add = (set, name) => {
  if (!name) return;
  if (!wanted.has(set)) wanted.set(set, new Set());
  wanted.get(set).add(String(name).trim().toLowerCase());
};
for (const [flag, set] of Object.entries(SET_FLAGS)) {
  if (args[flag] && args[flag] !== true) String(args[flag]).split(',').forEach((n) => add(set, n));
}
if (args['from-script']) {
  const script = JSON.parse(fs.readFileSync(args['from-script'], 'utf8'));
  for (const scene of script.scenes || []) {
    for (const icon of scene.visual?.icons || []) add(icon.set || 'simple-icons', icon.name);
  }
  if (script.logo?.icon) add(script.logo.icon.set || 'simple-icons', script.logo.icon.name);
}
if (wanted.size === 0) {
  console.error('Usage: node scripts/fetch-icons.mjs --brands youtube,instagram [--logos react] [--lucide zap] [--emoji rocket] [--from-script public/script/<id>.json]');
  process.exit(1);
}

const creditsFile = path.join(outDir, 'credits.json');
const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, 'utf8')) : [];
const upsertCredit = (entry) => {
  const i = credits.findIndex((c) => c.set === entry.set && c.name === entry.name);
  if (i === -1) credits.push(entry);
  else credits[i] = entry;
};
const writeSvg = (set, name, svg) => {
  const dir = path.join(outDir, set);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
};

const pascal = (slug) => slug.replace(/(^|[^a-z0-9])([a-z0-9])/g, (_, __, c) => c.toUpperCase());

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};

const fetchSimpleIcon = async (slug) => {
  let local = null;
  try {
    local = require('simple-icons');
  } catch {
    /* not installed */
  }
  const icon = local ? local[`si${pascal(slug)}`] : null;
  if (icon) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${icon.title}"><title>${icon.title}</title><path d="${icon.path}"/></svg>\n`;
    return {svg, title: icon.title, hex: icon.hex, source: icon.source, license: icon.license?.type ? `${icon.license.type} (${icon.license.url || ''})`.trim() : LICENSES['simple-icons'], guidelines: icon.guidelines || null};
  }
  const svg = await fetchText(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`);
  const title = (svg.match(/<title>([^<]+)<\/title>/) || [])[1] || slug;
  return {svg, title, hex: null, source: `https://simpleicons.org/?q=${slug}`, license: LICENSES['simple-icons'], guidelines: null};
};

const fetchIconify = async (set, names) => {
  let data = null;
  try {
    const local = require(`@iconify-json/${set}/icons.json`);
    data = {prefix: set, icons: Object.fromEntries(names.map((n) => [n, local.icons[n]]).filter(([, v]) => v)), width: local.width, height: local.height, aliases: local.aliases || {}};
    for (const n of names) {
      if (!data.icons[n] && local.aliases?.[n]) data.icons[n] = local.icons[local.aliases[n].parent];
    }
  } catch {
    const json = await fetchText(`https://api.iconify.design/${set}.json?icons=${encodeURIComponent(names.join(','))}`);
    data = JSON.parse(json);
    for (const [alias, def] of Object.entries(data.aliases || {})) if (!data.icons[alias] && data.icons[def.parent]) data.icons[alias] = data.icons[def.parent];
  }
  const out = {};
  for (const n of names) {
    const icon = data.icons?.[n];
    if (!icon) {
      out[n] = null;
      continue;
    }
    const w = icon.width ?? data.width ?? 24;
    const h = icon.height ?? data.height ?? 24;
    out[n] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${w} ${h}">${icon.body}</svg>\n`;
  }
  return out;
};

let ok = 0;
let missing = [];
for (const [set, names] of wanted) {
  const list = [...names];
  if (set === 'simple-icons') {
    for (const slug of list) {
      try {
        const r = await fetchSimpleIcon(slug);
        writeSvg(set, slug, r.svg);
        upsertCredit({set, name: slug, title: r.title, license: r.license, source: r.source, hex: r.hex, guidelines: r.guidelines});
        ok++;
        console.log(`  simple-icons/${slug}.svg  ${r.title}${r.hex ? `  #${r.hex}` : ''}${r.guidelines ? '  (brand guidelines linked)' : ''}`);
      } catch (error) {
        missing.push(`${set}:${slug} (${error.message})`);
      }
    }
    continue;
  }
  try {
    const svgs = await fetchIconify(set, list);
    for (const n of list) {
      if (!svgs[n]) {
        missing.push(`${set}:${n}`);
        continue;
      }
      writeSvg(set, n, svgs[n]);
      upsertCredit({set, name: n, title: n.replace(/-/g, ' '), license: LICENSES[set] || 'see set license', source: `https://icon-sets.iconify.design/${set}/${n}/`, hex: null, guidelines: null});
      ok++;
      console.log(`  ${set}/${n}.svg`);
    }
  } catch (error) {
    missing.push(`${set}:* (${error.message})`);
  }
}

fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
console.log(`\n${ok} icons in ${path.relative(process.cwd(), outDir)}; credits.json has ${credits.length} entries.`);
if (missing.length) console.log(`Not found: ${missing.join(', ')}\nSearch names at https://simpleicons.org and https://icon-sets.iconify.design`);
console.log('Brand marks are trademarks of their owners: keep <AttributionBar> on, follow linked brand guidelines, never alter a mark.');
if (missing.length) process.exit(2);
