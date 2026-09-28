/**
 * Topic package types (schema "wiresplained.production/1"). A package is prepared once, stored in the
 * episode folder and copied to public/packages/<id>/ for rendering. Nothing here calls a service.
 * The validator in scripts/validate-package.mjs mirrors these types.
 */

export type Ratio = '16:9' | '9:16';

/** A reveal keyed to the narration: `at` is a phrase from the scene's narration (synced to the measured
 * voice) or a 0..1 fraction of the scene. The kind decides what `show`, `focus` and `set` mean. */
export type Beat = {
  readonly at: string | number;
  readonly show?: readonly string[];
  readonly hide?: readonly string[];
  readonly focus?: readonly string[];
  readonly set?: Readonly<Record<string, unknown>>;
};

export type VisualSpec = {
  readonly kind: string;
  readonly beats?: readonly Beat[];
  readonly [param: string]: unknown;
};

export type Scene = {
  readonly id: string;
  readonly title?: string;
  /** On-screen headline; "\n" forces a line break. Short: 2 to 6 words per line. */
  readonly headline: string;
  /** Word or phrase of the headline drawn in the accent colour. */
  readonly highlight?: string;
  /** One short supporting line under the headline. */
  readonly subhead?: string;
  readonly narration: string;
  /** Delivery note for the voice (not spoken). */
  readonly delivery?: string;
  /** Seconds of picture after the voice ends (default 0.5). */
  readonly holdAfter?: number;
  /** Seconds the scene lasts at least, voice or not. */
  readonly minSeconds?: number;
  readonly visual: VisualSpec;
  /** Source ids from research/sources.json backing this scene's claims. */
  readonly sources?: readonly string[];
  /** Small corner citation shown on screen (defaults to the first source's short name when numbers are shown). */
  readonly sourceNote?: string;
};

export type Video = {
  readonly id: string;
  readonly ratio: Ratio;
  readonly title: string;
  /** Target voice length in seconds [min, max]; the validator checks the estimate and the measured length. */
  readonly targetSeconds: readonly [number, number];
  readonly scenes: readonly Scene[];
};

export type Production = {
  readonly schema: 'wiresplained.production/1';
  readonly episode: string;
  readonly series?: string;
  readonly videos: readonly Video[];
};

/** Measured voice timing written by scripts/package-voice.mjs (voice/<video>/timing.json). */
export type SceneVoice = {
  readonly file: string;
  /** Seconds into `file` where this scene's speech starts and ends. */
  readonly start: number;
  readonly end: number;
  /** Word timings relative to the scene start (seconds). */
  readonly words: readonly {readonly text: string; readonly start: number; readonly end: number}[];
};
export type VoiceTiming = {
  readonly provider: string;
  readonly voiceId?: string;
  readonly scenes: Readonly<Record<string, SceneVoice>>;
};

export type MusicSpec = {readonly file: string; readonly level: number};

export type BrandLogo = {readonly title: string; readonly hex: string; readonly path: string};

/** A scene with frames resolved from measured (or estimated) timing. */
export type TimedScene = Scene & {
  readonly from: number;
  readonly frames: number;
  readonly voice: SceneVoice | null;
  /** Beats resolved to frames within the scene, sorted. */
  readonly beatFrames: readonly (Beat & {readonly frame: number})[];
};
