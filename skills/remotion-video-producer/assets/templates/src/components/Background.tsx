import React from 'react';
import {noise2D} from '@remotion/noise';
import {AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {fr} from '../lib/motion';
import type {BackgroundKind} from '../lib/styles';
import {useTheme} from '../lib/theme';
import {GradientBackground} from './GradientBackground';

/**
 * Animated background systems, all deterministic and CSS/SVG only (no WebGL):
 *  gradient  drifting gradient + two noise-driven blobs (GradientBackground)
 *  mesh      four soft blobs on a base gradient, slow and premium
 *  grid      perspective floor grid rushing toward the camera, horizon glow (tech, gaming)
 *  particles bokeh dots drifting on noise, depth by size and blur
 *  aurora    wide blurred ribbons sliding across (neon, music, night)
 *  rays      rotating light rays from the top with a vignette (luxury, reveal)
 *  waves     layered sine waves at the bottom, phase-shifting (editorial, calm)
 *  dots      dot matrix with a pulse travelling from a moving centre (data, corporate)
 *  streaks   diagonal speed lines racing through (hype, sports)
 *  solid     flat brand color with a soft vignette
 * Pick per style preset (styles.ts), per video (script "background") or per scene (visual.background).
 */
export const Background: React.FC<{
  readonly kind?: BackgroundKind;
  readonly seed?: string;
  readonly speed?: number;
  readonly intensity?: number;
  readonly grain?: number;
}> = ({kind = 'gradient', seed = 'bg', speed = 1, intensity = 1, grain = 0}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = (frame / fps) * speed; // seconds
  const c = theme.colors;
  const unit = width / 1080;

  const vignette = <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${0.45 * intensity}) 100%)`, pointerEvents: 'none'}} />;

  if (kind === 'gradient') return <GradientBackground seed={seed} speed={speed} grain={grain} />;

  if (kind === 'solid') {
    return (
      <AbsoluteFill style={{backgroundColor: c.bg}}>
        {vignette}
      </AbsoluteFill>
    );
  }

  if (kind === 'mesh') {
    const blobs = [c.accent, c.accent2, c.surface, c.accent];
    return (
      <AbsoluteFill style={{background: `linear-gradient(${150 + t * 3}deg, ${c.bg} 0%, ${c.surface} 100%)`, overflow: 'hidden'}}>
        {blobs.map((color, i) => {
          const size = Math.max(width, height) * (0.55 + 0.15 * (i % 2));
          const x = width * (0.5 + noise2D(`${seed}-mx${i}`, t / 6, i) * 0.45) - size / 2;
          const y = height * (0.5 + noise2D(`${seed}-my${i}`, t / 6 + 3, i) * 0.45) - size / 2;
          return <div key={i} style={{position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: '50%', background: color, opacity: 0.32 * intensity, filter: `blur(${size * 0.22}px)`, mixBlendMode: 'screen'}} />;
        })}
        {vignette}
      </AbsoluteFill>
    );
  }

  if (kind === 'grid') {
    const cell = 120 * unit;
    const offset = (t * 60 * unit) % cell; // rushes toward the viewer
    return (
      <AbsoluteFill style={{backgroundColor: c.bg, overflow: 'hidden', perspective: 900 * unit, perspectiveOrigin: '50% 40%'}}>
        <div style={{position: 'absolute', left: '-50%', width: '200%', top: '45%', height: '120%', transformOrigin: 'top center', transform: 'rotateX(72deg)', backgroundImage: `linear-gradient(${c.accent}55 2px, transparent 2px), linear-gradient(90deg, ${c.accent}55 2px, transparent 2px)`, backgroundSize: `${cell}px ${cell}px`, backgroundPosition: `0px ${offset}px`, maskImage: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 25%, #000 100%)', WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 25%, #000 100%)'}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: '30%', height: '30%', background: `radial-gradient(ellipse at 50% 60%, ${c.accent}66 0%, rgba(0,0,0,0) 60%)`, opacity: 0.9 * intensity}} />
        <div style={{position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${c.bg} 0%, rgba(0,0,0,0) 40%)`}} />
        {vignette}
      </AbsoluteFill>
    );
  }

  if (kind === 'particles') {
    const count = 70;
    const dots = [];
    for (let i = 0; i < count; i++) {
      const depth = random(`${seed}-d${i}`); // 0 far .. 1 near
      const size = (6 + depth * 26) * unit;
      const x = ((random(`${seed}-x${i}`) + noise2D(`${seed}-nx`, t / 8, i) * 0.06 + t * 0.004 * (0.3 + depth)) % 1) * width;
      const y = ((random(`${seed}-y${i}`) + noise2D(`${seed}-ny`, t / 8, i + 100) * 0.06 - t * 0.01 * (0.2 + depth) + 10) % 1) * height;
      dots.push(<div key={i} style={{position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: '50%', background: i % 3 === 0 ? c.accent2 : c.accent, opacity: (0.15 + depth * 0.5) * intensity, filter: `blur(${(1 - depth) * 6 * unit}px)`}} />);
    }
    return (
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 30%, ${c.surface} 0%, ${c.bg} 70%)`, overflow: 'hidden'}}>
        {dots}
        {vignette}
      </AbsoluteFill>
    );
  }

  if (kind === 'aurora') {
    const ribbons = [c.accent, c.accent2, c.accent];
    return (
      <AbsoluteFill style={{backgroundColor: c.bg, overflow: 'hidden'}}>
        {ribbons.map((color, i) => {
          const pts: string[] = [];
          for (let k = 0; k <= 8; k++) {
            const x = (k / 8) * width;
            const y = height * (0.3 + i * 0.18) + noise2D(`${seed}-a${i}`, k / 3 + t / 5, i) * height * 0.14;
            pts.push(`${x},${y}`);
          }
          return (
            <svg key={i} width={width} height={height} style={{position: 'absolute', inset: 0, filter: `blur(${70 * unit}px)`, opacity: 0.55 * intensity, mixBlendMode: 'screen'}}>
              <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={height * 0.16} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          );
        })}
        {vignette}
      </AbsoluteFill>
    );
  }

  if (kind === 'rays') {
    const angle = (t * 4) % 360;
    return (
      <AbsoluteFill style={{backgroundColor: c.bg, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: '50%', top: '-20%', width: Math.max(width, height) * 3, height: Math.max(width, height) * 3, marginLeft: -Math.max(width, height) * 1.5, background: `repeating-conic-gradient(from ${angle}deg at 50% 50%, ${c.accent}22 0deg, rgba(0,0,0,0) 6deg, rgba(0,0,0,0) 14deg)`, opacity: 0.9 * intensity, filter: `blur(${2 * unit}px)`}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: '60%', background: `radial-gradient(ellipse at 50% 0%, ${c.accent}55 0%, rgba(0,0,0,0) 60%)`}} />
        {vignette}
      </AbsoluteFill>
    );
  }

  if (kind === 'waves') {
    const layers = [c.surface, c.accent, c.accent2];
    return (
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${c.bg} 0%, ${c.surface} 100%)`, overflow: 'hidden'}}>
        {layers.map((color, i) => {
          const amp = height * (0.04 + i * 0.015);
          const base = height * (0.72 + i * 0.08);
          let d = `M 0 ${base}`;
          for (let x = 0; x <= width; x += width / 40) {
            const y = base + Math.sin(x / (width / (2 + i)) * Math.PI * 2 + t * (0.6 + i * 0.25) * (i % 2 ? -1 : 1)) * amp;
            d += ` L ${x} ${y}`;
          }
          d += ` L ${width} ${height} L 0 ${height} Z`;
          return (
            <svg key={i} width={width} height={height} style={{position: 'absolute', inset: 0, opacity: (0.35 - i * 0.08) * intensity}}>
              <path d={d} fill={color} />
            </svg>
          );
        })}
        {vignette}
      </AbsoluteFill>
    );
  }

  if (kind === 'dots') {
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
        const pulse = interpolate(Math.abs(dist - radius), [0, 140 * unit], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        items.push(<circle key={`${r}-${col}`} cx={x} cy={y} r={(2 + pulse * 3) * unit} fill={pulse > 0.2 ? c.accent : c.text} opacity={(0.12 + pulse * 0.6) * intensity} />);
      }
    }
    return (
      <AbsoluteFill style={{backgroundColor: c.bg}}>
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>{items}</svg>
        {vignette}
      </AbsoluteFill>
    );
  }

  // streaks
  const lines = [];
  for (let i = 0; i < 14; i++) {
    const len = (300 + random(`${seed}-l${i}`) * 700) * unit;
    const y = random(`${seed}-sy${i}`) * height;
    const speedPx = (900 + random(`${seed}-sv${i}`) * 900) * unit * speed;
    const x = ((random(`${seed}-sx${i}`) * (width + len) + t * speedPx) % (width + len * 2)) - len;
    lines.push(<div key={i} style={{position: 'absolute', left: x, top: y, width: len, height: (4 + random(`${seed}-h${i}`) * 10) * unit, borderRadius: 999, background: `linear-gradient(90deg, rgba(0,0,0,0), ${i % 4 === 0 ? c.accent2 : c.accent}, rgba(0,0,0,0))`, opacity: 0.55 * intensity, transform: 'skewX(-25deg)'}} />);
  }
  return (
    <AbsoluteFill style={{background: `linear-gradient(200deg, ${c.surface} 0%, ${c.bg} 60%)`, overflow: 'hidden'}}>
      {lines}
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 50%, ${c.accent}22 0%, rgba(0,0,0,0) 60%)`, opacity: interpolate(Math.sin(frame / fr(30, fps)), [-1, 1], [0.4, 1])}} />
      {vignette}
    </AbsoluteFill>
  );
};
