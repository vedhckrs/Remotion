import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {fr, impulse} from '../lib/motion';

/**
 * Beat hits for fast-paced edits: a brief full-frame flash (white or brand color) and an optional
 * scale bump on the wrapped content at the given frames. Use sparingly: one per cut or emphasis.
 */
export const ImpactFlash: React.FC<{
  /** Frames (scene-local, authored at 30 fps) where a hit happens. */
  readonly at: readonly number[];
  readonly color?: string;
  readonly opacity?: number;
  readonly length?: number;
  readonly bump?: number;
  readonly children?: React.ReactNode;
}> = ({at, color = '#FFFFFF', opacity = 0.85, length = 5, bump = 0.03, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  let hit = 0;
  for (const a of at) hit = Math.max(hit, impulse(frame, fr(a, fps), fr(length, fps)));

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{scale: String(1 + hit * bump)}}>{children}</AbsoluteFill>
      {hit > 0.01 ? <AbsoluteFill style={{backgroundColor: color, opacity: hit * opacity, pointerEvents: 'none'}} /> : null}
    </AbsoluteFill>
  );
};
