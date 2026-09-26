import React from 'react';
import {Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {SPRING, fr, idleFloat} from '../lib/motion';
import {getLogoSlot, type LogoCorner, type PlatformId} from '../lib/platforms';
import {theme} from '../lib/theme';

/**
 * Logo or watermark placed in the platform-safe logo slot (see platforms.ts getLogoSlot):
 * top-left by default, clear of the Reels profile row, the Shorts rail and YouTube's end screen.
 * Accepts an image (SVG/PNG) or a text mark. Enters with a soft spring, floats gently, and can
 * be dimmed to watermark opacity.
 */
export const LogoBadge: React.FC<{
  readonly src?: string;
  readonly text?: string;
  readonly corner?: LogoCorner;
  readonly platform?: PlatformId;
  readonly scale?: number;
  readonly opacity?: number;
  readonly delay?: number;
  readonly accent?: string;
  readonly pill?: boolean;
}> = ({src, text, corner = 'top-left', platform, scale = 1, opacity = 0.92, delay = 6, accent = theme.colors.accent, pill = true}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const slot = getLogoSlot(width, height, corner, platform, scale);
  const enter = spring({frame, fps, delay: fr(delay, fps), config: SPRING.soft});
  const float = idleFloat(frame, slot.height * 0.03, 70, 0, fps);
  const unit = width / 1080;

  return (
    <div
      style={{
        position: 'absolute',
        left: slot.x,
        top: slot.y,
        height: slot.height,
        minWidth: slot.width,
        display: 'flex',
        alignItems: 'center',
        gap: 12 * unit,
        padding: pill && text ? `0 ${slot.height * 0.28}px` : 0,
        borderRadius: 999,
        background: pill && text ? 'rgba(0,0,0,0.42)' : 'transparent',
        backdropFilter: pill && text ? 'blur(12px)' : undefined,
        opacity: interpolate(enter, [0, 1], [0, opacity], {extrapolateRight: 'clamp'}),
        translate: `0px ${(1 - enter) * -slot.height * 0.4 + float}px`,
        scale: String(0.9 + enter * 0.1),
        pointerEvents: 'none',
      }}
    >
      {src ? <Img src={src} style={{height: slot.height * (pill && text ? 0.62 : 1), width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.45))'}} /> : null}
      {text ? (
        <span style={{fontFamily: theme.fonts.display, fontWeight: 800, fontSize: slot.height * 0.42, color: theme.colors.text, letterSpacing: '-0.01em', whiteSpace: 'nowrap'}}>
          <span style={{color: accent}}>●</span> {text}
        </span>
      ) : null}
    </div>
  );
};
