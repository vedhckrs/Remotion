#!/usr/bin/env node
/**
 * Generate 3D .cube LUTs from parametric grades. No licensing questions: these are computed here,
 * they are yours. They match the CSS/effect grades in src/lib/grades.ts so a LUT-graded <LutVideo>
 * and a CSS-graded <Graded> scene look alike.
 *
 *   node scripts/make-lut.mjs [--out public/luts] [--size 33] [--only teal-orange,warm-film]
 *
 * Also usable on any project or in Resolve/Premiere (standard IRIDAS/Adobe .cube).
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out || path.join('public', 'luts'));
const size = Math.max(9, Math.min(65, Number(args.size || 33)));
const only = args.only ? String(args.only).split(',').map((s) => s.trim()) : null;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// Building blocks -------------------------------------------------------------------------------
const contrast = (c, amount, pivot = 0.5) => c.map((v) => clamp01((v - pivot) * amount + pivot));
const saturation = (c, amount) => {
  const l = luma(c);
  return c.map((v) => clamp01(l + (v - l) * amount));
};
const gamma = (c, g) => c.map((v) => Math.pow(clamp01(v), 1 / g));
const lift = (c, amount) => c.map((v) => clamp01(v + amount * (1 - v)));
const gain = (c, amount) => c.map((v) => clamp01(v * amount));
const temperature = (c, t) => [clamp01(c[0] + t * 0.08), clamp01(c[1] + t * 0.01), clamp01(c[2] - t * 0.08)];
/** Tint shadows toward one color and highlights toward another (split toning). */
const splitTone = (c, shadowHex, highlightHex, strength) => {
  const l = luma(c);
  const s = hex(shadowHex);
  const h = hex(highlightHex);
  const sw = (1 - l) * (1 - l) * strength;
  const hw = l * l * strength;
  return c.map((v, i) => clamp01(v + (s[i] - 0.5) * sw + (h[i] - 0.5) * hw));
};
const sCurve = (c, amount) => c.map((v) => {
  const s = v < 0.5 ? 0.5 * Math.pow(2 * v, 1 + amount) : 1 - 0.5 * Math.pow(2 * (1 - v), 1 + amount);
  return clamp01(s);
});
const matte = (c, amount) => c.map((v) => clamp01(amount + v * (1 - amount * 1.2)));

// Grades (keep names in sync with src/lib/grades.ts) ---------------------------------------------
const GRADES = {
  'teal-orange': (c) => splitTone(saturation(contrast(c, 1.1), 1.08), '#0c6b7a', '#ff8a3d', 0.28),
  'warm-film': (c) => splitTone(gamma(saturation(contrast(temperature(c, 0.6), 1.04), 0.95), 1.03), '#5a3a2a', '#f2b16d', 0.18),
  'cool-noir': (c) => splitTone(lift(saturation(contrast(temperature(c, -0.7), 1.2), 0.6), -0.02), '#1f3a5f', '#cfd8e6', 0.22),
  'vibrant-pop': (c) => sCurve(saturation(contrast(c, 1.08), 1.35), 0.25),
  'bleach-bypass': (c) => contrast(saturation(c, 0.45), 1.35),
  'matte-fade': (c) => matte(saturation(contrast(c, 0.94), 0.9), 0.06),
  'neon-night': (c) => splitTone(gain(saturation(contrast(c, 1.15), 1.3), 0.96), '#5b2bff', '#ff2bd6', 0.2),
};

fs.mkdirSync(outDir, {recursive: true});
const names = Object.keys(GRADES).filter((n) => !only || only.indexOf(n) !== -1);
for (const name of names) {
  const fn = GRADES[name];
  const lines = [`TITLE "${name}"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0'];
  // .cube order: red fastest, then green, then blue.
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const out = fn([r / (size - 1), g / (size - 1), b / (size - 1)]);
        lines.push(out.map((v) => v.toFixed(6)).join(' '));
      }
    }
  }
  const file = path.join(outDir, `${name}.cube`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(`  ${name}.cube  (${size}^3, ${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}
console.log(`Wrote ${names.length} LUTs to ${path.relative(process.cwd(), outDir) || '.'}. Use <LutVideo grade="teal-orange"> or lut({content}) from @remotion/effects.`);
void lerp;
