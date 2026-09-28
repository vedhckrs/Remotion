/**
 * Color math for legibility: every text, icon and accent decision in the templates goes through
 * these helpers so nothing is ever placed on a background it cannot be read on.
 *
 * Rules applied (see references/visual-design.md, "Color theory for video"):
 *  - Text on background: WCAG contrast >= 4.5:1 (body) and >= 3:1 for display type over 60 px,
 *    checked with `contrast()`; `readableOn()` picks white or near-black automatically.
 *  - Icons, bars, pills, strokes: >= 3:1 against what they sit on (`ensureContrast(fg, bg, 3)`).
 *  - One dominant field (the background hue), one accent, tonal steps of the same hue for depth.
 *    Depth comes from `tone()` (lightness steps of the background), never from a second hue.
 * All functions are pure and deterministic.
 */
export type RGBA = readonly [number, number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hex2 = (v: number) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0');

/** Parse #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). Unknown strings parse as opaque black. */
export const parseColor = (input: string): RGBA => {
  const s = input.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split('').map((c) => parseInt(c + c, 16));
      return [r, g, b, h.length === 4 ? a / 255 : 1];
    }
    if (h.length === 6 || h.length === 8) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  return [0, 0, 0, 1];
};

export const toHex = (c: RGBA) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;

/** rgba() string with a new alpha. */
export const alpha = (color: string, a: number) => {
  const [r, g, b] = parseColor(color);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp01(a)})`;
};

/** Composite a translucent color over an opaque one (for contrast checks of rgba fills). */
export const over = (fg: string, bg: string) => {
  const f = parseColor(fg);
  const b = parseColor(bg);
  const a = f[3];
  return toHex([f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]);
};

/** WCAG 2 relative luminance (0 black .. 1 white). */
export const luminance = (color: string) => {
  const [r, g, b] = parseColor(color);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** WCAG 2 contrast ratio, 1 .. 21. */
export const contrast = (a: string, b: string) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** True when white text reads better on this color than near-black text does. */
export const isDark = (color: string) => contrast(color, '#FFFFFF') >= contrast(color, '#111111');

/** White or near-black (or the two poles you pass), whichever contrasts more with `bg`. */
export const readableOn = (bg: string, light = '#FFFFFF', dark = '#111111') => (contrast(bg, light) >= contrast(bg, dark) ? light : dark);

/** Linear mix of two colors, t = 0 -> a, 1 -> b. */
export const mix = (a: string, b: string, t: number) => {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const k = clamp01(t);
  return toHex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k, 1]);
};

/**
 * Tonal step of the same hue: positive lightens toward white, negative darkens toward black,
 * `amount` in percent (6 = a visible but quiet surface step, 12 = a card, 25 = a highlight).
 * This is how the templates build depth without introducing a second hue.
 */
export const tone = (color: string, amount: number) => mix(color, amount >= 0 ? '#FFFFFF' : '#000000', Math.abs(amount) / 100);

/** Tonal step away from the background's own pole: lighter on dark backgrounds, darker on light ones. */
export const lift = (bg: string, amount: number) => tone(bg, isDark(bg) ? amount : -amount);

/**
 * Push `fg` toward the readable pole of `bg` until it reaches `min` contrast (default 4.5).
 * Keeps the hue; only lightness changes. Use for accents and highlight words that must stay
 * legible on any preset background, and for brand colors on tiles.
 */
export const ensureContrast = (fg: string, bg: string, min = 4.5) => {
  if (contrast(fg, bg) >= min) return toHex(parseColor(fg));
  const pole = readableOn(bg, '#FFFFFF', '#000000');
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(mix(fg, pole, mid), bg) >= min) hi = mid;
    else lo = mid;
  }
  return mix(fg, pole, hi);
};

/** Pick the better of two candidates for a surface: whichever contrasts more with `bg`. */
export const pickReadable = (bg: string, candidates: readonly string[]) => candidates.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best), candidates[0]);

/** Text shadow that helps on this background without muddying it: dark glow on dark, faint drop on light. */
export const textShadowFor = (bg: string) => (isDark(bg) ? '0 2px 12px rgba(0,0,0,0.5)' : '0 1px 2px rgba(0,0,0,0.12)');

/** Scrim gradient for copy over photos/footage: darkens on dark themes, lightens on light themes. */
export const scrimFor = (bg: string, strength = 0.6) => {
  const pole = isDark(bg) ? '0,0,0' : '255,255,255';
  return `linear-gradient(180deg, rgba(${pole},${strength * 0.6}) 0%, rgba(${pole},0) 40%, rgba(${pole},${strength}) 100%)`;
};
