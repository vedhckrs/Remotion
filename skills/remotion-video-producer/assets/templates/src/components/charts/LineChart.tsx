import React, {useMemo} from 'react';
import {createSmoothSvgPath} from '@remotion/media-utils';
import {evolvePath, getLength, getPointAtLength} from '@remotion/paths';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, fr} from '../../lib/motion';
import {useTheme} from '../../lib/theme';

/**
 * Line chart that draws itself on: smooth path via createSmoothSvgPath, stroke revealed with
 * evolvePath, a glowing head dot riding the line, gradient area fill, and the final value label.
 */
export const LineChart: React.FC<{
  readonly values: readonly number[];
  readonly labels?: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly delay?: number;
  readonly drawFrames?: number;
  readonly area?: boolean;
  readonly unit?: string;
  readonly strokeWidth?: number;
  readonly labelSize?: number;
}> = ({values, labels, width, height, color: colorProp, delay = 0, drawFrames = 50, area = true, unit = '', strokeWidth = 8, labelSize = 28}) => {
  const theme = useTheme();
  const color = colorProp ?? theme.colors.accent;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pad = {l: 24, r: labelSize * 3.5, t: labelSize * 1.6, b: labels ? labelSize * 1.8 : 24};
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = useMemo(
    () => values.map((v, i) => ({x: pad.l + (i / Math.max(1, values.length - 1)) * innerW, y: pad.t + innerH - ((v - min) / range) * innerH})),
    [values, pad.l, pad.t, innerW, innerH, min, range],
  );
  const d = useMemo(() => createSmoothSvgPath({points}), [points]);
  const length = useMemo(() => getLength(d), [d]);

  const progress = interpolate(frame, [fr(delay, fps), fr(delay + drawFrames, fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOut});
  const evolution = evolvePath(progress, d);
  const head = getPointAtLength(d, length * progress) ?? points[0];
  const currentValue = min + ((pad.t + innerH - head.y) / innerH) * range;
  const areaD = `${d} L ${points[points.length - 1].x} ${pad.t + innerH} L ${points[0].x} ${pad.t + innerH} Z`;
  const gradId = `line-area-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} style={{overflow: 'visible', fontFamily: theme.fonts.display}}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <clipPath id={`${gradId}-clip`}>
          <rect x={0} y={0} width={Math.max(0, head.x)} height={height} />
        </clipPath>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad.l} x2={pad.l + innerW} y1={pad.t + innerH * g} y2={pad.t + innerH * g} stroke={theme.colors.line} strokeWidth={1} />
      ))}
      {area ? <path d={areaD} fill={`url(#${gradId})`} clipPath={`url(#${gradId}-clip)`} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={evolution.strokeDasharray} strokeDashoffset={evolution.strokeDashoffset} style={{filter: `drop-shadow(0 0 ${strokeWidth * 1.5}px ${color}88)`}} />
      {progress > 0 ? (
        <>
          <circle cx={head.x} cy={head.y} r={strokeWidth * 2.2} fill={color} opacity={0.25} />
          <circle cx={head.x} cy={head.y} r={strokeWidth * 1.1} fill="#fff" />
          <text x={head.x + strokeWidth * 2.5} y={head.y - strokeWidth} fill={theme.colors.text} fontSize={labelSize} fontWeight={800} style={{fontVariantNumeric: 'tabular-nums'}}>
            {currentValue.toLocaleString('en-US', {maximumFractionDigits: 0})}
            {unit}
          </text>
        </>
      ) : null}
      {labels
        ? labels.map((label, i) => (
            <text key={label + i} x={points[i]?.x ?? 0} y={height - labelSize * 0.4} fill={theme.colors.muted} fontSize={labelSize * 0.8} textAnchor="middle" opacity={progress * (values.length - 1) >= i ? 1 : 0.25}>
              {label}
            </text>
          ))
        : null}
    </svg>
  );
};
