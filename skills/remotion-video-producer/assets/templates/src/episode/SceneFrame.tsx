import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Ctx, fitSize, textWidth, type DiagramCtx} from './kit';
import {KINDS} from './kinds';
import {LEAD_SECONDS} from './load';
import {C, FONT, FPS, LAYOUT, clamp, ease} from './theme';
import type {BrandLogo, TimedScene} from './types';

/** Greedy wrap into at most `maxLines`, shrinking the size until it fits. Keeps authored "\n" breaks. */
const layoutHeadline = (text: string, base: number, width: number, maxLines: number) => {
  for (let size = base; size >= base * 0.6; size -= 2) {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && textWidth(next, size, 750, FONT.display) > width) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
    }
    if (lines.length <= maxLines && lines.every((l) => textWidth(l, size, 750, FONT.display) <= width)) return {lines, size};
  }
  return {lines: text.split('\n'), size: base * 0.6};
};

const Headline: React.FC<{readonly text: string; readonly highlight?: string; readonly x: number; readonly y: number; readonly width: number; readonly size: number; readonly maxLines: number}> = ({text, highlight, x, y, width, size, maxLines}) => {
  const frame = useCurrentFrame();
  const {lines, size: s} = layoutHeadline(text, size, width, maxLines);
  const hl = (highlight ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return (
    <div style={{position: 'absolute', left: x, top: y, width, fontFamily: FONT.display, fontWeight: 750, fontSize: s, lineHeight: 1.04, letterSpacing: -s * 0.025, color: C.text}}>
      {lines.map((line, i) => {
        const p = ease((frame - i * 5) / 20);
        return (
          <div key={i} style={{opacity: p, translate: `0px ${(1 - p) * 26}px`, whiteSpace: 'nowrap'}}>
            {line.split(/(\s+)/).map((word, k) => (
              <span key={k} style={{color: hl.includes(word.toLowerCase().replace(/[^a-z0-9%-]/g, '')) ? C.accent : undefined}}>{word}</span>
            ))}
          </div>
        );
      })}
    </div>
  );
};

/** Word-timed captions: the phrase being spoken, active word in the accent. Chunks are cut at pauses and length. */
const Captions: React.FC<{readonly scene: TimedScene; readonly vertical: boolean}> = ({scene, vertical}) => {
  const frame = useCurrentFrame();
  const L = vertical ? LAYOUT.port : LAYOUT.land;
  if (!scene.voice || !scene.voice.words.length) return null;
  const t = frame / FPS - LEAD_SECONDS;
  const maxWords = vertical ? 4 : 9;
  const chunks: {start: number; end: number; words: typeof scene.voice.words}[] = [];
  let cur: typeof scene.voice.words[number][] = [];
  scene.voice.words.forEach((w, i, all) => {
    cur.push(w);
    const next = all[i + 1];
    const pause = next ? next.start - w.end > 0.35 : true;
    const punct = /[.!?;:,]$/.test(w.text);
    if (cur.length >= maxWords || pause || (punct && cur.length >= (vertical ? 2 : 4)) || !next) {
      chunks.push({start: cur[0].start, end: cur[cur.length - 1].end, words: cur});
      cur = [];
    }
  });
  const idx = chunks.findIndex((c, i) => t >= c.start - 0.05 && t < (chunks[i + 1]?.start ?? c.end + 0.4));
  if (idx < 0) return null;
  const chunk = chunks[idx];
  const size = L.captions.size;
  const text = chunk.words.map((w) => w.text).join(' ');
  const fitted = fitSize(text, size, L.captions.w - size, 700);
  const appear = clamp((t - chunk.start + 0.05) / 0.12);
  return (
    <div style={{position: 'absolute', left: (L.w - L.captions.w) / 2 - (vertical ? 36 : 0), width: L.captions.w, top: L.captions.y, display: 'flex', justifyContent: 'center', opacity: appear}}>
      <div style={{background: 'rgba(8,11,22,0.86)', borderRadius: size * 0.42, padding: `${size * 0.22}px ${size * 0.5}px`, fontFamily: FONT.body, fontWeight: 700, fontSize: fitted, lineHeight: 1.2, color: C.text, textAlign: 'center', maxWidth: L.captions.w}}>
        {chunk.words.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          return (
            <span key={i} style={{color: active ? C.accent : t >= w.end ? C.text : 'rgba(245,247,251,0.55)'}}>
              {i ? ' ' : ''}
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/**
 * One scene: ink background, eyebrow, headline, optional subhead, the scene's diagram, captions and a small
 * source note. The camera is locked; only the graphics move. Layout is native per ratio (theme LAYOUT).
 */
export const SceneFrame: React.FC<{
  readonly scene: TimedScene;
  readonly vertical: boolean;
  readonly brands: Readonly<Record<string, BrandLogo>>;
  readonly eyebrow: string;
  readonly captions: boolean;
  /** Whole-video frame count, for the thin progress line on landscape videos. */
  readonly total?: number;
}> = ({scene, vertical, brands, eyebrow, captions, total}) => {
  const frame = useCurrentFrame();
  const L = vertical ? LAYOUT.port : LAYOUT.land;
  const Kind = KINDS[scene.visual.kind];
  const ctx: DiagramCtx = {frame, frames: scene.frames, vertical, w: L.diagram.w, h: L.diagram.h, brands, beats: scene.beatFrames};
  const diagramIn = ease((frame - 3) / 22);
  return (
    <div style={{position: 'absolute', inset: 0, width: L.w, height: L.h, overflow: 'hidden', background: `radial-gradient(ellipse at 82% 10%, ${C.bgTop} 0%, #0F1427 42%, ${C.bg} 80%)`}}>
      <svg width={L.w} height={L.h} style={{position: 'absolute', inset: 0, opacity: 0.06}}>
        <defs>
          <pattern id="dotgrid" width="64" height="64" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.4" fill="white" />
          </pattern>
        </defs>
        <rect width={L.w} height={L.h} fill="url(#dotgrid)" />
      </svg>
      <div style={{position: 'absolute', left: L.eyebrow.x, top: L.eyebrow.y, display: 'flex', alignItems: 'center', gap: 14, fontFamily: FONT.body, fontSize: vertical ? 24 : 20, fontWeight: 700, letterSpacing: 3.5, color: C.muted}}>
        <span style={{width: 12, height: 12, borderRadius: 12, background: C.accent, display: 'inline-block'}} />
        {eyebrow.toUpperCase()}
      </div>
      <Headline text={scene.headline} highlight={scene.highlight} x={L.headline.x} y={L.headline.y} width={L.headline.w} size={L.headline.size} maxLines={L.headline.maxLines} />
      {scene.subhead ? (
        <div style={{position: 'absolute', left: L.headline.x, top: L.diagram.y - L.subhead.size * 1.9, width: L.headline.w, fontFamily: FONT.body, fontWeight: 500, fontSize: L.subhead.size, color: C.muted, opacity: ease((frame - 10) / 20)}}>{scene.subhead}</div>
      ) : null}
      <div style={{position: 'absolute', left: L.diagram.x, top: L.diagram.y, width: L.diagram.w, height: L.diagram.h, opacity: diagramIn}}>
        <svg width={L.diagram.w} height={L.diagram.h} viewBox={`0 0 ${L.diagram.w} ${L.diagram.h}`} style={{overflow: 'visible'}}>
          <Ctx.Provider value={ctx}>{Kind ? <Kind spec={scene.visual} /> : <text x={20} y={60} fill={C.red} fontSize={40}>{`Unknown visual kind "${scene.visual.kind}"`}</text>}</Ctx.Provider>
        </svg>
      </div>
      {captions ? <Captions scene={scene} vertical={vertical} /> : null}
      {scene.sourceNote ? (
        <div style={{position: 'absolute', right: L.source.right, bottom: L.source.bottom, maxWidth: vertical ? 700 : 900, textAlign: 'right', fontFamily: FONT.body, fontSize: L.source.size, fontWeight: 500, color: C.text, opacity: 0.6, textShadow: '0 1px 6px rgba(0,0,0,0.7)'}}>
          {/^sources?\s*:/i.test(scene.sourceNote) ? scene.sourceNote : `Source: ${scene.sourceNote}`}
        </div>
      ) : null}
      {total && !vertical ? (
        <div style={{position: 'absolute', left: 112, right: 112, bottom: 16, height: 3, background: 'rgba(255,255,255,0.08)'}}>
          <div style={{height: 3, width: `${clamp((scene.from + frame) / total) * 100}%`, background: `linear-gradient(90deg, ${C.cyan}, ${C.violet}, ${C.accent})`}} />
        </div>
      ) : null}
    </div>
  );
};
