import {computeSceneTimings} from '../../assets/templates/src/lib/timeline.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {atomicJson, inside,safeId} from './files.mjs';

/**
 * Script JSON contract shared by the templates (src/lib/script.ts) and the scripts.
 *
 * {
 *   videoId: string,
 *   title?: string,
 *   pacing?: 'fast' | 'medium' | 'calm',
 *   style?: 'midnight-neon' | 'clean-corporate' | 'hype-bold' | 'luxury-noir' | 'warm-editorial' | 'tech-grid',
 *   background?: 'solid' | 'tonal' | 'spotlight' | 'grid' | 'dots' | 'particles' | 'rays' | 'waves' | 'streaks' | 'paper',
 *   seo?: { titles?: [], description?, keywords?: [], hashtags?: [], category?, cta?, thumbnailText?, language? },
 *   grade?: 'none' | 'teal-orange' | 'warm-film' | 'cool-noir' | 'vibrant-pop' | 'bleach-bypass' | 'matte-fade' | 'neon-night',
 *   logo?: { src?, text?, corner? } | null,
 *   music?: { src?, mood?, level? } | null,
 *   voice?: { provider: 'elevenlabs' | 'openai' | 'macos', voiceId?, preset?, model?, instructions?, settings? },
 *   scenes: [{ id, headline, highlight?, subline?, source?, voiceover, delivery?, minSeconds?, speaker?: {name, role?},
 *              visual?: { type: 'plain' | 'image' | 'video' | 'chart' | 'neon' | 'icons', src?, focal?, background?,
 *                         chart?: { kind, title?, unit?, data: [{label, value}] }, icons?: [{set?, name, label?}] } }]
 * }
 */
export const loadScript = (file) => {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`Script not found: ${abs}`);
  const script = JSON.parse(fs.readFileSync(abs, 'utf8'));
  validateScript(script);
  return script;
};

export const validateScript = (script) => {
  const errors = [];
  if (!script || typeof script !== 'object' || Array.isArray(script)) throw new Error('Invalid script: script must be an object');
  if (!safeId(script.videoId)) errors.push('videoId is required (letters, numbers, - and _)');
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) errors.push('scenes must be a non-empty array');
  const ids = new Set();
  (Array.isArray(script.scenes) ? script.scenes : []).forEach((scene, i) => {
    const where = `scenes[${i}]`;
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) { errors.push(`${where} must be an object`); return; }
    if (scene.minSeconds !== undefined && (!Number.isFinite(scene.minSeconds) || scene.minSeconds < 0)) errors.push(`${where}.minSeconds must be finite and nonnegative`);
    if (!safeId(scene.id)) errors.push(`${where}.id is required (letters, numbers, - and _)`);
    if (ids.has(scene.id)) errors.push(`${where}.id "${scene.id}" is duplicated`);
    ids.add(scene.id);
    if (typeof scene.headline !== 'string') errors.push(`${where}.headline is required`);
    if (typeof scene.voiceover !== 'string' || !scene.voiceover.trim()) errors.push(`${where}.voiceover is required`);
    if (scene.visual && ['plain', 'gradient', 'image', 'video', 'chart', 'neon', 'icons'].indexOf(scene.visual.type) === -1) errors.push(`${where}.visual.type must be plain | image | video | chart | neon | icons`);
    if (scene.visual && scene.visual.type === 'icons' && (!Array.isArray(scene.visual.icons) || scene.visual.icons.length === 0 || scene.visual.icons.some((ic) => !ic || typeof ic.name !== 'string'))) errors.push(`${where}.visual.icons must be [{set?, name, label?}]`);
    if (scene.visual && scene.visual.background && ['solid', 'tonal', 'spotlight', 'grid', 'dots', 'particles', 'rays', 'waves', 'streaks', 'paper'].indexOf(scene.visual.background) === -1) errors.push(`${where}.visual.background is not a known background kind`);
    if (scene.speaker && typeof scene.speaker.name !== 'string') errors.push(`${where}.speaker.name is required`);
    if (scene.visual && (scene.visual.type === 'image' || scene.visual.type === 'video') && !scene.visual.src) errors.push(`${where}.visual.src is required for ${scene.visual.type}`);
    if (scene.visual && scene.visual.type === 'chart') {
      const chart = scene.visual.chart;
      if (!chart || ['bar', 'line', 'donut', 'stat'].indexOf(chart.kind) === -1) errors.push(`${where}.visual.chart.kind must be bar | line | donut | stat`);
      if (!chart || !Array.isArray(chart.data) || chart.data.length === 0 || chart.data.some((d) => !d || typeof d.label !== 'string' || !Number.isFinite(d.value) || (['bar', 'donut'].includes(chart.kind) && d.value < 0) || (chart.kind === 'donut' && chart.data.length === 1 && d.value > 100))) errors.push(`${where}.visual.chart.data must be [{label, value}]`);
    }
  });
  if (script.pacing && ['fast', 'medium', 'calm'].indexOf(script.pacing) === -1) errors.push('pacing must be fast | medium | calm');
  if (script.style && typeof script.style !== 'string') errors.push('style must be a preset id string');
  if (script.background && ['solid', 'tonal', 'spotlight', 'grid', 'dots', 'particles', 'rays', 'waves', 'streaks', 'paper'].indexOf(script.background) === -1) errors.push('background is not a known background kind');
  if (script.seo && typeof script.seo !== 'object') errors.push('seo must be an object');
  if (script.grade && ['none', 'teal-orange', 'warm-film', 'cool-noir', 'vibrant-pop', 'bleach-bypass', 'matte-fade', 'neon-night'].indexOf(script.grade) === -1) errors.push('grade is not one of the known grades');
  if (script.logo && !script.logo.src && !script.logo.text) errors.push('logo needs src or text');
  if (script.voice && ['elevenlabs', 'openai', 'macos'].indexOf(script.voice.provider) === -1) errors.push('voice.provider must be elevenlabs | openai | macos');
  if (errors.length) throw new Error(`Invalid script:\n - ${errors.join('\n - ')}`);
};

export const readManifest = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

export const writeJson = (file, data) => {
  atomicJson(file, data);
};

/** Scene start times in seconds given durations and a constant gap (matches computeSceneTimings in src/lib/script.ts). */
export const sceneStarts = (scenes, gapSeconds, fps = 60) => computeSceneTimings(scenes,fps,gapSeconds).map((t) => t.startFrame/fps);

/** A manifest exists after the first scene; completeness must be checked independently. */
export const voiceManifestComplete = (script, file, provider) => {
  try {
    const manifest = readManifest(file);
    return Boolean(manifest && JSON.stringify(manifest.scriptVoice ?? null) === JSON.stringify(script.voice ?? null) && (!provider || manifest.provider === provider) && script.scenes.length &&
      script.scenes.every((s) => {
        const m = manifest.scenes?.find((x) => x.id === s.id);
        const audio = m && inside(path.dirname(file), m.file);
        return m && m.text === s.voiceover && Number.isFinite(m.durationSeconds) && m.durationSeconds > 0 && audio && fs.existsSync(audio) && fs.statSync(audio).size > 0;
      }));
  } catch { return false; }
};
