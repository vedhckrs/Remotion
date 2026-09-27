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
 *   [icons: youtube, instagram, logos:react, lucide:zap]   brand/UI icon scene (default set simple-icons)
 *   [speaker: Ada Lovelace | Founder, Analytical Engines]  lower third for that scene
 *   [bg: spotlight]              per-scene background system (solid, tonal, spotlight, grid, dots, particles, rays, waves, streaks, paper)
 *   (delivery: excited)          per-scene delivery hint for TTS
 *   --style <preset>             midnight-neon | clean-corporate | hype-bold | luxury-noir | warm-editorial | tech-grid
 *   --keywords "a, b"            seeds the seo block (titles, hashtags, description skeleton) for the publish pack
 *
 *   node scripts/analyze-script.mjs --check public/script/<videoId>.json
 *                                validates a hand-written JSON script (schema, hook length, timing, seo) and exits 1 on errors
 *
 * Everything else in the scene is the voiceover text. Output: public/script/<videoId>.json plus a
 * timing summary (words per scene, estimated seconds at the pacing's words-per-minute).
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/env.mjs';
import {validateScript, writeJson} from './lib/script-schema.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.check) {
  const file = typeof args.check === 'string' ? args.check : args._[0];
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/analyze-script.mjs --check public/script/<videoId>.json');
    process.exit(1);
  }
  const script = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  try {
    validateScript(script);
  } catch (error) {
    problems.push(...error.message.split('\n').slice(1).map((l) => l.replace(/^ - /, '')));
  }
  const wpm = {fast: 185, medium: 165, calm: 145}[script.pacing] || 165;
  const gap = {fast: 0.35, medium: 0.6, calm: 0.9}[script.pacing] || 0.6;
  let total = 0;
  for (const scene of script.scenes || []) {
    const words = String(scene.voiceover || '').trim().split(/\s+/).filter(Boolean).length;
    total += Math.max(scene.minSeconds || 0, 0.6 + (words * 60) / wpm + gap);
    if (words > 40) problems.push(`${scene.id}: ${words} words in one scene; split it (one idea per scene)`);
    if (String(scene.headline || '').split(/\s+/).length > 12) problems.push(`${scene.id}: headline over 12 words`);
  }
  const hook = script.scenes?.[0];
  if (hook && String(hook.headline).split(/\s+/).length > 12) problems.push('scene 1 (hook) headline should be under 12 words');
  const seo = script.seo || {};
  if (!seo.titles?.length) problems.push('seo.titles missing (3 options, under 70 chars)');
  (seo.titles || []).forEach((t, i) => t.length > 100 && problems.push(`seo.titles[${i}] over 100 chars (YouTube limit)`));
  if (!seo.description) problems.push('seo.description missing');
  if (!seo.thumbnailText) problems.push('seo.thumbnailText missing (3 to 5 words)');
  else if (seo.thumbnailText.split(/\s+/).length > 6) problems.push('seo.thumbnailText over 6 words; thumbnails need 3 to 5');
  if (!seo.hashtags?.length) problems.push('seo.hashtags missing');
  const kinds = (script.scenes || []).map((s) => s.visual?.type || 'plain');
  console.log(`${file}: ${script.scenes?.length || 0} scenes, ~${Math.round(total)} s at ${script.pacing || 'medium'} pacing, style ${script.style || '(default)'}, visuals ${Array.from(new Set(kinds)).join('/')}`);
  if (problems.length) {
    console.log(`Problems:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
  console.log('OK');
  process.exit(0);
}

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
  let visual = {type: 'plain'};
  let delivery;
  let subline;
  let highlight;
  let speaker;
  let background;
  const dataLines = [];
  const voiceLines = [];

  for (let line of block.lines) {
    const tag = line.match(/^\s*\[(neon|image|video|icons|logos)(?::\s*([^\]]+))?\]\s*/i);
    if (tag) {
      const kind = tag[1].toLowerCase();
      if (kind === 'neon') visual = {type: 'neon'};
      else if (kind === 'icons' || kind === 'logos') {
        const icons = (tag[2] || '').split(',').map((s) => s.trim()).filter(Boolean).map((token) => {
          const [a, b] = token.split(':').map((x) => x.trim());
          const spec = b ? {set: a, name: b} : {set: kind === 'logos' ? 'logos' : 'simple-icons', name: a};
          spec.label = spec.name.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
          return spec;
        });
        visual = {type: 'icons', icons};
      } else visual = {type: kind, src: (tag[2] || '').trim()};
      line = line.slice(tag[0].length);
    }
    const sp = line.match(/\[speaker:\s*([^\]|]+)(?:\|\s*([^\]]+))?\]/i);
    if (sp) {
      speaker = {name: sp[1].trim(), ...(sp[2] ? {role: sp[2].trim()} : {})};
      line = line.replace(sp[0], '');
    }
    const bg = line.match(/\[bg:\s*([a-z]+)\]/i);
    if (bg) {
      background = bg[1].toLowerCase();
      line = line.replace(bg[0], '');
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
  if (background) visual = {...visual, background};
  const scene = {id, headline, highlight, voiceover: voiceover || headline, visual};
  if (subline) scene.subline = subline;
  if (delivery) scene.delivery = delivery;
  if (speaker) scene.speaker = speaker;
  if (i === 0) scene.minSeconds = pacing === 'fast' ? 2 : 2.5;
  return {scene, words, seconds};
});

if (scenes.length === 0) {
  console.error('No scenes found. Add paragraphs or ## headings to the script.');
  process.exit(1);
}

const keywords = args.keywords ? String(args.keywords).split(',').map((k) => k.trim()).filter(Boolean) : [];
const highlights = scenes.map((s) => s.scene.highlight).filter(Boolean);
const hook = scenes[0].scene.headline.replace(/[.!?]+$/, '');
// Thumbnail text: the whole hook when it is short, else its first words without a dangling "the" / "to".
const thumbWords = hook.split(/\s+/).slice(0, hook.split(/\s+/).length <= 6 ? 6 : 5);
while (thumbWords.length > 2 && STOP.has(thumbWords[thumbWords.length - 1].toLowerCase().replace(/[^a-z']/g, ''))) thumbWords.pop();
const seo = {
  titles: [title || hook, hook, `${hook} (${keywords[0] || 'explained'})`].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3),
  description: `${title || hook}. ${scenes.slice(0, 2).map((s) => s.scene.voiceover.split(/(?<=[.!?])\s+/)[0]).join(' ')}`.slice(0, 300),
  keywords: [...keywords, ...highlights.map((h) => String(h).toLowerCase())].filter((v, i, a) => a.indexOf(v) === i).slice(0, 12),
  hashtags: [...keywords, ...highlights].map((k) => '#' + String(k).toLowerCase().replace(/[^a-z0-9]/g, '')).filter((h) => h.length > 2).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5),
  category: args.category || 'Education',
  cta: 'Follow for part two.',
  thumbnailText: thumbWords.join(' '),
  language: 'en',
};

const script = {
  videoId,
  title: title || videoId,
  pacing,
  style: args.style || undefined,
  seo,
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
  const kind = scene.visual.type === 'chart' ? `chart:${scene.visual.chart.kind}` : scene.visual.type === 'icons' ? `icons:${scene.visual.icons.length}` : scene.visual.type;
  console.log(`  ${scene.id}  ${String(words).padStart(3)} w  ${seconds.toFixed(1).padStart(5)} s  ${kind.padEnd(11)} ${scene.headline}${scene.highlight ? `  [${scene.highlight}]` : ''}`);
});
if (totalSeconds > 60 && pacing === 'fast') console.log('Note: over 60 s. Shorts/Reels perform best under 45 s; cut scenes or split into parts.');
if (args.print) console.log(JSON.stringify(script, null, 2));
