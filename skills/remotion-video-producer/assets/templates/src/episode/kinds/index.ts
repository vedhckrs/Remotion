import type React from 'react';
import {Flow} from './flow';
import {Bars, Equation, Meter, Stat} from './numbers';
import {Device, Hero, Wave} from './signal';
import {Checklist, Compare, Cycle, Grid, Layers, Timeline} from './structure';

/**
 * Diagram kinds a scene can use (scene.visual.kind). Each draws inside the diagram box of either ratio and
 * reads its parameters and beats from the scene. Add a kind here and in scripts/lib/package-schema.mjs.
 */
export const KINDS: Record<string, React.FC<{readonly spec: Record<string, unknown>}>> = {
  flow: Flow,
  stat: Stat,
  bars: Bars,
  equation: Equation,
  meter: Meter,
  compare: Compare,
  layers: Layers,
  grid: Grid,
  timeline: Timeline,
  cycle: Cycle,
  checklist: Checklist,
  wave: Wave,
  hero: Hero,
  device: Device,
};
