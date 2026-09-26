import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from '../components/Background';
import {BrandLogo, Icon, type IconSet} from '../components/Icon';
import {KineticTitle} from '../components/KineticTitle';
import {PACING, SPRING, fr, type Pacing} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import type {IconSpec, ScriptScene} from '../lib/script';
import type {BackgroundKind} from '../lib/styles';
import {useTheme} from '../lib/theme';

/**
 * Icon / logo scene from the script (`visual.type: "icons"`):
 *  1 icon  -> hero logo with glow and label
 *  2 icons -> side by side with a "VS" badge (comparisons)
 *  3 to 8  -> staggered grid with labels (stacks, integrations, platforms)
 * Brand marks come from Simple Icons / SVG Logos in official colors; UI icons from Lucide.
 */
export const IconScene: React.FC<{
  readonly scene: ScriptScene;
  readonly icons: readonly IconSpec[];
  readonly audioSrc?: string;
  readonly index?: number;
  readonly pacing?: Pacing;
  readonly background?: BackgroundKind;
  readonly versus?: boolean;
}> = ({scene, icons, audioSrc, index = 0, pacing = 'medium', background = 'mesh', versus}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const {safe, unit, isVertical, isHorizontal} = usePlatformLayout();
  const p = PACING[pacing];
  const words = scene.headline.trim().split(/\s+/).length;
  const iconsDelay = words * p.stagger + 6;
  const list = icons.slice(0, 8);
  const isVersus = versus ?? (list.length === 2 && /\bvs\b|versus/i.test(scene.headline));

  const renderIcon = (spec: IconSpec, i: number, size: number) => {
    const set = (spec.set ?? 'simple-icons') as IconSet;
    if (set === 'simple-icons' || set === 'logos') {
      return <BrandLogo key={`${set}-${spec.name}-${i}`} set={set} name={spec.name} size={size} label={spec.label} delay={iconsDelay + i * (p.stagger + 2)} glow={list.length <= 2} />;
    }
    return (
      <div key={`${set}-${spec.name}-${i}`} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.12}}>
        <Icon set={set} name={spec.name} size={size * 0.9} color={spec.color ?? theme.colors.accent} animate={set === 'lucide' || set === 'tabler' ? 'draw' : 'pop'} delay={iconsDelay + i * (p.stagger + 2)} glow={list.length <= 2} />
        {spec.label ? <div style={{fontFamily: theme.fonts.display, fontSize: size * 0.2, fontWeight: 700, color: theme.colors.text, textAlign: 'center'}}>{spec.label}</div> : null}
      </div>
    );
  };

  const heroSize = Math.min(safe.width, safe.height) * (list.length === 1 ? 0.42 : list.length === 2 ? 0.3 : 0.2);
  const vsIn = spring({frame, fps, delay: fr(iconsDelay + 10, fps), config: SPRING.bouncy});

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg}}>
      <Background kind={background} seed={`icons-${index}`} />
      <div style={{position: 'absolute', left: safe.x, top: safe.y, width: safe.width, height: safe.height, display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', alignItems: 'center', justifyContent: isHorizontal ? 'space-between' : 'flex-start', paddingTop: isVertical ? safe.height * 0.12 : 0, gap: 40 * unit}}>
        <div style={{width: isHorizontal ? safe.width * 0.36 : '100%'}}>
          <KineticTitle text={scene.headline} highlight={scene.highlight} fontSize={(isVertical ? 84 : 84) * unit} align={isHorizontal ? 'left' : 'center'} stagger={p.stagger} exitAt={durationInFrames - fr(4, fps)} />
        </div>
        <div style={{flex: isHorizontal ? 1 : undefined, width: isHorizontal ? undefined : '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: heroSize * 0.35, position: 'relative', marginTop: isVertical ? safe.height * 0.06 : 0}}>
          {list.map((spec, i) => renderIcon(spec, i, heroSize))}
          {isVersus ? (
            <div style={{position: 'absolute', left: '50%', top: '38%', translate: '-50% -50%', width: heroSize * 0.42, height: heroSize * 0.42, borderRadius: '50%', background: theme.colors.accent, color: '#fff', fontFamily: theme.fonts.impact, fontSize: heroSize * 0.18, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(vsIn), opacity: interpolate(vsIn, [0, 0.3], [0, 1], {extrapolateRight: 'clamp'}), boxShadow: `0 0 ${heroSize * 0.3}px ${theme.colors.accent}88`}}>
              VS
            </div>
          ) : null}
        </div>
      </div>
      {audioSrc ? <Audio src={audioSrc} name={`VO ${scene.id}`} premountFor={fr(15, fps)} /> : null}
    </AbsoluteFill>
  );
};
