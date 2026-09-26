import fs from 'node:fs';
import path from 'node:path';

/**
 * Script JSON contract shared by the templates (src/lib/script.ts) and the scripts.
 *
 * {
 *   videoId: string,
 *   title?: string,
 *   pacing?: 'fast' | 'medium' | 'calm',
 *   grade?: 'none' | 'teal-orange' | 'warm-film' | 'cool-noir' | 'vibrant-pop' | 'bleach-bypass' | 'matte-fade' | 'neon-night',
 *   logo?: { src?, text?, corner? } | null,
 *   music?: { src?, mood?, level? } | null,
 *   voice?: { provider: 'elevenlabs' | 'openai' | 'macos', voiceId?, preset?, model?, instructions?, settings? },
 *   scenes: [{ id, headline, highlight?, subline?, voiceover, delivery?, minSeconds?,
 *              visual?: { type: 'gradient' | 'image' | 'video' | 'chart' | 'neon', src?, focal?, chart?: { kind, title?, unit?, data: [{label, value}] } } }]
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
  if (!script || typeof script !== 'object') errors.push('script must be an object');
  if (!script.videoId || !/^[a-zA-Z0-9_-]+$/.test(script.videoId)) errors.push('videoId is required (letters, numbers, - and _)');
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) errors.push('scenes must be a non-empty array');
  const ids = new Set();
  (script.scenes || []).forEach((scene, i) => {
    const where = `scenes[${i}]`;
    if (!scene.id || !/^[a-zA-Z0-9_-]+$/.test(scene.id)) errors.push(`${where}.id is required (letters, numbers, - and _)`);
    if (ids.has(scene.id)) errors.push(`${where}.id "${scene.id}" is duplicated`);
    ids.add(scene.id);
    if (typeof scene.headline !== 'string') errors.push(`${where}.headline is required`);
    if (typeof scene.voiceover !== 'string' || !scene.voiceover.trim()) errors.push(`${where}.voiceover is required`);
    if (scene.visual && ['gradient', 'image', 'video', 'chart', 'neon'].indexOf(scene.visual.type) === -1) errors.push(`${where}.visual.type must be gradient | image | video | chart | neon`);
    if (scene.visual && (scene.visual.type === 'image' || scene.visual.type === 'video') && !scene.visual.src) errors.push(`${where}.visual.src is required for ${scene.visual.type}`);
    if (scene.visual && scene.visual.type === 'chart') {
      const chart = scene.visual.chart;
      if (!chart || ['bar', 'line', 'donut', 'stat'].indexOf(chart.kind) === -1) errors.push(`${where}.visual.chart.kind must be bar | line | donut | stat`);
      if (!chart || !Array.isArray(chart.data) || chart.data.length === 0 || chart.data.some((d) => typeof d.label !== 'string' || typeof d.value !== 'number')) errors.push(`${where}.visual.chart.data must be [{label, value}]`);
    }
  });
  if (script.pacing && ['fast', 'medium', 'calm'].indexOf(script.pacing) === -1) errors.push('pacing must be fast | medium | calm');
  if (script.grade && ['none', 'teal-orange', 'warm-film', 'cool-noir', 'vibrant-pop', 'bleach-bypass', 'matte-fade', 'neon-night'].indexOf(script.grade) === -1) errors.push('grade is not one of the known grades');
  if (script.logo && !script.logo.src && !script.logo.text) errors.push('logo needs src or text');
  if (script.voice && ['elevenlabs', 'openai', 'macos'].indexOf(script.voice.provider) === -1) errors.push('voice.provider must be elevenlabs | openai | macos');
  if (errors.length) throw new Error(`Invalid script:\n - ${errors.join('\n - ')}`);
};

export const readManifest = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

export const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

/** Scene start times in seconds given durations and a constant gap (matches computeSceneTimings in src/lib/script.ts). */
export const sceneStarts = (scenes, gapSeconds, fps = 30) => {
  let cursorFrames = 0;
  return scenes.map((scene) => {
    const start = cursorFrames / fps;
    const voiceFrames = Math.ceil(scene.durationSeconds * fps);
    const minFrames = Math.ceil((scene.minSeconds ?? 0) * fps);
    cursorFrames += Math.max(minFrames, voiceFrames + Math.ceil(gapSeconds * fps));
    return start;
  });
};
