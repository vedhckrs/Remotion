import React, {useEffect, useState} from 'react';
import {Video} from '@remotion/media';
import {lut} from '@remotion/effects/lut';
import {CanvasImage, staticFile, useDelayRender, type EffectDescriptor} from 'remotion';
import {GRADES, type GradeName} from '../lib/grades';

/**
 * Footage or stills graded through a .cube LUT (WebGL) with optional extra effects.
 * LUT files come from scripts/make-lut.mjs (public/luts/<name>.cube) or any 3D .cube you own.
 * Falls back to the grade's effect stack when no LUT is given.
 */
const useCube = (name: string | null) => {
  const [content, setContent] = useState<string | null>(null);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  useEffect(() => {
    if (!name) return;
    const handle = delayRender(`Loading LUT ${name}`);
    fetch(staticFile(`luts/${name}.cube`))
      .then((r) => {
        if (!r.ok) throw new Error(`LUT not found: public/luts/${name}.cube (run scripts/make-lut.mjs)`);
        return r.text();
      })
      .then((text) => {
        setContent(text);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [name, delayRender, continueRender, cancelRender]);
  return content;
};

const buildEffects = (grade: GradeName, cube: string | null, extra: EffectDescriptor<unknown>[]) => {
  const base = cube ? [lut({content: cube})] : GRADES[grade].effects();
  return [...base, ...extra];
};

export const LutVideo: React.FC<{
  readonly src: string;
  readonly grade?: GradeName;
  /** Override the LUT name; null disables the LUT and uses the effect stack. */
  readonly cube?: string | null;
  readonly extraEffects?: EffectDescriptor<unknown>[];
  readonly style?: React.CSSProperties;
  readonly muted?: boolean;
  readonly trimBefore?: number;
  readonly trimAfter?: number;
  readonly loop?: boolean;
  readonly playbackRate?: number;
  readonly volume?: number;
}> = ({src, grade = 'none', cube, extraEffects = [], style, muted = true, trimBefore, trimAfter, loop, playbackRate, volume}) => {
  const cubeName = cube === undefined ? GRADES[grade].lut : cube;
  const content = useCube(cubeName);
  if (cubeName && !content) return null;
  return <Video src={src} muted={muted} trimBefore={trimBefore} trimAfter={trimAfter} loop={loop} playbackRate={playbackRate} volume={volume} objectFit="cover" style={{width: '100%', height: '100%', ...style}} effects={buildEffects(grade, content, extraEffects)} name="Graded footage" />;
};

export const LutImage: React.FC<{
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly grade?: GradeName;
  readonly cube?: string | null;
  readonly extraEffects?: EffectDescriptor<unknown>[];
  readonly style?: React.CSSProperties;
}> = ({src, width, height, grade = 'none', cube, extraEffects = [], style}) => {
  const cubeName = cube === undefined ? GRADES[grade].lut : cube;
  const content = useCube(cubeName);
  if (cubeName && !content) return null;
  return <CanvasImage src={src} width={width} height={height} style={style} effects={buildEffects(grade, content, extraEffects)} />;
};
