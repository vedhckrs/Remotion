import React, {useMemo} from 'react';
import {createTikTokStyleCaptions, type Caption, type TikTokPage} from '@remotion/captions';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {isDark, readableOn} from '../lib/color';
import {SPRING, fr} from '../lib/motion';
import {getCaptionBand, usePlatformLayout, type PlatformId} from '../lib/platforms';
import {useTheme} from '../lib/theme';

/**
 * Word-highlighted captions inside the platform caption band. Six looks, researched from the
 * styles that dominate Shorts/Reels in 2026 (see references/captions.md):
 *  - hormozi : Montserrat 900, uppercase, white with black stroke + hard shadow, active word yellow
 *  - pop     : words spring in one by one, active word larger with a glow (energetic UGC)
 *  - boxed   : accent pill follows the active word (brand/ad content, best legibility on footage)
 *  - karaoke : whole page visible, active word in accent (educational, calm)
 *  - outline : heavy stroke, no fill change; clean over busy footage
 *  - minimal : lowercase, dark translucent bar behind the line; active word white, others dimmed
 */
export type CaptionStyle = 'hormozi' | 'pop' | 'boxed' | 'karaoke' | 'outline' | 'minimal';

const STYLE_DEFAULTS: Record<CaptionStyle, {font: 'display' | 'caption' | 'impact'; uppercase: boolean; combineMs: number; weight: number}> = {
  hormozi: {font: 'caption', uppercase: true, combineMs: 800, weight: 900},
  pop: {font: 'caption', uppercase: false, combineMs: 900, weight: 900},
  boxed: {font: 'display', uppercase: false, combineMs: 1000, weight: 800},
  karaoke: {font: 'display', uppercase: false, combineMs: 1400, weight: 800},
  outline: {font: 'impact', uppercase: true, combineMs: 900, weight: 400},
  minimal: {font: 'display', uppercase: false, combineMs: 1500, weight: 600},
};

export const CaptionLayer: React.FC<{
  readonly captions: readonly Caption[];
  readonly style?: CaptionStyle;
  readonly platform?: PlatformId;
  readonly accent?: string;
  readonly highlight?: string;
  readonly fontSize?: number;
  readonly combineMs?: number;
  readonly breakOnSilenceMs?: number;
  readonly uppercase?: boolean;
  /** 0..1 vertical anchor inside the caption band (0 = top of band). */
  readonly anchorY?: number;
  readonly maxWidthRatio?: number;
}> = ({captions, style = 'hormozi', platform, accent: accentProp, highlight: highlightProp, fontSize, combineMs, breakOnSilenceMs = 400, uppercase, anchorY = 0.35, maxWidthRatio = 0.92}) => {
  const theme = useTheme();
  const accent = accentProp ?? theme.colors.accent;
  const highlight = highlightProp ?? theme.colors.highlight;
  const {fps, width, height} = useVideoConfig();
  const {unit, isVertical} = usePlatformLayout(platform);
  const defaults = STYLE_DEFAULTS[style];
  const band = getCaptionBand(width, height, platform);

  const pages = useMemo(() => {
    if (captions.length === 0) return [] as TikTokPage[];
    return createTikTokStyleCaptions({captions: [...captions], combineTokensWithinMilliseconds: combineMs ?? defaults.combineMs, breakOnSilenceAfterMilliseconds: breakOnSilenceMs}).pages;
  }, [captions, combineMs, defaults.combineMs, breakOnSilenceMs]);

  const size = fontSize ?? (isVertical ? (style === 'hormozi' || style === 'outline' ? 68 : 62) : 44) * unit;
  const y = band.y + band.height * anchorY;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {pages.map((page, index) => {
        const next = pages[index + 1];
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const naturalEnd = Math.round(((page.startMs + page.durationMs) / 1000) * fps);
        const hold = Math.round(fps * 0.4);
        const endFrame = next ? Math.min(Math.round((next.startMs / 1000) * fps), naturalEnd + hold) : naturalEnd + hold;
        const durationInFrames = endFrame - startFrame;
        if (durationInFrames <= 0) return null;
        return (
          <Sequence key={`${page.startMs}-${index}`} from={startFrame} durationInFrames={durationInFrames} layout="none" name={`Caption ${index + 1}`}>
            <CaptionPage page={page} style={style} accent={accent} highlight={highlight} fontSize={size} font={defaults.font} weight={defaults.weight} uppercase={uppercase ?? defaults.uppercase} centerX={band.x + band.width / 2} y={y} maxWidth={band.width * maxWidthRatio} unit={unit} />
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
  readonly highlight: string;
  readonly fontSize: number;
  readonly font: 'display' | 'caption' | 'impact';
  readonly weight: number;
  readonly uppercase: boolean;
  readonly centerX: number;
  readonly y: number;
  readonly maxWidth: number;
  readonly unit: number;
}> = ({page, style, accent, highlight, fontSize, font, weight, uppercase, centerX, y, maxWidth, unit}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  const enter = spring({frame, fps, config: style === 'hormozi' || style === 'outline' ? SPRING.punch : SPRING.snappy, durationInFrames: fr(style === 'hormozi' ? 7 : 10, fps)});
  const stroke = Math.max(1, (style === 'hormozi' ? 3.5 : style === 'outline' ? 5 : 2.5) * unit);
  // Stroked styles are white-on-black-stroke and read on anything. Filled styles adapt to the theme.
  const dark = isDark(theme.colors.bg);
  const bar = dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.88)';
  const onBar = readableOn(dark ? '#000000' : '#FFFFFF');
  const onAccent = theme.colors.onAccent;

  const base: React.CSSProperties = {
    position: 'absolute',
    left: centerX - maxWidth / 2,
    top: y,
    width: maxWidth,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    // Stroked, hard-shadowed styles eat into the gap (stroke + 4 px shadow), so they get a wider one.
    columnGap: fontSize * (style === 'hormozi' || style === 'outline' ? 0.38 : 0.24),
    rowGap: fontSize * 0.14,
    translate: `0px ${-fontSize * 0.6}px`,
    fontFamily: theme.fonts[font],
    fontWeight: weight,
    fontSize,
    lineHeight: 1.1,
    letterSpacing: style === 'outline' ? '0.02em' : '-0.01em',
    textTransform: uppercase ? 'uppercase' : 'none',
    color: '#FFFFFF',
    whiteSpace: 'pre',
    paintOrder: 'stroke fill',
  };

  if (style === 'minimal') {
    return (
      <div style={{...base, opacity: enter, translate: `0px ${-fontSize * 0.6 + (1 - enter) * fontSize * 0.3}px`}}>
        <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: fontSize * 0.22, padding: `${fontSize * 0.18}px ${fontSize * 0.5}px`, borderRadius: fontSize * 0.35, background: bar, backdropFilter: 'blur(10px)'}}>
          {page.tokens.map((token, i) => {
            const active = token.fromMs <= nowMs && token.toMs > nowMs;
            const spoken = token.toMs <= nowMs;
            const text = token.text.trim();
            if (!text) return null;
            return (
              <span key={`${token.fromMs}-${i}`} style={{color: active || spoken ? onBar : dark ? 'rgba(255,255,255,0.55)' : 'rgba(17,17,17,0.5)', textTransform: 'lowercase'}}>
                {text}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        opacity: style === 'karaoke' || style === 'hormozi' || style === 'outline' ? enter : 1,
        scale: style === 'hormozi' ? String(0.92 + enter * 0.08) : '1',
        WebkitTextStroke: style === 'boxed' ? undefined : `${stroke}px rgba(0,0,0,0.9)`,
        textShadow: style === 'hormozi' ? `${4 * unit}px ${4 * unit}px 0 rgba(0,0,0,0.85), 0 ${6 * unit}px ${18 * unit}px rgba(0,0,0,0.5)` : style === 'boxed' ? undefined : `0 ${4 * unit}px ${18 * unit}px rgba(0,0,0,0.55)`,
      }}
    >
      {page.tokens.map((token, i) => {
        const active = token.fromMs <= nowMs && token.toMs > nowMs;
        const spoken = token.toMs <= nowMs;
        const text = token.text.trim();
        if (!text) return null;
        const tokenStartFrame = ((token.fromMs - page.startMs) / 1000) * fps;

        if (style === 'hormozi') {
          const hit = spring({frame, fps, delay: Math.max(0, tokenStartFrame), config: SPRING.punch, durationInFrames: fr(6, fps)});
          return (
            <span key={`${token.fromMs}-${i}`} style={{display: 'inline-block', color: active || spoken ? highlight : '#FFFFFF', scale: String(1 + (active ? 0.1 * hit : 0)), rotate: active ? `${(i % 2 === 0 ? -1 : 1) * 1.5 * hit}deg` : '0deg'}}>
              {text}
            </span>
          );
        }
        if (style === 'pop') {
          const pop = spring({frame, fps, delay: Math.max(0, tokenStartFrame - 2), config: SPRING.bouncy, durationInFrames: fr(10, fps)});
          return (
            <span key={`${token.fromMs}-${i}`} style={{display: 'inline-block', color: active || spoken ? accent : '#FFFFFF', opacity: interpolate(pop, [0, 0.5], [0, 1], {extrapolateRight: 'clamp'}), scale: String(0.6 + pop * 0.4 + (active ? 0.08 : 0)), filter: active ? `drop-shadow(0 0 ${fontSize * 0.25}px ${accent})` : undefined}}>
              {text}
            </span>
          );
        }
        if (style === 'boxed') {
          return (
            <span key={`${token.fromMs}-${i}`} style={{display: 'inline-block', padding: `${fontSize * 0.06}px ${fontSize * 0.18}px`, borderRadius: fontSize * 0.18, background: active ? accent : bar, color: active ? onAccent : onBar, scale: String(active ? 1.06 : 1)}}>
              {text}
            </span>
          );
        }
        if (style === 'outline') {
          return (
            <span key={`${token.fromMs}-${i}`} style={{display: 'inline-block', color: active ? highlight : '#FFFFFF', scale: String(active ? 1.06 : 1)}}>
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
