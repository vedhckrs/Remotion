import React from 'react';
import {Audio, Video} from '@remotion/media';
import {AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {GradientBackground} from '../components/GradientBackground';
import {KenBurnsImage} from '../components/KenBurnsImage';
import {KineticTitle} from '../components/KineticTitle';
import {SPRING, cameraPush} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import type {ScriptScene} from '../lib/script';
import {theme} from '../lib/theme';

/**
 * Generic narrated scene: background (gradient, Ken Burns still or graded footage),
 * kinetic headline inside the safe zone, optional subline, and the scene's voice clip.
 * Layout adapts to vertical / horizontal / square from useVideoConfig().
 */
export const VoiceoverScene: React.FC<{
  readonly scene: ScriptScene;
  readonly audioSrc?: string;
  readonly accent?: string;
  readonly index?: number;
  /** Enable WebGL-only polish (film grain). Requires --gl=angle or swangle. */
  readonly webglExtras?: boolean;
}> = ({scene, audioSrc, accent = theme.colors.accent, index = 0, webglExtras = false}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const {safe, unit, isVertical, isHorizontal} = usePlatformLayout();

  const push = cameraPush(frame, durationInFrames, 1, 1.05);
  const visual = scene.visual ?? {type: 'gradient' as const};
  const headlineSize = (isVertical ? 96 : isHorizontal ? 104 : 88) * unit;
  const exitAt = durationInFrames - 4;

  // Supporting line waits for the headline words (3-frame stagger) to land, then rises in.
  const wordCount = scene.headline.trim().split(/\s+/).length;
  const sublineIn = spring({frame, fps, delay: wordCount * 3 + 6, config: SPRING.settle});
  const sublineOut = interpolate(frame, [exitAt - 10, exitAt], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg}}>
      <AbsoluteFill style={{scale: String(push)}}>
        {visual.type === 'image' && visual.src ? (
          <KenBurnsImage src={staticFile(visual.src)} focal={visual.focal} />
        ) : visual.type === 'video' && visual.src ? (
          <AbsoluteFill>
            <Video src={staticFile(visual.src)} muted objectFit="cover" style={{width: '100%', height: '100%', filter: theme.grade}} name="Footage" />
            <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)`}} />
          </AbsoluteFill>
        ) : (
          <GradientBackground seed={`scene-${index}`} grain={webglExtras ? 0.06 : 0} />
        )}
      </AbsoluteFill>

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
          paddingTop: isVertical ? safe.height * 0.12 : 0,
          gap: 28 * unit,
        }}
      >
        <KineticTitle text={scene.headline} highlight={scene.highlight} fontSize={headlineSize} highlightColor={accent} align={isHorizontal ? 'left' : 'center'} exitAt={exitAt} maxWidth={isHorizontal ? safe.width * 0.62 : '100%'} />
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

      {audioSrc ? <Audio src={audioSrc} name={`VO ${scene.id}`} premountFor={15} /> : null}
    </AbsoluteFill>
  );
};
