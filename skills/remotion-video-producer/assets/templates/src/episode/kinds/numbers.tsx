import React from 'react';
import {Badge, Glyph, Label, Panel, enter, fitSize, useBeats, useDiagram} from '../kit';
import {C, FONT, clamp, ease, tone} from '../theme';

const fmt = (v: number, decimals: number) => v.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});

/**
 * stat: one big number that counts up. {value, from?, unit?, prefix?, decimals?, label?, sub?, icon?, color?}
 * Beats: set {value} to count on to a new number, set {label} / {sub} to change the caption.
 */
export const Stat: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats();
  const decimals = (spec.decimals as number) ?? 0;
  const color = tone(spec.color as string, 'accent');
  const v = b.param('value', spec.value as number);
  const start = v.changedAt < 0 ? 6 : v.changedAt;
  const from = v.changedAt < 0 ? ((spec.from as number) ?? 0) : v.previous;
  const t = ease((frame - start) / 72);
  const value = from + (v.value - from) * t;
  const text = `${(spec.prefix as string) ?? ''}${fmt(value, decimals)}`;
  const unit = (spec.unit as string) ?? '';
  const label = b.param('label', (spec.label as string) ?? '').value;
  const sub = b.param('sub', (spec.sub as string) ?? '').value;
  const icon = spec.icon as string | undefined;
  const big = fitSize(`${(spec.prefix as string) ?? ''}${fmt(v.value, decimals)}${unit ? ' ' + unit : ''}`, vertical ? 260 : 240, w * 0.9, 750, FONT.display);
  const cy = vertical ? h * 0.44 : h * 0.46;
  const inP = enter(frame - 2, 20);
  return (
    <g opacity={inP}>
      {icon ? <Glyph name={icon} x={w / 2 - 44} y={cy - big * 1.35} size={88} color={color} /> : null}
      <text x={w / 2} y={cy} textAnchor="middle" fontFamily={FONT.display} fontWeight={750} fontSize={big} fill={color} letterSpacing={-2}>
        {text}
        {unit ? <tspan fontSize={big * 0.42} fill={C.text} dx={big * 0.12}>{unit}</tspan> : null}
      </text>
      {label ? <Label x={w / 2} y={cy + (vertical ? 110 : 96)} size={vertical ? 46 : 42} maxWidth={w * 0.9} weight={650}>{label}</Label> : null}
      {sub ? <Label x={w / 2} y={cy + (vertical ? 176 : 150)} size={vertical ? 34 : 30} color={C.muted} weight={500} maxWidth={w * 0.9}>{sub}</Label> : null}
    </g>
  );
};

/**
 * bars: horizontal bars. {items: [{id?, label, value, color?, icon?}], unit?, max?, decimals?}
 * Beats: show item ids (default: label) one by one, focus an item to fade the rest.
 */
export const Bars: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical} = useDiagram();
  const b = useBeats(10);
  const items = (spec.items as {id?: string; label: string; value: number; color?: string; icon?: string}[]) ?? [];
  const unit = (spec.unit as string) ?? '';
  const decimals = (spec.decimals as number) ?? 0;
  const max = (spec.max as number) ?? Math.max(...items.map((i) => i.value), 1);
  const rowH = Math.min(vertical ? 170 : 120, h / Math.max(1, items.length));
  const labelW = vertical ? w : w * 0.26;
  const barX = vertical ? 0 : labelW + 24;
  const barW = (vertical ? w : w - barX) - 170;
  const top = (h - rowH * items.length) / 2;
  return (
    <g>
      {items.map((it, i) => {
        const id = it.id ?? it.label;
        const p = enter(b.since(id, i), 34);
        const y = top + i * rowH;
        const color = tone(it.color, i === 0 ? 'accent' : 'cyan');
        const dim = b.anyFocus && !b.focused(id);
        const barY = vertical ? y + rowH * 0.42 : y + rowH * 0.2;
        const bh = vertical ? rowH * 0.34 : rowH * 0.5;
        return (
          <g key={id} opacity={(dim ? 0.35 : 1) * Math.min(1, p * 2)}>
            <Label x={vertical ? 0 : labelW} y={vertical ? y + rowH * 0.3 : barY + bh * 0.68} anchor={vertical ? 'start' : 'end'} size={vertical ? 42 : 36} maxWidth={labelW} weight={650}>{it.label}</Label>
            <rect x={barX} y={barY} width={barW} height={bh} rx={bh / 2} fill={C.line} opacity={0.5} />
            <rect x={barX} y={barY} width={Math.max(bh, barW * clamp(it.value / max) * p)} height={bh} rx={bh / 2} fill={color} />
            <Label x={barX + Math.max(bh, barW * clamp(it.value / max) * p) + 16} y={barY + bh * 0.7} anchor="start" size={vertical ? 38 : 34} color={color} weight={750}>{`${fmt(it.value * p, decimals)}${unit ? ' ' + unit : ''}`}</Label>
          </g>
        );
      })}
    </g>
  );
};

/**
 * equation: a worked calculation revealed term by term.
 * {terms: [{value, label?, color?} | {op: "÷" | "×" | "+" | "−" | "="}], note?}
 * Terms appear in order; beats can show term ids ("t0", "t1", ...) to sync with the voice.
 */
export const Equation: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical} = useDiagram();
  const b = useBeats(18);
  const terms = (spec.terms as ({value?: string; label?: string; color?: string; op?: string})[]) ?? [];
  const note = spec.note as string | undefined;
  const values = terms.filter((t) => !t.op);
  // Portrait stacks the terms; landscape reads left to right.
  const size = vertical ? 76 : fitSize(terms.map((t) => t.op ?? t.value ?? '').join('   '), 84, w * 0.95, 750, FONT.display);
  let cursor = 0;
  const widths = terms.map((t) => (t.op ? size * 1.3 : Math.max(size * 2.2, ((t.value ?? '').length + 1) * size * 0.55)));
  const total = widths.reduce((a, x) => a + x, 0);
  return (
    <g>
      {terms.map((t, i) => {
        const id = `t${i}`;
        const p = enter(b.since(id, i));
        const color = t.op ? C.muted : tone(t.color, t === values[values.length - 1] ? 'accent' : 'text');
        let x: number;
        let y: number;
        if (vertical) {
          x = w / 2;
          y = h * 0.14 + i * (h * 0.72) / Math.max(1, terms.length - 1);
        } else {
          x = (w - total) / 2 + cursor + widths[i] / 2;
          y = h * 0.46;
          cursor += widths[i];
        }
        return (
          <g key={id} opacity={p} transform={`translate(0 ${(1 - p) * 20})`}>
            <text x={x} y={y} textAnchor="middle" fontFamily={FONT.display} fontWeight={t.op ? 500 : 750} fontSize={t.op ? size * 0.8 : size} fill={color}>{t.op ?? t.value}</text>
            {t.label ? <Label x={x} y={y + size * 0.62} size={vertical ? 26 : 24} color={C.muted} weight={600} spacing={1}>{t.label.toUpperCase()}</Label> : null}
          </g>
        );
      })}
      {note ? <Badge x={w / 2} y={h - 36} text={note} color="amber" maxWidth={w * 0.9} opacity={enter(b.since('note', terms.length))} /> : null}
    </g>
  );
};

/**
 * meter: a level that fills and drains (buffer, tank, battery, signal).
 * {style: tank | battery | bar, label, level (0..1), unit?, in?: {label, icon}, out?: {label, icon}, color?}
 * Beats: set {level} to animate to a new level, set {label}.
 */
export const Meter: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical, frame} = useDiagram();
  const b = useBeats();
  const style = (spec.style as string) ?? 'tank';
  const lv = b.param('level', (spec.level as number) ?? 0.6);
  const t = ease((frame - Math.max(0, lv.changedAt)) / 50);
  const level = clamp(lv.changedAt < 0 ? lv.value * ease(frame / 40) : lv.previous + (lv.value - lv.previous) * t);
  const color = tone(spec.color as string, level < 0.2 ? 'red' : 'green');
  const label = b.param('label', (spec.label as string) ?? '').value;
  const inflow = spec.in as {label: string; icon?: string} | undefined;
  const outflow = spec.out as {label: string; icon?: string} | undefined;
  const bw = style === 'battery' ? (vertical ? 340 : 280) : vertical ? 480 : 360;
  const bh = style === 'battery' ? (vertical ? 500 : 420) : vertical ? 440 : 380;
  const bx = w / 2 - bw / 2;
  const by = vertical ? h * 0.12 : (h - bh) / 2 - 10;
  const fillH = (bh - 24) * level;
  const flowY = by + bh / 2;
  return (
    <g>
      {style === 'battery' ? <rect x={w / 2 - bw * 0.18} y={by - 30} width={bw * 0.36} height={34} rx={10} fill={C.line} /> : null}
      <Panel x={bx} y={by} w={bw} h={bh} color={spec.color as string} r={style === 'battery' ? 40 : 30} />
      <rect x={bx + 12} y={by + bh - 12 - fillH} width={bw - 24} height={fillH} rx={22} fill={color} opacity={0.85} />
      {style !== 'battery' ? <path d={`M ${bx + 12} ${by + bh - 12 - fillH} q ${(bw - 24) / 4} ${-10 * Math.sin(frame / 12)} ${(bw - 24) / 2} 0 t ${(bw - 24) / 2} 0`} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={3} fill="none" /> : null}
      <Label x={w / 2} y={by + bh / 2 + 22} size={64} weight={750} family={FONT.display}>{`${Math.round(level * 100)}%`}</Label>
      {label ? <Label x={w / 2} y={by + bh + 64} size={vertical ? 36 : 34} maxWidth={w * 0.9}>{label}</Label> : null}
      {inflow ? (
        <g opacity={enter(b.since('in', 1))}>
          {vertical ? null : <line x1={bx - 260} y1={flowY} x2={bx - 20} y2={flowY} stroke={C.cyan} strokeWidth={4} strokeDasharray="14 12" strokeDashoffset={-frame * 2} />}
          <Glyph name={inflow.icon ?? 'download'} x={vertical ? w * 0.08 : bx - 360} y={vertical ? by + bh + 120 : flowY - 40} size={80} color={C.cyan} />
          <Label x={vertical ? w * 0.08 + 40 : bx - 320} y={vertical ? by + bh + 245 : flowY + 80} size={28} color={C.cyan} maxWidth={260}>{inflow.label}</Label>
        </g>
      ) : null}
      {outflow ? (
        <g opacity={enter(b.since('out', 2))}>
          {vertical ? null : <line x1={bx + bw + 20} y1={flowY} x2={bx + bw + 260} y2={flowY} stroke={C.accent} strokeWidth={4} strokeDasharray="14 12" strokeDashoffset={-frame * 2} />}
          <Glyph name={outflow.icon ?? 'play'} x={vertical ? w * 0.92 - 80 : bx + bw + 280} y={vertical ? by + bh + 120 : flowY - 40} size={80} color={C.accent} />
          <Label x={vertical ? w * 0.92 - 40 : bx + bw + 320} y={vertical ? by + bh + 245 : flowY + 80} size={28} color={C.accent} maxWidth={260}>{outflow.label}</Label>
        </g>
      ) : null}
    </g>
  );
};
