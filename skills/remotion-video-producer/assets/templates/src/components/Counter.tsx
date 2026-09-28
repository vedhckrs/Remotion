import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, fr} from '../lib/motion';
import {useTheme} from '../lib/theme';

/** Animated statistic: counts from `from` to `to` with an ease-out and tabular digits. */
export const Counter: React.FC<{
  readonly to: number;
  readonly from?: number;
  readonly durationInFrames?: number;
  readonly delay?: number;
  readonly decimals?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly fontSize?: number;
  readonly color?: string;
  readonly locale?: string;
}> = ({to, from = 0, durationInFrames = 40, delay = 0, decimals = 0, prefix = '', suffix = '', fontSize = 160, color: colorProp, locale = 'en-US'}) => {
  const theme = useTheme();
  const color = colorProp ?? theme.colors.text;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const d0 = fr(delay, fps);
  const value = interpolate(frame, [d0, d0 + fr(durationInFrames, fps)], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.snap});
  const appear = interpolate(frame, [d0, d0 + fr(8, fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out});
  const formatted = value.toLocaleString(locale, {minimumFractionDigits: decimals, maximumFractionDigits: decimals});

  return (
    <div
      style={{
        fontFamily: theme.fonts.display,
        fontWeight: 900,
        fontSize,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        color,
        fontVariantNumeric: 'tabular-nums',
        opacity: appear,
        translate: `0px ${(1 - appear) * fontSize * 0.2}px`,
        textShadow: theme.shadow.text,
      }}
    >
      {prefix}
      {formatted}
      {suffix}
    </div>
  );
};
