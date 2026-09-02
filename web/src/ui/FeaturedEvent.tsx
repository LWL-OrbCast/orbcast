import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CANDLE_INTERVAL_MS,
  displayListedTitle,
  fetchLegCandleSamples,
  formatHighlightVolume,
  impliedPercent,
  questionSiblings,
  type ListedMarket,
  type OutcomeSide,
} from '@hip4';
import { isEconomicsCatalogMarket } from '@hip4/catalog';
import { useCopy } from '../lib/copy';
import { WEB_CHART_RANGES, type WebChartRangeId } from './chartRanges';
import { formatEndDate, formatHms, looksLikeScheduleSubtitle } from './formatTime';
import { LEG_PALETTE, NO_COLOR, YES_COLOR } from './outcomeColors';
import { ProbabilityChart, type ProbSeries } from './ProbabilityChart';
import { RollingNumber } from './RollingNumber';
import { ShareMarketButton } from './ShareMarketButton';
import { FeaturedEventSkeleton } from './skeleton';

export function FeaturedEvent({
  markets,
  catalog = [],
  loading,
}: {
  markets: ListedMarket[];
  catalog?: ListedMarket[];
  loading: boolean;
}) {
  const { hip4 } = useCopy();
  const [idx, setIdx] = useState(0);
  const featured = markets[Math.min(idx, Math.max(0, markets.length - 1))] ?? null;

  useEffect(() => {
    if (idx >= markets.length) setIdx(0);
  }, [idx, markets.length]);

  if (loading && !featured) {
    return <FeaturedEventSkeleton />;
  }
  if (!featured) {
    return (
      <div className="flex h-[280px] min-w-0 items-center justify-center rounded-3xl border border-[var(--border)] bg-white">
        <p className="text-sm font-semibold text-[var(--text-2)]">{hip4.home.noLive}</p>
      </div>
    );
  }

  return (
    <FeaturedCard
      market={featured}
      catalog={catalog}
      index={idx}
      total={markets.length}
      onDot={setIdx}
    />
  );
}

function FeaturedCountdown({ market }: { market: ListedMarket }) {
  const { hip4 } = useCopy();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startRemain =
    market.startsAt != null && market.startsAt > now
      ? Math.max(0, Math.ceil((market.startsAt - now) / 1000))
      : null;
  const endRemain =
    market.expiresAt != null && market.expiresAt > now
      ? Math.max(0, Math.ceil((market.expiresAt - now) / 1000))
      : null;

  const clock = (value: number, label: string) => (
    <div className="flex w-full min-w-0 flex-col items-start gap-1">
      <div className="w-full min-w-0 overflow-x-auto no-scrollbar">
        <RollingNumber
          value={value}
          format={formatHms}
          variant="clock"
          durationMs={280}
          className="max-w-full text-[18px] font-extrabold text-[var(--accent)] sm:text-[22px]"
        />
      </div>
      <span className="text-xs font-semibold text-[var(--text-2)]">{label}</span>
    </div>
  );

  if (market.status === 'live') {
    return (
      <div className="flex min-w-0 flex-col items-start gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/40 bg-[#ECFDF3] px-3 py-1">
          <span className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute h-3 w-3 animate-ping rounded-full bg-[var(--accent)]/40" />
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          </span>
          <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-[var(--accent-dark)]">
            {hip4.status.live}
          </span>
        </span>
        {endRemain != null ? clock(endRemain, hip4.status.endsIn) : null}
      </div>
    );
  }

  if (startRemain != null) {
    return <div className="min-w-0">{clock(startRemain, hip4.featured.startsIn)}</div>;
  }

  if (endRemain != null) {
    return <div className="min-w-0">{clock(endRemain, hip4.status.endsIn)}</div>;
  }

  return null;
}

function FeaturedCard({
  market,
  catalog,
  index,
  total,
  onDot,
}: {
  market: ListedMarket;
  catalog: ListedMarket[];
  index: number;
  total: number;
  onDot: (i: number) => void;
}) {
  const navigate = useNavigate();
  const { hip4 } = useCopy();
  const [rangeId, setRangeId] = useState<WebChartRangeId>('1d');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const yes = market.sides[0];
  const no = market.sides[1];
  const yesNo = !market.multiOutcome && market.sides.length >= 2;
  const vol = formatHighlightVolume(market.volumeUsd);
  const siblings = useMemo(
    () => (catalog.length ? questionSiblings(catalog, market) : [market]),
    [catalog, market],
  );
  const multiLeg = siblings.length > 1;
  const heading = multiLeg
    ? market.questionName || displayListedTitle(market)
    : displayListedTitle(market);
  const showSubtitle =
    Boolean(market.subtitle) &&
    market.subtitle !== heading &&
    !isEconomicsCatalogMarket(market) &&
    !looksLikeScheduleSubtitle(market.subtitle, market.expiresAt);

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
        key: `${market.outcomeId}:0`,
        outcomeId: market.outcomeId,
        side: 0 as OutcomeSide,
        seed: market.sides[0]?.probability ?? null,
        label: market.sides[0]?.name ?? hip4.yes,
      },
      {
        key: `${market.outcomeId}:1`,
        outcomeId: market.outcomeId,
        side: 1 as OutcomeSide,
        seed: market.sides[1]?.probability ?? null,
        label: market.sides[1]?.name ?? hip4.no,
      },
    ];
  }, [market, multiLeg, siblings]);

  const legsKey = legs.map((l) => l.key).join(',');
  const range = WEB_CHART_RANGES.find((r) => r.id === rangeId) ?? WEB_CHART_RANGES[2];

  useEffect(() => {
    setSelectedKey(legs[0]?.key ?? null);
  }, [legsKey]);

  const resolvedKey =
    selectedKey && legs.some((l) => l.key === selectedKey) ? selectedKey : (legs[0]?.key ?? null);

  const chartQ = useQuery({
    queryKey: ['hip4', 'candles', 'featured', legsKey, range.id],
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
  }, [legs, chartQ.data, range.interval, rangePending, multiLeg, resolvedKey]);

  const go = (side?: 0 | 1) => {
    const q = side === 1 ? '?side=1' : side === 0 ? '?side=0' : '';
    navigate(`/market/${market.id}${q}`);
  };

  const pickSeries = (key: string) => {
    setSelectedKey(key);
  };

  return (
    <article className="card-shadow w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
      <div className="min-w-0 p-4 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <FeaturedCountdown market={market} />
          </div>
          <ShareMarketButton marketId={market.id} title={heading} />
        </div>

        <h2 className="break-words text-[1.35rem] font-extrabold leading-tight tracking-tight sm:text-[1.65rem] lg:text-[1.85rem]">
          {heading}
        </h2>
        {showSubtitle ? (
          <p className="mt-1 truncate text-sm text-[var(--text-2)]">{market.subtitle}</p>
        ) : null}

        <div className="mt-4 w-full min-w-0">
          <ProbabilityChart
            series={series}
            loading={rangePending}
            rangeId={rangeId}
            onRange={setRangeId}
            onSelect={pickSeries}
            title={multiLeg ? hip4.ticket.outcomeChances : hip4.ticket.yesNoChances}
            compact
            bare
          />
        </div>

        <div className="mt-5 grid min-w-0 gap-2 pb-1 pr-1 sm:gap-3">
          {multiLeg ? (
            <div
              className={`grid min-w-0 gap-2 sm:gap-3 ${
                siblings.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'
              }`}
            >
              {siblings.map((m, i) => {
                const px = m.sides.find((s) => s.side === 0)?.probability ?? null;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => navigate(`/market/${m.id}`)}
                    className="btn-stamp min-w-0 px-2 py-3 text-[12px] leading-tight sm:py-3.5 sm:text-sm"
                    style={{ background: LEG_PALETTE[i % LEG_PALETTE.length] }}
                  >
                    <span className="line-clamp-2">
                      {m.legLabel || hip4.yes} {impliedPercent(px)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : yesNo ? (
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => go(0)}
                className="btn-stamp btn-yes min-w-0 truncate py-3 text-sm sm:py-3.5 sm:text-base"
              >
                {yes?.name ?? hip4.yes} {impliedPercent(yes?.probability ?? null)}
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="btn-stamp btn-no min-w-0 truncate py-3 text-sm sm:py-3.5 sm:text-base"
              >
                {no?.name ?? hip4.no} {impliedPercent(no?.probability ?? null)}
              </button>
            </div>
          ) : (
            <Link
              to={`/market/${market.id}`}
              className="btn-stamp btn-primary min-w-0 truncate py-3 text-center text-sm sm:py-3.5 sm:text-base"
            >
              {yes?.name ?? hip4.yes} · {impliedPercent(yes?.probability ?? null)}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--text-3)]">
          {vol !== '—' ? <span>{vol} Vol</span> : null}
          {market.expiresAt ? <span>Ends {formatEndDate(market.expiresAt)}</span> : null}
        </div>
        {total > 1 ? (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Featured ${i + 1}`}
                onClick={() => onDot(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-5 bg-[var(--accent)]' : 'w-2 bg-[var(--border)]'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
