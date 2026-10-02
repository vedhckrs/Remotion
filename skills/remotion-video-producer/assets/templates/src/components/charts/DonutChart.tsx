import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, SPRING, fr} from '../../lib/motion';
import {alpha, tone} from '../../lib/color';
import {useTheme} from '../../lib/theme';

export type DonutSegment = {readonly label: string; readonly value: number; readonly color?: string};

/**
 * Donut / radial progress. One segment = progress ring with a big percentage; several = share chart
 * with staggered sweep. SVG strokes with dasharray, so it stays crisp at 4K.
 */
export const DonutChart: React.FC<{
  readonly segments: readonly DonutSegment[];
  readonly size: number;
  readonly thickness?: number;
  readonly delay?: number;
  readonly sweepFrames?: number;
  readonly accent?: string;
  readonly centerLabel?: string;
  readonly showPercent?: boolean;
}> = ({segments, size, thickness, delay = 0, sweepFrames = 45, accent: accentProp, centerLabel, showPercent = true}) => {
  const theme = useTheme();
  const accent = accentProp ?? theme.colors.accent;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const stroke = thickness ?? size * 0.11;
  const r = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.length === 1 ? 100 : Math.max(1, segments.reduce((s, d) => s + d.value, 0));
  // One hue, tonal steps: the leader in the accent, the rest lighter/darker versions and text tints.
  const palette = [accent, theme.colors.accent2, tone(accent, 45), tone(accent, -35), alpha(theme.colors.text, 0.35), alpha(theme.colors.text, 0.18)];

  const progress = interpolate(frame, [fr(delay, fps), fr(delay + sweepFrames, fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOut});
  const pop = spring({frame, fps, delay: fr(delay + 6, fps), config: SPRING.soft});

  let offset = 0;
  const arcs = segments.map((seg, i) => {
    const share = seg.value / total;
    const start = offset;
    offset += share;
    const visible = Math.max(0, Math.min(share, progress - start));
    return {seg, share, start, visible, color: seg.color ?? palette[i % palette.length]};
  });

  const headline = segments.length === 1 ? `${Math.round(segments[0].value * progress)}%` : centerLabel ?? '';

  return (
    <div style={{position: 'relative', width: size, height: size, fontFamily: theme.fonts.display, color: theme.colors.text}}>
      <svg width={size} height={size} style={{transform: 'rotate(-90deg)', overflow: 'visible'}}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.colors.line} strokeWidth={stroke} />
        {arcs.map(({seg, start, visible, color}) => (
          <circle
            key={seg.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap={segments.length === 1 ? 'round' : 'butt'}
            strokeDasharray={`${visible * circumference} ${circumference}`}
            strokeDashoffset={-start * circumference}
            style={{filter: `drop-shadow(0 0 ${stroke * 0.6}px ${color}66)`}}
          />
        ))}
      </svg>
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', scale: String(0.8 + pop * 0.2), opacity: pop}}>
        {showPercent || centerLabel ? <div style={{fontSize: size * 0.22, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>{headline}</div> : null}
        {segments.length === 1 ? <div style={{fontSize: size * 0.07, fontWeight: 600, color: theme.colors.muted, marginTop: size * 0.03}}>{segments[0].label}</div> : null}
      </div>
    </div>
  );
};
