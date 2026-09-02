import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { RollingNumber } from './RollingNumber';
import { WEB_CHART_RANGES, type WebChartRangeId } from './chartRanges';

export type ProbSample = { t: number; p: number };

export type ProbSeries = {
  key: string;
  label: string;
  color: string;
  samples: ProbSample[];
  selected?: boolean;
};

type Hover = { t: number; x: number };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function yAt(v: number, height: number, pad = 10): number {
  return height - clamp01(v) * (height - pad * 2) - pad;
}

function xyPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 1} ${pts[0].y}`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function nudgeLabels(ys: number[], height: number, gap = 16): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let n = 1; n < order.length; n++) {
    if (order[n]!.y - order[n - 1]!.y < gap) order[n]!.y = order[n - 1]!.y + gap;
  }
  const lo = 8;
  const hi = height - 12;
  if (order.length && order[order.length - 1]!.y > hi) {
    const overflow = order[order.length - 1]!.y - hi;
    for (const row of order) row.y -= overflow;
  }
  if (order.length && order[0]!.y < lo) {
    const lift = lo - order[0]!.y;
    for (const row of order) row.y += lift;
  }
  const out = ys.slice();
  for (const row of order) out[row.i] = row.y;
  return out;
}

function pAt(samples: ProbSample[], t: number): number | null {
  const rows = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.p));
  if (!rows.length) return null;
  if (t <= rows[0]!.t) return clamp01(rows[0]!.p);
  const last = rows[rows.length - 1]!;
  if (t >= last.t) return clamp01(last.p);
  let lo = 0;
  let hi = rows.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = rows[lo]!;
  const b = rows[hi]!;
  const span = b.t - a.t;
  const u = span === 0 ? 0 : (t - a.t) / span;
  return clamp01(a.p + (b.p - a.p) * u);
}

function formatAxis(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs >= 3 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatHoverTime(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs >= 6 * 24 * 60 * 60 * 1000) {
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type Props = {
  series: ProbSeries[];
  loading?: boolean;
  rangeId: WebChartRangeId;
  onRange: (id: WebChartRangeId) => void;
  onSelect?: (key: string) => void;
  title?: string;
  compact?: boolean;
  bare?: boolean;
  className?: string;
};

export function ProbabilityChart({
  series,
  loading = false,
  rangeId,
  onRange,
  onSelect,
  title,
  compact = false,
  bare = false,
  className,
}: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const plotH = compact ? 160 : 236;
  const [size, setSize] = useState({ w: 640, h: plotH });
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { paths, labels, tMin, tMax } = useMemo(() => {
    const all = series.flatMap((s) => s.samples).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
    const now = Date.now();
    let min = all.length ? Math.min(...all.map((s) => s.t)) : now - 60_000;
    let max = all.length ? Math.max(...all.map((s) => s.t), now) : now;
    if (max <= min) max = min + 60_000;
    const span = max - min;
    const toX = (t: number) => ((t - min) / span) * size.w;

    const hoverT = hover ? hover.t : null;
    const pathsInner = series.map((s) => {
      const samples = s.samples.filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
      const pts = samples.map((x) => ({ x: toX(x.t), y: yAt(x.p, size.h) }));
      const live = samples[samples.length - 1]?.p ?? 0.5;
      const shown = hoverT != null ? (pAt(samples, hoverT) ?? live) : live;
      return {
        ...s,
        d:
          pts.length >= 2
            ? xyPath(pts)
            : pts.length === 1
              ? xyPath([pts[0]!, { x: size.w, y: pts[0]!.y }])
              : '',
        live,
        shown,
      };
    });

    const rawY = pathsInner.map((s) => yAt(s.shown, size.h));
    const nudged = nudgeLabels(rawY, size.h);
    const labelsInner = pathsInner.map((s, i) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      selected: s.selected,
      livePct: Math.round(clamp01(s.live) * 100),
      pct: Math.round(clamp01(s.shown) * 100),
      y: nudged[i] ?? rawY[i] ?? 0,
    }));

    return {
      paths: pathsInner,
      labels: labelsInner,
      tMin: min,
      tMax: max,
    };
  }, [series, size.w, size.h, hover]);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = plotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(r.width, Math.max(0, e.clientX - r.left));
    const t = tMin + (x / Math.max(1, r.width)) * (tMax - tMin);
    setHover({ t, x });
  };

  const ready = !loading && series.some((s) => s.samples.length >= 2);
  const spanMs = tMax - tMin;
  const hoverX = hover ? Math.min(size.w, Math.max(0, hover.x)) : 0;

  return (
    <div
      className={
        className ??
        (bare
          ? 'w-full min-w-0 max-w-full'
          : 'w-full min-w-0 max-w-full rounded-2xl border border-[var(--border)] bg-white p-3 sm:p-4')
      }
    >
      {title ? (
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--text-3)]">{title}</p>
      ) : null}

      <div className={`flex flex-wrap gap-x-3 gap-y-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
        {series.map((s) => {
          const row = labels.find((l) => l.key === s.key);
          const on = s.selected;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect?.(s.key)}
              className={`flex min-w-0 items-center gap-1.5 text-left ${on ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-[13px] font-semibold text-[var(--text)]">{s.label}</span>
              <span className="text-[13px] font-extrabold tabular-nums" style={{ color: s.color }}>
                <RollingNumber
                  value={row?.livePct ?? Math.round(clamp01(s.samples[s.samples.length - 1]?.p ?? 0.5) * 100)}
                  format={(n) => `${Math.round(n)}%`}
                  durationMs={320}
                  emptyText="—%"
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 gap-1.5 sm:gap-2">
        <div
          className="flex w-7 shrink-0 flex-col justify-between py-1 text-right text-[9px] font-semibold tabular-nums text-[var(--text-3)] sm:w-8 sm:text-[10px]"
          style={{ height: plotH }}
        >
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={plotRef}
            className="relative cursor-crosshair"
            style={{ height: plotH }}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${size.w} ${size.h}`}
              preserveAspectRatio="none"
              className={loading ? 'opacity-25' : 'opacity-100'}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <line
                  key={v}
                  x1={0}
                  y1={yAt(v, size.h)}
                  x2={size.w}
                  y2={yAt(v, size.h)}
                  stroke={v === 0.5 ? '#c5d0c8' : '#e8eee9'}
                  strokeWidth={1}
                  strokeDasharray={v === 0.5 ? '4 6' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {paths.map((s) =>
                s.d ? (
                  <path
                    key={s.key}
                    d={s.d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.selected ? 2.8 : 2.1}
                    strokeLinecap="round"
                    opacity={s.selected ? 1 : 0.82}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null,
              )}
              {hover && ready ? (
                <line
                  x1={hoverX}
                  y1={0}
                  x2={hoverX}
                  y2={size.h}
                  stroke="#0f172a"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity={0.45}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {hover && ready
                ? paths.map((s) => (
                    <circle
                      key={`dot-${s.key}`}
                      cx={hoverX}
                      cy={yAt(s.shown, size.h)}
                      r={compact ? 3.5 : 4.5}
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth={1.6}
                    />
                  ))
                : null}
            </svg>
            {!ready ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--text-3)]">
                Waiting for chart…
              </div>
            ) : null}
            {hover && ready ? (
              <div
                className="pointer-events-none absolute top-1 z-10 rounded-lg border border-[var(--border)] bg-white/95 px-2 py-1 text-[11px] font-bold text-[var(--text)] shadow-sm"
                style={{
                  left: hoverX > size.w * 0.62 ? undefined : hoverX + 8,
                  right: hoverX > size.w * 0.62 ? size.w - hoverX + 8 : undefined,
                }}
              >
                {formatHoverTime(hover.t, spanMs)}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={`relative hidden shrink-0 sm:block ${compact ? 'w-[84px]' : 'w-[92px] sm:w-[108px]'}`}
          style={{ height: plotH }}
        >
          {labels.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => onSelect?.(row.key)}
              className="absolute left-0 right-0 flex items-center gap-1 overflow-hidden text-left"
              style={{ top: row.y - 8 }}
            >
              <span
                className="text-[11px] font-extrabold tabular-nums"
                style={{ color: row.color, fontWeight: row.selected ? 800 : 700 }}
              >
                {row.pct}
                <span className="pl-[0.22em]">%</span>
              </span>
              <span className="truncate text-[11px] font-bold" style={{ color: row.color }}>
                {row.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className={`mt-1 flex justify-between pl-7 text-[10px] font-medium text-[var(--text-3)] sm:pl-8 ${
          compact ? 'sm:pr-[84px]' : 'sm:pr-[100px]'
        }`}
      >
        <span>{formatAxis(tMin, spanMs)}</span>
        <span>{formatAxis(tMax, spanMs)}</span>
      </div>

      <div className="mt-2 flex w-full min-w-0 flex-wrap justify-end gap-1 sm:mt-3">
        {WEB_CHART_RANGES.map((r) => {
          const on = r.id === rangeId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onRange(r.id)}
              className={`rounded-lg px-1.5 py-1 text-[10px] font-extrabold sm:px-2 sm:text-[11px] ${
                on ? 'bg-[var(--ink)] text-white' : 'text-[var(--text-3)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]'
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
