import React from 'react';
import {Badge, Glyph, Label, Panel, enter, pointAt, useBeats, useDiagram, type Pt} from '../kit';
import {C, FONT, ease, frac, tone} from '../theme';

type Item = {id?: string; label: string; sub?: string; icon?: string; color?: string; value?: string; points?: string[]; ok?: boolean};
const idOf = (it: Item, i: number) => it.id ?? `i${i}`;

/**
 * compare: two or three options side by side (portrait: stacked).
 * {items: [{id, label, icon?, color?, value?, points?: [..]}], vs?: boolean, winner?: id}
 * Beats: show ids, focus the one that wins, set {winner}.
 */
export const Compare: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical} = useDiagram();
  const b = useBeats(14);
  const items = (spec.items as Item[]) ?? [];
  const n = Math.max(1, items.length);
  const winner = b.param<string | null>('winner', (spec.winner as string) ?? null).value;
  const gap = vertical ? 28 : 40;
  const cw = vertical ? w : (w - gap * (n - 1)) / n;
  const ch = vertical ? (h - gap * (n - 1)) / n : h * 0.92;
  return (
    <g>
      {items.map((it, i) => {
        const id = idOf(it, i);
        const p = enter(b.since(id, i));
        const x = vertical ? 0 : i * (cw + gap);
        const y = vertical ? i * (ch + gap) : (h - ch) / 2;
        const color = tone(it.color, (['cyan', 'violet', 'pink'] as const)[i % 3]);
        const win = winner === id || b.focused(id);
        const dim = (winner !== null || b.anyFocus) && !win;
        const iconSize = vertical ? Math.min(130, ch * 0.5) : 150;
        const textX = vertical ? iconSize + 70 : cw / 2;
        const anchor = vertical ? 'start' : 'middle';
        const lines = it.points ?? [];
        return (
          <g key={id} opacity={p * (dim ? 0.4 : 1)} transform={`translate(${x} ${y + (1 - p) * 24})`}>
            <Panel x={0} y={0} w={cw} h={ch} color={win ? 'accent' : it.color} />
            {win ? <rect x={-4} y={-4} width={cw + 8} height={ch + 8} rx={30} fill="none" stroke={C.accent} strokeWidth={3} /> : null}
            <Glyph name={it.icon ?? 'circle'} x={vertical ? 36 : cw / 2 - iconSize / 2} y={vertical ? ch / 2 - iconSize / 2 : 44} size={iconSize} color={color} />
            <Label x={textX} y={vertical ? ch / 2 - (it.value || lines.length ? 24 : -16) : iconSize + 120} anchor={anchor} size={vertical ? 50 : 50} weight={700} maxWidth={vertical ? cw - textX - 24 : cw - 48}>{it.label}</Label>
            {it.value ? <Label x={textX} y={vertical ? ch / 2 + 44 : iconSize + 196} anchor={anchor} size={vertical ? 48 : 64} color={color} weight={750} family={FONT.display} maxWidth={vertical ? cw - textX - 24 : cw - 48}>{it.value}</Label> : null}
            {lines.slice(0, vertical ? 1 : 3).map((line, k) => (
              <Label key={k} x={textX} y={vertical ? ch / 2 + 44 + (it.value ? 52 : 0) : iconSize + (it.value ? 262 : 186) + k * 46} anchor={anchor} size={vertical ? 32 : 32} color={C.muted} weight={500} maxWidth={vertical ? cw - textX - 24 : cw - 48}>{line}</Label>
            ))}
          </g>
        );
      })}
      {spec.vs && n === 2 ? (
        <g opacity={enter(b.since(idOf(items[1], 1), 1))}>
          <circle cx={vertical ? w / 2 : w / 2} cy={vertical ? ch + gap / 2 : h / 2} r={40} fill={C.accent} />
          <Label x={w / 2} y={(vertical ? ch + gap / 2 : h / 2) + 12} size={32} color={C.bg} weight={800} halo={false}>VS</Label>
        </g>
      ) : null}
    </g>
  );
};

/**
 * layers: what something is made of. style rings (cross-section, e.g. a cable) or stack (layers of a system).
 * {style, items: [{id, label, sub?, color?}] (outermost / top first), title?}
 */
export const Layers: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats(12);
  const items = (spec.items as Item[]) ?? [];
  const style = (spec.style as string) ?? 'rings';
  const palette = ['violet', 'cyan', 'amber', 'green', 'pink', 'accent'];
  if (style === 'rings') {
    const R = vertical ? Math.min(w * 0.42, h * 0.34) : Math.min(h * 0.46, w * 0.2);
    const cx = vertical ? w / 2 : w * 0.26;
    const cy = vertical ? R + 20 : h / 2;
    return (
      <g>
        {items.map((it, i) => {
          const id = idOf(it, i);
          const p = enter(b.since(id, i));
          const r = R * (1 - i / (items.length + 0.4));
          const color = tone(it.color, palette[i % palette.length] as never);
          const focus = b.focused(id);
          return <circle key={id} cx={cx} cy={cy} r={r * (0.9 + 0.1 * p)} fill={color} fillOpacity={0.14 + (focus ? 0.2 : 0)} stroke={color} strokeWidth={focus ? 5 : 3} opacity={p} />;
        })}
        {/* the core glints so a still cross-section still reads as live */}
        <circle cx={cx} cy={cy} r={R * 0.12} fill={C.accent} opacity={0.5 + 0.5 * Math.sin(frame / 14)} />
        {items.map((it, i) => {
          const id = idOf(it, i);
          const p = enter(b.since(id, i));
          const color = tone(it.color, palette[i % palette.length] as never);
          const ly = vertical ? cy + R + 80 + i * 70 : cy - (items.length - 1) * 44 + i * 88;
          const lx = vertical ? w * 0.1 : w * 0.52;
          const r = R * (1 - i / (items.length + 0.4));
          return (
            <g key={`l-${id}`} opacity={p * (b.anyFocus && !b.focused(id) ? 0.4 : 1)}>
              {!vertical ? <polyline points={`${cx + r * 0.7},${cy - r * 0.7 + (i - (items.length - 1) / 2) * 6} ${lx - 90},${ly - 10} ${lx - 24},${ly - 10}`} fill="none" stroke={color} strokeWidth={2} opacity={0.6} /> : null}
              <circle cx={lx - 4} cy={ly - 10} r={9} fill={color} />
              <Label x={lx + 20} y={ly} anchor="start" size={vertical ? 40 : 38} weight={650} maxWidth={vertical ? w * 0.85 : w * 0.46}>{it.label}</Label>
              {it.sub && !vertical ? <Label x={lx + 20} y={ly + 34} anchor="start" size={24} color={C.muted} weight={500} maxWidth={w * 0.46}>{it.sub}</Label> : null}
            </g>
          );
        })}
      </g>
    );
  }
  // stack
  const rowH = Math.min(vertical ? 120 : 96, (h - 40) / Math.max(1, items.length));
  const top = (h - rowH * items.length) / 2;
  const sw = vertical ? w : w * 0.7;
  const sx = vertical ? 0 : (w - sw) / 2;
  return (
    <g>
      {items.map((it, i) => {
        const id = idOf(it, i);
        const p = enter(b.since(id, i));
        const color = tone(it.color, palette[i % palette.length] as never);
        const y = top + i * rowH;
        return (
          <g key={id} opacity={p * (b.anyFocus && !b.focused(id) ? 0.4 : 1)} transform={`translate(${(1 - p) * -40} 0)`}>
            <rect x={sx} y={y + 6} width={sw} height={rowH - 12} rx={18} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={b.focused(id) ? 4 : 2} />
            {it.icon ? <Glyph name={it.icon} x={sx + 24} y={y + rowH / 2 - 26} size={52} color={color} /> : null}
            <Label x={sx + (it.icon ? 96 : 32)} y={y + rowH / 2 + 12} anchor="start" size={vertical ? 36 : 34} weight={650} maxWidth={sw * 0.55}>{it.label}</Label>
            {it.sub ? <Label x={sx + sw - 28} y={y + rowH / 2 + 10} anchor="end" size={vertical ? 26 : 26} color={C.muted} weight={500} maxWidth={sw * 0.38}>{it.sub}</Label> : null}
          </g>
        );
      })}
    </g>
  );
};

/**
 * grid: many small units (packets, frames, devices). {count?, items?: [{id, label?, icon?}], icon?, cols?, caption?}
 * Beats: set {missing: [ids]} to mark gaps, set {done: [ids]} to tick them, show ids to reveal in order.
 * Ids default to "1".."n".
 */
export const Grid: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical} = useDiagram();
  const b = useBeats(4);
  const items: Item[] = (spec.items as Item[]) ?? Array.from({length: (spec.count as number) ?? 8}, (_, i) => ({id: String(i + 1), label: String(i + 1)}));
  const cols = (spec.cols as number) ?? (vertical ? 4 : Math.min(8, items.length));
  const rows = Math.ceil(items.length / cols);
  const missing = new Set(b.param<string[]>('missing', []).value);
  const done = new Set(b.param<string[]>('done', []).value);
  const caption = b.param('caption', (spec.caption as string) ?? '').value;
  const capSpace = caption ? 90 : 0;
  const cell = Math.min((w - 20) / cols, (h - capSpace - 20) / rows);
  const size = cell * 0.78;
  const ox = (w - cols * cell) / 2 + (cell - size) / 2;
  const oy = (h - capSpace - rows * cell) / 2 + (cell - size) / 2;
  return (
    <g>
      {items.map((it, i) => {
        const id = idOf(it, i);
        const p = enter(b.since(id, i), 16);
        const x = ox + (i % cols) * cell;
        const y = oy + Math.floor(i / cols) * cell;
        const gone = missing.has(id);
        const ok = done.has(id);
        const color = gone ? C.red : ok ? C.green : i % 2 ? C.violet : C.cyan;
        return (
          <g key={id} opacity={p * (gone ? 0.5 : 1)} transform={`translate(${x} ${y + (1 - p) * 30})`}>
            <rect width={size} height={size} rx={size * 0.2} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2.5} strokeDasharray={gone ? '10 8' : undefined} />
            <Glyph name={gone ? 'circle-question-mark' : ok ? 'check' : it.icon ?? (spec.icon as string) ?? 'package'} x={size * 0.28} y={size * 0.16} size={size * 0.44} color={color} />
            {it.label ? <Label x={size / 2} y={size * 0.86} size={Math.max(20, size * 0.18)} color={C.text} weight={650}>{gone ? '?' : it.label}</Label> : null}
          </g>
        );
      })}
      {caption ? <Badge x={w / 2} y={h - 40} text={caption} color="cyan" maxWidth={w * 0.92} /> : null}
    </g>
  );
};

/**
 * timeline: steps along a line with a travelling marker. {steps: [{id, label, sub?, icon?}], marker?: boolean}
 * Portrait runs top to bottom. Beats: show step ids, set {at: stepIndex} to move the marker.
 */
export const Timeline: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats(14);
  const steps = (spec.steps as Item[]) ?? [];
  const n = Math.max(1, steps.length);
  const pos = (i: number): Pt => (vertical ? [w * 0.1, 60 + (i * (h - 120)) / Math.max(1, n - 1)] : [110 + (i * (w - 220)) / Math.max(1, n - 1), h * 0.4]);
  const markerIdx = b.param('at', -1);
  const mt = ease((frame - Math.max(0, markerIdx.changedAt)) / 40);
  const target = markerIdx.value < 0 ? null : markerIdx.previous < 0 ? pos(markerIdx.value) : pointAt([pos(markerIdx.previous), pos(markerIdx.value)], mt);
  return (
    <g>
      <line x1={pos(0)[0]} y1={pos(0)[1]} x2={pos(n - 1)[0]} y2={pos(n - 1)[1]} stroke={C.line} strokeWidth={6} strokeLinecap="round" />
      {steps.map((s, i) => {
        const id = idOf(s, i);
        const p = enter(b.since(id, i));
        const [x, y] = pos(i);
        const color = tone(s.color, 'cyan');
        return (
          <g key={id} opacity={p}>
            {i > 0 ? <line x1={pos(i - 1)[0]} y1={pos(i - 1)[1]} x2={pos(i - 1)[0] + (x - pos(i - 1)[0]) * p} y2={pos(i - 1)[1] + (y - pos(i - 1)[1]) * p} stroke={color} strokeWidth={6} strokeLinecap="round" /> : null}
            <circle cx={x} cy={y} r={b.focused(id) ? 42 : 36} fill={C.panel} stroke={color} strokeWidth={4} />
            {s.icon ? <Glyph name={s.icon} x={x - 22} y={y - 22} size={44} color={color} /> : null}
            <Label x={vertical ? x + 70 : x} y={vertical ? y + 14 : y + 92} anchor={vertical ? 'start' : 'middle'} size={vertical ? 44 : 38} weight={650} maxWidth={vertical ? w * 0.8 : (w - 160) / n + 40}>{s.label}</Label>
            {s.sub ? <Label x={vertical ? x + 70 : x} y={vertical ? y + 56 : y + 134} anchor={vertical ? 'start' : 'middle'} size={vertical ? 30 : 28} color={C.muted} weight={500} maxWidth={vertical ? w * 0.8 : (w - 160) / n + 40}>{s.sub}</Label> : null}
          </g>
        );
      })}
      {target ? <circle cx={target[0]} cy={target[1]} r={12} fill={C.accent} /> : null}
    </g>
  );
};

/** cycle: a loop of steps with a token travelling round. {steps: [{id, label, icon?, color?}]} */
export const Cycle: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats(10);
  const steps = (spec.steps as Item[]) ?? [];
  const n = Math.max(1, steps.length);
  const R = vertical ? Math.min(w, h) * 0.36 : h * 0.38;
  const cx = w / 2;
  const cy = vertical ? h * 0.46 : h / 2;
  const a = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const t = frac(frame / 240);
  return (
    <g>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.line} strokeWidth={6} strokeDasharray="4 14" />
      <circle cx={cx + Math.cos(t * Math.PI * 2 - Math.PI / 2) * R} cy={cy + Math.sin(t * Math.PI * 2 - Math.PI / 2) * R} r={12} fill={C.accent} />
      {steps.map((s, i) => {
        const id = idOf(s, i);
        const p = enter(b.since(id, i));
        const x = cx + Math.cos(a(i)) * R;
        const y = cy + Math.sin(a(i)) * R;
        const color = tone(s.color, (['cyan', 'violet', 'pink', 'green', 'amber'] as const)[i % 5]);
        const out = Math.cos(a(i)) >= 0 ? 1 : -1;
        return (
          <g key={id} opacity={p * (b.anyFocus && !b.focused(id) ? 0.4 : 1)}>
            <circle cx={x} cy={y} r={64} fill={C.panel} stroke={color} strokeWidth={3} />
            <Glyph name={s.icon ?? 'circle'} x={x - 34} y={y - 34} size={68} color={color} />
            <Label x={Math.abs(Math.cos(a(i))) < 0.3 ? x : x + out * 88} y={Math.abs(Math.cos(a(i))) < 0.3 ? y + (Math.sin(a(i)) < 0 ? -86 : 112) : y + 13} anchor={Math.abs(Math.cos(a(i))) < 0.3 ? 'middle' : out > 0 ? 'start' : 'end'} size={vertical ? 38 : 38} weight={650} maxWidth={vertical ? w * 0.34 : w * 0.3}>{s.label}</Label>
          </g>
        );
      })}
    </g>
  );
};

/** checklist: items ticked (or crossed) in order. {items: [{id, label, sub?, ok?: boolean}]} Beats: show ids. */
export const Checklist: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical} = useDiagram();
  const b = useBeats(22);
  const items = (spec.items as Item[]) ?? [];
  const rowH = Math.min(vertical ? 150 : 130, h / Math.max(1, items.length));
  const top = (h - rowH * items.length) / 2;
  const x0 = vertical ? 10 : w * 0.2;
  const tw = vertical ? w - 120 : w * 0.64;
  return (
    <g>
      {items.map((it, i) => {
        const id = idOf(it, i);
        const since = b.since(id, i);
        const p = enter(since);
        const tick = enter(since - 10, 14);
        const ok = it.ok !== false;
        const color = ok ? C.green : C.red;
        const y = top + i * rowH + rowH / 2;
        return (
          <g key={id} opacity={Math.max(0.28, p)}>
            <rect x={x0} y={y - 38} width={76} height={76} rx={20} fill={C.panel} stroke={tick > 0 ? color : C.line} strokeWidth={3} />
            {tick > 0 ? <Glyph name={ok ? 'check' : 'x'} x={x0 + 10} y={y - 28} size={56} color={color} /> : null}
            <Label x={x0 + 110} y={y + (it.sub ? -4 : 15)} anchor="start" size={vertical ? 46 : 44} weight={650} maxWidth={tw}>{it.label}</Label>
            {it.sub ? <Label x={x0 + 110} y={y + 42} anchor="start" size={vertical ? 30 : 30} color={C.muted} weight={500} maxWidth={tw}>{it.sub}</Label> : null}
          </g>
        );
      })}
    </g>
  );
};

