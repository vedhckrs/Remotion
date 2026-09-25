import React from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE} from '../lib/motion';
import {theme} from '../lib/theme';

/**
 * Full-bleed still with a slow scale and drift toward a focal point, graded with the theme.
 * `focal` is [x, y] in 0..1 image coordinates; the drift moves toward it.
 */
export const KenBurnsImage: React.FC<{
  readonly src: string;
  readonly fromScale?: number;
  readonly toScale?: number;
  readonly focal?: readonly [number, number];
  readonly drift?: number;
  readonly scrim?: number;
  readonly grade?: string;
}> = ({src, fromScale = 1.08, toScale = 1.16, focal = [0.5, 0.5], drift = 0.03, scrim = 0.35, grade = theme.grade}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();

  const t = interpolate(frame, [0, durationInFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOut});
  const scale = fromScale + (toScale - fromScale) * t;
  const dx = (0.5 - focal[0]) * drift * width * t;
  const dy = (0.5 - focal[1]) * drift * height * t;

  return (
    <AbsoluteFill style={{overflow: 'hidden', backgroundColor: theme.colors.bg}}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${focal[0] * 100}% ${focal[1] * 100}%`,
          scale: String(scale),
          translate: `${dx}px ${dy}px`,
          filter: grade,
        }}
      />
      {scrim > 0 ? (
        <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,${scrim * 0.6}) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 55%, rgba(0,0,0,${scrim}) 100%)`}} />
      ) : null}
    </AbsoluteFill>
  );
};
