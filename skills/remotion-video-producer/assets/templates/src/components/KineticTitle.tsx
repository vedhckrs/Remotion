import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, SPRING} from '../lib/motion';
import {theme} from '../lib/theme';

/**
 * Word-by-word kinetic headline with a masked rise, spring settle and an
 * optional emphasized word. Exits before the scene ends when `exitAt` is given.
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
}> = ({
  text,
  highlight,
  fontSize = 96,
  color = theme.colors.text,
  highlightColor = theme.colors.accent,
  align = 'center',
  delay = 0,
  stagger = 3,
  exitAt,
  maxWidth = '100%',
  weight = 900,
  uppercase = false,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  const highlightWords = highlight ? highlight.toLowerCase().split(/\s+/) : [];

  const exit = exitAt === undefined ? 1 : interpolate(frame, [exitAt - 10, exitAt], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.in});

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
        const progress = spring({frame, fps, delay: delay + i * stagger, config: SPRING.soft});
        const isHighlight = highlightWords.indexOf(word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')) !== -1;
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
