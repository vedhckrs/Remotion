import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {fr} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import {useTheme} from '../lib/theme';
import {useIconCredits} from './Icon';

/**
 * Tiny ownership line for third-party logos and icons, inside the safe rect at the bottom edge:
 * "Logos: YouTube, Instagram (trademarks of their owners) · icons via Simple Icons (CC0)".
 * Keeps the video honest about sources; it does not replace brand-guideline compliance
 * (see references/icons-and-logos.md). Pass the icon keys used in this video ("set:name").
 */
export const AttributionBar: React.FC<{
  readonly used: readonly string[];
  readonly extra?: string;
  readonly opacity?: number;
  /** Fade in/out with the enclosing sequence (off for stills). */
  readonly fade?: boolean;
}> = ({used, extra, opacity = 0.6, fade: fadeEnabled = true}) => {
  const theme = useTheme();
  const credits = useIconCredits();
  const frame = useCurrentFrame();
  const {fps, durationInFrames, height} = useVideoConfig();
  const {safe, unit, isVertical} = usePlatformLayout();

  const usedCredits = credits.filter((c) => used.indexOf(`${c.set}:${c.name}`) !== -1);
  const brands = usedCredits.filter((c) => c.set === 'simple-icons' || c.set === 'logos');
  const sets = Array.from(new Set(usedCredits.map((c) => c.license)));
  if (usedCredits.length === 0 && !extra) return null;

  const parts: string[] = [];
  if (brands.length) parts.push(`Logos: ${brands.map((b) => b.title).join(', ')} are trademarks of their respective owners`);
  if (sets.length) parts.push(`Icons via ${Array.from(new Set(usedCredits.map((c) => (c.set === 'simple-icons' ? 'Simple Icons' : c.set === 'logos' ? 'SVG Logos' : c.set === 'lucide' ? 'Lucide' : c.set === 'tabler' ? 'Tabler' : c.set === 'fluent-emoji-flat' ? 'Fluent Emoji' : c.set)))).join(', ')} (${sets.join(', ')})`);
  if (extra) parts.push(extra);

  const fadeFrames = fr(12, fps);
  // Stills and very short sequences: no fade (the range would not be monotonic).
  const fade = fadeEnabled && durationInFrames > fadeFrames * 2 + 2 ? interpolate(frame, [0, fadeFrames, durationInFrames - fadeFrames - 1, durationInFrames - 1], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;

  return (
    <div
      style={{
        position: 'absolute',
        left: safe.x + safe.width * 0.05,
        width: safe.width * 0.9,
        bottom: height - (safe.y + safe.height) + 4 * unit,
        fontFamily: theme.fonts.body,
        fontSize: (isVertical ? 16 : 14) * unit,
        lineHeight: 1.25,
        color: theme.colors.text,
        opacity: opacity * fade,
        textAlign: 'center',
        textShadow: '0 1px 6px rgba(0,0,0,0.7)',
        maxHeight: (isVertical ? 16 : 14) * unit * 1.25 * 2,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {parts.join(' · ')}
    </div>
  );
};
