import React from 'react';
import {lightLeak} from '@remotion/effects/light-leak';
import {Solid, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Light leak that evolves over the first half of its lifetime and retracts over the
 * second. Place inside <TransitionSeries.Overlay durationInFrames={20..28}> to hide a
 * hard cut, or anywhere as a decorative flare. WebGL: needs --gl=angle for renders.
 */
export const LightLeakOverlay: React.FC<{
  readonly seed?: number;
  /** 0..360. 0 = warm orange, 120 = green, 240 = blue. */
  readonly hueShift?: number;
  readonly opacity?: number;
}> = ({seed = 0, hueShift = 0, opacity = 1}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();

  return (
    <Solid
      width={width}
      height={height}
      style={{opacity, mixBlendMode: 'screen'}}
      effects={[
        lightLeak({
          seed,
          hueShift,
          progress: interpolate(frame, [0, durationInFrames - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }),
      ]}
    />
  );
};
