import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';

/**
 * A CSS 3D camera rig. Children are <Layer depth={...}> planes; the rig applies perspective,
 * pan/tilt/roll and dolly so layers move with true parallax (nearer layers move more). No WebGL:
 * renders on every machine and previews at full speed. For real geometry use @remotion/three.
 *
 * Camera keyframes are in seconds: {at, pan, tilt, roll, dolly, x, y}. Values interpolate with an
 * ease-in-out between keyframes. `handheld` adds a small noise drift.
 */
export type CameraKeyframe = {
  readonly at: number;
  /** Rotation around Y in degrees (look left/right). */
  readonly pan?: number;
  /** Rotation around X in degrees (look up/down). */
  readonly tilt?: number;
  /** Rotation around Z in degrees. */
  readonly roll?: number;
  /** Move toward (+) or away from (-) the scene, in px along Z. */
  readonly dolly?: number;
  readonly x?: number;
  readonly y?: number;
};

const sample = (keys: readonly CameraKeyframe[], key: keyof Omit<CameraKeyframe, 'at'>, t: number): number => {
  if (keys.length === 0) return 0;
  const times = keys.map((k) => k.at);
  const values = keys.map((k) => k[key] ?? 0);
  if (keys.length === 1) return values[0];
  return interpolate(t, times, values, {easing: Easing.bezier(0.65, 0, 0.35, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
};

export const Camera3D: React.FC<{
  readonly keyframes?: readonly CameraKeyframe[];
  readonly perspective?: number;
  readonly handheld?: number;
  readonly seed?: string;
  readonly children: React.ReactNode;
}> = ({keyframes = [{at: 0}], perspective = 1400, handheld = 0, seed = 'cam', children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const pan = sample(keyframes, 'pan', t) + (handheld ? noise2D(`${seed}-pan`, t / 3, 0) * handheld * 0.6 : 0);
  const tilt = sample(keyframes, 'tilt', t) + (handheld ? noise2D(`${seed}-tilt`, t / 3, 1) * handheld * 0.4 : 0);
  const roll = sample(keyframes, 'roll', t) + (handheld ? noise2D(`${seed}-roll`, t / 4, 2) * handheld * 0.2 : 0);
  const dolly = sample(keyframes, 'dolly', t);
  const x = sample(keyframes, 'x', t) + (handheld ? noise2D(`${seed}-x`, t / 2, 3) * handheld * 4 : 0);
  const y = sample(keyframes, 'y', t) + (handheld ? noise2D(`${seed}-y`, t / 2, 4) * handheld * 4 : 0);

  return (
    <AbsoluteFill style={{perspective, perspectiveOrigin: '50% 50%', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          transformStyle: 'preserve-3d',
          transform: `translate3d(${x}px, ${y}px, ${dolly}px) rotateX(${tilt}deg) rotateY(${pan}deg) rotateZ(${roll}deg)`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A plane at `depth` px along Z. Negative = further away (moves less, appears smaller). */
export const Layer: React.FC<{readonly depth?: number; readonly style?: React.CSSProperties; readonly children?: React.ReactNode}> = ({depth = 0, style, children}) => (
  <AbsoluteFill style={{transform: `translateZ(${depth}px)`, transformStyle: 'preserve-3d', ...style}}>{children}</AbsoluteFill>
);

/** A card standing in 3D space with its own rotation; combine with <Layer> for product/UI shots. */
export const Card3D: React.FC<{
  readonly width: number;
  readonly height: number;
  readonly rotateX?: number;
  readonly rotateY?: number;
  readonly depth?: number;
  readonly style?: React.CSSProperties;
  readonly children?: React.ReactNode;
}> = ({width, height, rotateX = 0, rotateY = 0, depth = 0, style, children}) => (
  <div
    style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      width,
      height,
      marginLeft: -width / 2,
      marginTop: -height / 2,
      transform: `translateZ(${depth}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      transformStyle: 'preserve-3d',
      backfaceVisibility: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);
