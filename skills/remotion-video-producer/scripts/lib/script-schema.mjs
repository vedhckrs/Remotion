import fs from 'node:fs';
import path from 'node:path';

/**
 * Script JSON contract shared by the templates (src/lib/script.ts) and the scripts.
 *
 * {
 *   videoId: string,
 *   title?: string,
 *   voice?: { provider: 'elevenlabs' | 'openai' | 'macos', voiceId?, model?, instructions?, settings? },
 *   scenes: [{ id, headline, highlight?, subline?, voiceover, visual?, minSeconds? }]
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
    if (scene.visual && ['gradient', 'image', 'video'].indexOf(scene.visual.type) === -1) errors.push(`${where}.visual.type must be gradient | image | video`);
  });
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
