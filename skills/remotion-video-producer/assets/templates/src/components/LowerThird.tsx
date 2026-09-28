import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, SPRING, fr} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import {useTheme} from '../lib/theme';

/**
 * Broadcast-style lower third: accent bar grows, name and role rise out of a mask,
 * everything slides away before `durationInFrames` ends.
 */
export const LowerThird: React.FC<{
  readonly name: string;
  readonly role?: string;
  readonly accent?: string;
  readonly durationInFrames: number;
  readonly side?: 'left' | 'right';
}> = ({name, role, accent: accentProp, durationInFrames, side = 'left'}) => {
  const theme = useTheme();
  const accent = accentProp ?? theme.colors.accent;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {safe, unit, isVertical} = usePlatformLayout();

  const bar = spring({frame, fps, config: SPRING.settle, durationInFrames: fr(14, fps)});
  const textIn = spring({frame, fps, delay: fr(6, fps), config: SPRING.soft});
  const out = interpolate(frame, [durationInFrames - fr(12, fps), durationInFrames - fr(2, fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.in});

  const nameSize = (isVertical ? 44 : 48) * unit;
  const roleSize = (isVertical ? 28 : 32) * unit;
  const bottom = isVertical ? safe.y + safe.height - 40 * unit : safe.y + safe.height - 60 * unit;

  return (
    <div
      style={{
        position: 'absolute',
        [side]: safe.x,
        top: bottom - nameSize * 2.6,
        display: 'flex',
        alignItems: 'stretch',
        gap: 18 * unit,
        opacity: 1 - out,
        translate: `${(side === 'left' ? -1 : 1) * out * 60 * unit}px 0px`,
      }}
    >
      <div style={{width: 10 * unit, borderRadius: 6 * unit, background: accent, scale: `1 ${bar}`, transformOrigin: 'bottom'}} />
      <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 * unit, fontFamily: theme.fonts.display, color: theme.colors.text}}>
        <div style={{overflow: 'hidden'}}>
          <div style={{fontSize: nameSize, fontWeight: 800, letterSpacing: '-0.02em', translate: `0px ${(1 - textIn) * nameSize}px`, textShadow: theme.shadow.text}}>{name}</div>
        </div>
        {role ? (
          <div style={{overflow: 'hidden'}}>
            <div style={{fontSize: roleSize, fontWeight: 500, color: theme.colors.muted, translate: `0px ${(1 - textIn) * roleSize * 1.2}px`, opacity: interpolate(textIn, [0.3, 1], [0, 1], {extrapolateLeft: 'clamp'})}}>{role}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
