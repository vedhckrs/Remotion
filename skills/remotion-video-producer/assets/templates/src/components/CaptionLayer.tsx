import React, {useMemo} from 'react';
import {createTikTokStyleCaptions, type Caption, type TikTokPage} from '@remotion/captions';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {SPRING} from '../lib/motion';
import {usePlatformLayout, type PlatformId} from '../lib/platforms';
import {theme} from '../lib/theme';

export type CaptionStyle = 'karaoke' | 'pop' | 'boxed';

/**
 * Word-highlighted captions placed inside the platform safe zone.
 * Pass absolute captions (composition timeline, ms). Three looks:
 *  - karaoke: all words of the page visible, active word in accent
 *  - pop: words spring in, active word larger with glow
 *  - boxed: accent box follows the active word
 */
export const CaptionLayer: React.FC<{
  readonly captions: readonly Caption[];
  readonly style?: CaptionStyle;
  readonly platform?: PlatformId;
  readonly accent?: string;
  readonly fontSize?: number;
  readonly combineMs?: number;
  readonly breakOnSilenceMs?: number;
  readonly uppercase?: boolean;
  /** 0..1 vertical anchor inside the safe rect. Default sits in the lower band. */
  readonly anchorY?: number;
  readonly maxWidthRatio?: number;
}> = ({captions, style = 'pop', platform, accent = theme.colors.accent, fontSize, combineMs = 900, breakOnSilenceMs = 400, uppercase = false, anchorY, maxWidthRatio = 0.92}) => {
  const {fps} = useVideoConfig();
  const {safe, unit, isVertical} = usePlatformLayout(platform);

  const pages = useMemo(() => {
    if (captions.length === 0) return [] as TikTokPage[];
    return createTikTokStyleCaptions({captions: [...captions], combineTokensWithinMilliseconds: combineMs, breakOnSilenceAfterMilliseconds: breakOnSilenceMs}).pages;
  }, [captions, combineMs, breakOnSilenceMs]);

  const size = fontSize ?? (isVertical ? 64 : 44) * unit;
  const y = safe.y + safe.height * (anchorY ?? (isVertical ? 0.86 : 0.8));

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {pages.map((page, index) => {
        const next = pages[index + 1];
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const naturalEnd = Math.round(((page.startMs + page.durationMs) / 1000) * fps);
        const endFrame = next ? Math.min(Math.round((next.startMs / 1000) * fps), naturalEnd + Math.round(fps * 0.4)) : naturalEnd + Math.round(fps * 0.4);
        const durationInFrames = endFrame - startFrame;
        if (durationInFrames <= 0) return null;
        return (
          <Sequence key={`${page.startMs}-${index}`} from={startFrame} durationInFrames={durationInFrames} layout="none" name={`Caption ${index + 1}`}>
            <CaptionPage page={page} style={style} accent={accent} fontSize={size} uppercase={uppercase} centerX={safe.centerX} y={y} maxWidth={safe.width * maxWidthRatio} unit={unit} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{
  readonly page: TikTokPage;
  readonly style: CaptionStyle;
  readonly accent: string;
  readonly fontSize: number;
  readonly uppercase: boolean;
  readonly centerX: number;
  readonly y: number;
  readonly maxWidth: number;
  readonly unit: number;
}> = ({page, style, accent, fontSize, uppercase, centerX, y, maxWidth, unit}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;

  const enter = spring({frame, fps, config: SPRING.settle, durationInFrames: 8});

  return (
    <div
      style={{
        position: 'absolute',
        left: centerX - maxWidth / 2,
        top: y,
        width: maxWidth,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        columnGap: fontSize * 0.22,
        rowGap: fontSize * 0.12,
        translate: `0px ${-fontSize * 0.6}px`,
        fontFamily: theme.fonts.display,
        fontWeight: 900,
        fontSize,
        lineHeight: 1.1,
        letterSpacing: '-0.01em',
        textTransform: uppercase ? 'uppercase' : 'none',
        color: '#FFFFFF',
        opacity: style === 'karaoke' ? enter : 1,
        scale: style === 'karaoke' ? String(0.96 + enter * 0.04) : '1',
        WebkitTextStroke: style === 'boxed' ? undefined : `${Math.max(1, 2.5 * unit)}px rgba(0,0,0,0.55)`,
        paintOrder: 'stroke fill',
        textShadow: '0 4px 18px rgba(0,0,0,0.55)',
        whiteSpace: 'pre',
      }}
    >
      {page.tokens.map((token, i) => {
        const active = token.fromMs <= nowMs && token.toMs > nowMs;
        const spoken = token.toMs <= nowMs;
        const text = token.text.trim();
        if (!text) return null;

        if (style === 'pop') {
          const tokenStartFrame = ((token.fromMs - page.startMs) / 1000) * fps;
          const pop = spring({frame, fps, delay: Math.max(0, tokenStartFrame - 2), config: SPRING.bouncy, durationInFrames: 10});
          return (
            <span
              key={`${token.fromMs}-${i}`}
              style={{
                display: 'inline-block',
                color: active || spoken ? accent : '#FFFFFF',
                opacity: interpolate(pop, [0, 0.5], [0, 1], {extrapolateRight: 'clamp'}),
                scale: String(0.6 + pop * 0.4 + (active ? 0.08 : 0)),
                filter: active ? `drop-shadow(0 0 ${fontSize * 0.25}px ${accent})` : undefined,
              }}
            >
              {text}
            </span>
          );
        }

        if (style === 'boxed') {
          return (
            <span
              key={`${token.fromMs}-${i}`}
              style={{
                display: 'inline-block',
                padding: `${fontSize * 0.06}px ${fontSize * 0.18}px`,
                borderRadius: fontSize * 0.18,
                background: active ? accent : 'rgba(0,0,0,0.6)',
                color: '#FFFFFF',
                scale: String(active ? 1.06 : 1),
              }}
            >
              {text}
            </span>
          );
        }

        return (
          <span key={`${token.fromMs}-${i}`} style={{display: 'inline-block', color: active ? accent : '#FFFFFF', scale: String(active ? 1.08 : 1)}}>
            {text}
          </span>
        );
      })}
    </div>
  );
};
