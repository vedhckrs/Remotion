import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from '../components/Background';
import {BrandLogo, Icon, type IconSet} from '../components/Icon';
import {KineticTitle} from '../components/KineticTitle';
import {alpha, isDark, lift} from '../lib/color';
import {EASE, PACING, SPRING, cameraPush, fr, idleFloat, type Pacing} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import type {IconSpec, ScriptScene} from '../lib/script';
import type {BackgroundKind} from '../lib/styles';
import {useTheme} from '../lib/theme';

/**
 * Icon / logo scene from the script (`visual.type: "icons"`):
 *  1 icon  -> hero logo with label
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
}> = ({scene, icons, audioSrc, index = 0, pacing = 'medium', background = 'tonal', versus}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const {safe, unit, isVertical, isHorizontal} = usePlatformLayout();
  const p = PACING[pacing];
  const words = scene.headline.trim().split(/\s+/).length;
  // Icons arrive while the headline is still landing, so a two-second scene is never half empty.
  const iconsDelay = Math.min(words * p.stagger, 8) + 4;
  const list = icons.slice(0, 8);
  const isVersus = versus ?? (list.length === 2 && /\bvs\b|versus/i.test(scene.headline));

  // Labels auto-made from UI icon file names ("Zap", "Map Pin") mean nothing to a viewer: show only real ones.
  const autoLabel = (name: string) => name.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const labelFor = (spec: IconSpec) => {
    const set = spec.set ?? 'simple-icons';
    if (!spec.label) return undefined;
    return set === 'simple-icons' || set === 'logos' || spec.label !== autoLabel(spec.name) ? spec.label : undefined;
  };
  const tileBg = lift(theme.colors.bg, isDark(theme.colors.bg) ? 9 : -6);

  const renderIcon = (spec: IconSpec, i: number, size: number) => {
    const set = (spec.set ?? 'simple-icons') as IconSet;
    const delay = iconsDelay + i * (p.stagger + 3);
    // Each icon pops in with a soft overshoot, then floats gently so the frame never freezes.
    const pop = spring({frame, fps, delay: fr(delay, fps), config: SPRING.soft});
    const float = idleFloat(frame, size * 0.035, 70, i * 11, fps);
    const label = labelFor(spec);
    const wrap = (child: React.ReactNode) => (
      <div key={`${set}-${spec.name}-${i}`} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.14, translate: `0px ${float}px`}}>
        {child}
        {label ? <div style={{fontFamily: theme.fonts.display, fontSize: Math.max(34 * unit, size * 0.2), fontWeight: 700, color: theme.colors.text, textAlign: 'center', opacity: pop}}>{label}</div> : null}
      </div>
    );
    if (set === 'simple-icons' || set === 'logos') {
      return wrap(<BrandLogo set={set} name={spec.name} size={size} delay={delay} />);
    }
    return wrap(
      <div style={{width: size * 1.25, height: size * 1.25, borderRadius: size * 0.3, background: `linear-gradient(160deg, ${tileBg}, ${theme.colors.bg})`, border: `${Math.max(1, 2 * unit)}px solid ${alpha(theme.colors.accent, 0.35)}`, boxShadow: `0 0 ${size * 0.5}px ${alpha(theme.colors.accent, 0.22)}, inset 0 ${size * 0.02}px 0 ${alpha('#ffffff', 0.06)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(0.6 + pop * 0.4), opacity: Math.min(1, pop * 1.6)}}>
        <Icon set={set} name={spec.name} size={size * 0.66} color={spec.color ?? theme.colors.accent} animate="draw" delay={delay} />
      </div>,
    );
  };

  // Vertical: one icon fills half the width; a pair about a third each; three or more wrap in rows.
  const n = list.length;
  const heroSize = isVertical ? safe.width * (n === 1 ? 0.44 : n === 2 ? 0.3 : n === 3 ? 0.2 : 0.19) : Math.min(safe.width, safe.height) * (n === 1 ? 0.42 : n === 2 ? 0.3 : 0.2);
  const push = cameraPush(frame, durationInFrames, 1, p.cameraPush);
  const vsIn = spring({frame, fps, delay: fr(iconsDelay + 10, fps), config: SPRING.snappy});

  // Signal path: 2 to 4 icons that are not a "vs" comparison are drawn as a chain joined by glowing wires
  // with pulses of data running along them (phone -> Wi-Fi -> router). It explains the flow and never stands still.
  const isFlow = !isVersus && n >= 2 && n <= 4 && isVertical;
  const flowRow = (() => {
    if (!isFlow) return null;
    const W = safe.width * 0.94; // room for the camera push
    const size = W * (n === 2 ? 0.26 : n === 3 ? 0.2 : 0.15);
    const T = size * 1.25;
    const gap = (W - n * T) / (n - 1);
    const hasLabels = list.some((spec) => labelFor(spec));
    const H = T + (hasLabels ? Math.max(34 * unit, size * 0.2) * 1.6 + size * 0.14 : 0);
    const cy = T / 2;
    const wires = list.slice(1).map((_, i) => {
      const x1 = i * (T + gap) + T;
      const x2 = (i + 1) * (T + gap);
      const startAt = iconsDelay + (i + 1) * (p.stagger + 3);
      const grow = interpolate(frame, [fr(startAt, fps), fr(startAt + 12, fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.emphasizedOut});
      const len = x2 - x1;
      const pulses = [0, 0.5].map((phase, k) => {
        const u = ((frame / fps) * 0.9 + phase + i * 0.17) % 1;
        const on = grow >= 1 ? 1 : 0;
        return <circle key={k} cx={x1 + len * u} cy={cy} r={7 * unit} fill={theme.colors.accent} opacity={on * interpolate(u, [0, 0.1, 0.9, 1], [0, 1, 1, 0])} style={{filter: `drop-shadow(0 0 ${10 * unit}px ${theme.colors.accent})`}} />;
      });
      return (
        <g key={i}>
          <line x1={x1} y1={cy} x2={x1 + len * grow} y2={cy} stroke={alpha(theme.colors.accent, 0.35)} strokeWidth={10 * unit} strokeLinecap="round" style={{filter: `blur(${6 * unit}px)`}} />
          <line x1={x1} y1={cy} x2={x1 + len * grow} y2={cy} stroke={theme.colors.accent} strokeWidth={4 * unit} strokeLinecap="round" strokeDasharray={`${14 * unit} ${10 * unit}`} strokeDashoffset={-(frame / fps) * 60 * unit} />
          {pulses}
        </g>
      );
    });
    return (
      <div style={{position: 'relative', width: W, height: H, scale: String(push)}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>{wires}</svg>
        {list.map((spec, i) => (
          <div key={`${spec.name}-${i}`} style={{position: 'absolute', left: i * (T + gap), top: 0, width: T, display: 'flex', justifyContent: 'center'}}>
            {renderIcon(spec, i, size)}
          </div>
        ))}
      </div>
    );
  })();

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg}}>
      <AbsoluteFill style={{scale: String(push)}}>
        <Background kind={background} seed={`icons-${index}`} />
      </AbsoluteFill>
      {/* Vertical: headline at the top, icons centred in the space above the caption band. */}
      <div style={{position: 'absolute', left: safe.x, top: safe.y, width: safe.width, height: isVertical ? safe.height * 0.72 : safe.height, display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', alignItems: 'center', justifyContent: isHorizontal ? 'space-between' : 'flex-start', paddingTop: isVertical ? safe.height * 0.1 : 0, gap: 40 * unit}}>
        <div style={{width: isHorizontal ? safe.width * 0.36 : '100%'}}>
          <KineticTitle text={scene.headline} highlight={scene.highlight} fontSize={(isVertical ? 108 : 88) * unit} align={isHorizontal ? 'left' : 'center'} stagger={p.stagger} exitAt={durationInFrames - fr(4, fps)} />
        </div>
        <div style={{flex: 1, width: isHorizontal ? undefined : '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', alignItems: 'center', gap: heroSize * 0.4, position: 'relative', scale: isFlow ? undefined : String(push)}}>
          {flowRow ?? list.map((spec, i) => renderIcon(spec, i, heroSize))}
          {isVersus ? (
            <div style={{position: 'absolute', left: '50%', top: '38%', translate: '-50% -50%', width: heroSize * 0.42, height: heroSize * 0.42, borderRadius: '50%', background: theme.colors.accent, color: theme.colors.onAccent, fontFamily: theme.fonts.impact, fontSize: heroSize * 0.18, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(vsIn), opacity: interpolate(vsIn, [0, 0.3], [0, 1], {extrapolateRight: 'clamp'}), boxShadow: `0 0 ${heroSize * 0.3}px ${theme.colors.accent}88`}}>
              VS
            </div>
          ) : null}
        </div>
      </div>
      {audioSrc ? <Audio src={audioSrc} name={`VO ${scene.id}`} premountFor={fr(15, fps)} /> : null}
    </AbsoluteFill>
  );
};
