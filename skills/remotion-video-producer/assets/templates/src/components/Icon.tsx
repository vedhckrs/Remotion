import React, {useEffect, useMemo, useState} from 'react';
import {interpolate, spring, staticFile, useCurrentFrame, useDelayRender, useVideoConfig} from 'remotion';
import {alpha, contrast, isDark, lift} from '../lib/color';
import {SPRING, fluid, fr, idleFloat} from '../lib/motion';
import {useTheme} from '../lib/theme';

/**
 * SVG icons and real brand logos, fetched once by scripts/fetch-icons.mjs into public/icons/<set>/<name>.svg
 * (with public/icons/credits.json holding title, license, source URL and brand hex).
 *
 * Sets: simple-icons (monochrome brand marks, official brand color available), logos (full-color
 * SVG Logos), lucide / tabler (UI stroke icons), fluent-emoji-flat (colorful emoji), plus any
 * custom SVG you drop into public/icons/custom/.
 *
 * Animations: fluid (default: condenses into place, no overshoot), pop (spring), draw (stroke
 * icons draw themselves), float, spin, none. `glow` adds a colored drop shadow. Monochrome sets
 * take `color`; colorful sets keep their own. `BrandLogo` checks the official brand color
 * against its tile and falls back to the theme text color when the mark would vanish (a black
 * wordmark on a black stage, a white one on paper).
 */
export type IconSet = 'simple-icons' | 'logos' | 'lucide' | 'tabler' | 'fluent-emoji-flat' | 'custom';
export type IconAnimation = 'fluid' | 'pop' | 'draw' | 'float' | 'spin' | 'none';

export type IconCredit = {set: string; name: string; title: string; license: string; source: string | null; hex: string | null};

const creditsCache: {data: IconCredit[] | null; promise: Promise<IconCredit[]> | null} = {data: null, promise: null};

/** Credits for all fetched icons (empty until fetch-icons.mjs has run). */
export const useIconCredits = (): IconCredit[] => {
  const [credits, setCredits] = useState<IconCredit[]>(creditsCache.data ?? []);
  const {delayRender, continueRender} = useDelayRender();
  useEffect(() => {
    if (creditsCache.data) return;
    const handle = delayRender('icon credits');
    if (!creditsCache.promise) {
      creditsCache.promise = fetch(staticFile('icons/credits.json'))
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
        .then((data: IconCredit[]) => {
          creditsCache.data = data;
          return data;
        });
    }
    creditsCache.promise.then((data) => {
      setCredits(data);
      continueRender(handle);
    });
  }, [delayRender, continueRender]);
  return credits;
};

const svgCache = new Map<string, string>();

const useSvg = (set: string, name: string) => {
  const key = `${set}/${name}`;
  const [svg, setSvg] = useState<string | null>(svgCache.get(key) ?? null);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  useEffect(() => {
    if (svgCache.has(key)) return;
    const handle = delayRender(`icon ${key}`);
    fetch(staticFile(`icons/${key}.svg`))
      .then((r) => {
        if (!r.ok) throw new Error(`Icon not found: public/icons/${key}.svg. Run: node scripts/fetch-icons.mjs --${set === 'simple-icons' ? 'brands' : set} ${name}`);
        return r.text();
      })
      .then((text) => {
        svgCache.set(key, text);
        setSvg(text);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [key, set, name, delayRender, continueRender, cancelRender]);
  return svg;
};

const prepareSvg = (svg: string, options: {draw: boolean; progress: number; mono: boolean}) => {
  let out = svg.replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '');
  // Make the root scale to its box.
  out = out.replace(/<svg([^>]*)>/, (m, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  });
  if (options.mono) {
    // Simple Icons ship a single path with no fill; paint with currentColor so `color` applies.
    out = out.replace(/<path(?![^>]*fill=)/g, '<path fill="currentColor"');
  }
  if (options.draw) {
    const dash = `pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:${(1 - options.progress).toFixed(4)}"`;
    out = out.replace(/<(path|circle|line|polyline|polygon|rect|ellipse)\b/g, `<$1 ${dash}`);
  }
  return out;
};

export const Icon: React.FC<{
  readonly set?: IconSet;
  readonly name: string;
  readonly size?: number;
  readonly color?: string;
  readonly animate?: IconAnimation;
  readonly delay?: number;
  readonly glow?: string | boolean;
  readonly style?: React.CSSProperties;
}> = ({set = 'lucide', name, size = 120, color, animate = 'fluid', delay = 0, glow = false, style}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const svg = useSvg(set, name);
  const mono = set === 'simple-icons' || set === 'lucide' || set === 'tabler';
  const local = frame - fr(delay, fps);
  const enter = spring({frame: local, fps, config: SPRING.soft});
  const flow = fluid(local, fps, {duration: 22});
  const draw = interpolate(local, [0, fr(28, fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const html = useMemo(() => (svg ? prepareSvg(svg, {draw: animate === 'draw', progress: draw, mono}) : ''), [svg, animate, draw, mono]);
  if (!svg) return null;
  const glowColor = glow === true ? color ?? theme.colors.accent : glow || null;
  const transform = animate === 'spin' ? `rotate(${(local / fps) * 90}deg)` : undefined;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        color: color ?? theme.colors.text,
        opacity: animate === 'none' || animate === 'draw' ? 1 : animate === 'fluid' ? interpolate(flow, [0, 0.6], [0, 1], {extrapolateRight: 'clamp'}) : interpolate(enter, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'}),
        scale: animate === 'pop' ? String(0.5 + enter * 0.5) : animate === 'fluid' ? String(0.88 + flow * 0.12) : '1',
        translate: animate === 'float' ? `0px ${idleFloat(frame, size * 0.05, 60, delay, fps)}px` : animate === 'fluid' ? `0px ${(1 - flow) * size * 0.12}px` : undefined,
        transform,
        filter: [glowColor ? `drop-shadow(0 0 ${size * 0.12}px ${glowColor}) drop-shadow(0 0 ${size * 0.3}px ${alpha(glowColor, 0.53)})` : '', animate === 'fluid' && flow < 0.97 ? `blur(${((1 - flow) * size * 0.06).toFixed(2)}px)` : ''].filter(Boolean).join(' ') || undefined,
        ...style,
      }}
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
};

/** Real brand mark in its official color (from credits.json) with an optional label. */
export const BrandLogo: React.FC<{
  readonly name: string;
  readonly size?: number;
  readonly official?: boolean;
  readonly color?: string;
  readonly label?: string;
  readonly animate?: IconAnimation;
  readonly delay?: number;
  readonly glow?: boolean;
  readonly set?: 'simple-icons' | 'logos';
}> = ({name, size = 160, official = true, color, label, animate = 'fluid', delay = 0, glow = false, set = 'simple-icons'}) => {
  const theme = useTheme();
  const credits = useIconCredits();
  const credit = credits.find((c) => c.set === set && c.name === name);
  // The tile is one tonal step off the background; a mark must hold 2.5:1 against it or it goes mono.
  const tileBg = lift(theme.colors.bg, isDark(theme.colors.bg) ? 7 : -6);
  const official_ = official && credit?.hex ? `#${credit.hex}` : null;
  const brandColor = color ?? (official_ && contrast(official_, tileBg) >= 2.5 ? official_ : theme.colors.text);
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const labelIn = spring({frame, fps, delay: fr(delay + 6, fps), config: SPRING.fluid});
  // The tile condenses together with its mark (same curve, 2 frames ahead) so it never sits empty.
  const tileIn = animate === 'none' ? 1 : fluid(frame, fps, {delay: Math.max(0, delay - 2), duration: 20});
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.12}}>
      <div style={{width: size * 1.25, height: size * 1.25, borderRadius: size * 0.28, background: tileBg, border: `1px solid ${theme.colors.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: glow ? `0 0 ${size * 0.5}px ${alpha(brandColor, 0.33)}` : theme.shadow.card, opacity: interpolate(tileIn, [0, 0.6], [0, 1], {extrapolateRight: 'clamp'}), scale: String(0.9 + tileIn * 0.1), translate: `0px ${(1 - tileIn) * size * 0.1}px`}}>
        <Icon set={set} name={name} size={size * 0.7} color={brandColor} animate={animate} delay={delay} glow={glow ? brandColor : false} />
      </div>
      {label ? (
        <div style={{fontFamily: theme.fonts.display, fontSize: size * 0.2, fontWeight: 700, color: theme.colors.text, opacity: labelIn, translate: `0px ${(1 - labelIn) * size * 0.1}px`, textAlign: 'center'}}>{label}</div>
      ) : null}
    </div>
  );
};
