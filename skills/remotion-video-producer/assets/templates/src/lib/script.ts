import type {Caption} from '@remotion/captions';
import {staticFile} from 'remotion';
import type {GradeName} from './grades';
import type {Pacing} from './motion';
import type {LogoCorner} from './platforms';
import type {BackgroundKind} from './styles';

export type IconSpec = {readonly set?: 'simple-icons' | 'logos' | 'lucide' | 'tabler' | 'fluent-emoji-flat' | 'custom'; readonly name: string; readonly label?: string; readonly color?: string};

/** Publishing metadata; Claude fills it, make-publish-pack.mjs turns it into per-platform files. */
export type SeoSpec = {
  readonly titles?: readonly string[];
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly hashtags?: readonly string[];
  readonly category?: string;
  readonly cta?: string;
  readonly thumbnailText?: string;
  readonly language?: string;
};

/** Data for an infographic scene. */
export type ChartSpec = {
  readonly kind: 'bar' | 'line' | 'donut' | 'stat';
  readonly title?: string;
  readonly unit?: string;
  readonly data: readonly {readonly label: string; readonly value: number; readonly color?: string}[];
};

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
    readonly type: 'gradient' | 'image' | 'video' | 'chart' | 'neon' | 'icons';
    readonly src?: string;
    readonly focal?: readonly [number, number];
    readonly chart?: ChartSpec;
    readonly icons?: readonly IconSpec[];
    /** Per-scene background system override. */
    readonly background?: BackgroundKind;
  };
  /** Lower third for a talking-head or quoted person. */
  readonly speaker?: {readonly name: string; readonly role?: string};
  /** Minimum on-screen seconds even when the voice line is shorter. */
  readonly minSeconds?: number;
  /** Per-scene delivery hint for TTS (v3 audio tag or instruction). */
  readonly delivery?: string;
};

export type VideoScript = {
  readonly videoId: string;
  readonly title?: string;
  readonly pacing?: Pacing;
  /** Style preset id from src/lib/styles.ts; sets fonts, colors, captions, grade, background. */
  readonly style?: string;
  readonly background?: BackgroundKind;
  readonly grade?: GradeName;
  readonly seo?: SeoSpec;
  readonly logo?: {readonly src?: string; readonly text?: string; readonly corner?: LogoCorner; readonly icon?: IconSpec} | null;
  /** `credit` and `license` go into every description the publish pack writes. */
  readonly music?: {readonly src?: string; readonly mood?: string; readonly level?: number; readonly credit?: string; readonly license?: string} | null;
  readonly voice?: {
    readonly provider: 'elevenlabs' | 'openai' | 'macos';
    readonly voiceId?: string;
    readonly preset?: string;
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
