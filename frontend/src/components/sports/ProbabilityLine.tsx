import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, ActivityIndicator } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { type ChartTick } from './ChartTradeTicks';
// import { ChartTradeTicks, type ChartTick } from './ChartTradeTicks';
import { RollingNumber } from '../RollingNumber';

type Props = {
  points: number[];
  height?: number;
  color?: string;
  fill?: boolean;
};

export type ProbSample = { t: number; p: number };

export type ProbSeries = {
  key: string;
  label: string;
  color: string;
  samples: ProbSample[];
  selected?: boolean;
};

function cleanPts(points: number[]): number[] {
  return points.filter((n) => Number.isFinite(n)).map((n) => Math.min(1, Math.max(0, n)));
}

function yAt(v: number, height: number): number {
  const t = Math.min(1, Math.max(0, v));
  return height - t * (height - 10) - 5;
}

function xyPath(
  pts: { x: number; y: number }[],
): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 1} ${pts[0].y}`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function smoothPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const pts = values.map((v, i) => ({ x: i * step, y: yAt(v, height) }));
  return xyPath(pts);
}

function nudgeLabels(ys: number[], height: number, gap = 15): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let n = 1; n < order.length; n++) {
    if (order[n].y - order[n - 1].y < gap) order[n].y = order[n - 1].y + gap;
  }
  const lo = 8;
  const hi = height - 12;
  if (order.length && order[order.length - 1].y > hi) {
    const overflow = order[order.length - 1].y - hi;
    for (const row of order) row.y -= overflow;
  }
  if (order.length && order[0].y < lo) {
    const lift = lo - order[0].y;
    for (const row of order) row.y += lift;
  }
  const out = ys.slice();
  for (const row of order) out[row.i] = row.y;
  return out;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function ProbabilityLine({
  points,
  height = 120,
  color = '#22C55E',
  fill = true,
}: Props) {
  const cleaned = useMemo(() => cleanPts(points), [points]);
  const path = useMemo(() => smoothPath(cleaned.length ? cleaned : [0.5], 320, height), [cleaned, height]);
  const area = `${path} L 320 ${height} L 0 ${height} Z`;

  return (
    <View style={[styles.wrap, { height }]}>
      <Svg width="100%" height={height} viewBox={`0 0 320 ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="probFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {fill ? <Path d={area} fill="url(#probFill)" /> : null}
        <Path d={path} stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function formatAxis(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs >= 3 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

type ChartProps = {
  series: ProbSeries[];
  height?: number;
  ticks?: ChartTick[];
  onTickDone?: (id: string) => void;
  loading?: boolean;
};

/** Overlay every outcome on one time-based chart, with optional live trade ticks. */
export const ProbabilityChart = React.memo(function ProbabilityChart({
  series,
  height = 148,
  ticks: _ticks = [],
  onTickDone: _onTickDone,
  loading = false,
}: ChartProps) {
  const [plotW, setPlotW] = useState(0);

  const { paths, labels, tMin, tMax, midY } = useMemo(() => {
    const all = series.flatMap((s) => s.samples).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
    const now = Date.now();
    let min = all.length ? Math.min(...all.map((s) => s.t)) : now - 60_000;
    let max = all.length ? Math.max(...all.map((s) => s.t), now) : now;
    if (max <= min) max = min + 60_000;
    const span = max - min;
    const toX = (t: number) => ((t - min) / span) * 320;

    const pathsInner = series.map((s) => {
      const samples = s.samples.filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
      const pts = samples.map((x) => ({ x: toX(x.t), y: yAt(clamp01(x.p), height) }));
      const last = samples[samples.length - 1]?.p ?? 0.5;
      return { ...s, d: pts.length >= 2 ? xyPath(pts) : pts.length === 1 ? xyPath([pts[0], { x: 320, y: pts[0].y }]) : '', last };
    });

    const rawY = pathsInner.map((s) => yAt(s.last, height));
    const nudged = nudgeLabels(rawY, height);
    const labelsInner = pathsInner.map((s, i) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      selected: s.selected,
      pct: Math.round(clamp01(s.last) * 100),
      y: nudged[i],
    }));

    return {
      paths: pathsInner,
      labels: labelsInner,
      tMin: min,
      tMax: max,
      midY: yAt(0.5, height),
    };
  }, [series, height]);

  const onPlotLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - plotW) > 1) setPlotW(w);
  };

  const showEndLabels = series.length <= 2;

  return (
    <View>
      <View style={[styles.chartRow, { height }]}>
        <View style={[styles.wrap, { height, flex: 1, opacity: loading ? 0.22 : 1 }]} onLayout={onPlotLayout}>
          <Svg width="100%" height={height} viewBox={`0 0 320 ${height}`} preserveAspectRatio="none">
            <Line
              x1={0}
              y1={midY}
              x2={320}
              y2={midY}
              stroke={colors.chart.grid}
              strokeWidth={1}
              strokeDasharray="4 6"
            />
            {paths.map((s) =>
              s.d ? (
                <Path
                  key={s.key}
                  d={s.d}
                  stroke={s.color}
                  strokeWidth={s.selected ? 2.8 : 2.1}
                  fill="none"
                  strokeLinecap="round"
                  opacity={s.selected ? 1 : 0.88}
                />
              ) : null,
            )}
          </Svg>
          {/* Live +$ / −$ trade bubbles on the chart. Off for this build — uncomment to restore.
          {!loading ? (
            <ChartTradeTicks
              ticks={ticks}
              height={height}
              plotWidth={plotW}
              onDone={onTickDone ?? (() => undefined)}
            />
          ) : null}
          */}
        </View>
        {showEndLabels ? (
          <View style={[styles.legendCol, { height, opacity: loading ? 0.22 : 1 }]} pointerEvents="none">
            {labels.map((row) => (
              <View key={row.key} style={[styles.endLabel, { top: row.y - 8 }]}>
                <RollingNumber
                  value={row.pct}
                  format={(n) => `${Math.round(n)}%`}
                  align="left"
                  durationMs={380}
                  style={{
                    color: row.color,
                    fontSize: 11,
                    fontWeight: row.selected ? '800' : '700',
                    lineHeight: 14,
                    letterSpacing: 0.2,
                  }}
                />
                <Text numberOfLines={1} style={[styles.endName, { color: row.color }]}>
                  {row.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {loading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator color={colors.accent.gold} />
          </View>
        ) : null}
      </View>
      <View style={[styles.axisRow, !showEndLabels && styles.axisRowFlush, loading && { opacity: 0.35 }]}>
        <Text style={styles.axis}>{formatAxis(tMin, tMax - tMin)}</Text>
        <Text style={styles.axis}>{formatAxis(tMax, tMax - tMin)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', position: 'relative' },
  chartRow: { width: '100%', flexDirection: 'row', overflow: 'hidden', position: 'relative' },
  legendCol: { width: 92, position: 'relative', marginLeft: 4 },
  endLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 14,
    overflow: 'hidden',
  },
  endName: {
    flex: 1,
    fontSize: 11,
    letterSpacing: 0.2,
    fontWeight: '700',
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingRight: 96,
  },
  axisRowFlush: { paddingRight: 0 },
  axis: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.text.muted,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
