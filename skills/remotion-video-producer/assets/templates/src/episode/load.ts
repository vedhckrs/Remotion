import {staticFile} from 'remotion';
import {FPS} from './theme';
import type {Beat, BrandLogo, MusicSpec, Production, Scene, SceneVoice, TimedScene, Video, VoiceTiming} from './types';

/** Seconds of picture before the voice starts in every scene, so the headline lands first. */
export const LEAD_SECONDS = 0.25;
const DEFAULT_HOLD = 0.5;
/** Estimated speaking rate when no voice has been generated yet (preview and layout work). */
const ESTIMATE_WPM = 160;

export const packageUrl = (id: string, file: string) => staticFile(`packages/${id}/${file}`);

const getJson = async <T>(url: string, signal?: AbortSignal): Promise<T | null> => {
  const res = await fetch(url, {signal});
  if (!res.ok) return null;
  return (await res.json()) as T;
};

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9%]+/g, '');

/** Seconds (scene-relative, before the lead-in) at which `phrase` is spoken, or null. */
const phraseTime = (phrase: string, scene: Scene, voice: SceneVoice | null, estimateSeconds: number): number | null => {
  const target = words(phrase).map(norm).filter(Boolean);
  if (!target.length) return null;
  if (voice && voice.words.length) {
    const said = voice.words.map((w) => norm(w.text));
    for (let i = 0; i + target.length <= said.length; i++) {
      if (target.every((t, k) => said[i + k] === t)) return voice.words[i].start;
    }
  }
  // No measured timing (or the phrase was re-worded by the voice): place it by its position in the text.
  const all = words(scene.narration).map(norm);
  for (let i = 0; i + target.length <= all.length; i++) {
    if (target.every((t, k) => all[i + k] === t)) return (i / Math.max(1, all.length)) * estimateSeconds;
  }
  return null;
};

export type EpisodeData = {
  readonly video: Video;
  readonly scenes: readonly TimedScene[];
  readonly totalFrames: number;
  readonly music: MusicSpec | null;
  readonly brands: Readonly<Record<string, BrandLogo>>;
  readonly episode: string;
  readonly series: string;
};

export const loadEpisode = async (packageId: string, videoId: string, signal?: AbortSignal): Promise<EpisodeData> => {
  const production = await getJson<Production>(packageUrl(packageId, 'production.json'), signal);
  if (!production) throw new Error(`Missing public/packages/${packageId}/production.json. Import the topic package first.`);
  const video = production.videos.find((v) => v.id === videoId);
  if (!video) throw new Error(`Package ${packageId} has no video "${videoId}" (has: ${production.videos.map((v) => v.id).join(', ')})`);
  const timing = await getJson<VoiceTiming>(packageUrl(packageId, `voice/${videoId}/timing.json`), signal);
  const pkg = await getJson<{music?: Record<string, MusicSpec>}>(packageUrl(packageId, 'package.json'), signal);
  const brands = (await getJson<Record<string, BrandLogo>>(packageUrl(packageId, 'assets/brands.json'), signal)) ?? {};

  let from = 0;
  const scenes: TimedScene[] = video.scenes.map((scene) => {
    const voice = timing?.scenes[scene.id] ?? null;
    const spoken = voice ? voice.end - voice.start : (words(scene.narration).length / ESTIMATE_WPM) * 60;
    const seconds = Math.max(scene.minSeconds ?? 0, LEAD_SECONDS + spoken + (scene.holdAfter ?? DEFAULT_HOLD));
    const frames = Math.max(1, Math.ceil(seconds * FPS));
    const beatFrames = (scene.visual.beats ?? [])
      .map((b: Beat) => {
        const t = typeof b.at === 'number' ? b.at * seconds : phraseTime(b.at, scene, voice, spoken);
        const at = typeof b.at === 'number' ? (t as number) : t === null ? null : LEAD_SECONDS + t;
        return at === null ? null : {...b, frame: Math.min(frames - 1, Math.max(0, Math.round(at * FPS)))};
      })
      .filter((b): b is Beat & {frame: number} => b !== null)
      .sort((a, b) => a.frame - b.frame);
    const timed: TimedScene = {...scene, from, frames, voice, beatFrames};
    from += frames;
    return timed;
  });

  return {
    video,
    scenes,
    totalFrames: Math.max(1, from),
    music: pkg?.music?.[videoId] ?? null,
    brands,
    episode: production.episode,
    series: production.series ?? 'How it’s wired',
  };
};
