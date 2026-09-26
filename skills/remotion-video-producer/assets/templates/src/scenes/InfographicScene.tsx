import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {Counter} from '../components/Counter';
import {GradientBackground} from '../components/GradientBackground';
import {KineticTitle} from '../components/KineticTitle';
import {BarChart} from '../components/charts/BarChart';
import {DonutChart} from '../components/charts/DonutChart';
import {LineChart} from '../components/charts/LineChart';
import {PACING, fr, type Pacing} from '../lib/motion';
import {usePlatformLayout} from '../lib/platforms';
import type {ChartSpec, ScriptScene} from '../lib/script';
import {theme} from '../lib/theme';

/**
 * Data scene: headline on top, one chart in the safe rect, voice underneath.
 * Chart kinds: bar (categories), line (series over time), donut (share or single progress),
 * stat (one big counter). Data comes from the script's `visual.chart`.
 */
export const InfographicScene: React.FC<{
  readonly scene: ScriptScene;
  readonly chart: ChartSpec;
  readonly audioSrc?: string;
  readonly accent?: string;
  readonly index?: number;
  readonly pacing?: Pacing;
  readonly webglExtras?: boolean;
}> = ({scene, chart, audioSrc, accent = theme.colors.accent, index = 0, pacing = 'medium', webglExtras = false}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const {safe, unit, isVertical, isHorizontal} = usePlatformLayout();
  const p = PACING[pacing];

  const headlineSize = (isVertical ? 72 : 76) * unit;
  const headlineWords = scene.headline.trim().split(/\s+/).length;
  const chartDelay = headlineWords * p.stagger + 8;
  const chartW = isHorizontal ? safe.width * 0.62 : safe.width * 0.92;
  const chartH = isVertical ? safe.height * 0.42 : safe.height * 0.55;
  const labelSize = (isVertical ? 30 : 28) * unit;

  const renderChart = () => {
    if (chart.kind === 'bar') return <BarChart data={chart.data} width={chartW} height={chartH} horizontal={!isVertical && chart.data.length > 5} unit={chart.unit ?? ''} delay={chartDelay} stagger={p.stagger + 1} accent={accent} labelSize={labelSize} />;
    if (chart.kind === 'line') return <LineChart values={chart.data.map((d) => d.value)} labels={chart.data.map((d) => d.label)} width={chartW} height={chartH} color={accent} delay={chartDelay} drawFrames={Math.min(70, Math.max(30, Math.round((durationInFrames / fps) * 30 * 0.45)))} unit={chart.unit ?? ''} labelSize={labelSize} strokeWidth={8 * unit} />;
    if (chart.kind === 'donut') return <DonutChart segments={chart.data} size={Math.min(chartW, chartH)} delay={chartDelay} accent={accent} centerLabel={chart.title} />;
    const stat = chart.data[0];
    return (
      <div style={{display: 'flex', flexDirection: 'column', alignItems: isHorizontal ? 'flex-start' : 'center', gap: 12 * unit}}>
        <Counter to={stat.value} suffix={chart.unit ?? ''} fontSize={(isVertical ? 200 : 220) * unit} delay={chartDelay} color={accent} />
        <div style={{fontFamily: theme.fonts.body, fontSize: 40 * unit, fontWeight: 500, color: theme.colors.muted}}>{stat.label}</div>
      </div>
    );
  };

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg}}>
      <GradientBackground seed={`chart-${index}`} grain={webglExtras ? 0.05 : 0} speed={0.6} />
      <div
        style={{
          position: 'absolute',
          left: safe.x,
          top: safe.y,
          width: safe.width,
          height: safe.height,
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          alignItems: isHorizontal ? 'center' : 'center',
          justifyContent: isHorizontal ? 'space-between' : 'flex-start',
          paddingTop: isVertical ? safe.height * 0.12 : 0, // clears the logo slot at the top of the safe rect
          gap: 40 * unit,
        }}
      >
        <div style={{width: isHorizontal ? safe.width * 0.34 : '100%', display: 'flex', flexDirection: 'column', gap: 20 * unit}}>
          <KineticTitle text={scene.headline} highlight={scene.highlight} fontSize={headlineSize} highlightColor={accent} align={isHorizontal ? 'left' : 'center'} stagger={p.stagger} exitAt={durationInFrames - fr(4, fps)} />
          {chart.title && chart.kind !== 'donut' ? <div style={{fontFamily: theme.fonts.body, fontSize: 34 * unit, color: theme.colors.muted, textAlign: isHorizontal ? 'left' : 'center'}}>{chart.title}</div> : null}
        </div>
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', width: chartW, height: chartH}}>{renderChart()}</div>
      </div>
      {audioSrc ? <Audio src={audioSrc} name={`VO ${scene.id}`} premountFor={fr(15, fps)} /> : null}
    </AbsoluteFill>
  );
};
