import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CANDLE_INTERVAL_MS,
  fetchLegCandleSamples,
  formatHighlightVolume,
  impliedPercent,
  isOtherOutcomeLeg,
  questionSiblings,
  type ListedMarket,
  type OutcomeSide,
} from '@hip4';
import {
  canOpenFootballEvents,
  formatFootballEvent,
  previewFootballEvents,
  type EplFixture,
} from '../lib/api';
import { interpolate, useCopy } from '../lib/copy';
import { WEB_CHART_RANGES, type WebChartRangeId } from './chartRanges';
import { formatEndDate, formatHms } from './formatTime';
import { LEG_PALETTE, multiLegStampColor, multiLegStampGridClass, NO_COLOR, YES_COLOR } from './outcomeColors';
import { ChartRangePills, ProbabilityChart, type ProbSeries } from './ProbabilityChart';
import { RollingNumber } from './RollingNumber';
import { IconList } from './icons';
import { MatchEventsDialog } from './MatchEventsDialog';
import { TeamCrest } from './TeamCrest';
import bannerArsenalVilla from '../../../frontend/assets/images/symbols/featured-arsenal-villa.webp';
import bannerStadium from '../../../frontend/assets/images/symbols/featured-banner.webp';

function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function featuredBanner(fixture: EplFixture): string {
  const names = [fixture.home.name, fixture.away.name].map(teamSlug);
  const arsenal = names.some((n) => n.includes('arsenal'));
  const villa = names.some((n) => n.includes('villa'));
  return arsenal && villa ? bannerArsenalVilla : bannerStadium;
}

function scoreText(fixture: EplFixture): string {
  const { home, away } = fixture.goals;
  if (home == null || away == null) return '';
  return `${home}  –  ${away}`;
}

function formatKickoff(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusPill({ label, live }: { label: string; live?: boolean }) {
  return (
    <span
      className={`mb-3 inline-flex items-center gap-2 self-center rounded-full border px-3 py-1 ${
        live
          ? 'border-[var(--accent)]/40 bg-[#ECFDF3]'
          : 'border-[var(--border)] bg-[var(--bg-2)]'
      }`}
    >
      {live ? (
        <span className="relative flex h-3 w-3 items-center justify-center">
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-[var(--accent)]/40" />
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        </span>
      ) : null}
      <span
        className={`text-[12px] font-extrabold uppercase tracking-[1.2px] ${
          live ? 'text-[var(--accent-dark)]' : 'text-[var(--text)]'
        }`}
      >
        {label}
      </span>
    </span>
  );
}

function Hip4BannerOdds({
  book,
  catalog,
}: {
  book: ListedMarket;
  catalog: ListedMarket[];
}) {
  const navigate = useNavigate();
  const { hip4 } = useCopy();
  const siblings = useMemo(
    () => (catalog.length ? questionSiblings(catalog, book) : [book]),
    [book, catalog],
  );
  const multiLeg = siblings.length > 1;
  const yes = book.sides[0];
  const no = book.sides[1];

  return (
    <div className="relative z-10 mt-3 grid min-w-0 gap-2">
      {multiLeg ? (
        <div
          className={`grid min-w-0 gap-2 ${multiLegStampGridClass(siblings.length)}`}
        >
          {siblings.map((m, i) => {
            const px = m.sides.find((s) => s.side === 0)?.probability ?? null;
            return (
              <button
                key={m.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(`/market/${m.id}`);
                }}
                className="btn-stamp min-w-0 px-1.5 py-2 text-[11px] leading-tight sm:px-2 sm:py-2.5 sm:text-sm"
                style={{ background: multiLegStampColor(isOtherOutcomeLeg(m), i) }}
              >
                <span className="line-clamp-2">
                  {m.legLabel || hip4.yes} {impliedPercent(px)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/market/${book.id}`);
            }}
            className="btn-stamp btn-yes min-w-0 truncate py-2 text-sm sm:py-2.5"
          >
            {yes?.name ?? hip4.yes} {impliedPercent(yes?.probability ?? null)}
          </button>
          {no ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/market/${book.id}`);
              }}
              className="btn-stamp btn-no min-w-0 truncate py-2 text-sm sm:py-2.5"
            >
              {no.name ?? hip4.no} {impliedPercent(no.probability ?? null)}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function EplDesktopBook({ book, catalog }: { book: ListedMarket; catalog: ListedMarket[] }) {
  const { hip4 } = useCopy();
  const [rangeId, setRangeId] = useState<WebChartRangeId>('1h');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const siblings = useMemo(
    () => (catalog.length ? questionSiblings(catalog, book) : [book]),
    [book, catalog],
  );
  const multiLeg = siblings.length > 1;

  const legs = useMemo(() => {
    if (multiLeg) {
      return siblings.map((m) => ({
        key: `${m.outcomeId}:0`,
        outcomeId: m.outcomeId,
        side: 0 as OutcomeSide,
        seed: m.sides.find((s) => s.side === 0)?.probability ?? null,
        label: m.legLabel || hip4.yes,
      }));
    }
    return [
      {
        key: `${book.outcomeId}:0`,
        outcomeId: book.outcomeId,
        side: 0 as OutcomeSide,
        seed: book.sides[0]?.probability ?? null,
        label: book.sides[0]?.name ?? hip4.yes,
      },
      {
        key: `${book.outcomeId}:1`,
        outcomeId: book.outcomeId,
        side: 1 as OutcomeSide,
        seed: book.sides[1]?.probability ?? null,
        label: book.sides[1]?.name ?? hip4.no,
      },
    ];
  }, [book, hip4.no, hip4.yes, multiLeg, siblings]);

  const legsKey = legs.map((l) => l.key).join(',');
  const range = WEB_CHART_RANGES.find((r) => r.id === rangeId) ?? WEB_CHART_RANGES[0];

  useEffect(() => {
    setSelectedKey(legs[0]?.key ?? null);
  }, [legsKey]);

  const resolvedKey =
    selectedKey && legs.some((l) => l.key === selectedKey) ? selectedKey : (legs[0]?.key ?? null);

  const chartQ = useQuery({
    queryKey: ['hip4', 'candles', 'epl-featured', legsKey, range.id],
    enabled: legs.length > 0,
    queryFn: () => {
      const end = Date.now();
      return fetchLegCandleSamples(legs, range.interval, end - range.spanMs, end);
    },
    staleTime: 30_000,
  });

  const rangePending = chartQ.isPending;
  const series: ProbSeries[] = useMemo(() => {
    const now = Date.now();
    const bucket = CANDLE_INTERVAL_MS[range.interval];
    return legs.map((leg, i) => {
      const hist = rangePending ? [] : (chartQ.data?.[leg.key] ?? []);
      const live = leg.seed ?? hist[hist.length - 1]?.p ?? 0.5;
      const last = hist[hist.length - 1];
      let samples = hist;
      if (rangePending) {
        samples = [];
      } else if (last && now - last.t < bucket) {
        samples = [...hist.slice(0, -1), { t: last.t, p: live }, { t: now, p: live }];
      } else if (hist.length) {
        samples = [...hist, { t: now, p: live }];
      } else {
        samples = [
          { t: now - Math.min(bucket * 8, bucket * 12), p: live },
          { t: now, p: live },
        ];
      }
      const color = multiLeg
        ? LEG_PALETTE[i % LEG_PALETTE.length]
        : leg.side === 0
          ? YES_COLOR
          : NO_COLOR;
      return { key: leg.key, label: leg.label, color, samples, selected: leg.key === resolvedKey };
    });
  }, [chartQ.data, legs, multiLeg, range.interval, rangePending, resolvedKey]);

  const volUsd = siblings.reduce((sum, m) => sum + (m.volumeUsd ?? 0), 0);
  const vol = formatHighlightVolume(volUsd);
  const endLabel = book.expiresAt ? `Ends ${formatEndDate(book.expiresAt)}` : null;

  return (
    <div className="border-t border-[var(--border)] bg-white px-6 pb-5 pt-4">
      <ProbabilityChart
        series={series}
        loading={rangePending}
        rangeId={rangeId}
        onRange={setRangeId}
        onSelect={setSelectedKey}
        title={multiLeg ? hip4.ticket.outcomeChances : hip4.ticket.yesNoChances}
        compact
        bare
        hideRanges
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-xs font-semibold text-[var(--text-3)]">
          {vol !== '—' ? <span>{vol} Vol</span> : null}
          {vol !== '—' && endLabel ? <span> · </span> : null}
          {endLabel ? <span>{endLabel}</span> : null}
        </div>
        <ChartRangePills
          rangeId={rangeId}
          onRange={setRangeId}
          className="mt-0 flex shrink-0 flex-wrap justify-end gap-1"
        />
      </div>
    </div>
  );
}

export function EplFeatured({
  fixture,
  href,
  catalog = [],
  book = null,
  pager,
}: {
  fixture: EplFixture;
  href: string;
  catalog?: ListedMarket[];
  book?: ListedMarket | null;
  pager?: ReactNode;
}) {
  const { hip4 } = useCopy();
  const [now, setNow] = useState(() => Date.now());
  const [eventsOpen, setEventsOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const showScore = fixture.live || fixture.finished;
  const mid = showScore ? scoreText(fixture) : '';
  const previewLines = previewFootballEvents(fixture.events)
    .map(formatFootballEvent)
    .filter(Boolean);
  const showEventsToggle = canOpenFootballEvents(fixture);
  const startRemain =
    fixture.kickoffAt != null && fixture.kickoffAt > now
      ? Math.max(0, Math.ceil((fixture.kickoffAt - now) / 1000))
      : null;
  const hint =
    !fixture.live && !fixture.finished && fixture.kickoffAt
      ? formatKickoff(fixture.kickoffAt)
      : fixture.venue;

  return (
    <div className="card-shadow w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
      <div className="relative">
        <img
          src={featuredBanner(fixture)}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0.88) 68%, #fff 100%)',
          }}
        />
        <div className="relative z-10 flex min-h-[260px] min-w-0 flex-col justify-end px-3.5 pb-3.5 pt-3 sm:min-h-[300px] sm:px-6 sm:pb-5 sm:pt-4">
          <Link to={href} className="flex min-w-0 flex-col">
        {fixture.league.logo ? (
          <img
            src={fixture.league.logo}
            alt={fixture.league.name || hip4.featured.epl}
            className="mx-auto mb-1.5 h-[68px] w-[72px] object-contain"
          />
        ) : (
          <p className="mb-1 text-center text-[13px] font-extrabold tracking-wide text-[var(--text)]">
            {fixture.league.name || hip4.featured.epl}
          </p>
        )}

        {fixture.finished ? (
          <StatusPill label={hip4.featured.ft} />
        ) : fixture.status === 'HT' ? (
          <StatusPill label={hip4.featured.ht} />
        ) : fixture.live ? (
          <StatusPill
            live
            label={
              fixture.elapsed != null
                ? `${hip4.status.live} · ${interpolate(hip4.featured.minute, { n: fixture.elapsed })}`
                : hip4.status.live
            }
          />
        ) : startRemain != null ? (
          <div className="mb-3 flex flex-col items-center gap-0.5">
            <RollingNumber
              value={startRemain}
              format={formatHms}
              variant="clock"
              durationMs={280}
              className="text-[18px] font-extrabold tracking-wide text-[var(--text)] sm:text-[20px]"
            />
            <span className="text-xs font-semibold text-[var(--text-2)]">{hip4.featured.startsIn}</span>
          </div>
        ) : (
          <StatusPill label={fixture.statusLong || fixture.status} />
        )}

        <div className="mb-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            {fixture.home.logo ? (
              <TeamCrest src={fixture.home.logo} />
            ) : (
              <div className="h-11 w-11 rounded-full bg-[var(--bg-2)] sm:h-14 sm:w-14" />
            )}
            <p className="w-full truncate text-center text-[13px] font-bold sm:text-sm">{fixture.home.name}</p>
          </div>
          <p
            className={`shrink-0 px-2 text-center font-extrabold tabular-nums ${
              showScore && mid ? 'text-[22px]' : 'text-base'
            }`}
          >
            {showScore && mid ? mid : hip4.featured.vs}
          </p>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            {fixture.away.logo ? (
              <TeamCrest src={fixture.away.logo} />
            ) : (
              <div className="h-11 w-11 rounded-full bg-[var(--bg-2)] sm:h-14 sm:w-14" />
            )}
            <p className="w-full truncate text-center text-[13px] font-bold sm:text-sm">{fixture.away.name}</p>
          </div>
        </div>

        {previewLines.length > 0 ? (
          <ul className="min-h-9 space-y-0.5 text-center text-xs font-semibold text-[var(--text-2)]">
            {previewLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : hint ? (
          <p className="min-h-9 truncate text-center text-xs font-semibold leading-9 text-[var(--text-2)]">
            {hint}
          </p>
        ) : null}
      </Link>
      {showEventsToggle ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEventsOpen(true);
          }}
          className="relative z-10 mt-1.5 inline-flex items-center gap-1.5 self-center rounded-full border border-[var(--border)] bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-[var(--text-2)] hover:border-[var(--accent)]/40 hover:text-[var(--accent-dark)]"
        >
          <IconList size={13} />
          {hip4.featured.eventsMore}
        </button>
      ) : null}
      {book ? <Hip4BannerOdds book={book} catalog={catalog} /> : null}
      {eventsOpen ? (
        <MatchEventsDialog fixture={fixture} onClose={() => setEventsOpen(false)} />
      ) : null}
      </div>
      </div>
      {book ? <EplDesktopBook book={book} catalog={catalog} /> : null}
      {pager ? <div className="flex justify-end px-4 pb-4 sm:px-6">{pager}</div> : null}
    </div>
  );
}
