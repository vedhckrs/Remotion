import React from 'react';
import {AbsoluteFill} from 'remotion';
import {usePlatformLayout, type PlatformId} from '../lib/platforms';

/**
 * Debug overlay showing the platform-safe rectangle and a caption band.
 * Render it last inside the composition and switch it off for delivery.
 */
export const SafeArea: React.FC<{
  readonly platform?: PlatformId;
  readonly debug?: boolean;
  readonly color?: string;
}> = ({platform, debug = false, color = '#22D3EE'}) => {
  const {safe, unit, isVertical, width} = usePlatformLayout(platform);
  if (!debug) return null;

  const captionTop = isVertical ? safe.y + safe.height * 0.78 : safe.y + safe.height * 0.72;
  const captionHeight = isVertical ? safe.height * 0.17 : safe.height * 0.16;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: safe.x,
          top: safe.y,
          width: safe.width,
          height: safe.height,
          outline: `${2 * unit}px dashed ${color}`,
          outlineOffset: -2 * unit,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: safe.x,
          top: captionTop,
          width: safe.width,
          height: captionHeight,
          background: `${color}22`,
          borderTop: `${1 * unit}px solid ${color}`,
          borderBottom: `${1 * unit}px solid ${color}`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: safe.x,
          top: safe.y - 34 * unit,
          fontFamily: 'monospace',
          fontSize: 22 * unit,
          color,
          background: 'rgba(0,0,0,0.6)',
          padding: `${4 * unit}px ${10 * unit}px`,
        }}
      >
        {platform ?? 'auto'} safe {Math.round(safe.width)}x{Math.round(safe.height)} of {width}
      </div>
    </AbsoluteFill>
  );
};
