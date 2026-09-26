import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ensureContrast} from '../lib/color';
import {SPRING, fluid, fluidOut, fr, staggerDelay} from '../lib/motion';
import {useTheme} from '../lib/theme';

/**
 * Word-by-word kinetic headline with an optional emphasized word. Exits before the scene ends
 * when `exitAt` is given.
 *
 * motion="fluid" (default): each word condenses into place (rise + de-blur + settle on the
 * emphasized-decelerate curve, no overshoot) with a natural stagger that compresses toward the
 * last word; the exit accelerates away. motion="spring": the masked spring rise with a little
 * overshoot (energetic hooks). motion="punch": near-instant slams for fast cuts.
 * The highlight color is pushed to at least 3:1 against the theme background so an accent that
 * works on black still reads on cream.
 */
export const KineticTitle: React.FC<{
  readonly text: string;
  readonly highlight?: string;
  readonly fontSize?: number;
  readonly color?: string;
  readonly highlightColor?: string;
  readonly align?: 'left' | 'center';
  readonly delay?: number;
  readonly stagger?: number;
  /** Frame (scene-local) at which the exit animation should be finished. */
  readonly exitAt?: number;
  readonly maxWidth?: number | string;
  readonly weight?: number;
  readonly uppercase?: boolean;
  readonly motion?: 'fluid' | 'spring' | 'punch';
}> = ({
  text,
  highlight,
  fontSize = 96,
  color: colorProp,
  highlightColor: highlightProp,
  align = 'center',
  delay = 0,
  stagger = 3,
  exitAt,
  maxWidth = '100%',
  weight = 900,
  uppercase = false,
  motion = 'fluid',
}) => {
  const theme = useTheme();
  const color = colorProp ?? theme.colors.text;
  const highlightColor = ensureContrast(highlightProp ?? theme.colors.accent, theme.colors.bg, 3);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  const highlightWords = highlight ? highlight.toLowerCase().split(/\s+/) : [];

  const exit = exitAt === undefined ? 1 : fluidOut(frame, fps, exitAt, 10);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        columnGap: fontSize * 0.28,
        rowGap: fontSize * 0.04,
        maxWidth,
        fontFamily: theme.fonts.display,
        fontWeight: weight,
        fontSize,
        lineHeight: 1,
        letterSpacing: '-0.03em',
        color,
        textAlign: align,
        textTransform: uppercase ? 'uppercase' : 'none',
        textShadow: theme.shadow.text,
        opacity: exit,
        translate: `0px ${(1 - exit) * -fontSize * 0.25}px`,
      }}
    >
      {words.map((word, i) => {
        const isHighlight = highlightWords.indexOf(word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')) !== -1;
        if (motion === 'fluid') {
          // Natural stagger across the line, then each word condenses: rise + de-blur + settle, no overshoot.
          const wordDelay = delay + staggerDelay(i, words.length, stagger * Math.max(1, words.length - 1));
          const p = fluid(frame, fps, {delay: wordDelay, duration: 20});
          const blur = (1 - p) * fontSize * 0.08;
          return (
            <span
              key={`${word}-${i}`}
              style={{
                display: 'inline-block',
                color: isHighlight ? highlightColor : undefined,
                opacity: interpolate(p, [0, 0.55], [0, 1], {extrapolateRight: 'clamp'}),
                translate: `0px ${(1 - p) * fontSize * 0.45}px`,
                scale: String(0.94 + p * 0.06),
                filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
              }}
            >
              {word}
            </span>
          );
        }
        const progress = spring({frame, fps, delay: fr(delay + i * stagger, fps), config: motion === 'punch' ? SPRING.punch : SPRING.soft});
        return (
          <span key={`${word}-${i}`} style={{display: 'inline-block', overflow: 'hidden', paddingBottom: fontSize * 0.12, marginBottom: -fontSize * 0.12}}>
            <span
              style={{
                display: 'inline-block',
                color: isHighlight ? highlightColor : undefined,
                opacity: interpolate(progress, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'}),
                translate: `0px ${(1 - progress) * fontSize * 0.9}px`,
                rotate: `${(1 - progress) * 4}deg`,
                scale: String(isHighlight ? 1 + (1 - Math.abs(progress - 0.7) / 0.7) * 0.04 : 1),
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </div>
  );
};
