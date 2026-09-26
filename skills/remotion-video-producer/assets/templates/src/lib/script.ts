import type {Caption} from '@remotion/captions';
import {staticFile} from 'remotion';

/** One scene of the script. Mirrors scripts/lib/script-schema.mjs. */
export type ScriptScene = {
  readonly id: string;
  readonly headline: string;
  /** Word (or phrase) inside the headline to emphasize. */
  readonly highlight?: string;
  readonly subline?: string;
  readonly voiceover: string;
  /** Visual intent for this scene. */
  readonly visual?: {
    readonly type: 'gradient' | 'image' | 'video';
    readonly src?: string;
    readonly focal?: readonly [number, number];
  };
  /** Minimum on-screen seconds even when the voice line is shorter. */
  readonly minSeconds?: number;
};

export type VideoScript = {
  readonly videoId: string;
  readonly title?: string;
  readonly voice?: {
    readonly provider: 'elevenlabs' | 'openai' | 'macos';
    readonly voiceId?: string;
    readonly model?: string;
    readonly instructions?: string;
    readonly settings?: Record<string, number | boolean>;
  };
  readonly scenes: readonly ScriptScene[];
};

export type ManifestScene = {
  readonly id: string;
  readonly file: string;
  readonly durationSeconds: number;
  readonly text: string;
  /** Word captions relative to the start of this scene's audio, if the provider returned timing. */
  readonly captions?: readonly Caption[];
};

export type VoiceoverManifest = {
  readonly videoId: string;
  readonly provider: string;
  readonly gapSeconds: number;
  readonly scenes: readonly ManifestScene[];
};

/** Per-scene timing resolved by calculateMetadata. All values in frames of the parent composition. */
export type SceneTiming = {
  readonly id: string;
  readonly startFrame: number;
  /** Frames the scene is visible before the next transition begins (voice + gap). */
  readonly baseFrames: number;
  /** durationInFrames to pass to <TransitionSeries.Sequence> (baseFrames + transition overlap, except last). */
  readonly sequenceFrames: number;
  readonly voiceFrames: number;
};

export const scriptUrl = (videoId: string) => staticFile(`script/${videoId}.json`);
export const manifestUrl = (videoId: string) => staticFile(`voiceover/${videoId}/manifest.json`);
export const voiceoverUrl = (videoId: string, file: string) => staticFile(`voiceover/${videoId}/${file}`);

export const fetchJson = async <T,>(url: string, signal?: AbortSignal): Promise<T | null> => {
  const res = await fetch(url, {signal});
  if (!res.ok) return null;
  return (await res.json()) as T;
};

/**
 * Convert manifest durations into frame timings for a TransitionSeries.
 * total = sum(baseFrames); scene i starts at sum(baseFrames[0..i-1]).
 */
export const computeSceneTimings = (
  scenes: readonly {id: string; durationSeconds: number; minSeconds?: number}[],
  fps: number,
  gapSeconds: number,
  transitionFrames: number,
): SceneTiming[] => {
  const timings: SceneTiming[] = [];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    const voiceFrames = Math.ceil(scene.durationSeconds * fps);
    const minFrames = Math.ceil((scene.minSeconds ?? 0) * fps);
    const baseFrames = Math.max(minFrames, voiceFrames + Math.ceil(gapSeconds * fps));
    const isLast = i === scenes.length - 1;
    timings.push({
      id: scene.id,
      startFrame: cursor,
      baseFrames,
      sequenceFrames: baseFrames + (isLast ? 0 : transitionFrames),
      voiceFrames,
    });
    cursor += baseFrames;
  });
  return timings;
};

export const totalFrames = (timings: readonly SceneTiming[]) => timings.reduce((sum, t) => sum + t.baseFrames, 0);

/** Shift per-scene captions onto the composition timeline. */
export const absoluteCaptions = (manifest: VoiceoverManifest, timings: readonly SceneTiming[], fps: number): Caption[] => {
  const out: Caption[] = [];
  manifest.scenes.forEach((scene, i) => {
    const timing = timings[i];
    if (!scene.captions || !timing) return;
    const offsetMs = (timing.startFrame / fps) * 1000;
    scene.captions.forEach((c) => {
      out.push({
        ...c,
        startMs: c.startMs + offsetMs,
        endMs: c.endMs + offsetMs,
        timestampMs: c.timestampMs === null ? null : c.timestampMs + offsetMs,
      });
    });
  });
  return out;
};
