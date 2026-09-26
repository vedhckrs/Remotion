import React from 'react';
import type {Caption} from '@remotion/captions';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {zColor} from '@remotion/zod-types';
import {AbsoluteFill, staticFile, type CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {CaptionLayer} from '../components/CaptionLayer';
import {EndCard} from '../components/EndCard';
import {ImpactFlash} from '../components/ImpactFlash';
import {LightLeakOverlay} from '../components/LightLeakOverlay';
import {LogoBadge} from '../components/LogoBadge';
import {MusicBed} from '../components/MusicBed';
import {SafeArea} from '../components/SafeArea';
import {GRADE_NAMES, Graded} from '../lib/grades';
import {PACING, fr, type Pacing} from '../lib/motion';
import {PLATFORM_IDS} from '../lib/platforms';
import {absoluteCaptions, computeSceneTimings, fetchJson, manifestUrl, scriptUrl, totalFrames, voiceoverUrl, type SceneTiming, type VideoScript, type VoiceoverManifest} from '../lib/script';
import {pickTransition} from '../lib/transitions';
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
  accent: zColor(),
  /** 'auto' takes the pacing from the script (default medium). */
  pacing: z.enum(['auto', 'fast', 'medium', 'calm']),
  captionStyle: z.enum(['hormozi', 'pop', 'boxed', 'karaoke', 'outline', 'minimal', 'none']),
  grade: z.enum(GRADE_NAMES as [string, ...string[]]),
  logo: z.object({src: z.string().nullable(), text: z.string().nullable(), corner: z.enum(['top-left', 'top-right', 'top-center', 'bottom-left'])}).nullable(),
  music: z.object({src: z.string(), level: z.number().min(0).max(1)}).nullable(),
  endCard: z.object({headline: z.string(), cta: z.string(), handle: z.string()}).nullable(),
  /** null = derive from pacing. */
  gapSeconds: z.number().min(0).max(3).nullable(),
  showSafeArea: z.boolean(),
  /** Light leak flare and film grain. WebGL only: render with --gl=angle (GPU) or --gl=swangle (no GPU). */
  webglExtras: z.boolean(),
});

export type SocialVideoProps = z.infer<typeof socialVideoSchema> & {
  /** Filled by calculateMetadata. */
  readonly script?: VideoScript;
  readonly manifest?: VoiceoverManifest | null;
  readonly timings?: readonly SceneTiming[];
  readonly captions?: readonly Caption[];
  readonly resolvedPacing?: Pacing;
  readonly transitionFrames?: number;
};

const END_CARD_SECONDS = 2.5;

export const calculateSocialVideoMetadata: CalculateMetadataFunction<SocialVideoProps> = async ({props, abortSignal}) => {
  const fps = props.fps;
  const script = await fetchJson<VideoScript>(scriptUrl(props.videoId), abortSignal);
  if (!script) {
    throw new Error(`Missing public/script/${props.videoId}.json. Write the scene plan first (SKILL.md Phase 2) or run scripts/analyze-script.mjs.`);
  }
  const manifest = await fetchJson<VoiceoverManifest>(manifestUrl(props.videoId), abortSignal);

  const resolvedPacing: Pacing = props.pacing === 'auto' ? script.pacing ?? 'medium' : props.pacing;
  const pace = PACING[resolvedPacing];
  const gapSeconds = props.gapSeconds ?? pace.gapSeconds;
  const transitionFrames = fr(pace.transitionFrames, fps);

  // Without voiceover yet, estimate each scene from reading time so the layout can be built.
  const durations = script.scenes.map((scene) => {
    const fromManifest = manifest?.scenes.find((s) => s.id === scene.id)?.durationSeconds;
    const estimate = 0.6 + (scene.voiceover.trim().split(/\s+/).length * 60) / pace.wpm;
    return {id: scene.id, durationSeconds: fromManifest ?? estimate, minSeconds: scene.minSeconds};
  });
  if (props.endCard) {
    durations.push({id: '__end', durationSeconds: END_CARD_SECONDS, minSeconds: END_CARD_SECONDS});
  }

  const timings = computeSceneTimings(durations, fps, gapSeconds, transitionFrames);
  const captions = manifest ? absoluteCaptions(manifest, timings, fps) : [];

  return {
    durationInFrames: totalFrames(timings),
    fps,
    props: {...props, script, manifest, timings, captions, resolvedPacing, transitionFrames},
    defaultOutName: `${props.videoId}_${props.platform}`,
  };
};

export const SocialVideo: React.FC<SocialVideoProps> = ({videoId, fps, accent, captionStyle, grade, logo, music, endCard, showSafeArea, webglExtras, script, manifest, timings = [], captions = [], resolvedPacing = 'medium', transitionFrames = 12}) => {
  if (!script) return null;

  const scenes = script.scenes;
  const voiceSegments = timings
    .filter((t) => t.id !== '__end')
    .map((t) => ({startSeconds: t.startFrame / fps, endSeconds: (t.startFrame + t.voiceFrames) / fps}));
  const effectiveLogo = logo ?? script.logo ?? null;
  const effectiveMusic = music ?? (script.music?.src ? {src: script.music.src, level: script.music.level ?? 0.18} : null);
  const effectiveGrade = grade !== 'none' ? grade : script.grade ?? 'none';
  const isFast = resolvedPacing === 'fast';

  // Build the series as a flat array: sequence, transition, sequence, ...
  const items: React.ReactNode[] = [];
  timings.forEach((timing, i) => {
    const isEnd = timing.id === '__end';
    const scene = scenes[i];
    const manifestScene = manifest?.scenes.find((s) => s.id === timing.id);
    const audioSrc = manifestScene ? voiceoverUrl(videoId, manifestScene.file) : undefined;
    const chart = scene?.visual?.type === 'chart' ? scene.visual.chart : undefined;

    const content = isEnd && endCard ? (
      <EndCard headline={endCard.headline} cta={endCard.cta} handle={endCard.handle} accent={accent} webglExtras={webglExtras} />
    ) : chart ? (
      <InfographicScene scene={scene} chart={chart} audioSrc={audioSrc} accent={accent} index={i} pacing={resolvedPacing} webglExtras={webglExtras} />
    ) : (
      <VoiceoverScene scene={scene} audioSrc={audioSrc} accent={accent} index={i} pacing={resolvedPacing} webglExtras={webglExtras} />
    );

    items.push(
      <TransitionSeries.Sequence key={`seq-${timing.id}`} durationInFrames={timing.sequenceFrames} name={isEnd ? 'End card' : `Scene ${scene.id}`} premountFor={fr(20, fps)}>
        {isFast && i > 0 ? (
          <ImpactFlash at={[0]} color={accent} opacity={0.35} length={4} bump={0.02}>
            {content}
          </ImpactFlash>
        ) : (
          content
        )}
      </TransitionSeries.Sequence>,
    );

    if (i < timings.length - 1) {
      items.push(<TransitionSeries.Transition key={`tr-${timing.id}`} presentation={pickTransition(resolvedPacing, i)} timing={linearTiming({durationInFrames: transitionFrames})} />);
    }
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <Graded name={effectiveGrade as never}>
        <TransitionSeries>{items}</TransitionSeries>
      </Graded>

      {captionStyle !== 'none' && captions.length > 0 ? <CaptionLayer captions={captions} style={captionStyle} accent={accent} /> : null}

      {effectiveLogo && (effectiveLogo.src || effectiveLogo.text) ? <LogoBadge src={effectiveLogo.src ? staticFile(effectiveLogo.src) : undefined} text={effectiveLogo.text ?? undefined} corner={effectiveLogo.corner ?? 'top-left'} accent={accent} /> : null}

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
  );
};
