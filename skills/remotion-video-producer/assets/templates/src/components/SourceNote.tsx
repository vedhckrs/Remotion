import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {fr} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import {useTheme} from '../lib/theme';

/**
 * Citation as a small disclaimer in the bottom-right corner of the safe area ("Source: Ookla, 2025").
 * Readable when paused, out of the way while watching. `aboveCredit` lifts it over the trademark line.
 */
export const SourceNote: React.FC<{readonly text: string; readonly aboveCredit?: boolean}> = ({text, aboveCredit = false}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const {fps, durationInFrames, width, height} = useVideoConfig();
  const {safe, unit, isVertical} = usePlatformLayout();
  const fadeFrames = fr(10, fps);
  const fade = durationInFrames > fadeFrames * 2 + 2 ? interpolate(frame, [0, fadeFrames, durationInFrames - fadeFrames - 1, durationInFrames - 1], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  const size = (isVertical ? 22 : 18) * unit;
  const raise = aboveCredit ? (isVertical ? 16 : 14) * unit * 1.25 * 2 + 6 * unit : 0; // AttributionBar: two lines
  const label = /^sources?\s*:/i.test(text) ? text : `Source: ${text}`;
  return (
    <div
      style={{
        position: 'absolute',
        right: width - (safe.x + safe.width) + 8 * unit,
        bottom: height - (safe.y + safe.height) + 6 * unit + raise,
        maxWidth: safe.width * 0.6,
        fontFamily: theme.fonts.body,
        fontSize: size,
        lineHeight: 1.25,
        fontWeight: 500,
        color: theme.colors.text,
        opacity: 0.62 * fade,
        textAlign: 'right',
        textShadow: '0 1px 6px rgba(0,0,0,0.75)',
        maxHeight: size * 1.25 * 2,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  );
};
