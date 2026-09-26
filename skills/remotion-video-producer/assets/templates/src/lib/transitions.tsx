import React from 'react';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {pushCut} from '@remotion/transitions/push-cut';
import {AbsoluteFill, Easing, interpolate, random} from 'remotion';
import type {Pacing} from './motion';

/**
 * Transition catalog: pick by pacing and cut index so a video alternates naturally instead of
 * repeating one move. All custom presentations here are CSS-only (no WebGL) so they render on
 * every machine; the WebGL shader presentations from @remotion/transitions (filmBurn, dreamyZoom,
 * crossZoom, ...) can be swapped in when webglExtras is on.
 */

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// ---- zoomPunch: incoming scene punches in from 1.6x, outgoing retreats -------------------------
type ZoomPunchProps = {readonly from?: number; readonly flash?: boolean};

const ZoomPunchComponent: React.FC<TransitionPresentationComponentProps<ZoomPunchProps>> = ({children, presentationDirection, presentationProgress, passedProps}) => {
  const from = passedProps.from ?? 1.6;
  const entering = presentationDirection === 'entering';
  const p = interpolate(presentationProgress, [0, 1], [0, 1], {easing: Easing.bezier(0.05, 0.9, 0.1, 1), ...clamp});
  const scale = entering ? from + (1 - from) * p : 1 - 0.12 * p;
  const opacity = entering ? interpolate(p, [0, 0.35], [0, 1], clamp) : 1 - p;
  const flash = passedProps.flash === false ? 0 : entering ? interpolate(presentationProgress, [0, 0.15, 0.5], [0.9, 0.5, 0], clamp) : 0;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{scale: String(scale), opacity}}>{children}</AbsoluteFill>
      {flash > 0 ? <AbsoluteFill style={{backgroundColor: '#fff', opacity: flash, pointerEvents: 'none'}} /> : null}
    </AbsoluteFill>
  );
};

export const zoomPunch = (props: ZoomPunchProps = {}): TransitionPresentation<ZoomPunchProps> => ({component: ZoomPunchComponent, props});

// ---- whipPan: both scenes fly in one direction with motion blur -------------------------------
type WhipPanProps = {readonly direction?: 'left' | 'right' | 'up' | 'down'; readonly blur?: number};

const WhipPanComponent: React.FC<TransitionPresentationComponentProps<WhipPanProps>> = ({children, presentationDirection, presentationProgress, passedProps}) => {
  const dir = passedProps.direction ?? 'left';
  const maxBlur = passedProps.blur ?? 24;
  const p = interpolate(presentationProgress, [0, 1], [0, 1], {easing: Easing.bezier(0.7, 0, 0.2, 1), ...clamp});
  const entering = presentationDirection === 'entering';
  const offset = entering ? 100 - 100 * p : -100 * p; // percent
  const sign = dir === 'left' || dir === 'up' ? 1 : -1;
  const horizontal = dir === 'left' || dir === 'right';
  const translate = horizontal ? `${offset * sign}% 0%` : `0% ${offset * sign}%`;
  const blur = Math.sin(p * Math.PI) * maxBlur;
  return <AbsoluteFill style={{translate, filter: blur > 0.5 ? `blur(${blur}px)` : undefined}}>{children}</AbsoluteFill>;
};

export const whipPan = (props: WhipPanProps = {}): TransitionPresentation<WhipPanProps> => ({component: WhipPanComponent, props});

// ---- glitchSlam: horizontal strip displacement with RGB split, decaying into the new scene -------
type GlitchSlamProps = {readonly strips?: number; readonly intensity?: number; readonly seed?: number};

const GlitchSlamComponent: React.FC<TransitionPresentationComponentProps<GlitchSlamProps>> = ({children, presentationDirection, presentationProgress, passedProps}) => {
  const strips = passedProps.strips ?? 7;
  const intensity = passedProps.intensity ?? 60;
  const seed = passedProps.seed ?? 1;
  const entering = presentationDirection === 'entering';
  const energy = entering ? 1 - presentationProgress : presentationProgress; // strongest at the cut
  const opacity = entering ? interpolate(presentationProgress, [0, 0.2], [0, 1], clamp) : interpolate(presentationProgress, [0.6, 1], [1, 0], clamp);
  const step = Math.floor(presentationProgress * 12); // re-roll offsets every ~8% for a jittery feel
  if (energy < 0.08) {
    // Nearly settled: draw the plain scene so clip-path seams never show.
    return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
  }
  const layers: React.ReactNode[] = [];
  for (let i = 0; i < strips; i++) {
    const top = (i / strips) * 100;
    const bottom = 100 - ((i + 1) / strips) * 100;
    const dx = (random(`${seed}-${i}-${step}`) - 0.5) * 2 * intensity * energy * energy;
    layers.push(
      <AbsoluteFill key={i} style={{clipPath: `inset(${top}% 0 ${bottom}% 0)`, translate: `${dx}px 0px`}}>
        {children}
      </AbsoluteFill>,
    );
  }
  const split = 6 * energy;
  return (
    <AbsoluteFill style={{opacity}}>
      {split > 0.5 ? (
        <>
          <AbsoluteFill style={{translate: `${-split}px 0px`, mixBlendMode: 'screen', opacity: 0.6}}>
            <AbsoluteFill style={{filter: 'sepia(1) saturate(6) hue-rotate(-50deg)'}}>{children}</AbsoluteFill>
          </AbsoluteFill>
          <AbsoluteFill style={{translate: `${split}px 0px`, mixBlendMode: 'screen', opacity: 0.6}}>
            <AbsoluteFill style={{filter: 'sepia(1) saturate(6) hue-rotate(160deg)'}}>{children}</AbsoluteFill>
          </AbsoluteFill>
        </>
      ) : null}
      {layers}
    </AbsoluteFill>
  );
};

export const glitchSlam = (props: GlitchSlamProps = {}): TransitionPresentation<GlitchSlamProps> => ({component: GlitchSlamComponent, props});

// ---- Catalog ------------------------------------------------------------------------------------
export type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

const asAny = (p: TransitionPresentation<any>): AnyPresentation => p as AnyPresentation; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Returns the presentation for cut number `index` under a pacing. Fast pacing alternates punchy
 * moves; calm pacing stays with fades and slow slides. Deterministic so renders match previews.
 */
export const pickTransition = (pacing: Pacing, index: number): AnyPresentation => {
  const fast = [asAny(zoomPunch()), asAny(pushCut({flashFrames: 2})), asAny(whipPan({direction: index % 2 === 0 ? 'left' : 'up'})), asAny(glitchSlam({seed: index + 1}))];
  const medium = [asAny(fade()), asAny(slide({direction: 'from-right'})), asAny(zoomPunch({from: 1.25, flash: false})), asAny(wipe({direction: 'from-left'}))];
  const calm = [asAny(fade()), asAny(fade()), asAny(slide({direction: 'from-bottom'}))];
  const set = pacing === 'fast' ? fast : pacing === 'calm' ? calm : medium;
  return set[index % set.length];
};
