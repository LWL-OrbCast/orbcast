type Pt = { t: number; p: number };

export function Sparkline({ samples, className }: { samples: Pt[]; className?: string }) {
  if (samples.length < 2) {
    return (
      <div
        className={`flex h-40 items-center justify-center text-xs text-[var(--text-3)] ${className ?? ''}`}
      >
        Waiting for chart…
      </div>
    );
  }
  const ys = samples.map((s) => s.p);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(max - min, 0.01);
  const w = 640;
  const h = 160;
  const d = samples
    .map((s, i) => {
      const x = (i / (samples.length - 1)) * w;
      const y = h - ((s.p - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = samples[samples.length - 1]!;
  const first = samples[0]!;
  const up = last.p >= first.p;
  const stroke = up ? '#16a34a' : '#e11d48';
  const fill = up ? 'rgba(34,197,94,0.14)' : 'rgba(244,63,94,0.12)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-40 w-full ${className ?? ''}`} preserveAspectRatio="none">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
