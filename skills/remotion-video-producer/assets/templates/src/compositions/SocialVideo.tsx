import React from "react";
import type { Caption } from "@remotion/captions";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { zColor } from "@remotion/zod-types";
import {
  AbsoluteFill,
  staticFile,
  type CalculateMetadataFunction,
} from "remotion";
import { z } from "zod";
import { CaptionLayer } from "../components/CaptionLayer";
import { EndCard } from "../components/EndCard";
import { LightLeakOverlay } from "../components/LightLeakOverlay";
import { MusicBed } from "../components/MusicBed";
import { SafeArea } from "../components/SafeArea";
import { PLATFORM_IDS } from "../lib/platforms";
import {
  absoluteCaptions,
  computeSceneTimings,
  fetchJson,
  manifestUrl,
  scriptUrl,
  totalFrames,
  voiceoverUrl,
  type SceneTiming,
  type VideoScript,
  type VoiceoverManifest,
} from "../lib/script";
import { VoiceoverScene } from "../scenes/VoiceoverScene";

/**
 * Data-driven multi-scene video. One composition per platform in Root.tsx points at
 * the same component; calculateMetadata reads public/script/<videoId>.json and
 * public/voiceover/<videoId>/manifest.json, sizes every scene to its voice line
 * and shifts captions onto the composition timeline.
 */
export const TRANSITION_FRAMES = 12;

export const socialVideoSchema = z.object({
  videoId: z.string(),
  platform: z.enum(PLATFORM_IDS as [string, ...string[]]),
  accent: zColor(),
  captionStyle: z.enum(["karaoke", "pop", "boxed", "none"]),
  music: z
    .object({ src: z.string(), level: z.number().min(0).max(1) })
    .nullable(),
  endCard: z
    .object({ headline: z.string(), cta: z.string(), handle: z.string() })
    .nullable(),
  gapSeconds: z.number().min(0).max(3),
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
};

const END_CARD_SECONDS = 2.5;

export const calculateSocialVideoMetadata: CalculateMetadataFunction<
  SocialVideoProps
> = async ({ props, abortSignal, defaultProps, compositionId }) => {
  void defaultProps;
  void compositionId;
  const fps = 30;
  const script = await fetchJson<VideoScript>(
    scriptUrl(props.videoId),
    abortSignal,
  );
  if (!script) {
    throw new Error(
      `Missing public/script/${props.videoId}.json. Write the scene plan first (SKILL.md Phase 2).`,
    );
  }
  const manifest = await fetchJson<VoiceoverManifest>(
    manifestUrl(props.videoId),
    abortSignal,
  );

  // Without voiceover yet, estimate each scene from reading time so the layout can be built.
  const durations = script.scenes.map((scene) => {
    const fromManifest = manifest?.scenes.find(
      (s) => s.id === scene.id,
    )?.durationSeconds;
    const estimate = 0.8 + scene.voiceover.trim().split(/\s+/).length * 0.42;
    return {
      id: scene.id,
      durationSeconds: fromManifest ?? estimate,
      minSeconds: scene.minSeconds,
    };
  });
  if (props.endCard) {
    durations.push({
      id: "__end",
      durationSeconds: END_CARD_SECONDS,
      minSeconds: END_CARD_SECONDS,
    });
  }

  const timings = computeSceneTimings(
    durations,
    fps,
    props.gapSeconds,
    TRANSITION_FRAMES,
  );
  const captions = manifest ? absoluteCaptions(manifest, timings, fps) : [];

  return {
    durationInFrames: totalFrames(timings),
    fps,
    props: { ...props, script, manifest, timings, captions },
    defaultOutName: `${props.videoId}_${props.platform}`,
  };
};

export const SocialVideo: React.FC<SocialVideoProps> = ({
  videoId,
  accent,
  captionStyle,
  music,
  endCard,
  showSafeArea,
  webglExtras,
  script,
  manifest,
  timings = [],
  captions = [],
}) => {
  if (!script) return null;

  const scenes = script.scenes;
  const voiceSegments = timings
    .filter((t) => t.id !== "__end")
    .map((t) => ({
      startSeconds: t.startFrame / 30,
      endSeconds: (t.startFrame + t.voiceFrames) / 30,
    }));

  // Build the series as a flat array: sequence, transition, sequence, ...
  const items: React.ReactNode[] = [];
  timings.forEach((timing, i) => {
    const isEnd = timing.id === "__end";
    const scene = scenes[i];
    const manifestScene = manifest?.scenes.find((s) => s.id === timing.id);
    const audioSrc = manifestScene
      ? voiceoverUrl(videoId, manifestScene.file)
      : undefined;

    items.push(
      <TransitionSeries.Sequence
        key={`seq-${timing.id}`}
        durationInFrames={timing.sequenceFrames}
        name={isEnd ? "End card" : `Scene ${scene.id}`}
        premountFor={20}
      >
        {isEnd && endCard ? (
          <EndCard
            headline={endCard.headline}
            cta={endCard.cta}
            handle={endCard.handle}
            accent={accent}
            webglExtras={webglExtras}
          />
        ) : (
          <VoiceoverScene
            scene={scene}
            audioSrc={audioSrc}
            accent={accent}
            index={i}
            webglExtras={webglExtras}
          />
        )}
      </TransitionSeries.Sequence>,
    );

    if (i < timings.length - 1) {
      items.push(
        <TransitionSeries.Transition
          key={`tr-${timing.id}`}
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />,
      );
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>{items}</TransitionSeries>

      {captionStyle !== "none" && captions.length > 0 ? (
        <CaptionLayer
          captions={captions}
          style={captionStyle}
          accent={accent}
        />
      ) : null}

      {music ? (
        <MusicBed
          src={staticFile(music.src)}
          segments={voiceSegments}
          musicLevel={music.level}
          duckedLevel={music.level * 0.4}
        />
      ) : null}

      {/* Decorative flare on the first beat (WebGL). Remove if the brand is understated. */}
      {webglExtras ? (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <TransitionSeries>
            <TransitionSeries.Sequence durationInFrames={1}>
              <AbsoluteFill />
            </TransitionSeries.Sequence>
            <TransitionSeries.Overlay durationInFrames={28} offset={14}>
              <LightLeakOverlay seed={2} hueShift={250} opacity={0.6} />
            </TransitionSeries.Overlay>
            <TransitionSeries.Sequence
              durationInFrames={Math.max(1, totalFrames(timings) - 1)}
            >
              <AbsoluteFill />
            </TransitionSeries.Sequence>
          </TransitionSeries>
        </AbsoluteFill>
      ) : null}

      <SafeArea debug={showSafeArea} />
    </AbsoluteFill>
  );
};
