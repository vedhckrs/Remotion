import React from 'react';
import {Audio, Video} from '@remotion/media';
import {AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera3D, Layer} from '../components/Camera3D';
import {GradientBackground} from '../components/GradientBackground';
import {KenBurnsImage} from '../components/KenBurnsImage';
import {KineticTitle} from '../components/KineticTitle';
import {NeonText} from '../components/NeonText';
import {PACING, SPRING, cameraPush, fr, type Pacing} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import type {ScriptScene} from '../lib/script';
import {theme} from '../lib/theme';

/**
 * Generic narrated scene: background (gradient, Ken Burns still, graded footage, or a neon 3D
 * stage), kinetic headline inside the safe zone, optional subline, and the scene's voice clip.
 * Layout adapts to vertical / horizontal / square; timing adapts to the pacing profile.
 */
export const VoiceoverScene: React.FC<{
  readonly scene: ScriptScene;
  readonly audioSrc?: string;
  readonly accent?: string;
  readonly index?: number;
  readonly pacing?: Pacing;
  /** Enable WebGL-only polish (film grain). Requires --gl=angle or swangle. */
  readonly webglExtras?: boolean;
}> = ({scene, audioSrc, accent = theme.colors.accent, index = 0, pacing = 'medium', webglExtras = false}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const {safe, unit, isVertical, isHorizontal} = usePlatformLayout();
  const p = PACING[pacing];

  const push = cameraPush(frame, durationInFrames, 1, p.cameraPush);
  const visual = scene.visual ?? {type: 'gradient' as const};
  const headlineSize = (isVertical ? 96 : isHorizontal ? 104 : 88) * unit;
  const exitAt = durationInFrames - fr(4, fps);

  // Supporting line waits for the headline words to land, then rises in.
  const wordCount = scene.headline.trim().split(/\s+/).length;
  const sublineIn = spring({frame, fps, delay: fr(wordCount * p.stagger + 6, fps), config: SPRING.settle});
  const sublineOut = interpolate(frame, [exitAt - fr(10, fps), exitAt], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const isNeon = visual.type === 'neon';

  const background =
    visual.type === 'image' && visual.src ? (
      <KenBurnsImage src={staticFile(visual.src)} focal={visual.focal} />
    ) : visual.type === 'video' && visual.src ? (
      <AbsoluteFill>
        <Video src={staticFile(visual.src)} muted objectFit="cover" style={{width: '100%', height: '100%', filter: theme.grade}} name="Footage" />
        <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)`}} />
      </AbsoluteFill>
    ) : (
      <GradientBackground seed={`scene-${index}`} grain={webglExtras ? 0.06 : 0} colors={isNeon ? ['#05040A', '#120B2A'] : undefined} blobs={isNeon ? [accent, '#FF2BD6'] : undefined} />
    );

  const copy = (
    <div
      style={{
        position: 'absolute',
        left: safe.x,
        top: safe.y,
        width: safe.width,
        height: safe.height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: isVertical ? 'flex-start' : 'center',
        alignItems: isHorizontal ? 'flex-start' : 'center',
        paddingTop: isVertical ? safe.height * (isNeon ? 0.16 : 0.12) : 0, // clears the logo slot; the neon camera tilt lifts copy a little
        gap: 28 * unit,
      }}
    >
      {isNeon ? (
        <NeonText text={scene.headline} glow={accent} fontSize={headlineSize * 1.05} font="impact" uppercase extrude={Math.round(6 * unit)} seed={scene.id} style={{textAlign: isHorizontal ? 'left' : 'center', maxWidth: isHorizontal ? safe.width * 0.62 : '100%'}} />
      ) : (
        <KineticTitle text={scene.headline} highlight={scene.highlight} fontSize={headlineSize} highlightColor={accent} align={isHorizontal ? 'left' : 'center'} exitAt={exitAt} stagger={p.stagger} maxWidth={isHorizontal ? safe.width * 0.62 : '100%'} />
      )}
      {scene.subline ? (
        <div
          style={{
            fontFamily: theme.fonts.body,
            fontSize: 44 * unit,
            fontWeight: 500,
            color: theme.colors.muted,
            maxWidth: isHorizontal ? safe.width * 0.5 : safe.width * 0.9,
            textAlign: isHorizontal ? 'left' : 'center',
            lineHeight: 1.3,
            textShadow: theme.shadow.text,
            opacity: sublineIn * sublineOut,
            translate: `0px ${(1 - sublineIn) * 24 * unit}px`,
          }}
        >
          {scene.subline}
        </div>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg}}>
      {isNeon ? (
        // Neon stage: background far back, glow haze in the middle, copy nearest; a slow orbit gives depth.
        <Camera3D keyframes={[{at: 0, pan: -4, tilt: 2, dolly: -60}, {at: durationInFrames / fps, pan: 4, tilt: -1, dolly: 40}]} handheld={0.6} seed={scene.id}>
          <Layer depth={-320} style={{scale: '1.45'}}>{background}</Layer>
          <Layer depth={-120}>
            <AbsoluteFill style={{background: `radial-gradient(circle at 50% 55%, ${accent}33 0%, rgba(0,0,0,0) 55%)`}} />
          </Layer>
          <Layer depth={80}>{copy}</Layer>
        </Camera3D>
      ) : (
        <>
          <AbsoluteFill style={{scale: String(push)}}>{background}</AbsoluteFill>
          {copy}
        </>
      )}
      {audioSrc ? <Audio src={audioSrc} name={`VO ${scene.id}`} premountFor={fr(15, fps)} /> : null}
    </AbsoluteFill>
  );
};
