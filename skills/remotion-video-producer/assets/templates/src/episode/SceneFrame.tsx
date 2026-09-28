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

type Word = {readonly text: string; readonly start: number; readonly end: number};

/**
 * Subtitle pages of 2-3 words. A page never runs across a sentence or clause break or a pause, never leaves one
 * word alone when it can be avoided (4 -> 2 + 2), and stays within `maxChars` so it fits on one small line.
 */
export const subtitlePages = (words: readonly Word[], maxChars: number): Word[][] => {
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || /[.!?;:,]["”’)]?$/.test(w.text) || next.start - w.end > 0.3) {
      phrases.push(cur);
      cur = [];
    }
  });
  const pages: Word[][] = [];
  const len = (p: Word[]) => p.map((w) => w.text).join(' ').length;
  for (const phrase of phrases) {
    let rest = phrase;
    while (rest.length) {
      let take = rest.length <= 3 ? rest.length : rest.length === 4 ? 2 : 3;
      while (take > 1 && len(rest.slice(0, take)) > maxChars) take--;
      pages.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
  }
  return pages;
};

/** Sentence case: lower case except the first letter; acronyms and names with inner capitals (CDN, Wi-Fi, YouTube) and "I" stay as written. Trailing . , ; : are dropped. */
export const subtitleText = (page: readonly Word[]) =>
  page
    .map((w, i) => {
      let t = w.text.replace(/[.,;:]+(["”’)]?)$/, '$1');
      const keep = (t.match(/[A-Z]/g) ?? []).length >= 2 || /^I(['’]|$)/.test(t);
      if (!keep) t = t.toLowerCase();
      if (i === 0) t = t.replace(/[a-z]/, (c) => c.toUpperCase());
      return t;
    })
    .join(' ');

/**
 * Subtitles: one short line, white text on a 70% black box, centred, bottom edge 20% up from the bottom of the
 * frame (above the Shorts title and channel UI). Timed from the measured voice.
 */
const Captions: React.FC<{readonly scene: TimedScene; readonly vertical: boolean}> = ({scene, vertical}) => {
  const frame = useCurrentFrame();
  const L = vertical ? LAYOUT.port : LAYOUT.land;
  if (!scene.voice || !scene.voice.words.length) return null;
  const t = frame / FPS - LEAD_SECONDS;
  const pages = subtitlePages(scene.voice.words, L.captions.maxChars);
  const idx = pages.findIndex((p, i) => t >= p[0].start - 0.05 && t < Math.min(pages[i + 1]?.[0].start ?? Infinity, p[p.length - 1].end + 0.35));
  if (idx < 0) return null;
  const text = subtitleText(pages[idx]);
  const size = fitSize(text, L.captions.size, L.w * 0.8, 500);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: L.h * L.captions.bottom, display: 'flex', justifyContent: 'center'}}>
      <div style={{background: 'rgba(0,0,0,0.7)', color: '#FFFFFF', fontFamily: FONT.body, fontWeight: 500, fontSize: size, lineHeight: 1.25, padding: `${Math.round(size * 0.24)}px ${Math.round(size * 0.55)}px`, borderRadius: Math.round(size * 0.18), whiteSpace: 'nowrap', letterSpacing: 0.1}}>
        {text}
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
