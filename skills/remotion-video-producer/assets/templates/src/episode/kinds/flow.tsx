import React from 'react';
import {Badge, Node, Route, Signal, enter, useBeats, useDiagram, type Pt} from '../kit';
import {C} from '../theme';

/**
 * flow: devices and services joined by wires with moving data.
 *   nodes:  [{id, icon, label?, sub?, color?, signal?}]
 *   links:  [{from, to, id?, color?, packets?, dir?: forward|back|both, dashed?, label?, via?: [[x,y]...] (0..1)}]
 *   layout: row (default) | column | tree | hub | free
 *   pos:    {land: {id: [x, y]}, port: {id: [x, y]}}  0..1 of the diagram box, for layout "free" (or to override)
 *   badge:  {text, color?}
 * Beats: show/hide node and link ids, focus node ids, set {dim: [ids]} to fade the others back.
 * Portrait lays rows of three or more nodes out as a column (labels to the right), which uses the tall frame
 * and gives the wires room; labels never shrink below reading size.
 */
type FlowNode = {id: string; icon: string; label?: string; sub?: string; color?: string; signal?: boolean};
type FlowLink = {from: string; to: string; id?: string; color?: string; packets?: number; dir?: 'forward' | 'back' | 'both'; dashed?: boolean; label?: string; via?: [number, number][]};

export const Flow: React.FC<{readonly spec: Record<string, unknown>}> = ({spec}) => {
  const {w, h, vertical} = useDiagram();
  const nodes = (spec.nodes as FlowNode[]) ?? [];
  const links = (spec.links as FlowLink[]) ?? [];
  const badge = spec.badge as {text: string; color?: string} | undefined;
  const n = nodes.length;
  const requested = (spec.layout as string) ?? 'row';
  const layout = requested === 'row' && vertical && n > 2 ? 'column' : requested;
  const override = (spec.pos as {land?: Record<string, [number, number]>; port?: Record<string, [number, number]>}) ?? {};
  const custom = (vertical ? override.port : override.land) ?? {};
  const badgeSpace = badge ? 90 : 0;
  const H = h - badgeSpace;

  // Tile size: large enough to read on a phone, small enough for the longest row.
  const size = layout === 'free' || layout === 'tree' ? (vertical ? 132 : n <= 4 ? 140 : 124) : vertical ? (layout === 'column' ? Math.min(150, ((H - 40) / Math.max(1, n)) * 0.66) : layout === 'hub' ? 140 : n <= 2 ? 220 : 190) : n <= 3 ? 160 : n <= 5 ? 136 : 112;

  const place = (i: number, node: FlowNode): Pt => {
    const c = custom[node.id];
    if (c) return [c[0] * w, c[1] * H];
    if (layout === 'column') {
      const step = H / n;
      return [w * 0.3, step * (i + 0.5)];
    }
    if (layout === 'tree') {
      // Root on top, branches in a row underneath, in both ratios.
      if (i === 0) return [w / 2, H * 0.2];
      const k = n - 1;
      const j = i - 1;
      return [vertical ? w * ((j + 0.5) / k) : w * (0.18 + (0.64 * (j + 0.5)) / k), H * 0.72];
    }
    if (layout === 'hub') {
      if (i === 0) return [w / 2, H / 2];
      const a = ((i - 1) / (n - 1)) * Math.PI * 2 - Math.PI / 2;
      const rx = vertical ? w * 0.36 : w * 0.34;
      const ry = vertical ? H * 0.36 : H * 0.36;
      return [w / 2 + Math.cos(a) * rx, H / 2 + Math.sin(a) * ry];
    }
    // row
    const margin = size * 0.9;
    return [n === 1 ? w / 2 : margin + (i * (w - 2 * margin)) / (n - 1), H * 0.45];
  };
  const at = new Map(nodes.map((node, i) => [node.id, place(i, node)]));
  const b = useBeats(7);
  const dimmed = new Set(b.param<string[]>('dim', []).value);

  // Wires stop at the tile edge instead of running under it.
  const edge = (from: Pt, to: Pt): [Pt, Pt] => {
    const r = size / 2 + 10;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.abs(dx) > Math.abs(dy) ? r / (Math.abs(dx) / len) : r / (Math.abs(dy) / len);
    const cut = Math.min(k, len / 2 - 4);
    return [[from[0] + (dx / len) * cut, from[1] + (dy / len) * cut], [to[0] - (dx / len) * cut, to[1] - (dy / len) * cut]];
  };

  return (
    <g>
      {links.map((l, i) => {
        const id = l.id ?? `${l.from}>${l.to}`;
        const a = at.get(l.from);
        const z = at.get(l.to);
        if (!a || !z) return null;
        const since = b.since(id, i + n);
        const shownFrom = Math.max(b.since(l.from, nodes.findIndex((x) => x.id === l.from)), 0);
        const via = (l.via ?? []).map(([x, y]) => [x * w, y * H] as Pt);
        // Tree branches leave the root from below its label, not through it.
        const start: Pt = layout === 'tree' && l.from === nodes[0]?.id ? [a[0], a[1] + size / 2 + 58] : a;
        const [s0, e] = edge(start, via[0] ?? z);
        const s: Pt = start === a ? s0 : start;
        const [s2, e2] = via.length ? edge(via[via.length - 1], z) : [s, e];
        const pts: Pt[] = via.length ? [s, ...via, e2] : [s, e];
        void s2;
        const p = since < 0 ? 0 : enter(since, 26);
        return (
          <Route
            key={id}
            points={pts}
            color={l.color ?? 'cyan'}
            progress={shownFrom >= 0 ? p : 0}
            packets={l.packets ?? 3}
            dir={l.dir ?? 'forward'}
            dashed={l.dashed}
            label={l.label}
            dim={dimmed.has(id) || (b.anyFocus && !b.focused(l.from) && !b.focused(l.to) && !b.focused(id))}
          />
        );
      })}
      {nodes.map((node, i) => {
        const [x, y] = at.get(node.id)!;
        const since = b.since(node.id, i);
        const labelRight = layout === 'column';
        return (
          <g key={node.id}>
            {node.signal && since >= 0 ? <Signal x={x} y={y} color={node.color} size={size / 110} /> : null}
            <Node
              x={x}
              y={y}
              icon={node.icon}
              label={labelRight ? undefined : node.label}
              sub={labelRight ? undefined : node.sub}
              color={node.color}
              size={size}
              progress={enter(since)}
              dim={dimmed.has(node.id) || (b.anyFocus && !b.focused(node.id))}
              focus={b.focused(node.id)}
              labelWidth={layout === 'row' ? Math.min(size * 2.4, (w - size) / Math.max(1, n - 1) - 16) : size * 2.6}
            />
            {labelRight && node.label ? (
              <g opacity={enter(since)}>
                <text x={x + size * 0.75} y={y + (node.sub ? -4 : 12)} fill={C.text} fontSize={Math.max(34, size * 0.3)} fontWeight={650} fontFamily="Inter, Arial, sans-serif">{node.label}</text>
                {node.sub ? <text x={x + size * 0.75} y={y + 38} fill={C.muted} fontSize={Math.max(26, size * 0.22)} fontWeight={500} fontFamily="Inter, Arial, sans-serif">{node.sub}</text> : null}
              </g>
            ) : null}
          </g>
        );
      })}
      {badge ? <Badge x={w / 2} y={h - 40} text={b.param('badge', badge.text).value} color={badge.color} maxWidth={w * 0.9} opacity={enter(b.since('badge', n + links.length))} /> : null}
    </g>
  );
};
