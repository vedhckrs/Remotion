import React from 'react';
import {AbsoluteFill, type CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {useFonts} from './Episode';
import {Ctx, Glyph, type DiagramCtx} from './kit';
import {packageUrl} from './load';
import {layoutHeadline} from './SceneFrame';
import {C, FONT, tone} from './theme';
import type {BrandLogo} from './types';

/**
 * Thumbnail for a packaged video, from thumbs/thumbs.json: {<video>: {text, highlight, icon, color?, brands?}}.
 * 16:9 (long) is 1920x1080, rendered at 2/3 scale to YouTube's 1280x720; 9:16 (Short) is a 1080x1920 cover.
 * Same fonts, colours and icons as the video, bundled, so it renders offline.
 */
export const thumbnailSchema = z.object({packageId: z.string(), video: z.string()});

type ThumbSpec = {readonly text: string; readonly highlight?: string; readonly icon?: string; readonly color?: string; readonly brands?: readonly string[]};
type ThumbData = {readonly spec: ThumbSpec; readonly vertical: boolean; readonly label: string; readonly brands: Readonly<Record<string, BrandLogo>>};
export type ThumbnailProps = z.infer<typeof thumbnailSchema> & {readonly data?: ThumbData};

const getJson = async <T,>(url: string, signal?: AbortSignal): Promise<T | null> => {
  const res = await fetch(url, {signal});
  return res.ok ? ((await res.json()) as T) : null;
};

export const calculateThumbnailMetadata: CalculateMetadataFunction<ThumbnailProps> = async ({props, abortSignal}) => {
  const thumbs = (await getJson<Record<string, ThumbSpec>>(packageUrl(props.packageId, 'thumbs/thumbs.json'), abortSignal)) ?? {};
  const production = await getJson<{episode: string; series?: string; videos: {id: string; ratio: string; title: string}[]}>(packageUrl(props.packageId, 'production.json'), abortSignal);
  const brands = (await getJson<Record<string, BrandLogo>>(packageUrl(props.packageId, 'assets/brands.json'), abortSignal)) ?? {};
  const video = production?.videos.find((v) => v.id === props.video);
  if (!video) throw new Error(`Package ${props.packageId} has no video "${props.video}"`);
  const vertical = video.ratio === '9:16';
  const spec = thumbs[props.video] ?? {text: video.title};
  const label = `${production?.series ?? 'How it’s wired'} · ${String(production?.episode ?? props.packageId).toUpperCase()}`;
  return {width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080, durationInFrames: 1, fps: 30, props: {...props, data: {spec, vertical, label, brands}}, defaultOutName: `${props.packageId}_${props.video}_thumbnail`};
};

const HL = (line: string, hl: string[]) =>
  line.split(/(\s+)/).map((word, k) => (
    <span key={k} style={{color: hl.includes(word.toLowerCase().replace(/[^a-z0-9%-]/g, '')) ? C.accent : undefined}}>{word}</span>
  ));

export const Thumbnail: React.FC<ThumbnailProps> = ({data}) => {
  useFonts();
  if (!data) return null;
  const {spec, vertical, label, brands} = data;
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  const color = tone(spec.color, 'cyan');
  const hl = (spec.highlight ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  // Text block: left 58% on 16:9, top on 9:16. Big and heavy: it has to read at phone-feed size.
  const textW = vertical ? 920 : 1040;
  const {lines, size} = layoutHeadline(spec.text, vertical ? 132 : 150, textW, vertical ? 4 : 3);
  const circle = vertical ? 620 : 600;
  const cx = vertical ? W / 2 : 1450;
  const cy = vertical ? 1180 : H / 2 + 20;
  const ctx: DiagramCtx = {frame: 0, frames: 1, vertical, w: W, h: H, brands, beats: []};
  const brandList = (spec.brands ?? []).filter((b) => brands[b]);
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at ${vertical ? '50% 62%' : '76% 50%'}, ${C.bgTop} 0%, #0F1427 45%, ${C.bg} 82%)`, overflow: 'hidden'}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: 0.07}}>
        <defs>
          <pattern id="tdots" width="64" height="64" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.4" fill="white" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#tdots)" />
      </svg>
      {/* Icon in a glowing ring */}
      <div style={{position: 'absolute', left: cx - circle / 2, top: cy - circle / 2, width: circle, height: circle, borderRadius: '50%', background: `radial-gradient(circle, ${color}33 0%, ${color}14 45%, transparent 70%)`}} />
      <div style={{position: 'absolute', left: cx - circle * 0.36, top: cy - circle * 0.36, width: circle * 0.72, height: circle * 0.72, borderRadius: '50%', border: `6px solid ${color}`, boxShadow: `0 0 60px ${color}88, inset 0 0 40px ${color}44`, background: C.panel}} />
      <Ctx.Provider value={ctx}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <Glyph name={spec.icon ?? 'wifi'} x={cx - circle * 0.2} y={cy - circle * 0.2} size={circle * 0.4} color={color} strokeWidth={1.6} />
          {brandList.map((b, i) => {
            const n = brandList.length;
            const a = Math.PI * (0.62 + (0.5 * (i + 0.5)) / n) + (vertical ? Math.PI / 2 : 0);
            const r = circle * 0.47;
            const s = circle * 0.16;
            return (
              <g key={b}>
                <circle cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={s * 0.78} fill={C.panelHi} stroke={C.line} strokeWidth={3} />
                <Glyph name={`brand:${b}`} x={cx + Math.cos(a) * r - s / 2} y={cy + Math.sin(a) * r - s / 2} size={s} />
              </g>
            );
          })}
        </svg>
      </Ctx.Provider>
      {/* Series label */}
      <div style={{position: 'absolute', left: vertical ? 80 : 110, top: vertical ? 200 : 110, display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT.body, fontWeight: 700, fontSize: vertical ? 34 : 32, letterSpacing: 4, color: C.muted}}>
        <span style={{width: 16, height: 16, borderRadius: 16, background: C.accent, display: 'inline-block'}} />
        {label.toUpperCase()}
      </div>
      {/* Title */}
      <div style={{position: 'absolute', left: vertical ? 80 : 110, top: vertical ? 270 : 180, width: textW, height: vertical ? 620 : 720, display: 'flex', flexDirection: 'column', justifyContent: vertical ? 'flex-start' : 'center', fontFamily: FONT.display, fontWeight: 750, fontSize: size, lineHeight: 1.02, letterSpacing: -size * 0.03, color: C.text, textShadow: '0 6px 30px rgba(0,0,0,0.5)'}}>
        {lines.map((line, i) => (
          <div key={i} style={{whiteSpace: 'nowrap'}}>{HL(line, hl)}</div>
        ))}
        <div style={{width: size * 1.6, height: 12, borderRadius: 6, background: C.accent, marginTop: size * 0.35}} />
      </div>
    </AbsoluteFill>
  );
};
