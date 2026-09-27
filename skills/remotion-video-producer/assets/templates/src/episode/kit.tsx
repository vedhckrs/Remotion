import React, {createContext, useContext} from 'react';
import {icons as lucide} from 'lucide-react';
import {measureText} from '@remotion/layout-utils';
import {C, FONT, clamp, ease, frac, tone} from './theme';
import type {Beat, BrandLogo} from './types';

/** Scene-wide context for diagram components: frame, scene length, ratio and the package's brand logos. */
export type DiagramCtx = {
  readonly frame: number;
  readonly frames: number;
  readonly vertical: boolean;
  readonly w: number;
  readonly h: number;
  readonly brands: Readonly<Record<string, BrandLogo>>;
  readonly beats: readonly (Beat & {readonly frame: number})[];
};
export const Ctx = createContext<DiagramCtx>({frame: 0, frames: 1, vertical: false, w: 1600, h: 560, brands: {}, beats: []});
export const useDiagram = () => useContext(Ctx);

// ---------------------------------------------------------------------------------------------------------
// Beats: which elements are visible, which are in focus, which parameters changed, and since when.

export type BeatState = {
  /** Frames since the element became visible, or -1 when hidden. */
  readonly since: (id: string, index?: number) => number;
  readonly visible: (id: string, index?: number) => boolean;
  readonly focused: (id: string) => boolean;
  readonly anyFocus: boolean;
  /** Current value of a parameter changed by `set`, with the frame it last changed. */
  readonly param: <T>(key: string, fallback: T) => {readonly value: T; readonly previous: T; readonly changedAt: number};
};

/**
 * Elements named in a beat's `show` appear at that beat; everything else enters at the start, staggered by
 * its index so a scene never pops in all at once.
 */
export const useBeats = (stagger = 6): BeatState => {
  const {frame, beats} = useDiagram();
  const scheduled = new Map<string, number>();
  const hiddenAt = new Map<string, number>();
  for (const b of beats) {
    for (const id of b.show ?? []) if (!scheduled.has(id)) scheduled.set(id, b.frame);
    for (const id of b.hide ?? []) hiddenAt.set(id, b.frame);
  }
  const shownAt = (id: string, index: number) => scheduled.get(id) ?? 4 + index * stagger;
  const past = beats.filter((b) => b.frame <= frame);
  const lastFocus = [...past].reverse().find((b) => b.focus);
  const focus = new Set(lastFocus?.focus ?? []);
  return {
    since: (id, index = 0) => {
      const at = shownAt(id, index);
      const hid = hiddenAt.get(id);
      if (frame < at || (hid !== undefined && hid > at && frame >= hid)) return -1;
      return frame - at;
    },
    visible: (id, index = 0) => {
      const at = shownAt(id, index);
      const hid = hiddenAt.get(id);
      return frame >= at && !(hid !== undefined && hid > at && frame >= hid);
    },
    focused: (id) => focus.has(id),
    anyFocus: focus.size > 0,
    param: <T,>(key: string, fallback: T) => {
      let value = fallback;
      let previous = fallback;
      let changedAt = -1;
      for (const b of past) {
        if (b.set && key in b.set) {
          previous = value;
          value = b.set[key] as T;
          changedAt = b.frame;
        }
      }
      return {value, previous, changedAt};
    },
  };
};

/** 0..1 entrance progress for an element visible for `since` frames. */
export const enter = (since: number, frames = 22) => (since < 0 ? 0 : ease(since / frames));

// ---------------------------------------------------------------------------------------------------------
// Text

const measureCache = new Map<string, number>();
export const textWidth = (text: string, size: number, weight = 600, family = FONT.body) => {
  const key = `${family}|${weight}|${size}|${text}`;
  let w = measureCache.get(key);
  if (w === undefined) {
    w = measureText({text, fontFamily: family, fontSize: size, fontWeight: String(weight)}).width;
    measureCache.set(key, w);
  }
  return w;
};
/** Largest size <= `size` at which `text` fits in `maxWidth` (never below 55 percent of `size`). */
export const fitSize = (text: string, size: number, maxWidth: number, weight = 600, family = FONT.body) => {
  const w = textWidth(text, size, weight, family);
  return w <= maxWidth ? size : Math.max(size * 0.55, (size * maxWidth) / w);
};

export const Label: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly children: string;
  readonly size?: number;
  readonly color?: string;
  readonly anchor?: 'start' | 'middle' | 'end';
  readonly weight?: number;
  readonly maxWidth?: number;
  readonly opacity?: number;
  readonly family?: string;
  readonly spacing?: number;
  /** Dark outline behind the glyphs so a wire passing under a label never cuts through the text. */
  readonly halo?: boolean;
}> = ({x, y, children, size = 30, color = C.text, anchor = 'middle', weight = 600, maxWidth, opacity = 1, family = FONT.body, spacing, halo = true}) => {
  const s = maxWidth ? fitSize(children, size, maxWidth, weight, family) : size;
  return (
    <text x={x} y={y} fill={color} textAnchor={anchor} fontSize={s} fontWeight={weight} fontFamily={family} opacity={opacity} letterSpacing={spacing} stroke={halo ? C.bg : undefined} strokeWidth={halo ? s * 0.22 : undefined} strokeLinejoin="round" paintOrder="stroke">
      {children}
    </text>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Icons and brand marks. "brand:youtube" uses the package's Simple Icons data; anything else is a Lucide icon
// ("wifi", "lucide:radio-tower").

// Older Lucide names that were renamed, so packages written against either still resolve.
const ALIAS: Record<string, string> = {'circle-help': 'circle-question-mark', 'help-circle': 'circle-question-mark', 'alert-triangle': 'triangle-alert', 'check-circle': 'circle-check', 'x-circle': 'circle-x', 'bar-chart': 'chart-bar'};
const pascal = (name: string) => {
  const bare = name.replace(/^lucide:/, '');
  return (ALIAS[bare] ?? bare).split(/[-_ ]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
};

export const Glyph: React.FC<{readonly name: string; readonly x: number; readonly y: number; readonly size: number; readonly color?: string; readonly strokeWidth?: number}> = ({name, x, y, size, color = C.text, strokeWidth = 1.9}) => {
  const {brands} = useDiagram();
  if (name.startsWith('brand:')) {
    const slug = name.slice(6);
    const b = brands[slug];
    if (!b) return <Label x={x + size / 2} y={y + size * 0.6} size={size * 0.28}>{slug}</Label>;
    return (
      <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24" aria-label={b.title}>
        <path d={b.path} fill={`#${b.hex}`} />
      </svg>
    );
  }
  const I = (lucide as Record<string, React.ComponentType<Record<string, unknown>>>)[pascal(name)] ?? lucide.CircleQuestionMark;
  return <I x={x} y={y} width={size} height={size} color={color} strokeWidth={strokeWidth} absoluteStrokeWidth={false} />;
};

/** Icon tile: rounded panel, coloured stroke and soft glow; `focus` adds a pulsing ring, `dim` fades it back. */
export const Node: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly icon: string;
  readonly label?: string;
  readonly sub?: string;
  readonly color?: string;
  readonly size?: number;
  readonly progress?: number;
  readonly dim?: boolean;
  readonly focus?: boolean;
  readonly labelWidth?: number;
  readonly labelSize?: number;
}> = ({x, y, icon, label, sub, color: colorName, size = 120, progress = 1, dim = false, focus = false, labelWidth, labelSize}) => {
  const {frame} = useDiagram();
  const color = tone(colorName);
  const r = size / 2;
  const p = clamp(progress);
  const isBrand = icon.startsWith('brand:');
  const pulse = focus ? 0.5 + 0.5 * Math.sin(frame / 9) : 0;
  const ls = labelSize ?? Math.max(24, size * 0.26);
  return (
    <g opacity={p * (dim ? 0.35 : 1)} transform={`translate(${x} ${y + (1 - p) * 18}) scale(${0.88 + 0.12 * p})`}>
      <circle r={r + 16} fill={color} opacity={0.07 + pulse * 0.08} />
      {focus ? <rect x={-r - 9} y={-r - 9} width={size + 18} height={size + 18} rx={size * 0.3} fill="none" stroke={color} strokeWidth={3} opacity={0.4 + pulse * 0.5} /> : null}
      <rect x={-r} y={-r} width={size} height={size} rx={size * 0.26} fill={C.panel} stroke={color} strokeWidth={2.5} />
      <Glyph name={icon} x={-size * 0.3} y={-size * 0.3} size={size * 0.6} color={isBrand ? undefined : color} />
      {label ? <Label x={0} y={r + ls * 1.45} size={ls} maxWidth={labelWidth ?? size * 2.2}>{label}</Label> : null}
      {sub ? <Label x={0} y={r + ls * 1.45 + ls * 1.15} size={ls * 0.78} color={C.muted} weight={500} maxWidth={labelWidth ?? size * 2.2}>{sub}</Label> : null}
    </g>
  );
};

export type Pt = readonly [number, number];

const pathLength = (pts: readonly Pt[]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
export const pointAt = (pts: readonly Pt[], t: number): Pt => {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = clamp(t) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? d / lens[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
    }
    d -= lens[i];
  }
  return pts[0];
};

/**
 * A wire between points. Draws on with `progress`, then moves `packets` along it (forward, back or both).
 * Packet speed is in pixels per second so short and long wires move at the same pace.
 */
export const Route: React.FC<{
  readonly points: readonly Pt[];
  readonly color?: string;
  readonly progress?: number;
  readonly packets?: number;
  readonly dir?: 'forward' | 'back' | 'both';
  readonly dashed?: boolean;
  readonly dim?: boolean;
  readonly speed?: number;
  readonly label?: string;
  readonly width?: number;
}> = ({points, color: colorName, progress = 1, packets = 3, dir = 'forward', dashed = false, dim = false, speed = 260, label, width = 3}) => {
  const {frame} = useDiagram();
  const color = tone(colorName);
  const len = pathLength(points);
  const p = clamp(progress);
  const d = points.map((pt) => pt.join(',')).join(' ');
  const cycle = Math.max(0.8, len / speed) * 60; // frames per trip
  const dots: React.ReactNode[] = [];
  if (p >= 1 && packets > 0 && !dim) {
    const lanes = dir === 'both' ? ['forward', 'back'] : [dir];
    lanes.forEach((lane, li) => {
      for (let i = 0; i < packets; i++) {
        let t = frac(frame / cycle + i / packets + li * 0.5 / packets);
        if (lane === 'back') t = 1 - t;
        const [x, y] = pointAt(points, t);
        const fade = Math.min(1, t * 8, (1 - t) * 8);
        const c = lane === 'back' ? C.accent : color;
        dots.push(
          <g key={`${lane}-${i}`} opacity={fade}>
            <circle cx={x} cy={y} r={15} fill={c} opacity={0.14} />
            <circle cx={x} cy={y} r={5.5} fill={c} />
          </g>,
        );
      }
    });
  }
  const mid = pointAt(points, 0.5);
  return (
    <g opacity={dim ? 0.25 : 1}>
      <polyline points={d} fill="none" stroke={C.line} strokeWidth={width + 3} strokeLinejoin="round" strokeLinecap="round" opacity={p > 0 ? 1 : 0} />
      <polyline points={d} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={dashed ? '0.012 0.018' : '1 1'} strokeDashoffset={dashed ? -frame / 600 : 1 - p} opacity={dashed ? p : 1} />
      {dots}
      {label && p >= 1 ? <Badge x={mid[0]} y={mid[1] - 34} text={label} color={colorName} size={20} /> : null}
    </g>
  );
};

export const Badge: React.FC<{readonly x: number; readonly y: number; readonly text: string; readonly color?: string; readonly size?: number; readonly maxWidth?: number; readonly opacity?: number}> = ({x, y, text, color: colorName, size = 24, maxWidth = 900, opacity = 1}) => {
  const color = tone(colorName, 'accent');
  const s = fitSize(text.toUpperCase(), size, maxWidth - size * 2, 700);
  const w = Math.min(maxWidth, textWidth(text.toUpperCase(), s, 700) + s * 2.2);
  const h = s * 2.3;
  return (
    <g opacity={opacity}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={color} opacity={0.13} />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.5} />
      <Label x={x} y={y + s * 0.36} size={s} color={color} weight={700} spacing={1.2}>{text.toUpperCase()}</Label>
    </g>
  );
};

/** Expanding rings: radio, Bluetooth, Wi-Fi, sonar. */
export const Signal: React.FC<{readonly x: number; readonly y: number; readonly color?: string; readonly size?: number; readonly period?: number}> = ({x, y, color: colorName, size = 1, period = 90}) => {
  const {frame} = useDiagram();
  const color = tone(colorName);
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      {[0, 1, 2].map((i) => {
        const t = frac(frame / period + i / 3);
        return <circle key={i} r={18 + t * 95} fill="none" stroke={color} strokeWidth={3} opacity={(1 - t) * 0.55} />;
      })}
      <circle r={8} fill={color} />
    </g>
  );
};

export const Panel: React.FC<{readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly color?: string; readonly opacity?: number; readonly r?: number}> = ({x, y, w, h, color: colorName, opacity = 1, r = 26}) => {
  const color = tone(colorName, 'muted');
  return (
    <g opacity={opacity}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={C.panel} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={2} />
    </g>
  );
};
