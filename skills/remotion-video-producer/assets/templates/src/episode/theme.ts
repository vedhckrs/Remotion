/**
 * One visual identity for every episode: ink field, Spark Yellow as the channel accent, a small set of
 * signal colours for diagrams (data, return, alternative, success, problem). Change the channel look here.
 */
export const C = {
  bg: '#0B0F1A',
  bgTop: '#161C33',
  panel: '#141B2D',
  panelHi: '#1C2540',
  line: '#2C3654',
  text: '#F5F7FB',
  muted: '#A9B3C9',
  dim: '#6B7591',
  accent: '#FFD23F',
  cyan: '#4FD8EB',
  violet: '#A98BFF',
  pink: '#FF7AB6',
  green: '#6EE7B7',
  red: '#FF6B7A',
  amber: '#FFB547',
} as const;

export type Tone = 'accent' | 'cyan' | 'violet' | 'pink' | 'green' | 'red' | 'amber' | 'muted' | 'text';
export const tone = (t: string | undefined, fallback: Tone = 'cyan'): string => {
  const key = (t ?? fallback) as keyof typeof C;
  return (C as Record<string, string>)[key] ?? (t && t.startsWith('#') ? t : C[fallback]);
};

export const FONT = {
  display: '"Space Grotesk", Inter, Arial, sans-serif',
  body: 'Inter, Arial, sans-serif',
};

export const FPS = 60;

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
/** Cubic ease-out, 0..1. */
export const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
/** Emphasised decelerate for entrances. */
export const easeOutQuint = (v: number) => 1 - Math.pow(1 - clamp(v), 5);
export const frac = (v: number) => v - Math.floor(v);

/** Frame layout for both native ratios (px, composition space before any 4K scale). */
export const LAYOUT = {
  land: {
    w: 1920, h: 1080,
    eyebrow: {x: 112, y: 58},
    headline: {x: 112, y: 96, w: 1560, size: 84, maxLines: 2},
    subhead: {size: 30},
    diagram: {x: 112, y: 318, w: 1696, h: 560},
    captions: {y: 912, w: 1320, size: 38},
    source: {right: 64, bottom: 30, size: 19},
  },
  port: {
    w: 1080, h: 1920,
    eyebrow: {x: 80, y: 168},
    headline: {x: 80, y: 206, w: 900, size: 82, maxLines: 3},
    subhead: {size: 34},
    // Kept clear of the Shorts right-hand rail (x > 972 from ~45% height) and the bottom caption/title UI.
    diagram: {x: 72, y: 540, w: 900, h: 720},
    captions: {y: 1300, w: 900, size: 58},
    source: {right: 112, bottom: 420, size: 22},
  },
} as const;
export type Layout = (typeof LAYOUT)['land'] | (typeof LAYOUT)['port'];
