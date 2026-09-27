import React from 'react';
import {noise2D} from '@remotion/noise';
import {noise} from '@remotion/effects/noise';
import {AbsoluteFill, Solid, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {alpha, isDark, lift} from '../lib/color';
import {EASE, fr} from '../lib/motion';
import type {BackgroundKind} from '../lib/styles';
import {useTheme} from '../lib/theme';

/**
 * Animated background systems. All deterministic, CSS/SVG only, and all built on ONE hue: the
 * theme background, with depth from tonal steps of that same color (`lift()`), light from a soft
 * vignette, and at most one accent used as thin light at low opacity. No multi-color gradients:
 * the color belongs to the subject (text, icons, data), not the field behind it.
 *
 *  solid     flat field + vignette. The safest stage for dense type and data.
 *  tonal     a slow soft light drifts across the field (one hue, +6 percent). The premium default.
 *  spotlight one accent glow breathing at the top center behind the subject (neon, reveals).
 *  grid      perspective floor of thin accent lines rushing toward the camera (tech, gaming).
 *  dots      dot matrix in the text color at 10 percent with a travelling pulse (data, corporate).
 *  particles bokeh in the accent, depth by size and blur, slow drift (ambient, music).
 *  rays      rotating light rays from the top in the accent at 8 percent (luxury, reveal).
 *  waves     three tonal wave layers at the bottom, phase-shifting (editorial, calm).
 *  streaks   diagonal speed lines in the accent (hype, sports).
 *  paper     tonal field with a fixed fine grain (editorial, light themes).
 * `grain` > 0 adds WebGL film grain (angle / swangle) on top of any kind.
 */
export const Background: React.FC<{
  readonly kind?: BackgroundKind;
  readonly seed?: string;
  readonly speed?: number;
  readonly intensity?: number;
  readonly grain?: number;
}> = ({kind = 'tonal', seed = 'bg', speed = 1, intensity = 1, grain = 0}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = (frame / fps) * speed; // seconds
  const c = theme.colors;
  const dark = isDark(c.bg);
  const unit = width / 1080;
  const light = lift(c.bg, 8); // one tonal step, the only "second color" of the field
  const shadeEdge = dark ? '0,0,0' : '30,26,20';

  const vignette = <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, rgba(${shadeEdge},0) 50%, rgba(${shadeEdge},${(dark ? 0.45 : 0.12) * intensity}) 100%)`, pointerEvents: 'none'}} />;
  const grainLayer = grain > 0 ? <Solid width={width} height={height} color="#808080" style={{position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: grain * 4}} effects={[noise({amount: 0.8, seed: frame % 97})]} /> : null;

  let body: React.ReactNode = null;

  if (kind === 'solid') {
    body = null;
  } else if (kind === 'tonal' || kind === 'paper') {
    // A single soft light source wandering slowly; reads as depth, not as a gradient.
    const x = 50 + noise2D(`${seed}-lx`, t / 9, 0) * 30;
    const y = 40 + noise2D(`${seed}-ly`, t / 9, 1) * 25;
    const size = Math.max(width, height) * 0.9;
    body = (
      <>
        <div style={{position: 'absolute', left: `${x}%`, top: `${y}%`, width: size, height: size, translate: '-50% -50%', borderRadius: '50%', background: light, opacity: 0.9 * intensity, filter: `blur(${size * 0.25}px)`}} />
        {kind === 'paper' ? (
          <svg width={width} height={height} style={{position: 'absolute', inset: 0, opacity: dark ? 0.08 : 0.16, mixBlendMode: dark ? 'screen' : 'multiply'}}>
            <filter id={`paper-${seed}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={7} stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width={width} height={height} filter={`url(#paper-${seed})`} />
          </svg>
        ) : null}
      </>
    );
  } else if (kind === 'spotlight') {
    const breatheV = interpolate(Math.sin((frame / fr(120, fps)) * Math.PI * 2), [-1, 1], [0.8, 1]);
    const size = Math.max(width, height) * 1.1;
    body = (
      <>
        <div style={{position: 'absolute', left: '50%', top: '28%', width: size, height: size, translate: '-50% -50%', borderRadius: '50%', background: c.accent, opacity: (dark ? 0.22 : 0.14) * intensity * breatheV, filter: `blur(${size * 0.28}px)`}} />
        <div style={{position: 'absolute', left: '50%', top: '32%', width: size * 0.45, height: size * 0.45, translate: '-50% -50%', borderRadius: '50%', background: light, opacity: 0.5 * intensity, filter: `blur(${size * 0.15}px)`}} />
      </>
    );
  } else if (kind === 'grid') {
    const cell = 120 * unit;
    const offset = (t * 60 * unit) % cell;
    const line = alpha(c.accent, dark ? 0.3 : 0.22);
    body = (
      <>
        <div style={{position: 'absolute', left: '-50%', width: '200%', top: '45%', height: '120%', transformOrigin: 'top center', transform: 'rotateX(72deg)', backgroundImage: `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`, backgroundSize: `${cell}px ${cell}px`, backgroundPosition: `0px ${offset}px`, maskImage: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 25%, #000 100%)', WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 25%, #000 100%)'}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: '30%', height: '30%', background: `radial-gradient(ellipse at 50% 60%, ${alpha(c.accent, 0.28)} 0%, rgba(0,0,0,0) 60%)`, opacity: intensity}} />
        <div style={{position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${c.bg} 0%, rgba(0,0,0,0) 40%)`}} />
      </>
    );
  } else if (kind === 'particles') {
    const count = 60;
    const dots = [];
    for (let i = 0; i < count; i++) {
      const depth = random(`${seed}-d${i}`);
      const size = (6 + depth * 26) * unit;
      const x = ((random(`${seed}-x${i}`) + noise2D(`${seed}-nx`, t / 8, i) * 0.06 + t * 0.004 * (0.3 + depth)) % 1) * width;
      const y = ((random(`${seed}-y${i}`) + noise2D(`${seed}-ny`, t / 8, i + 100) * 0.06 - t * 0.01 * (0.2 + depth) + 10) % 1) * height;
      dots.push(<div key={i} style={{position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: '50%', background: c.accent, opacity: (0.08 + depth * 0.32) * intensity, filter: `blur(${(1 - depth) * 6 * unit}px)`}} />);
    }
    body = <>{dots}</>;
  } else if (kind === 'rays') {
    const angle = (t * 4) % 360;
    body = (
      <>
        <div style={{position: 'absolute', left: '50%', top: '-20%', width: Math.max(width, height) * 3, height: Math.max(width, height) * 3, marginLeft: -Math.max(width, height) * 1.5, background: `repeating-conic-gradient(from ${angle}deg at 50% 50%, ${alpha(c.accent, dark ? 0.12 : 0.08)} 0deg, rgba(0,0,0,0) 6deg, rgba(0,0,0,0) 14deg)`, opacity: intensity, filter: `blur(${2 * unit}px)`}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: '60%', background: `radial-gradient(ellipse at 50% 0%, ${alpha(c.accent, 0.3)} 0%, rgba(0,0,0,0) 60%)`}} />
      </>
    );
  } else if (kind === 'waves') {
    // Three thin glowing lines in the accent flowing across the lower third (filled tonal masses read as grey mud).
    const lines = [0, 1, 2].map((i) => {
      const amp = height * (0.025 + i * 0.012);
      const baseY = height * (0.62 + i * 0.07);
      let d = `M 0 ${baseY}`;
      for (let x = 0; x <= width; x += width / 48) {
        const y = baseY + Math.sin((x / (width / (1.5 + i * 0.6))) * Math.PI * 2 + t * (0.6 + i * 0.25) * (i % 2 ? -1 : 1)) * amp;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return <path key={i} d={d} fill="none" stroke={c.accent} strokeWidth={(4 - i) * unit} strokeOpacity={(0.55 - i * 0.14) * intensity} style={{filter: `drop-shadow(0 0 ${10 * unit}px ${alpha(c.accent, 0.6)})`}} />;
    });
    body = (
      <>
        <div style={{position: 'absolute', left: 0, right: 0, top: '45%', height: '45%', background: `radial-gradient(ellipse at 50% 60%, ${alpha(c.accent, 0.12)} 0%, rgba(0,0,0,0) 65%)`, opacity: intensity}} />
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>{lines}</svg>
      </>
    );
  } else if (kind === 'dots') {
    const step = 60 * unit;
    const cols = Math.ceil(width / step) + 1;
    const rows = Math.ceil(height / step) + 1;
    const cx = width * (0.5 + noise2D(`${seed}-cx`, t / 4, 0) * 0.35);
    const cy = height * (0.5 + noise2D(`${seed}-cy`, t / 4, 1) * 0.35);
    const radius = ((t * 220 * unit) % (Math.max(width, height) * 1.2)) + 1;
    const items = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * step;
        const y = r * step;
        const dist = Math.hypot(x - cx, y - cy);
        const pulse = interpolate(Math.abs(dist - radius), [0, 140 * unit], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out});
        items.push(<circle key={`${r}-${col}`} cx={x} cy={y} r={(2 + pulse * 3) * unit} fill={pulse > 0.2 ? c.accent : c.text} opacity={(0.1 + pulse * 0.5) * intensity} />);
      }
    }
    body = <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>{items}</svg>;
  } else if (kind === 'streaks') {
    const lines = [];
    for (let i = 0; i < 14; i++) {
      const len = (300 + random(`${seed}-l${i}`) * 700) * unit;
      const y = random(`${seed}-sy${i}`) * height;
      const speedPx = (900 + random(`${seed}-sv${i}`) * 900) * unit * speed;
      const x = ((random(`${seed}-sx${i}`) * (width + len) + t * speedPx) % (width + len * 2)) - len;
      lines.push(<div key={i} style={{position: 'absolute', left: x, top: y, width: len, height: (4 + random(`${seed}-h${i}`) * 10) * unit, borderRadius: 999, background: `linear-gradient(90deg, rgba(0,0,0,0), ${c.accent}, rgba(0,0,0,0))`, opacity: 0.45 * intensity, transform: 'skewX(-25deg)'}} />);
    }
    body = (
      <>
        {lines}
        <AbsoluteFill style={{background: `radial-gradient(circle at 50% 50%, ${alpha(c.accent, 0.12)} 0%, rgba(0,0,0,0) 60%)`, opacity: interpolate(Math.sin(frame / fr(30, fps)), [-1, 1], [0.4, 1])}} />
      </>
    );
  }

  return (
    <AbsoluteFill style={{backgroundColor: c.bg, overflow: 'hidden'}}>
      {body}
      {vignette}
      {grainLayer}
    </AbsoluteFill>
  );
};
