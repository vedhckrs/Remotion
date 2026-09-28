import type React from 'react';
import {Easing, interpolate, spring} from 'remotion';

/**
 * Motion vocabulary. Reach for these by name so the whole video shares one feel.
 * For hero elements you want to keyframe in Studio, write the interpolate() call
 * inline in the style prop instead (see references/remotion-api.md section 7).
 *
 * Frame counts in this codebase are authored at 30 fps and scaled with fr() so the
 * same motion reads identically at 60 fps masters.
 */
export const EASE = {
  /** Default entrance: fast start, soft landing (expo-out). */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /**
   * Fluid family (researched: Material 3 emphasized tokens, Apple's `.smooth` spring). Use these
   * for anything that should feel like liquid rather than a UI click: no overshoot, long tail.
   */
  /** Material 3 "emphasized decelerate": enters fast, settles for a long time. Text, icons, cards. */
  emphasizedOut: Easing.bezier(0.05, 0.7, 0.1, 1),
  /** Material 3 "emphasized accelerate": exits leave quietly then fast. */
  emphasizedIn: Easing.bezier(0.3, 0, 0.8, 0.15),
  /** Material 3 "standard": both ends soft; position changes, camera, transitions. */
  smooth: Easing.bezier(0.2, 0, 0, 1),
  /** Quint-out: a touch softer than expo for big elements. */
  quintOut: Easing.bezier(0.22, 1, 0.36, 1),
  /** Exits: slow start, fast leave. */
  in: Easing.bezier(0.7, 0, 0.84, 0),
  /** Camera moves and mid-scene position changes. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Snappy UI and counters. */
  snap: Easing.bezier(0.2, 0.9, 0.2, 1),
  /** Hard impact: almost instant, tiny settle. Fast-paced cuts. */
  punch: Easing.bezier(0.05, 0.9, 0.1, 1),
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
  /** Fast-paced content: arrives in ~6 frames at 30 fps with a hint of overshoot. */
  punch: {damping: 16, stiffness: 260, mass: 0.7},
  /** Critically damped (zeta ~ 1.0, like SwiftUI .smooth): reaches the target as fast as possible with zero overshoot. Default for text and icons. */
  fluid: {damping: 26, stiffness: 170, mass: 1},
  /** Slightly under-damped (zeta ~ 0.8, like SwiftUI .snappy): alive but not bouncy. Buttons, badges, counters. */
  snappy: {damping: 22, stiffness: 240, mass: 0.8},
  /** Over-damped and heavy (zeta ~ 1.4): slow, expensive settle for hero images and panels. */
  silk: {damping: 34, stiffness: 120, mass: 1.2},
} as const;

export type Pacing = 'fast' | 'medium' | 'calm';

/** Per-pacing timing tokens (seconds and 30 fps frames). */
export const PACING: Record<Pacing, {gapSeconds: number; stagger: number; entrance: number; exit: number; transitionFrames: number; wpm: number; cameraPush: number}> = {
  fast: {gapSeconds: 0.35, stagger: 2, entrance: 8, exit: 6, transitionFrames: 8, wpm: 185, cameraPush: 1.08},
  medium: {gapSeconds: 0.6, stagger: 3, entrance: 12, exit: 8, transitionFrames: 12, wpm: 165, cameraPush: 1.05},
  calm: {gapSeconds: 0.9, stagger: 4, entrance: 16, exit: 10, transitionFrames: 16, wpm: 145, cameraPush: 1.03},
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Scale a frame count authored at 30 fps to the composition fps (at least 1 frame). */
export const fr = (framesAt30: number, fps: number) => Math.max(1, Math.round((framesAt30 * fps) / 30));

/** 0 -> 1 progress over `durationInFrames` starting at `delay`, ease-out. */
export const easeIn01 = (frame: number, delay: number, durationInFrames: number) =>
  interpolate(frame, [delay, delay + durationInFrames], [0, 1], {...clamp, easing: EASE.out});

/** 1 -> 0 progress ending at `endFrame` over `durationInFrames`, ease-in. Use for exits. */
export const easeOut10 = (frame: number, endFrame: number, durationInFrames: number) =>
  interpolate(frame, [endFrame - durationInFrames, endFrame], [1, 0], {...clamp, easing: EASE.in});

/** Spring entrance for the i-th sibling, staggered by `stagger` frames (authored at 30 fps). */
export const enterSpring = (
  frame: number,
  fps: number,
  index: number,
  options: {stagger?: number; delay?: number; config?: {damping?: number; stiffness?: number; mass?: number}} = {},
) =>
  spring({
    frame,
    fps,
    delay: fr((options.delay ?? 0) + index * (options.stagger ?? 3), fps),
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

/** Slow camera push from `from` to `to` scale across the scene (standard curve: no visible start or stop). */
export const cameraPush = (frame: number, durationInFrames: number, from = 1, to = 1.06) =>
  interpolate(frame, [0, durationInFrames], [from, to], {...clamp, easing: EASE.smooth});

// ---- Fluid motion helpers -------------------------------------------------------------------------

/**
 * Eased 0..1 progress for a fluid entrance: starts at `delay`, lasts `duration` (both in frames
 * authored at 30 fps), emphasized-decelerate curve. Pair with `fluidStyle()`.
 */
export const fluid = (frame: number, fps: number, options: {delay?: number; duration?: number; easing?: (t: number) => number} = {}) => {
  const delay = options.delay ?? 0;
  const start = delay <= 0 ? 0 : fr(delay, fps);
  const end = Math.max(start + 1, fr(delay + (options.duration ?? 18), fps)); // stills (fps 1) collapse to one frame
  return interpolate(frame, [start, end], [0, 1], {...clamp, easing: options.easing ?? EASE.emphasizedOut});
};

/**
 * Style for a fluid entrance from progress `p`: fades in, rises `distance` px, sharpens from a
 * soft blur, and settles from a slight under-scale. Everything eases together so the element
 * feels like it condenses into place instead of snapping. `blur` costs a filter pass; set 0 on
 * hundreds of siblings.
 */
export const fluidStyle = (p: number, options: {distance?: number; blur?: number; scaleFrom?: number; axis?: 'x' | 'y'} = {}): React.CSSProperties => {
  const distance = options.distance ?? 24;
  const blur = (options.blur ?? 8) * (1 - p);
  const scaleFrom = options.scaleFrom ?? 0.96;
  const offset = (1 - p) * distance;
  return {
    opacity: interpolate(p, [0, 0.6], [0, 1], clamp),
    translate: options.axis === 'x' ? `${offset}px 0px` : `0px ${offset}px`,
    scale: String(scaleFrom + (1 - scaleFrom) * p),
    filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
  };
};

/** Fluid exit: 1 -> 0 finishing at `endFrame`, emphasized-accelerate curve. Multiply into opacity / distance. */
export const fluidOut = (frame: number, fps: number, endFrame: number, duration = 10) =>
  interpolate(frame, [Math.min(endFrame - 1, endFrame - fr(duration, fps)), endFrame], [1, 0], {...clamp, easing: EASE.emphasizedIn});

/**
 * Natural stagger: instead of a fixed gap, delays follow an ease-out distribution so the first
 * items arrive quickly and the tail compresses (how water and crowds move). Returns the delay of
 * item `index` in frames at 30 fps, spanning `total` frames across `count` items.
 */
export const staggerDelay = (index: number, count: number, total: number) => {
  if (count <= 1) return 0;
  const t = index / (count - 1);
  return total * (1 - (1 - t) ** 2.2);
};

/** Continuous, deterministic breathing (0.97..1.03 by default) for held elements so they never freeze. */
export const breathe = (frame: number, fps: number, amount = 0.03, period = 90, phase = 0) => 1 + Math.sin(((frame + phase) / fr(period, fps)) * Math.PI * 2) * amount;

/** Gentle idle float in px. Deterministic; phase offsets siblings. `period` in frames at 30 fps. */
export const idleFloat = (frame: number, amplitude = 4, period = 40, phase = 0, fps = 30) =>
  Math.sin(((frame + phase) / fr(period, fps)) * Math.PI * 2) * amplitude;

/** Quick hit: 1 at `at`, decays to 0 over `length` frames. Drive scale bumps and flashes on beats. */
export const impulse = (frame: number, at: number, length: number) =>
  interpolate(frame, [at, at + length], [1, 0], {...clamp, easing: EASE.out});

export const secondsToFrames = (seconds: number, fps: number) => Math.round(seconds * fps);

/** Reading time in seconds for on-screen copy. */
export const readingSeconds = (text: string, wpm = 165) => 0.6 + (text.trim().split(/\s+/).length * 60) / wpm;
