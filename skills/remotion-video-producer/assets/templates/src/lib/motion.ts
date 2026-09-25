import {Easing, interpolate, spring} from 'remotion';

/**
 * Motion vocabulary. Reach for these by name so the whole video shares one feel.
 * For hero elements you want to keyframe in Studio, write the interpolate() call
 * inline in the style prop instead (see references/remotion-api.md section 7).
 */
export const EASE = {
  /** Default entrance: fast start, soft landing. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** Exits: slow start, fast leave. */
  in: Easing.bezier(0.7, 0, 0.84, 0),
  /** Camera moves and mid-scene position changes. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Snappy UI and counters. */
  snap: Easing.bezier(0.2, 0.9, 0.2, 1),
  /** Critically damped spring; a push with no bounce. */
  push: Easing.spring({damping: 200}),
};

export const SPRING = {
  /** No overshoot. Safe on anything. */
  settle: {damping: 200},
  /** Slight overshoot for titles and cards. */
  soft: {damping: 18, stiffness: 120, mass: 0.9},
  /** Playful pop for stickers, emoji, badges. */
  bouncy: {damping: 12, stiffness: 140, mass: 0.8},
  /** Heavy panels and hero images. */
  heavy: {damping: 20, stiffness: 90, mass: 1.2},
} as const;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0 -> 1 progress over `durationInFrames` starting at `delay`, ease-out. */
export const easeIn01 = (frame: number, delay: number, durationInFrames: number) =>
  interpolate(frame, [delay, delay + durationInFrames], [0, 1], {...clamp, easing: EASE.out});

/** 1 -> 0 progress ending at `endFrame` over `durationInFrames`, ease-in. Use for exits. */
export const easeOut10 = (frame: number, endFrame: number, durationInFrames: number) =>
  interpolate(frame, [endFrame - durationInFrames, endFrame], [1, 0], {...clamp, easing: EASE.in});

/** Spring entrance for the i-th sibling, staggered by `stagger` frames. */
export const enterSpring = (
  frame: number,
  fps: number,
  index: number,
  options: {stagger?: number; delay?: number; config?: {damping?: number; stiffness?: number; mass?: number}} = {},
) =>
  spring({
    frame,
    fps,
    delay: (options.delay ?? 0) + index * (options.stagger ?? 3),
    config: options.config ?? SPRING.settle,
  });

/**
 * Combined fade-in / hold / fade-out envelope for a layer that lives `durationInFrames` long.
 * Returns 0..1. Use for opacity or as a multiplier on translate.
 */
export const envelope = (frame: number, durationInFrames: number, fadeIn = 10, fadeOut = 8) =>
  interpolate(frame, [0, fadeIn, Math.max(fadeIn + 1, durationInFrames - fadeOut), durationInFrames], [0, 1, 1, 0], {
    ...clamp,
    easing: [EASE.out, Easing.linear, EASE.in],
  });

/** Slow camera push from `from` to `to` scale across the scene. */
export const cameraPush = (frame: number, durationInFrames: number, from = 1, to = 1.06) =>
  interpolate(frame, [0, durationInFrames], [from, to], {...clamp, easing: EASE.inOut});

/** Gentle idle float in px. Deterministic; phase offsets siblings. */
export const idleFloat = (frame: number, amplitude = 4, period = 40, phase = 0) =>
  Math.sin((frame + phase) / period * Math.PI * 2) * amplitude;

export const secondsToFrames = (seconds: number, fps: number) => Math.round(seconds * fps);

/** Reading time in seconds for on-screen copy. */
export const readingSeconds = (text: string) => 0.6 + text.trim().split(/\s+/).length * 0.25;
