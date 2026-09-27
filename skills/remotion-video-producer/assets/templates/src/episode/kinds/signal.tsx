import React from 'react';
import {Badge, Glyph, Label, Signal, enter, useBeats, useDiagram} from '../kit';
import {C, FONT, frac, tone} from '../theme';

// Deterministic pseudo-random sequence (no Math.random: every render of a frame must be identical).
const hash = (n: number) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

/**
 * wave: radio and light, three modes.
 *  spectrum: {band: {from, to, unit}, channels, hop?: boolean, hopsPerSecond?, busy?: [{from, to, label}], label?}
 *            channels drawn as slots; with hop a lit slot jumps around; busy ranges are marked as crowded.
 *  sine:     {waves: [{label, cycles, color?}]} scrolling sine lines to compare frequencies.
 *  lanes:    {lanes: 3, label?} parallel fibres with pulses of light.
 */
export const Wave: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats(10);
  const mode = (spec.mode as string) ?? 'spectrum';
  const label = b.param('label', (spec.label as string) ?? '').value;

  if (mode === 'sine') {
    const waves = (spec.waves as {label: string; cycles: number; color?: string}[]) ?? [];
    const rowH = (h - (label ? 80 : 0)) / Math.max(1, waves.length);
    return (
      <g>
        {waves.map((wv, i) => {
          const id = wv.label;
          const p = enter(b.since(id, i));
          const color = tone(wv.color, (['cyan', 'violet', 'pink'] as const)[i % 3]);
          const y0 = rowH * (i + 0.5);
          const x0 = vertical ? 0 : w * 0.22;
          const ww = w - x0;
          let d = '';
          for (let k = 0; k <= 160; k++) {
            const x = x0 + (k / 160) * ww * p;
            const y = y0 + Math.sin((k / 160) * wv.cycles * Math.PI * 2 - frame / 8) * rowH * 0.28;
            d += `${k ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
          }
          return (
            <g key={id} opacity={Math.min(1, p * 2) * (b.anyFocus && !b.focused(id) ? 0.35 : 1)}>
              <path d={d} fill="none" stroke={color} strokeWidth={4} />
              <Label x={vertical ? 0 : x0 - 24} y={vertical ? y0 - rowH * 0.34 : y0 + 12} anchor={vertical ? 'start' : 'end'} size={32} color={color} weight={700} maxWidth={vertical ? w : w * 0.2}>{wv.label}</Label>
            </g>
          );
        })}
        {label ? <Badge x={w / 2} y={h - 36} text={label} color="cyan" maxWidth={w * 0.92} /> : null}
      </g>
    );
  }

  if (mode === 'lanes') {
    const lanes = (spec.lanes as number) ?? 3;
    const colors = [C.cyan, C.violet, C.pink, C.green];
    const top = h * 0.16;
    const laneH = (h * 0.6) / lanes;
    return (
      <g>
        {Array.from({length: lanes}, (_, i) => {
          const y = top + i * laneH + laneH / 2;
          const p = enter(b.since(`lane${i}`, i));
          return (
            <g key={i} opacity={p}>
              <rect x={20} y={y - laneH * 0.22} width={w - 40} height={laneH * 0.44} rx={laneH * 0.22} fill={colors[i % 4]} fillOpacity={0.1} stroke={colors[i % 4]} strokeOpacity={0.4} />
              {Array.from({length: 7}, (_, k) => {
                const x = 20 + frac(frame / 140 + k / 7 + i * 0.13) * (w - 40);
                return <circle key={k} cx={x} cy={y} r={7} fill={colors[i % 4]} opacity={hash(k + i * 7 + Math.floor(frame / 20)) > 0.3 ? 1 : 0.25} />;
              })}
            </g>
          );
        })}
        {label ? <Badge x={w / 2} y={h - 40} text={label} color="cyan" maxWidth={w * 0.92} /> : null}
      </g>
    );
  }

  // spectrum
  const band = (spec.band as {from: number; to: number; unit: string}) ?? {from: 2.4, to: 2.4835, unit: 'GHz'};
  const channels = (spec.channels as number) ?? 40;
  const hop = b.param('hop', Boolean(spec.hop)).value;
  const hps = (spec.hopsPerSecond as number) ?? 6; // shown speed; real hopping is far faster
  const busy = b.param<{from: number; to: number; label?: string}[]>('busy', (spec.busy as never) ?? []).value;
  const x0 = vertical ? 10 : 60;
  const bw = w - x0 * 2;
  const slotW = bw / channels;
  const y = vertical ? h * 0.3 : h * 0.34;
  const sh = vertical ? h * 0.3 : h * 0.34;
  const lit = hop ? Math.floor(hash(Math.floor((frame / 60) * hps)) * channels) : -1;
  const inBusy = (c: number) => busy.some((r) => c >= r.from && c <= r.to);
  const reveal = enter(frame, 30);
  return (
    <g>
      {busy.map((r, i) => (
        <g key={i} opacity={enter(b.since(`busy${i}`, 2 + i))}>
          <rect x={x0 + r.from * slotW - 4} y={y - 14} width={(r.to - r.from + 1) * slotW + 8} height={sh + 28} rx={16} fill={C.red} fillOpacity={0.12} stroke={C.red} strokeOpacity={0.5} strokeDasharray="10 8" />
          {r.label ? <Label x={x0 + ((r.from + r.to + 1) / 2) * slotW} y={y - 30} size={vertical ? 26 : 26} color={C.red} weight={700}>{r.label}</Label> : null}
        </g>
      ))}
      {Array.from({length: channels}, (_, c) => {
        const on = c === lit && !inBusy(c);
        const shown = c / channels <= reveal;
        return <rect key={c} x={x0 + c * slotW + slotW * 0.15} y={y} width={Math.max(2, slotW * 0.7)} height={sh} rx={Math.min(6, slotW * 0.3)} fill={on ? C.accent : inBusy(c) ? C.red : C.cyan} opacity={shown ? (on ? 1 : inBusy(c) ? 0.35 : 0.3) : 0} />;
      })}
      {lit >= 0 && !inBusy(lit) ? (
        <g>
          <circle cx={x0 + (lit + 0.5) * slotW} cy={y - 26} r={10} fill={C.accent} />
          <line x1={x0 + (lit + 0.5) * slotW} y1={y - 16} x2={x0 + (lit + 0.5) * slotW} y2={y} stroke={C.accent} strokeWidth={3} />
        </g>
      ) : null}
      <Label x={x0} y={y + sh + 48} anchor="start" size={vertical ? 30 : 28} color={C.muted}>{`${band.from} ${band.unit}`}</Label>
      <Label x={x0 + bw} y={y + sh + 48} anchor="end" size={vertical ? 30 : 28} color={C.muted}>{`${band.to} ${band.unit}`}</Label>
      <Label x={w / 2} y={y + sh + 48} size={vertical ? 30 : 28} color={C.text} weight={650}>{`${channels} channels`}</Label>
      {label ? <Badge x={w / 2} y={h - 36} text={label} color="accent" maxWidth={w * 0.92} /> : null}
    </g>
  );
};

/**
 * hero: one strong symbol for hooks and endings. {icon, color?, rings?: boolean, orbit?: [icons], big?: string, sub?: string}
 * Orbiting icons (brands or devices) circle slowly around the centre.
 */
export const Hero: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats(8);
  const color = tone(spec.color as string, 'accent');
  const orbit = (spec.orbit as string[]) ?? [];
  const big = spec.big as string | undefined;
  const sub = spec.sub as string | undefined;
  // Landscape: symbol left, statement right. Portrait: symbol above, statement below. Nothing overlaps the orbit.
  const split = Boolean(big) && !vertical;
  const cx = split ? w * 0.27 : w / 2;
  const cy = vertical ? (big ? h * 0.38 : h * 0.46) : h * 0.5;
  const size = vertical ? 230 : 210;
  const R = vertical ? Math.min(w * 0.36, cy - 50) : h * 0.4;
  const rx = vertical ? R : R * (split ? 1.3 : 1.6);
  const ry = vertical ? R : R * 0.85;
  const p = enter(frame - 2, 26);
  const textX = split ? w * 0.7 : w / 2;
  const textY = split ? h * 0.5 : h * 0.9;
  return (
    <g>
      {spec.rings !== false ? <Signal x={cx} y={cy} color={(spec.color as string) ?? 'accent'} size={vertical ? 2.2 : 2} period={120} /> : null}
      <g opacity={p} transform={`translate(${cx} ${cy}) scale(${0.85 + 0.15 * p})`}>
        <circle r={size * 0.72} fill={C.panel} stroke={color} strokeWidth={3} />
        <Glyph name={(spec.icon as string) ?? 'zap'} x={-size * 0.4} y={-size * 0.4} size={size * 0.8} color={color} />
      </g>
      {orbit.map((icon, i) => {
        const a = (i / orbit.length) * Math.PI * 2 + frame / 400;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        const ip = enter(b.since(icon, i + 1));
        return (
          <g key={icon} opacity={ip}>
            <circle cx={x} cy={y} r={56} fill={C.panel} stroke={C.line} strokeWidth={2} />
            <Glyph name={icon} x={x - 32} y={y - 32} size={64} color={C.text} />
          </g>
        );
      })}
      {big ? <Label x={textX} y={textY} size={vertical ? 130 : 150} weight={750} family={FONT.display} color={color} maxWidth={split ? w * 0.44 : w * 0.95} opacity={enter(frame - 12, 24)}>{big}</Label> : null}
      {sub ? <Label x={textX} y={textY + (vertical ? 70 : 76)} size={vertical ? 36 : 36} color={C.muted} weight={500} maxWidth={split ? w * 0.44 : w * 0.9} opacity={enter(frame - 18, 24)}>{sub}</Label> : null}
    </g>
  );
};

type Callout = {id?: string; label: string; at: string};

// Anchor points per device, 0..1 inside the device box.
const ANCHORS: Record<string, Record<string, [number, number]>> = {
  phone: {screen: [0.5, 0.45], antenna: [0.5, 0.02], chip: [0.5, 0.7], camera: [0.5, 0.06], battery: [0.5, 0.82], speaker: [0.5, 0.95]},
  earbuds: {left: [0.25, 0.4], right: [0.75, 0.4], mic: [0.25, 0.75], chip: [0.75, 0.3], case: [0.5, 0.9]},
  router: {antenna: [0.2, 0.05], lights: [0.5, 0.72], port: [0.85, 0.72], box: [0.5, 0.6]},
  tower: {top: [0.5, 0.05], antenna: [0.5, 0.25], base: [0.5, 0.95]},
};

/**
 * device: an illustrated device with pointing labels. {device: phone | earbuds | router | tower | <lucide icon>,
 * callouts: [{id, label, at: anchor}], screen?: {brands?: [...], play?: boolean, bars?: boolean}, color?}
 * Beats: show callout ids in order; focus a callout to fade the others.
 */
export const Device: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats(16);
  const device = (spec.device as string) ?? 'phone';
  const color = tone(spec.color as string, 'cyan');
  const callouts = (spec.callouts as Callout[]) ?? [];
  const screen = (spec.screen as {brands?: string[]; play?: boolean; bars?: boolean}) ?? {};
  const dh = vertical ? h * 0.72 : h * 0.9;
  const dw = device === 'phone' ? dh * 0.5 : device === 'earbuds' ? dh * 1.1 : device === 'router' ? dh * 1.2 : device === 'tower' ? dh * 0.55 : dh;
  const dx = vertical ? w / 2 - dw / 2 : w * 0.3 - dw / 2;
  const dy = vertical ? 10 : (h - dh) / 2;
  const p = enter(frame - 2, 26);

  const body = (() => {
    if (device === 'phone') {
      return (
        <g>
          <rect x={dx - 8} y={dy - 8} width={dw + 16} height={dh + 16} rx={dw * 0.16} fill="#3A4262" />
          <rect x={dx} y={dy} width={dw} height={dh} rx={dw * 0.14} fill="#0A0E1D" stroke="#7483AC" strokeWidth={2} />
          <rect x={dx + dw * 0.05} y={dy + dw * 0.05} width={dw * 0.9} height={dh - dw * 0.1} rx={dw * 0.1} fill="#1A2350" />
          <rect x={dx + dw * 0.36} y={dy + dw * 0.09} width={dw * 0.28} height={dw * 0.07} rx={dw * 0.035} fill="#0A0E1D" />
          {screen.bars !== false ? [1, 2, 3, 4].map((k, i) => <rect key={k} x={dx + dw * 0.66 + i * dw * 0.06} y={dy + dw * 0.3 - k * dw * 0.035} width={dw * 0.04} height={k * dw * 0.035} rx={3} fill={C.green} />) : null}
          <rect x={dx + dw * 0.1} y={dy + dh * 0.28} width={dw * 0.8} height={dh * 0.34} rx={dw * 0.06} fill={color} opacity={0.22} />
          {screen.play !== false ? (
            <g>
              <circle cx={dx + dw / 2} cy={dy + dh * 0.45} r={dw * 0.13} fill={C.text} />
              <path d={`M ${dx + dw / 2 - dw * 0.04} ${dy + dh * 0.45 - dw * 0.065} l ${dw * 0.1} ${dw * 0.065} l ${-dw * 0.1} ${dw * 0.065} z`} fill="#1A2350" />
            </g>
          ) : null}
          {(screen.brands ?? []).slice(0, 3).map((br, i, arr) => (
            <Glyph key={br} name={`brand:${br}`} x={dx + dw * (0.5 + (i - (arr.length - 1) / 2) * 0.26) - dw * 0.08} y={dy + dh * 0.78} size={dw * 0.16} />
          ))}
        </g>
      );
    }
    if (device === 'earbuds') {
      const bud = (cx: number, flip: number) => (
        <g transform={`translate(${cx} ${dy + dh * 0.38}) scale(${flip} 1)`}>
          <ellipse cx={0} cy={0} rx={dw * 0.11} ry={dh * 0.16} fill="#E8ECF6" />
          <rect x={-dw * 0.035} y={dh * 0.08} width={dw * 0.07} height={dh * 0.34} rx={dw * 0.035} fill="#E8ECF6" />
          <ellipse cx={dw * 0.05} cy={-dh * 0.03} rx={dw * 0.04} ry={dh * 0.06} fill="#9AA3BD" />
        </g>
      );
      return (
        <g>
          <rect x={dx + dw * 0.25} y={dy + dh * 0.72} width={dw * 0.5} height={dh * 0.26} rx={dh * 0.1} fill="#DDE2EE" />
          <rect x={dx + dw * 0.25} y={dy + dh * 0.72} width={dw * 0.5} height={dh * 0.08} rx={dh * 0.04} fill="#C3CAD9" />
          <circle cx={dx + dw * 0.5} cy={dy + dh * 0.88} r={dh * 0.012} fill={C.green} />
          {bud(dx + dw * 0.25, 1)}
          {bud(dx + dw * 0.75, -1)}
          <Signal x={dx + dw * 0.25} y={dy + dh * 0.3} color={spec.color as string ?? 'cyan'} size={0.9} />
          <Signal x={dx + dw * 0.75} y={dy + dh * 0.3} color={spec.color as string ?? 'cyan'} size={0.9} />
        </g>
      );
    }
    if (device === 'router') {
      const blink = (i: number) => (hash(i + Math.floor(frame / 8)) > 0.4 ? 1 : 0.3);
      return (
        <g>
          {[0.2, 0.8].map((ax) => <rect key={ax} x={dx + dw * ax - 8} y={dy + dh * 0.05} width={16} height={dh * 0.5} rx={8} fill="#5B6488" />)}
          <rect x={dx} y={dy + dh * 0.5} width={dw} height={dh * 0.34} rx={dh * 0.08} fill="#1E2748" stroke="#7483AC" strokeWidth={2} />
          {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={dx + dw * (0.25 + i * 0.1)} cy={dy + dh * 0.72} r={dh * 0.02} fill={i === 0 ? C.green : C.cyan} opacity={blink(i)} />)}
          <Signal x={dx + dw * 0.5} y={dy + dh * 0.3} color={spec.color as string ?? 'cyan'} size={1.2} />
        </g>
      );
    }
    if (device === 'tower') {
      return (
        <g>
          <path d={`M ${dx + dw * 0.5} ${dy + dh * 0.08} L ${dx + dw * 0.15} ${dy + dh} M ${dx + dw * 0.5} ${dy + dh * 0.08} L ${dx + dw * 0.85} ${dy + dh}`} stroke="#8791B3" strokeWidth={8} />
          {[0.3, 0.5, 0.7, 0.9].map((t) => <line key={t} x1={dx + dw * (0.5 - 0.35 * t)} y1={dy + dh * (0.08 + 0.92 * t)} x2={dx + dw * (0.5 + 0.35 * t)} y2={dy + dh * (0.08 + 0.92 * t)} stroke="#8791B3" strokeWidth={5} />)}
          {[-1, 1].map((s) => <rect key={s} x={dx + dw * 0.5 + s * dw * 0.14 - 10} y={dy + dh * 0.16} width={20} height={dh * 0.14} rx={6} fill="#C9D0E4" />)}
          <Signal x={dx + dw * 0.5} y={dy + dh * 0.12} color={spec.color as string ?? 'cyan'} size={1.3} />
        </g>
      );
    }
    // Any Lucide icon as a large illustration.
    return (
      <g>
        <circle cx={dx + dw / 2} cy={dy + dh / 2} r={dh * 0.42} fill={C.panel} stroke={color} strokeWidth={3} />
        <Glyph name={device} x={dx + dw / 2 - dh * 0.26} y={dy + dh / 2 - dh * 0.26} size={dh * 0.52} color={color} />
      </g>
    );
  })();

  const anchors = ANCHORS[device] ?? {center: [0.5, 0.5]};
  const labelX = vertical ? 0 : w * 0.56;
  return (
    <g>
      <g opacity={p} transform={`translate(0 ${(1 - p) * 20})`}>{body}</g>
      {callouts.map((c, i) => {
        const id = c.id ?? c.at;
        const cp = enter(b.since(id, i + 1));
        const [ax, ay] = anchors[c.at] ?? [0.5, 0.5];
        const px = dx + ax * dw;
        const py = dy + ay * dh;
        const ly = vertical ? dy + dh + 70 + i * 60 : h * 0.18 + i * ((h * 0.66) / Math.max(1, callouts.length - 1 || 1));
        const lx = vertical ? w * 0.08 : labelX;
        const dim = b.anyFocus && !b.focused(id);
        return (
          <g key={id} opacity={cp * (dim ? 0.35 : 1)}>
            {!vertical ? <polyline points={`${px},${py} ${lx - 60},${ly - 10} ${lx - 16},${ly - 10}`} fill="none" stroke={C.accent} strokeWidth={2.5} strokeDasharray={`${cp * 2000} 2000`} /> : null}
            <circle cx={px} cy={py} r={vertical ? 17 : 9} fill={C.accent} />
            {vertical ? <text x={px} y={py + 8} textAnchor="middle" fill={C.bg} fontSize={22} fontWeight={800} fontFamily={FONT.body}>{String(i + 1)}</text> : null}
            <circle cx={px} cy={py} r={9 + 10 * frac(frame / 50)} fill="none" stroke={C.accent} strokeWidth={2} opacity={1 - frac(frame / 50)} />
            {vertical ? <text x={lx - 26} y={ly + 2} fill={C.accent} fontSize={30} fontWeight={800} fontFamily={FONT.body}>{String(i + 1)}</text> : null}
            <Label x={lx} y={ly} anchor="start" size={vertical ? 34 : 36} weight={650} maxWidth={vertical ? w * 0.86 : w * 0.42}>{c.label}</Label>
          </g>
        );
      })}
    </g>
  );
};

