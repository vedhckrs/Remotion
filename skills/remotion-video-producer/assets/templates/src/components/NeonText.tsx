import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {SPRING, fr} from '../lib/motion';
import {theme} from '../lib/theme';

/**
 * Neon sign typography: layered glow, a deterministic "tube ignition" flicker on entry,
 * a slow breathing pulse while held, and an optional 2.5D extrusion built from stacked
 * shadows (cheap, renders without WebGL). Put it on a dark background or inside <Camera3D>.
 */
export const NeonText: React.FC<{
  readonly text: string;
  readonly color?: string;
  readonly glow?: string;
  readonly fontSize?: number;
  readonly font?: 'display' | 'caption' | 'impact';
  readonly intensity?: number;
  readonly flickerFrames?: number;
  readonly extrude?: number;
  readonly extrudeColor?: string;
  readonly delay?: number;
  readonly seed?: string;
  readonly uppercase?: boolean;
  readonly style?: React.CSSProperties;
}> = ({text, color = '#FFFFFF', glow = theme.colors.accent, fontSize = 120, font = 'display', intensity = 1, flickerFrames = 18, extrude = 0, extrudeColor = 'rgba(0,0,0,0.55)', delay = 0, seed = 'neon', uppercase = false, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - fr(delay, fps);

  const on = spring({frame: local, fps, config: SPRING.punch});
  const ignition = fr(flickerFrames, fps);
  // Tube flicker: a few dark dips in the first frames, then steady.
  const flicker = local < ignition ? (random(`${seed}-${Math.floor(local / 2)}`) > 0.72 ? 0.35 : 1) : 1;
  const pulse = 1 + 0.07 * Math.sin((frame / fr(48, fps)) * Math.PI * 2);
  const g = intensity * flicker * pulse * on;

  const shadows: string[] = [
    `0 0 ${fontSize * 0.04 * g}px ${color}`,
    `0 0 ${fontSize * 0.12 * g}px ${glow}`,
    `0 0 ${fontSize * 0.3 * g}px ${glow}`,
    `0 0 ${fontSize * 0.6 * g}px ${glow}`,
  ];
  for (let i = 1; i <= extrude; i++) {
    shadows.unshift(`${i}px ${i}px 0 ${extrudeColor}`);
  }

  return (
    <div
      style={{
        fontFamily: theme.fonts[font],
        fontWeight: font === 'impact' ? 400 : 900,
        fontSize,
        lineHeight: 1,
        letterSpacing: font === 'impact' ? '0.02em' : '-0.02em',
        textTransform: uppercase ? 'uppercase' : 'none',
        color,
        textShadow: shadows.join(', '),
        opacity: interpolate(on, [0, 0.3], [0, 1], {extrapolateRight: 'clamp'}) * (0.55 + 0.45 * flicker),
        scale: String(0.9 + on * 0.1),
        WebkitTextStroke: `${Math.max(1, fontSize * 0.01)}px ${color}`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};
