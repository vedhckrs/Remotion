import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, SPRING, fr, idleFloat} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import type {BackgroundKind} from '../lib/styles';
import {useTheme} from '../lib/theme';
import {Background} from './Background';

/** Closing card: logo drops in, headline and CTA pill follow, subtle idle motion while held. */
export const EndCard: React.FC<{
  readonly headline: string;
  readonly cta?: string;
  readonly handle?: string;
  readonly logoSrc?: string;
  readonly accent?: string;
  readonly background?: BackgroundKind;
  readonly webglExtras?: boolean;
}> = ({headline, cta = 'Follow for more', handle, logoSrc, accent: accentProp, background = 'tonal', webglExtras = false}) => {
  const theme = useTheme();
  const accent = accentProp ?? theme.colors.accent;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {safe, unit, isVertical} = usePlatformLayout();

  const logo = spring({frame, fps, config: SPRING.silk});
  const title = spring({frame, fps, delay: fr(8, fps), config: SPRING.fluid});
  const pill = spring({frame, fps, delay: fr(16, fps), config: SPRING.snappy});
  const shimmer = interpolate(frame % fr(60, fps), [0, fr(60, fps)], [-120, 220], {easing: EASE.inOut});

  const titleSize = (isVertical ? 84 : 72) * unit;

  return (
    <AbsoluteFill>
      <Background kind={background} seed="end" grain={webglExtras ? 0.06 : 0} />
      <div
        style={{
          position: 'absolute',
          left: safe.x,
          top: safe.y,
          width: safe.width,
          height: safe.height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40 * unit,
          fontFamily: theme.fonts.display,
          color: theme.colors.text,
          textAlign: 'center',
        }}
      >
        {logoSrc ? (
          <Img src={logoSrc} style={{width: 200 * unit, opacity: logo, scale: String(0.7 + logo * 0.3), translate: `0px ${idleFloat(frame, 6 * unit, 50, 0, fps)}px`}} />
        ) : null}
        <div style={{fontSize: titleSize, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1, maxWidth: safe.width * 0.9, opacity: title, translate: `0px ${(1 - title) * 40 * unit}px`, textShadow: theme.shadow.text}}>{headline}</div>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            padding: `${22 * unit}px ${48 * unit}px`,
            borderRadius: 999,
            background: accent,
            fontSize: 40 * unit,
            fontWeight: 800,
            color: theme.colors.onAccent,
            opacity: pill,
            scale: String(0.8 + pill * 0.2),
            boxShadow: `0 20px 60px ${accent}66`,
          }}
        >
          {cta}
          <div style={{position: 'absolute', top: 0, bottom: 0, width: '30%', left: `${shimmer}%`, background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)'}} />
        </div>
        {handle ? <div style={{fontSize: 32 * unit, fontWeight: 500, color: theme.colors.muted, opacity: pill}}>{handle}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
