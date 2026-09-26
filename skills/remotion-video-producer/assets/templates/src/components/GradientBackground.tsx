import React from 'react';
import {noise2D} from '@remotion/noise';
import {noise} from '@remotion/effects/noise';
import {AbsoluteFill, Solid, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../lib/theme';

/**
 * Living background: base gradient whose angle drifts, two blurred color blobs
 * wandering on Perlin noise, and optional film grain.
 * `grain` > 0 uses the WebGL `noise()` effect (needs a GL backend: angle / swangle);
 * leave it at 0 for renders that must not depend on WebGL.
 */
export const GradientBackground: React.FC<{
  readonly colors?: readonly [string, string];
  readonly blobs?: readonly [string, string];
  readonly grain?: number;
  readonly speed?: number;
  readonly seed?: string;
}> = ({colors = [theme.colors.bg, '#141428'], blobs = [theme.colors.accent, theme.colors.accent2], grain = 0, speed = 1, seed = 'bg'}) => {
  const frame = useCurrentFrame();
  const {width, height, durationInFrames, fps} = useVideoConfig();
  const t = (frame / (3 * fps)) * speed;

  const angle = interpolate(frame, [0, durationInFrames], [160, 200], {extrapolateRight: 'clamp'});
  const blobSize = Math.max(width, height) * 0.7;

  const blobStyle = (index: number, color: string): React.CSSProperties => {
    const nx = noise2D(`${seed}-x${index}`, t, index * 10);
    const ny = noise2D(`${seed}-y${index}`, t + 5, index * 10);
    const x = width * (0.5 + nx * 0.35) - blobSize / 2;
    const y = height * (0.5 + ny * 0.35) - blobSize / 2;
    return {
      position: 'absolute',
      left: x,
      top: y,
      width: blobSize,
      height: blobSize,
      borderRadius: '50%',
      background: color,
      opacity: 0.45,
      filter: `blur(${blobSize * 0.18}px)`,
      mixBlendMode: 'screen',
    };
  };

  return (
    <AbsoluteFill style={{background: `linear-gradient(${angle}deg, ${colors[0]} 0%, ${colors[1]} 100%)`, overflow: 'hidden'}}>
      <div style={blobStyle(0, blobs[0])} />
      <div style={blobStyle(1, blobs[1])} />
      {grain > 0 ? (
        <Solid
          width={width}
          height={height}
          color="#808080"
          style={{position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: grain * 4}}
          effects={[noise({amount: 0.8, seed: frame % 97})]}
        />
      ) : null}
    </AbsoluteFill>
  );
};
