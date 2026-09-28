/**
 * Topic package: the single source of truth for one episode, prepared once and rendered many times.
 *
 *   <episode folder>/
 *     package.json            id, week, date, topic, title, audience, objective, voice, music, version
 *     production.json         videos -> scenes: headline, narration, visual (kind + settings + beats), sources
 *     research/sources.json   [{id, title, publisher, url, accessed, supports, limits}]
 *     research/notes.md       optional working notes
 *     assets/brands.json      brand marks used (Simple Icons path + hex), assets/manifest.json provenance
 *     upload/<video>.json     title, description, tags, hashtags, chapters (filled after voice)
 *     thumbs/thumbs.json      thumbnail text and visual per video
 *     voice/<video>/          voice-*.mp3 + timing.json (measured, written by package-voice.mjs)
 *     music/<video>.wav       music bed (generated locally or a licensed library file)
 *     renders/                segments/, final MP4s, render-manifest.json, qc.json
 *     validation.json         written by validate-package.mjs
 *
 * Stages, in order: planned, researched, scripted, storyboarded, voiced, assets-ready, render-ready.
 * Rendered / QC state lives in renders/render-manifest.json and is checked against the current input hash.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STAGES = ['planned', 'researched', 'scripted', 'storyboarded', 'voiced', 'assets-ready', 'render-ready'];
export const KINDS = ['flow', 'stat', 'bars', 'equation', 'meter', 'compare', 'layers', 'grid', 'timeline', 'cycle', 'checklist', 'wave', 'hero', 'device'];
/** Bump when the renderer changes what a scene looks like, so cached segments are re-rendered. */
export const RENDERER_VERSION = 'episode-1';
export const ESTIMATE_WPM = 160;
const LEAD = 0.25;
const HOLD = 0.5;

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const fileHash = (file) => (fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null);
const words = (t) => String(t ?? '').trim().split(/\s+/).filter(Boolean);
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9%]+/g, '');

export const loadPackage = (dir) => ({
  dir,
  pkg: readJson(path.join(dir, 'package.json')),
  production: readJson(path.join(dir, 'production.json')),
  sources: readJson(path.join(dir, 'research', 'sources.json')),
  brands: readJson(path.join(dir, 'assets', 'brands.json')) ?? {},
  timing: (video) => readJson(path.join(dir, 'voice', video, 'timing.json')),
});

// Lucide icon names from the project's node_modules, when available (validation then catches typos).
let lucideNames = null;
const lucideSet = (projectDir) => {
  if (lucideNames !== null) return lucideNames;
  lucideNames = new Set();
  try {
    const dir = path.join(projectDir, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
    for (const f of fs.readdirSync(dir)) if (/\.m?js$/.test(f)) lucideNames.add(f.replace(/\.m?js$/, ''));
  } catch {
    // not installed here: icon names are not checked
  }
  return lucideNames;
};
const ALIAS = new Set(['circle-help', 'help-circle', 'alert-triangle', 'check-circle', 'x-circle', 'bar-chart']);

/** Icons used by a visual: [{name, where}] */
const iconsOf = (v) => {
  const out = [];
  const push = (name, where) => name && out.push({name: String(name), where});
  for (const n of v.nodes ?? []) push(n.icon, `node ${n.id}`);
  for (const it of v.items ?? []) push(it.icon, `item ${it.id ?? it.label}`);
  for (const st of v.steps ?? []) push(st.icon, `step ${st.id ?? st.label}`);
  for (const o of v.orbit ?? []) push(o, 'orbit');
  if (v.icon) push(v.icon, 'icon');
  if (v.in?.icon) push(v.in.icon, 'in');
  if (v.out?.icon) push(v.out.icon, 'out');
  for (const b of v.screen?.brands ?? []) push(`brand:${b}`, 'screen');
  if (v.kind === 'device' && v.device && !['phone', 'earbuds', 'router', 'tower'].includes(v.device)) push(v.device, 'device');
  return out;
};

/** Element ids a beat may show/focus for a visual (null = any id accepted). */
const idsOf = (v) => {
  switch (v.kind) {
    case 'flow':
      return new Set([...(v.nodes ?? []).map((n) => n.id), ...(v.links ?? []).map((l) => l.id ?? `${l.from}>${l.to}`), 'badge']);
    case 'grid':
      return new Set((v.items ?? Array.from({length: v.count ?? 8}, (_, i) => ({id: String(i + 1)}))).map((it, i) => it.id ?? `i${i}`));
    case 'equation':
      return new Set([...(v.terms ?? []).map((_, i) => `t${i}`), 'note']);
    default:
      return null;
  }
};

const KIND_RULES = {
  flow: (v, e) => {
    if (!Array.isArray(v.nodes) || !v.nodes.length) e('flow needs nodes: [{id, icon, label}]');
    const ids = new Set((v.nodes ?? []).map((n) => n.id));
    if (ids.size !== (v.nodes ?? []).length) e('flow node ids must be unique');
    for (const l of v.links ?? []) if (!ids.has(l.from) || !ids.has(l.to)) e(`flow link ${l.from} -> ${l.to} names a missing node`);
    if (v.layout && !['row', 'column', 'tree', 'hub', 'free'].includes(v.layout)) e(`flow layout "${v.layout}" is not row, column, tree, hub or free`);
    if ((v.nodes ?? []).length > 6) e('flow has more than 6 nodes: split it into two scenes');
  },
  stat: (v, e) => typeof v.value !== 'number' && e('stat needs a numeric value'),
  bars: (v, e) => (!Array.isArray(v.items) || !v.items.length || v.items.some((i) => typeof i.value !== 'number')) && e('bars needs items: [{label, value}]'),
  equation: (v, e) => (!Array.isArray(v.terms) || v.terms.length < 3) && e('equation needs at least 3 terms'),
  meter: (v, e) => typeof v.level === 'number' && (v.level < 0 || v.level > 1) && e('meter level must be 0..1'),
  compare: (v, e) => (!Array.isArray(v.items) || v.items.length < 2 || v.items.length > 3) && e('compare needs 2 or 3 items'),
  layers: (v, e) => (!Array.isArray(v.items) || !v.items.length || v.items.length > 6) && e('layers needs 1 to 6 items'),
  grid: (v, e) => !v.items && !v.count && e('grid needs count or items'),
  timeline: (v, e) => (!Array.isArray(v.steps) || v.steps.length < 2 || v.steps.length > 7) && e('timeline needs 2 to 7 steps'),
  cycle: (v, e) => (!Array.isArray(v.steps) || v.steps.length < 3 || v.steps.length > 6) && e('cycle needs 3 to 6 steps'),
  checklist: (v, e) => (!Array.isArray(v.items) || !v.items.length || v.items.length > 5) && e('checklist needs 1 to 5 items'),
  wave: (v, e) => v.mode && !['spectrum', 'sine', 'lanes'].includes(v.mode) && e(`wave mode "${v.mode}" is not spectrum, sine or lanes`),
  hero: (v, e) => !v.icon && e('hero needs an icon'),
  device: (v, e) => !v.device && e('device needs device: phone | earbuds | router | tower | <lucide icon>'),
};

/** Hash of everything that changes one scene's picture or sound. */
export const sceneHash = (scene, voice, brands, ratio) =>
  sha256(JSON.stringify({r: RENDERER_VERSION, ratio, scene, voice, brands: iconsOf(scene.visual).filter((i) => i.name.startsWith('brand:')).map((i) => brands[i.name.slice(6)] ?? null)}));

/**
 * Validate a package folder. Returns {stage, errors, warnings, videos: {id: {estimatedSeconds, measuredSeconds, scenes}}}.
 * `projectDir` (the Remotion project) enables icon-name checks.
 */
export const validatePackage = (dir, {projectDir = process.cwd()} = {}) => {
  const errors = [];
  const warnings = [];
  const P = loadPackage(dir);
  const report = {dir, id: P.pkg?.id ?? path.basename(dir), stage: 'planned', errors, warnings, videos: {}, checkedAt: new Date().toISOString()};
  if (!P.pkg) {
    errors.push('package.json missing or not valid JSON');
    report.stage = null;
    return report;
  }
  for (const k of ['id', 'topic', 'title']) if (!P.pkg[k]) errors.push(`package.json: ${k} is required`);

  // research
  const sourceIds = new Set((P.sources ?? []).map((s) => s.id));
  const researched = Array.isArray(P.sources) && P.sources.length > 0;
  for (const s of P.sources ?? []) {
    if (!s.id || !s.url || !s.title) errors.push(`sources.json: every source needs id, title and url (${s.id ?? '?'})`);
    if (s.url && !/^https?:\/\//.test(s.url)) errors.push(`sources.json: ${s.id} url is not http(s)`);
    if (!s.accessed) warnings.push(`sources.json: ${s.id} has no accessed date`);
  }

  if (!P.production) {
    errors.push('production.json missing or not valid JSON');
    report.stage = researched ? 'researched' : 'planned';
    return report;
  }
  if (P.production.schema !== 'wiresplained.production/1') errors.push('production.json: schema must be "wiresplained.production/1"');
  const videos = P.production.videos ?? [];
  if (!videos.length) errors.push('production.json: no videos');

  let scripted = true;
  let storyboarded = true;
  let voiced = true;
  let assetsReady = true;
  const icons = lucideSet(projectDir);
  const usedSources = new Set();

  for (const video of videos) {
    const vr = {estimatedSeconds: 0, measuredSeconds: null, scenes: {}};
    report.videos[video.id] = vr;
    if (!['16:9', '9:16'].includes(video.ratio)) errors.push(`${video.id}: ratio must be 16:9 or 9:16`);
    if (!Array.isArray(video.targetSeconds) || video.targetSeconds.length !== 2) errors.push(`${video.id}: targetSeconds [min, max] is required`);
    const sceneIds = new Set();
    const timing = P.timing(video.id);
    let measured = timing ? 0 : null;
    for (const scene of video.scenes ?? []) {
      const where = `${video.id}/${scene.id}`;
      if (!scene.id) errors.push(`${video.id}: a scene has no id`);
      if (sceneIds.has(scene.id)) errors.push(`${where}: duplicate scene id`);
      sceneIds.add(scene.id);
      if (!scene.headline) errors.push(`${where}: headline missing`);
      if (/\*/.test(scene.headline ?? '')) errors.push(`${where}: headline contains Markdown "*" (it would show on screen)`);
      const maxLine = video.ratio === '9:16' ? 22 : 36;
      for (const line of String(scene.headline ?? '').split('\n')) if (line.length > maxLine * 2) warnings.push(`${where}: headline line "${line}" is long for ${video.ratio}; the renderer will shrink it`);
      if (!scene.narration || !words(scene.narration).length) {
        errors.push(`${where}: narration missing`);
        scripted = false;
      }
      const est = LEAD + (words(scene.narration).length / ESTIMATE_WPM) * 60 + (scene.holdAfter ?? HOLD);
      vr.estimatedSeconds += Math.max(scene.minSeconds ?? 0, est);
      const v = scene.visual;
      if (!v || !v.kind) {
        errors.push(`${where}: visual.kind missing`);
        storyboarded = false;
      } else if (!KINDS.includes(v.kind)) {
        errors.push(`${where}: unknown visual kind "${v.kind}" (${KINDS.join(', ')})`);
        storyboarded = false;
      } else {
        KIND_RULES[v.kind]?.(v, (msg) => {
          errors.push(`${where}: ${msg}`);
          storyboarded = false;
        });
        for (const ic of iconsOf(v)) {
          if (ic.name.startsWith('brand:')) {
            if (!P.brands[ic.name.slice(6)]) {
              errors.push(`${where}: ${ic.where} uses ${ic.name} but assets/brands.json has no "${ic.name.slice(6)}"`);
              assetsReady = false;
            }
          } else if (icons.size && !icons.has(ic.name.replace(/^lucide:/, '')) && !ALIAS.has(ic.name.replace(/^lucide:/, ''))) {
            errors.push(`${where}: ${ic.where} icon "${ic.name}" is not a Lucide icon`);
          }
        }
        const ids = idsOf(v);
        for (const b of v.beats ?? []) {
          if (typeof b.at === 'string') {
            const target = words(b.at).map(norm).filter(Boolean);
            const all = words(scene.narration).map(norm);
            const found = target.length && all.some((_, i) => target.every((t, k) => all[i + k] === t));
            if (!found) errors.push(`${where}: beat "${b.at}" is not in the narration, so it cannot sync to the voice`);
          } else if (typeof b.at !== 'number' || b.at < 0 || b.at > 1) {
            errors.push(`${where}: beat at must be a narration phrase or a 0..1 fraction`);
          }
          if (ids) for (const id of [...(b.show ?? []), ...(b.hide ?? []), ...(b.focus ?? [])]) if (!ids.has(id)) errors.push(`${where}: beat names "${id}", which is not an element of this ${v.kind}`);
        }
        if (['stat', 'bars', 'equation'].includes(v.kind) && !(scene.sources ?? []).length) warnings.push(`${where}: a ${v.kind} shows numbers but cites no source`);
      }
      for (const sid of scene.sources ?? []) {
        usedSources.add(sid);
        if (!sourceIds.has(sid)) errors.push(`${where}: source "${sid}" is not in research/sources.json`);
      }
      const voice = timing?.scenes?.[scene.id];
      if (!voice) voiced = false;
      else {
        if (!fs.existsSync(path.join(dir, 'voice', video.id, voice.file))) {
          errors.push(`${where}: voice file ${voice.file} missing`);
          voiced = false;
        }
        measured += Math.max(scene.minSeconds ?? 0, LEAD + (voice.end - voice.start) + (scene.holdAfter ?? HOLD));
      }
      vr.scenes[scene.id] = sceneHash(scene, voice ?? null, P.brands, video.ratio);
    }
    vr.measuredSeconds = measured;
    const [min, max] = video.targetSeconds ?? [0, Infinity];
    const est = vr.estimatedSeconds;
    if (est < min * 0.9 || est > max * 1.1) warnings.push(`${video.id}: estimated ${Math.round(est)} s is outside the target ${min}-${max} s`);
    if (measured !== null && (measured < min * 0.9 || measured > max * 1.1)) warnings.push(`${video.id}: measured ${Math.round(measured)} s is outside the target ${min}-${max} s`);
    const music = P.pkg.music?.[video.id];
    if (music && !fs.existsSync(path.join(dir, music.file))) {
      errors.push(`${video.id}: music file ${music.file} missing`);
      assetsReady = false;
    }
  }
  for (const s of P.sources ?? []) if (!usedSources.has(s.id)) warnings.push(`sources.json: ${s.id} is not cited by any scene`);

  // Stage: the furthest step whose requirements (and all earlier ones) hold.
  const steps = [true, researched, scripted && videos.length > 0, storyboarded, voiced, assetsReady, errors.length === 0];
  let stage = 'planned';
  for (let i = 0; i < steps.length && steps[i]; i++) stage = STAGES[i];
  report.stage = stage;

  // Finished renders (renders/render-manifest.json, written by package-render.mjs): stale when the scenes,
  // voice or music changed after rendering.
  const manifest = readJson(path.join(dir, 'renders', 'render-manifest.json')) ?? {};
  for (const video of videos) {
    const entry = manifest[video.id];
    const vr = report.videos[video.id];
    if (!entry || !vr) continue;
    const music = P.pkg.music?.[video.id];
    const inputs = renderInputs(dir, video.id, vr.scenes, music);
    vr.render = {file: entry.file, qc: entry.qc, width: entry.width, height: entry.height, renderedAt: entry.renderedAt, stale: JSON.stringify(entry.inputs ?? null) !== JSON.stringify(inputs)};
  }
  return report;
};

/** What a finished render was made from; compared on the next validation to spot stale renders. */
export const renderInputs = (dir, videoId, sceneHashes, music) => ({
  scenes: sceneHashes,
  timing: fileHash(path.join(dir, 'voice', videoId, 'timing.json')),
  music: music ? fileHash(path.join(dir, music.file)) : null,
  level: music?.level ?? null,
});
