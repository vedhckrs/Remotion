import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, SPRING, fr} from '../../lib/motion';
import {alpha} from '../../lib/color';
import {useTheme} from '../../lib/theme';

export type BarDatum = {readonly label: string; readonly value: number; readonly color?: string};

/**
 * Animated bar chart (vertical or horizontal). Bars grow with a staggered spring, values count up,
 * the leader gets the accent color. Pure SVG + HTML, fps-independent.
 */
export const BarChart: React.FC<{
  readonly data: readonly BarDatum[];
  readonly width: number;
  readonly height: number;
  readonly horizontal?: boolean;
  readonly maxValue?: number;
  readonly unit?: string;
  readonly delay?: number;
  readonly stagger?: number;
  readonly accent?: string;
  readonly labelSize?: number;
  readonly showValues?: boolean;
  readonly decimals?: number;
}> = ({data, width, height, horizontal = false, maxValue, unit = '', delay = 0, stagger = 4, accent: accentProp, labelSize = 28, showValues = true, decimals = 0}) => {
  const theme = useTheme();
  const accent = accentProp ?? theme.colors.accent;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const max = Math.max(1, maxValue ?? Math.max(0, ...data.map((d) => d.value)) * 1.08);
  const leader = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const gap = horizontal ? height * 0.06 : width * 0.05;
  const labelSpace = labelSize * 1.9;

  return (
    <div style={{position: 'relative', width, height, fontFamily: theme.fonts.display, color: theme.colors.text}}>
      {data.map((d, i) => {
        const grow = spring({frame, fps, delay: fr(delay + i * stagger, fps), config: SPRING.soft});
        const value = interpolate(grow, [0, 1], [0, d.value], {extrapolateRight: 'clamp'});
        const color = d.color ?? (i === leader ? accent : alpha(theme.colors.text, 0.28));
        const text = `${value.toLocaleString('en-US', {maximumFractionDigits: decimals, minimumFractionDigits: decimals})}${unit}`;
        if (horizontal) {
          const rowH = (height - gap * (data.length - 1)) / data.length;
          const barW = (width - labelSpace * 3.2) * (d.value / max) * grow;
          return (
            <div key={d.label} style={{position: 'absolute', top: i * (rowH + gap), left: 0, width, height: rowH, display: 'flex', alignItems: 'center', gap: labelSize * 0.6}}>
              <div style={{width: labelSpace * 2.4, fontSize: labelSize, fontWeight: 600, textAlign: 'right', opacity: grow}}>{d.label}</div>
              <div style={{height: rowH * 0.7, width: barW, borderRadius: rowH * 0.2, background: color, boxShadow: i === leader ? `0 0 ${rowH}px ${accent}66` : undefined}} />
              {showValues ? <div style={{fontSize: labelSize, fontWeight: 800, fontVariantNumeric: 'tabular-nums', opacity: interpolate(grow, [0.4, 1], [0, 1], {extrapolateLeft: 'clamp'})}}>{text}</div> : null}
            </div>
          );
        }
        const colW = (width - gap * (data.length - 1)) / data.length;
        const barH = (height - labelSpace * 2) * (d.value / max) * grow;
        return (
          <div key={d.label} style={{position: 'absolute', left: i * (colW + gap), bottom: 0, width: colW, height, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center'}}>
            {showValues ? <div style={{fontSize: labelSize, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: labelSize * 0.4, opacity: interpolate(grow, [0.4, 1], [0, 1], {extrapolateLeft: 'clamp'})}}>{text}</div> : null}
            <div style={{width: '100%', height: barH, borderRadius: colW * 0.14, background: color, boxShadow: i === leader ? `0 0 ${colW * 0.6}px ${accent}66` : undefined}} />
            <div style={{height: labelSpace, display: 'flex', alignItems: 'center', fontSize: labelSize, fontWeight: 600, color: theme.colors.muted, opacity: interpolate(frame, [fr(delay + i * stagger, fps), fr(delay + i * stagger + 8, fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out})}}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
};
