#!/usr/bin/env node
/**
 * Turn a plain-text or Markdown script written by Claude Code (or a human) into the scene JSON
 * the compositions and the voiceover pipeline consume.
 *
 *   node scripts/analyze-script.mjs <script.md|txt> --id <videoId> [--pacing fast|medium|calm]
 *        [--voice-preset young-male-pro] [--grade none|teal-orange|...] [--logo "brand"] [--music-mood energetic-tech]
 *        [--title "..."] [--out public/script/<videoId>.json] [--print]
 *
 * Input conventions (all optional):
 *   # Title                      first H1 becomes the title
 *   ## Scene heading             starts a scene; the heading is the on-screen headline
 *   blank line                   also starts a new scene when there are no headings
 *   **word** or *word*           marks the highlight word of that scene
 *   > subline text               becomes the supporting line
 *   - Label: 42%                 three or more such lines in a scene become a bar chart
 *   [neon] / [image: path] / [video: path] at the start of a scene picks the visual
 *   (delivery: excited)          per-scene delivery hint for TTS
 *
 * Everything else in the scene is the voiceover text. Output: public/script/<videoId>.json plus a
 * timing summary (words per scene, estimated seconds at the pacing's words-per-minute).
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {validateScript, writeJson} from './lib/script-schema.mjs';

const args = parseArgs(process.argv.slice(2));
const input = args._[0];
if (!input || !fs.existsSync(input) || !args.id) {
  console.error('Usage: node scripts/analyze-script.mjs <script.md> --id <videoId> [--pacing fast|medium|calm] [--voice-preset young-male-pro]');
  process.exit(1);
}

const WPM = {fast: 185, medium: 165, calm: 145};
const pacing = ['fast', 'medium', 'calm'].indexOf(args.pacing) !== -1 ? args.pacing : 'fast';
const videoId = String(args.id).replace(/[^a-zA-Z0-9_-]/g, '-');
const raw = fs.readFileSync(input, 'utf8').replace(/\r\n/g, '\n');

// ---- split into title + scene blocks --------------------------------------------------------------
let title = args.title || '';
const lines = raw.split('\n');
const blocks = [];
let current = null;
const startBlock = (heading) => {
  current = {heading, lines: []};
  blocks.push(current);
};
for (const line of lines) {
  const h1 = line.match(/^#\s+(.+)/);
  const h2 = line.match(/^#{2,3}\s+(.+)/);
  if (h1 && !title) {
    title = h1[1].trim();
    continue;
  }
  if (h2) {
    startBlock(h2[1].trim());
    continue;
  }
  if (line.trim() === '') {
    // A blank line closes the current scene once it has content; the next text starts a new one
    // (a following ## heading also starts one). Headed scenes therefore end at their first blank line.
    if (current && current.lines.length > 0) current = null;
    continue;
  }
  if (!current) startBlock(null);
  current.lines.push(line);
}

const STOP = new Set('the a an and or but of to in on for with your you it is are was were be this that these those from by as at into than then so not no we our they their i my me he she his her its will can just very more most'.split(' '));

const pickHighlight = (headline, voiceover) => {
  const numberInHeadline = headline.match(/\d[\d,.%$]*\s*\w*/);
  if (numberInHeadline) return numberInHeadline[0].trim();
  const words = headline.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''));
  const candidates = words.filter((w) => w && !STOP.has(w.toLowerCase()) && w.length > 3);
  // Prefer a word that also appears emphasized or repeated in the voiceover.
  const vo = voiceover.toLowerCase();
  const scored = candidates.map((w) => ({w, score: (vo.indexOf(w.toLowerCase()) !== -1 ? 2 : 0) + w.length / 10 + (/^[A-Z]/.test(w) ? 0.5 : 0)}));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.w;
};

const firstSentence = (text, maxWords = 8) => {
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  const words = sentence.replace(/[*_>`]/g, '').split(/\s+/);
  return words.slice(0, maxWords).join(' ').replace(/[,:;]$/, '');
};

const scenes = blocks.map((block, i) => {
  const id = `scene-${String(i + 1).padStart(2, '0')}`;
  let visual = {type: 'gradient'};
  let delivery;
  let subline;
  let highlight;
  const dataLines = [];
  const voiceLines = [];

  for (let line of block.lines) {
    const tag = line.match(/^\s*\[(neon|image|video)(?::\s*([^\]]+))?\]\s*/i);
    if (tag) {
      visual = tag[1].toLowerCase() === 'neon' ? {type: 'neon'} : {type: tag[1].toLowerCase(), src: (tag[2] || '').trim()};
      line = line.slice(tag[0].length);
    }
    const del = line.match(/\(delivery:\s*([^)]+)\)/i);
    if (del) {
      delivery = del[1].trim();
      line = line.replace(del[0], '');
    }
    const quote = line.match(/^\s*>\s*(.+)/);
    if (quote) {
      subline = quote[1].trim();
      continue;
    }
    const data = line.match(/^\s*[-*]\s*([^:]+?)\s*[:—-]\s*\$?([\d.,]+)\s*(%|[a-zA-Z]+)?\s*$/);
    if (data) {
      dataLines.push({label: data[1].trim(), value: parseFloat(data[2].replace(/,/g, '')), unit: data[3] || ''});
      continue;
    }
    const emph = line.match(/\*\*([^*]+)\*\*|\*([^*]+)\*/);
    if (emph && !highlight) highlight = (emph[1] || emph[2]).trim();
    if (line.trim()) voiceLines.push(line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim());
  }

  const voiceover = voiceLines.join(' ').replace(/\s+/g, ' ').trim();
  const headline = block.heading || firstSentence(voiceover);
  if (!highlight) highlight = pickHighlight(headline, voiceover);

  if (dataLines.length >= 3) {
    const unit = dataLines.find((d) => d.unit)?.unit || '';
    const isSeries = dataLines.every((d) => /^\d{4}$|^q[1-4]|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun|week|day)/i.test(d.label));
    const isShare = unit === '%' && Math.abs(dataLines.reduce((s, d) => s + d.value, 0) - 100) < 2;
    visual = {type: 'chart', chart: {kind: isSeries ? 'line' : isShare ? 'donut' : 'bar', title: block.heading || undefined, unit, data: dataLines.map(({label, value}) => ({label, value}))}};
  } else if (dataLines.length > 0 && dataLines.length < 3) {
    const d = dataLines[0];
    visual = {type: 'chart', chart: {kind: 'stat', unit: d.unit, data: [{label: d.label, value: d.value}]}};
  }

  const words = voiceover.split(/\s+/).filter(Boolean).length;
  const seconds = 0.6 + (words * 60) / WPM[pacing];
  const scene = {id, headline, highlight, voiceover: voiceover || headline, visual};
  if (subline) scene.subline = subline;
  if (delivery) scene.delivery = delivery;
  if (i === 0) scene.minSeconds = pacing === 'fast' ? 2 : 2.5;
  return {scene, words, seconds};
});

if (scenes.length === 0) {
  console.error('No scenes found. Add paragraphs or ## headings to the script.');
  process.exit(1);
}

const script = {
  videoId,
  title: title || videoId,
  pacing,
  grade: args.grade || 'none',
  logo: args.logo ? {text: String(args.logo), corner: 'top-left'} : null,
  music: args['music-mood'] ? {mood: String(args['music-mood']), level: 0.18} : null,
  voice: {
    provider: args.provider || 'elevenlabs',
    preset: args['voice-preset'] || 'young-male-pro',
    model: 'eleven_multilingual_v2',
    settings: pacing === 'fast' ? {stability: 0.42, similarity_boost: 0.78, style: 0.35, use_speaker_boost: true, speed: 1.08} : pacing === 'calm' ? {stability: 0.55, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 0.97} : {stability: 0.48, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.02},
  },
  scenes: scenes.map((s) => s.scene),
};
validateScript(script);

const out = args.out || path.join('public', 'script', `${videoId}.json`);
writeJson(out, script);

const totalWords = scenes.reduce((s, x) => s + x.words, 0);
const totalSeconds = scenes.reduce((s, x) => s + x.seconds, 0) + scenes.length * (pacing === 'fast' ? 0.35 : pacing === 'calm' ? 0.9 : 0.6);
console.log(`Wrote ${out}: ${scenes.length} scenes, ${totalWords} words, about ${totalSeconds.toFixed(0)} s at ${pacing} pacing (${WPM[pacing]} wpm)`);
scenes.forEach(({scene, words, seconds}) => {
  const kind = scene.visual.type === 'chart' ? `chart:${scene.visual.chart.kind}` : scene.visual.type;
  console.log(`  ${scene.id}  ${String(words).padStart(3)} w  ${seconds.toFixed(1).padStart(5)} s  ${kind.padEnd(11)} ${scene.headline}${scene.highlight ? `  [${scene.highlight}]` : ''}`);
});
if (totalSeconds > 60 && pacing === 'fast') console.log('Note: over 60 s. Shorts/Reels perform best under 45 s; cut scenes or split into parts.');
if (args.print) console.log(JSON.stringify(script, null, 2));
