import React from 'react';
import {Audio, Video} from '@remotion/media';
import {AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from '../components/Background';
import {Camera3D, Layer} from '../components/Camera3D';
import {KenBurnsImage} from '../components/KenBurnsImage';
import {KineticTitle} from '../components/KineticTitle';
import {LutVideo} from '../components/LutMedia';
import {alpha, scrimFor} from '../lib/color';
import {NeonText} from '../components/NeonText';
import type {GradeName} from '../lib/grades';
import {PACING, SPRING, cameraPush, fr, type Pacing} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import type {ScriptScene} from '../lib/script';
import type {BackgroundKind} from '../lib/styles';
import {useTheme} from '../lib/theme';

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
  /** Background system for gradient/neon scenes (from the style preset unless the scene overrides it). */
  readonly background?: BackgroundKind;
  /** Grade name; with webglExtras, footage is graded through its LUT (exact), otherwise via the parent <Graded>. */
  readonly grade?: GradeName;
  /** Enable WebGL-only polish (film grain, LUT on footage). Requires --gl=angle or swangle. */
  readonly webglExtras?: boolean;
}> = ({scene, audioSrc, accent: accentProp, index = 0, pacing = 'medium', background: backgroundKind = 'tonal', grade = 'none', webglExtras = false}) => {
  const theme = useTheme();
  const accent = accentProp ?? theme.colors.accent;
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const {safe, unit, isVertical, isHorizontal} = usePlatformLayout();
  const p = PACING[pacing];

  const push = cameraPush(frame, durationInFrames, 1, p.cameraPush);
  const visual = scene.visual ?? {type: 'plain' as const};
  const headlineSize = (isVertical ? 124 : isHorizontal ? 112 : 96) * unit;
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
        {webglExtras && grade !== 'none' ? (
          <LutVideo src={staticFile(visual.src)} grade={grade} />
        ) : (
          <Video src={staticFile(visual.src)} muted objectFit="cover" style={{width: '100%', height: '100%', filter: theme.grade}} name="Footage" />
        )}
        <AbsoluteFill style={{background: scrimFor(theme.colors.bg)}} />
      </AbsoluteFill>
    ) : isNeon ? (
      <Background kind="spotlight" seed={`scene-${index}`} grain={webglExtras ? 0.06 : 0} intensity={1.2} />
    ) : (
      <Background kind={backgroundKind} seed={`scene-${index}`} grain={webglExtras ? 0.06 : 0} />
    );

  const copy = (
    <div
      style={{
        position: 'absolute',
        left: safe.x,
        top: safe.y,
        width: safe.width,
        // Vertical: the headline is the hero, centred in the frame above the caption band (never a small line at the top).
        height: isVertical ? safe.height * 0.72 : safe.height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: isHorizontal ? 'flex-start' : 'center',
        paddingTop: isVertical ? safe.height * (isNeon ? 0.1 : 0.06) : 0, // clears the logo slot
        gap: 28 * unit,
      }}
    >
      {isNeon ? (
        <NeonText text={scene.headline} glow={accent} fontSize={headlineSize * 1.05} font="impact" uppercase extrude={Math.round(6 * unit)} seed={scene.id} style={{textAlign: isHorizontal ? 'left' : 'center', maxWidth: isHorizontal ? safe.width * 0.62 : '100%'}} />
      ) : (
        <KineticTitle text={scene.headline} highlight={scene.highlight} fontSize={headlineSize} highlightColor={accent} align={isHorizontal ? 'left' : 'center'} exitAt={exitAt} stagger={p.stagger} maxWidth={isHorizontal ? safe.width * 0.62 : '100%'} />
      )}
      {scene.subline && !/^sources?\s*:/i.test(scene.subline) ? (
        <div
          style={{
            fontFamily: theme.fonts.body,
            fontSize: (isVertical ? 50 : 44) * unit,
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
            <AbsoluteFill style={{background: `radial-gradient(circle at 50% 55%, ${alpha(accent, 0.2)} 0%, rgba(0,0,0,0) 55%)`}} />
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
