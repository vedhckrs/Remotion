import React from 'react';
import type {Caption} from '@remotion/captions';
import {TransitionSeries} from '@remotion/transitions';
import {zColor} from '@remotion/zod-types';
import {AbsoluteFill, Sequence, staticFile, type CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {AttributionBar} from '../components/AttributionBar';
import {CaptionLayer} from '../components/CaptionLayer';
import {EndCard} from '../components/EndCard';
import {ImpactFlash} from '../components/ImpactFlash';
import {LightLeakOverlay} from '../components/LightLeakOverlay';
import {LogoBadge} from '../components/LogoBadge';
import {LowerThird} from '../components/LowerThird';
import {MusicBed} from '../components/MusicBed';
import {SafeArea} from '../components/SafeArea';
import {GRADE_NAMES, Graded, type GradeName} from '../lib/grades';
import {PACING, fr, readingSeconds, type Pacing} from '../lib/motion';
import {PLATFORM_IDS} from '../lib/platforms';
import {absoluteCaptions, computeSceneTimings, fetchJson, manifestUrl, scriptUrl, totalFrames, voiceoverUrl, type SceneTiming, type VideoScript, type VoiceoverManifest} from '../lib/script';
import {BACKGROUND_KINDS, STYLE_IDS, getStyle, themeWith, type BackgroundKind, type CaptionStyleName} from '../lib/styles';
import {ThemeProvider} from '../lib/theme';
import {pickTransition, transitionTiming} from '../lib/transitions';
import {IconScene} from '../scenes/IconScene';
import {InfographicScene} from '../scenes/InfographicScene';
import {VoiceoverScene} from '../scenes/VoiceoverScene';

/**
 * Data-driven multi-scene video. One composition per platform in Root.tsx points at the same
 * component; calculateMetadata reads public/script/<videoId>.json and public/voiceover/<videoId>/
 * manifest.json, sizes every scene to its voice line (plus a pacing-dependent gap), picks
 * transitions per pacing, shifts captions onto the composition timeline, and applies the grade,
 * logo and music declared in the script or overridden by props.
 */
export const socialVideoSchema = z.object({
  videoId: z.string(),
  platform: z.enum(PLATFORM_IDS as [string, ...string[]]),
  /** Must match the <Composition fps>; calculateMetadata returns it. */
  fps: z.number().int().min(24).max(120),
  /** Style preset (src/lib/styles.ts). 'auto' takes it from the script, falling back to the default preset. */
  style: z.enum(['auto', ...STYLE_IDS] as [string, ...string[]]),
  /** null = the preset's accent. */
  accent: zColor().nullable(),
  /** 'auto' takes the pacing from the script, else from the style preset. */
  pacing: z.enum(['auto', 'fast', 'medium', 'calm']),
  /** 'auto' = the preset's caption style; 'none' hides captions. */
  captionStyle: z.enum(['auto', 'hormozi', 'pop', 'boxed', 'karaoke', 'outline', 'minimal', 'none']),
  /** 'auto' = script grade, else the preset's grade. */
  grade: z.enum(['auto', ...GRADE_NAMES] as [string, ...string[]]),
  /** 'auto' = script background, else the preset's background system. */
  background: z.enum(['auto', ...BACKGROUND_KINDS] as [string, ...string[]]),
  logo: z.object({src: z.string().nullable(), text: z.string().nullable(), corner: z.enum(['top-left', 'top-right', 'top-center', 'bottom-left'])}).nullable(),
  music: z.object({src: z.string(), level: z.number().min(0).max(1)}).nullable(),
  endCard: z.object({headline: z.string(), cta: z.string(), handle: z.string()}).nullable(),
  /** null = derive from pacing. */
  gapSeconds: z.number().min(0).max(3).nullable(),
  showSafeArea: z.boolean(),
  /** Light leak flare and film grain. WebGL only: render with --gl=angle (GPU) or --gl=swangle (no GPU). */
  webglExtras: z.boolean(),
  /** 'fluid' (default): smooth fades, glides, liquid wipes, iris. 'hard': slams, whips, glitch for hype cuts. */
  transitions: z.enum(['fluid', 'hard']),
});

export type SocialVideoProps = z.infer<typeof socialVideoSchema> & {
  /** Filled by calculateMetadata. */
  readonly script?: VideoScript;
  readonly manifest?: VoiceoverManifest | null;
  readonly timings?: readonly SceneTiming[];
  readonly captions?: readonly Caption[];
  readonly resolvedPacing?: Pacing;
  readonly transitionFrames?: number;
  readonly resolvedStyle?: string;
};

const END_CARD_SECONDS = 2.5;

export const calculateSocialVideoMetadata: CalculateMetadataFunction<SocialVideoProps> = async ({props, abortSignal}) => {
  const fps = props.fps;
  const script = await fetchJson<VideoScript>(scriptUrl(props.videoId), abortSignal);
  if (!script) {
    throw new Error(`Missing public/script/${props.videoId}.json. Write the scene plan first (SKILL.md Phase 2) or run scripts/analyze-script.mjs.`);
  }
  const manifest = await fetchJson<VoiceoverManifest>(manifestUrl(props.videoId), abortSignal);

  const preset = getStyle(props.style === 'auto' ? script.style : props.style);
  const resolvedPacing: Pacing = props.pacing === 'auto' ? script.pacing ?? preset.pacing : props.pacing;
  const pace = PACING[resolvedPacing];
  const gapSeconds = props.gapSeconds ?? pace.gapSeconds;
  const transitionFrames = fr(pace.transitionFrames, fps);

  // Without voiceover yet, estimate each scene from reading time so the layout can be built.
  const durations = script.scenes.map((scene) => {
    const fromManifest = manifest?.scenes.find((s) => s.id === scene.id)?.durationSeconds;
    return {id: scene.id, durationSeconds: fromManifest ?? readingSeconds(scene.voiceover, pace.wpm), minSeconds: scene.minSeconds};
  });
  if (props.endCard) {
    durations.push({id: '__end', durationSeconds: END_CARD_SECONDS, minSeconds: END_CARD_SECONDS});
  }

  const timings = computeSceneTimings(durations, fps, gapSeconds, transitionFrames);
  const captions = manifest ? absoluteCaptions(manifest, timings, fps) : [];

  return {
    durationInFrames: totalFrames(timings),
    fps,
    props: {...props, script, manifest, timings, captions, resolvedPacing, transitionFrames, resolvedStyle: preset.id},
    defaultOutName: `${props.videoId}_${props.platform}`,
  };
};

export const SocialVideo: React.FC<SocialVideoProps> = ({videoId, fps, style, accent: accentProp, captionStyle, grade, background, logo, music, endCard, showSafeArea, webglExtras, transitions: transitionFlavor = 'fluid', script, manifest, timings = [], captions = [], resolvedPacing = 'medium', transitionFrames = 12, resolvedStyle}) => {
  if (!script) return null;

  // Style preset -> theme (fonts, colors, caption look, grade, background). Props override per field.
  const preset = getStyle(resolvedStyle ?? (style === 'auto' ? script.style : style));
  const theme = themeWith(preset, {accent: accentProp});
  const accent = theme.colors.accent;
  const effectiveCaptionStyle: CaptionStyleName | 'none' = captionStyle === 'auto' ? preset.captionStyle : (captionStyle as CaptionStyleName | 'none');
  const effectiveGrade: GradeName = grade === 'auto' ? script.grade ?? preset.grade : (grade as GradeName);
  const effectiveBackground: BackgroundKind = background === 'auto' ? script.background ?? preset.background : (background as BackgroundKind);

  const scenes = script.scenes;
  const voiceSegments = timings
    .filter((t) => t.id !== '__end')
    .map((t) => ({startSeconds: t.startFrame / fps, endSeconds: (t.startFrame + t.voiceFrames) / fps}));
  const effectiveLogo = logo ?? script.logo ?? null;
  const effectiveMusic = music ?? (script.music?.src ? {src: script.music.src, level: script.music.level ?? 0.18} : null);
  const isFast = resolvedPacing === 'fast';

  // Third-party marks get a tiny ownership line while they are on screen (the whole video when the
  // channel logo itself is a third-party mark). Keys are "set:name" as in public/icons/credits.json.
  const iconKey = (ic: {set?: string; name: string}) => `${ic.set ?? 'simple-icons'}:${ic.name}`;
  const persistentIcons = script.logo?.icon ? [iconKey(script.logo.icon)] : [];
  const attributionRanges = persistentIcons.length
    ? [{from: 0, durationInFrames: totalFrames(timings), used: Array.from(new Set([...persistentIcons, ...scenes.flatMap((s) => (s.visual?.icons ?? []).map(iconKey))]))}]
    : timings
        .map((t, i) => ({from: t.startFrame, durationInFrames: t.baseFrames, used: (scenes[i]?.visual?.icons ?? []).map(iconKey)}))
        .filter((r) => r.used.length > 0);

  // Build the series as a flat array: sequence, transition, sequence, ...
  const items: React.ReactNode[] = [];
  timings.forEach((timing, i) => {
    const isEnd = timing.id === '__end';
    const scene = scenes[i];
    const manifestScene = manifest?.scenes.find((s) => s.id === timing.id);
    const audioSrc = manifestScene ? voiceoverUrl(videoId, manifestScene.file) : undefined;
    const chart = scene?.visual?.type === 'chart' ? scene.visual.chart : undefined;
    const icons = scene?.visual?.type === 'icons' ? scene.visual.icons : undefined;
    const sceneBackground = scene?.visual?.background ?? effectiveBackground;

    const body = isEnd && endCard ? (
      <EndCard headline={endCard.headline} cta={endCard.cta} handle={endCard.handle} background={effectiveBackground} webglExtras={webglExtras} />
    ) : chart ? (
      <InfographicScene scene={scene} chart={chart} audioSrc={audioSrc} index={i} pacing={resolvedPacing} background={scene.visual?.background ?? preset.dataBackground} webglExtras={webglExtras} />
    ) : icons && icons.length > 0 ? (
      <IconScene scene={scene} icons={icons} audioSrc={audioSrc} index={i} pacing={resolvedPacing} background={sceneBackground} />
    ) : (
      <VoiceoverScene scene={scene} audioSrc={audioSrc} index={i} pacing={resolvedPacing} background={sceneBackground} grade={effectiveGrade} webglExtras={webglExtras} />
    );

    const content =
      !isEnd && scene?.speaker ? (
        <>
          {body}
          <Sequence from={fr(10, fps)} durationInFrames={Math.max(1, timing.baseFrames - fr(10, fps))} layout="none" name={`Lower third ${scene.speaker.name}`}>
            <LowerThird name={scene.speaker.name} role={scene.speaker.role} durationInFrames={Math.max(1, timing.baseFrames - fr(10, fps))} />
          </Sequence>
        </>
      ) : (
        body
      );

    items.push(
      <TransitionSeries.Sequence key={`seq-${timing.id}`} durationInFrames={timing.sequenceFrames} name={isEnd ? 'End card' : `Scene ${scene.id}`} premountFor={fr(20, fps)}>
        {isFast && i > 0 ? (
          <ImpactFlash at={[0]} color={accent} opacity={transitionFlavor === 'hard' ? 0.35 : 0.12} length={4} bump={transitionFlavor === 'hard' ? 0.02 : 0.008}>
            {content}
          </ImpactFlash>
        ) : (
          content
        )}
      </TransitionSeries.Sequence>,
    );

    if (i < timings.length - 1) {
      items.push(<TransitionSeries.Transition key={`tr-${timing.id}`} presentation={pickTransition(resolvedPacing, i, transitionFlavor)} timing={transitionTiming(transitionFrames)} />);
    }
  });

  return (
    <ThemeProvider value={theme}>
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <Graded name={effectiveGrade}>
        <TransitionSeries>{items}</TransitionSeries>
      </Graded>

      {effectiveCaptionStyle !== 'none' && captions.length > 0 ? <CaptionLayer captions={captions} style={effectiveCaptionStyle} accent={accent} /> : null}

      {effectiveLogo && (effectiveLogo.src || effectiveLogo.text) ? <LogoBadge src={effectiveLogo.src ? staticFile(effectiveLogo.src) : undefined} text={effectiveLogo.text ?? undefined} corner={effectiveLogo.corner ?? 'top-left'} accent={accent} /> : null}

      {attributionRanges.map((r) => (
        <Sequence key={`credit-${r.from}`} from={r.from} durationInFrames={r.durationInFrames} layout="none" name="Logo credit">
          <AttributionBar used={r.used} />
        </Sequence>
      ))}

      {effectiveMusic ? <MusicBed src={staticFile(effectiveMusic.src)} segments={voiceSegments} musicLevel={effectiveMusic.level} duckedLevel={effectiveMusic.level * 0.4} /> : null}

      {/* Decorative flare on the first beat (WebGL). Remove if the brand is understated. */}
      {webglExtras ? (
        <AbsoluteFill style={{pointerEvents: 'none'}}>
          <TransitionSeries>
            <TransitionSeries.Sequence durationInFrames={1}>
              <AbsoluteFill />
            </TransitionSeries.Sequence>
            <TransitionSeries.Overlay durationInFrames={fr(28, fps)} offset={fr(14, fps)}>
              <LightLeakOverlay seed={2} hueShift={250} opacity={0.6} />
            </TransitionSeries.Overlay>
            <TransitionSeries.Sequence durationInFrames={Math.max(1, totalFrames(timings) - 1)}>
              <AbsoluteFill />
            </TransitionSeries.Sequence>
          </TransitionSeries>
        </AbsoluteFill>
      ) : null}

      <SafeArea debug={showSafeArea} />
    </AbsoluteFill>
    </ThemeProvider>
  );
};
