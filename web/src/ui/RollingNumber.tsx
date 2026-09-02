const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

type Props = {
  value: number | null;
  format: (n: number) => string;
  className?: string;
  durationMs?: number;
  emptyText?: string;
  /** Even gaps for countdown clocks. Default packs currency and percents. */
  variant?: 'clock' | 'figure';
};

function DigitWheel({
  digit,
  durationMs,
  widthClass,
}: {
  digit: number;
  durationMs: number;
  widthClass: string;
}) {
  return (
    <span className={`inline-block h-[1.2em] overflow-hidden ${widthClass}`}>
      <span
        className="flex flex-col will-change-transform"
        style={{
          transform: `translateY(${-digit * 1.2}em)`,
          transition: `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="flex h-[1.2em] items-center justify-center leading-none">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

export function RollingNumber({
  value,
  format,
  className,
  durationMs = 280,
  emptyText = '--',
  variant = 'figure',
}: Props) {
  const text = value != null && Number.isFinite(value) ? format(value) : emptyText;
  const empty = value == null || !Number.isFinite(value);
  const clock = variant === 'clock';
  const digitW = clock ? 'w-[0.72em]' : 'w-[0.58em]';
  const markW = clock ? 'w-[0.36em]' : 'w-[0.28em]';

  if (empty) {
    return <span className={`inline-flex tabular-nums ${className ?? ''}`}>{emptyText}</span>;
  }

  return (
    <span
      className={`inline-flex h-[1.2em] items-center tabular-nums ${clock ? 'gap-[0.2em]' : ''} ${className ?? ''}`}
    >
      {text.split('').map((ch, i) => {
        const code = ch.charCodeAt(0);
        if (code >= 48 && code <= 57) {
          return (
            <DigitWheel
              key={`d-${text.length - i}`}
              digit={code - 48}
              durationMs={durationMs}
              widthClass={digitW}
            />
          );
        }
        if (ch === '%') {
          return (
            <span
              key={`s-${text.length - i}`}
              className="ml-[0.22em] inline-flex h-[1.2em] items-center leading-none"
            >
              %
            </span>
          );
        }
        return (
          <span
            key={`s-${text.length - i}`}
            className={`inline-flex h-[1.2em] items-center justify-center leading-none ${markW}`}
          >
            {ch === ' ' ? '\u00a0' : ch}
          </span>
        );
      })}
    </span>
  );
}
