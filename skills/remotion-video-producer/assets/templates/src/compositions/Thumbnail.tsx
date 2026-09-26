import React from 'react';
import {zColor} from '@remotion/zod-types';
import {AbsoluteFill, Img, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {AttributionBar} from '../components/AttributionBar';
import {Background} from '../components/Background';
import {BrandLogo, type IconSet} from '../components/Icon';
import {LogoBadge} from '../components/LogoBadge';
import {fetchJson, scriptUrl, type IconSpec, type VideoScript} from '../lib/script';
import {STYLE_IDS, getStyle, themeWith} from '../lib/styles';
import {ThemeProvider, useTheme} from '../lib/theme';

/**
 * Click-through thumbnail / cover, one Still per format, styled by the same preset as the video:
 *  - youtube  1280x720   big 3-5 word line, accent block, brand marks on the right, channel badge
 *  - cover    1080x1920  Shorts / Reels cover: line in the upper third, marks below (safe for UI)
 *  - square   1080x1080  Feed / Facebook post
 * Text comes from script.seo.thumbnailText (Claude writes it: a curiosity gap, not the title),
 * or `text`. `highlight` picks the accent word (default: last word). Hero photo optional.
 * Rendered by scripts/make-thumbnails.mjs (JPEG <= 2 MB as YouTube requires).
 */
export const thumbnailSchema = z.object({
  videoId: z.string(),
  variant: z.enum(['youtube', 'cover', 'square']),
  style: z.enum(['auto', ...STYLE_IDS] as [string, ...string[]]),
  accent: zColor().nullable(),
  /** null = script.seo.thumbnailText, then script.title. */
  text: z.string().nullable(),
  highlight: z.string().nullable(),
  /** Optional hero image under public/ (person, product); gets a scrim so text stays legible. */
  image: z.string().nullable(),
  /** Show up to three brand marks used in the script. */
  showLogos: z.boolean(),
  /** Which frame of the animated background to freeze (variety across A/B variants). */
  backgroundFrame: z.number().int().min(0),
});

export type ThumbnailProps = z.infer<typeof thumbnailSchema> & {readonly script?: VideoScript};

export const calculateThumbnailMetadata: CalculateMetadataFunction<ThumbnailProps> = async ({props, abortSignal}) => {
  const script = await fetchJson<VideoScript>(scriptUrl(props.videoId), abortSignal);
  if (!script) throw new Error(`Missing public/script/${props.videoId}.json`);
  return {props: {...props, script}, defaultOutName: `${props.videoId}_thumb_${props.variant}`};
};

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/gi, '');

/** Marks the highlight word (or the last word when the highlight is absent or not in the line). */
const splitHighlight = (text: string, highlight: string | null) => {
  const words = text.trim().split(/\s+/);
  const wanted = highlight ? highlight.split(/\s+/).map(norm) : [];
  const found = wanted.length > 0 && words.some((w) => wanted.indexOf(norm(w)) !== -1);
  return words.map((w, i) => ({word: w, hot: found ? wanted.indexOf(norm(w)) !== -1 : i === words.length - 1}));
};

const Inner: React.FC<ThumbnailProps & {readonly script: VideoScript}> = ({variant, text, highlight, image, showLogos, script}) => {
  const theme = useTheme();
  const preset = getStyle(script.style);
  const {width, height} = useVideoConfig();
  const unit = width / 1280;
  const isCover = variant === 'cover';
  const line = text ?? script.seo?.thumbnailText ?? script.title ?? script.scenes[0]?.headline ?? '';
  const words = splitHighlight(preset.thumbnail.textCase === 'upper' ? line.toUpperCase() : line, highlight ?? script.scenes[0]?.highlight ?? null);

  const icons: IconSpec[] = [];
  for (const scene of script.scenes) for (const ic of scene.visual?.icons ?? []) if ((ic.set ?? 'simple-icons') === 'simple-icons' || ic.set === 'logos') icons.push(ic);
  const marks = showLogos ? icons.filter((ic, i, arr) => arr.findIndex((o) => o.name === ic.name) === i).slice(0, 3) : [];
  const usedKeys = marks.map((ic) => `${ic.set ?? 'simple-icons'}:${ic.name}`);

  const fontSize = (isCover ? 200 : variant === 'square' ? 150 : 168) * unit * (line.length > 24 ? 0.8 : 1);
  const pad = 64 * unit;
  const creditSpace = usedKeys.length ? 44 * unit : 0;

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg, fontFamily: preset.thumbnail.font, color: theme.colors.text}}>
      <Background kind={preset.background} seed={`thumb-${variant}`} />
      {image ? (
        <AbsoluteFill>
          <Img src={staticFile(image)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: isCover ? '50% 20%' : '70% 50%'}} />
          <AbsoluteFill style={{background: isCover ? `linear-gradient(180deg, ${theme.colors.bg}EE 0%, ${theme.colors.bg}55 45%, ${theme.colors.bg}F2 100%)` : `linear-gradient(90deg, ${theme.colors.bg}F5 0%, ${theme.colors.bg}CC 45%, ${theme.colors.bg}22 100%)`}} />
        </AbsoluteFill>
      ) : null}

      {/* Headline block */}
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: isCover ? pad : marks.length ? width * 0.3 : pad,
          top: isCover ? height * 0.25 : undefined,
          bottom: isCover ? undefined : pad * 1.2 + creditSpace,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-end',
          gap: `${fontSize * 0.04}px ${fontSize * 0.22}px`,
          fontSize,
          fontWeight: 900,
          lineHeight: 0.98,
          letterSpacing: preset.thumbnail.textCase === 'upper' ? '-0.01em' : '-0.04em',
          textShadow: '0 6px 30px rgba(0,0,0,0.55)',
        }}
      >
        {words.map(({word, hot}, i) =>
          hot && preset.thumbnail.accentBlock ? (
            <span key={i} style={{background: theme.colors.accent, color: '#fff', padding: `${fontSize * 0.04}px ${fontSize * 0.14}px`, borderRadius: fontSize * 0.08, rotate: '-2deg', display: 'inline-block', boxShadow: `0 12px 40px ${theme.colors.accent}66`}}>
              {word}
            </span>
          ) : (
            <span key={i} style={{color: hot ? theme.colors.accent : theme.colors.text}}>{word}</span>
          ),
        )}
      </div>

      {/* Brand marks */}
      {marks.length ? (
        <div
          style={{
            position: 'absolute',
            right: isCover ? undefined : pad,
            left: isCover ? '50%' : undefined,
            translate: isCover ? '-50% 0' : undefined,
            top: isCover ? height * 0.56 : '50%',
            transform: isCover ? undefined : 'translateY(-50%)',
            display: 'flex',
            flexDirection: isCover || marks.length === 1 ? 'row' : 'column',
            gap: 28 * unit,
            alignItems: 'center',
          }}
        >
          {marks.map((ic, i) => (
            <BrandLogo key={`${ic.name}-${i}`} name={ic.name} set={(ic.set ?? 'simple-icons') as Extract<IconSet, 'simple-icons' | 'logos'>} size={(marks.length === 1 ? 260 : isCover ? 190 : 150) * unit} animate="none" glow />
          ))}
        </div>
      ) : null}

      {script.logo?.text || script.logo?.src ? <LogoBadge text={script.logo.text ?? undefined} src={script.logo.src ? staticFile(script.logo.src) : undefined} corner={isCover ? 'top-left' : 'top-left'} delay={0} scale={isCover ? 1 : 1.1} /> : null}
      {usedKeys.length ? <AttributionBar used={usedKeys} opacity={0.5} fade={false} /> : null}
    </AbsoluteFill>
  );
};

export const Thumbnail: React.FC<ThumbnailProps> = (props) => {
  if (!props.script) return null;
  const theme = themeWith(getStyle(props.style === 'auto' ? props.script.style : props.style), {accent: props.accent});
  return (
    <ThemeProvider value={theme}>
      {/* Negative offset freezes the animated background at a livelier frame. */}
      <Sequence from={-props.backgroundFrame} layout="none">
        <Inner {...props} script={props.script} />
      </Sequence>
    </ThemeProvider>
  );
};
