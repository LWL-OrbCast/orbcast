import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  HIP4_CATALOG_POLL_MS,
  HIP4_CATALOG_STALE_MS,
  formatHighlightVolume,
  formatMarketVolumeAmount,
  impliedPercent,
  listOutcomes,
  topMarketsByVolume,
  type ListedMarket,
} from '@hip4';
import {
  applyCatalogView,
  applySearch,
  applySportChip,
  catalogEmptyKind,
  isEconomicsCatalogMarket,
  type MarketCatalogView,
  type SportChipId,
} from '@hip4/catalog';
import { interpolate, useCopy } from '../lib/copy';
import { useCatalogUi } from './catalogUi';
import { FeaturedEvent } from './FeaturedEvent';
import { looksLikeScheduleSubtitle, formatHms } from './formatTime';
import { IconChevron, IconFlame, SportIcon } from './icons';
import { RollingNumber } from './RollingNumber';
import { HomeLiveSkeleton, MarketGridSkeleton, SidebarListSkeleton } from './skeleton';
import { SPORT_CHIPS, sportIdForListed } from './SportCategoryBar';

export function useCatalog() {
  return useQuery({
    queryKey: ['hip4', 'outcomes'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    refetchInterval: HIP4_CATALOG_POLL_MS,
  });
}

export function MarketRow({ market }: { market: ListedMarket }) {
  const { hip4 } = useCopy();
  const yes = market.sides[0];
  const heading = market.multiOutcome && market.questionName ? market.questionName : market.title;
  const sub = market.multiOutcome
    ? market.legLabel
    : market.subtitle &&
        !isEconomicsCatalogMarket(market) &&
        !looksLikeScheduleSubtitle(market.subtitle, market.expiresAt)
      ? market.subtitle
      : '';
  const leadName = market.multiOutcome ? market.legLabel : (yes?.name ?? hip4.yes);
  const vol = formatMarketVolumeAmount(market.volumeUsd);
  const sport = sportIdForListed(market);
  const lead = yes?.probability ?? 0.5;
  return (
    <Link
      to={`/market/${market.id}`}
      className="card-shadow flex min-w-0 items-center gap-3.5 rounded-[18px] border border-[var(--border)] bg-white p-3.5 hover:border-[var(--accent)]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#ECFDF3] text-[var(--accent-dark)]">
        <SportIcon id={sport} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
          {market.status === 'live' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--live-bg)] px-2 py-0.5 text-[var(--live-dark)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
              {hip4.status.live}
            </span>
          ) : (
            <span className="text-[var(--text-3)]">
              {market.status === 'upcoming' ? hip4.status.upcoming : hip4.status.settled}
            </span>
          )}
          {vol ? (
            <span className="font-medium normal-case text-[var(--text-3)]">
              {interpolate(hip4.row.volume, { amount: vol })}
            </span>
          ) : null}
        </div>
        <div className="line-clamp-2 text-sm font-bold leading-snug">{heading}</div>
        {sub ? <div className="truncate text-xs text-[var(--text-3)]">{sub}</div> : null}
      </div>
      <div className="w-[72px] shrink-0 text-right">
        <div className="text-lg font-extrabold text-[var(--accent-dark)]">{impliedPercent(yes?.probability ?? null)}</div>
        <div className="truncate text-[10px] font-semibold text-[var(--text-2)]">{leadName}</div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, lead)) * 100)}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

export function CatalogFilters(props: {
  view: MarketCatalogView;
  setView: (v: MarketCatalogView) => void;
  count: number;
}) {
  const { hip4 } = useCopy();
  const views: { id: MarketCatalogView; label: string }[] = [
    { id: 'endingSoon', label: hip4.markets.endingSoon },
    { id: 'open', label: hip4.markets.live },
    { id: 'upcoming', label: hip4.status.upcoming },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => props.setView(v.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              props.view === v.id
                ? 'border-[var(--accent)] bg-[#ECFDF3] text-[var(--accent-dark)]'
                : 'border-[var(--border)] bg-white text-[var(--text-2)]'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="mb-3 text-xs font-bold text-[var(--text-3)]">
        {interpolate(props.count === 1 ? hip4.markets.count_one : hip4.markets.count_other, {
          count: props.count,
        })}
      </div>
    </>
  );
}

export function useFilteredCatalog(
  all: ListedMarket[],
  view: MarketCatalogView,
  chip: SportChipId,
  query: string,
) {
  return useMemo(() => {
    let next = applyCatalogView(all, view);
    next = applySportChip(next, chip);
    return applySearch(next, query);
  }, [all, view, chip, query]);
}

function SidebarList({
  title,
  to,
  children,
}: {
  title: ReactNode;
  to: string;
  children: ReactNode;
}) {
  return (
    <section className="card-shadow min-w-0 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
      <Link
        to={to}
        className="flex min-w-0 items-center justify-between border-b border-[var(--border)] px-4 py-3"
      >
        <h2 className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-extrabold">{title}</h2>
        <IconChevron size={16} className="text-[var(--text-3)]" />
      </Link>
      {children}
    </section>
  );
}

function TrendingSidebar({ markets, loading }: { markets: ListedMarket[]; loading?: boolean }) {
  const { hip4 } = useCopy();
  if (loading) return <SidebarListSkeleton />;
  if (!markets.length) return null;
  return (
    <SidebarList
      title={
        <>
          <span aria-hidden>🔥</span> {hip4.home.trending}
        </>
      }
      to="/markets?view=open"
    >
      <ol>
        {markets.map((m, i) => {
          const vol = formatHighlightVolume(m.volumeUsd);
          const heading = m.multiOutcome && m.questionName ? m.questionName : m.title;
          return (
            <li key={m.id}>
              <Link
                to={`/market/${m.id}`}
                className="flex min-w-0 items-center gap-2 px-3 py-3 hover:bg-[var(--bg)] sm:gap-3 sm:px-4"
              >
                <span className="w-5 shrink-0 text-sm font-extrabold text-[var(--text-3)]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{heading}</span>
                <span className="shrink-0 text-[11px] font-semibold text-[var(--text-3)]">
                  {vol !== '—' ? vol : ''}
                </span>
                <IconFlame size={14} className="hidden shrink-0 text-orange-500 sm:block" />
                <IconChevron size={14} className="hidden shrink-0 text-[var(--text-3)] sm:block" />
              </Link>
            </li>
          );
        })}
      </ol>
    </SidebarList>
  );
}

function EndingSoonSidebar({ markets, loading }: { markets: ListedMarket[]; loading?: boolean }) {
  const { hip4 } = useCopy();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (loading) return <SidebarListSkeleton />;
  if (!markets.length) return null;
  return (
    <SidebarList
      title={
        <>
          <span aria-hidden>⏳</span> {hip4.home.endingSoon}
        </>
      }
      to="/markets?view=endingSoon"
    >
      <ul>
        {markets.map((m) => {
          const heading = m.multiOutcome && m.questionName ? m.questionName : m.title;
          const remainSec =
            m.expiresAt != null && m.expiresAt > now
              ? Math.max(0, Math.ceil((m.expiresAt - now) / 1000))
              : null;
          const vol = formatHighlightVolume(m.volumeUsd);
          const yes = m.sides[0];
          return (
            <li key={m.id}>
              <Link
                to={`/market/${m.id}`}
                className="flex min-w-0 items-center gap-3 px-3 py-3 hover:bg-[var(--bg)] sm:px-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-bold leading-snug">{heading}</span>
                  {remainSec != null || vol !== '—' ? (
                    <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-[11px] font-semibold">
                      {remainSec != null ? (
                        <>
                          <span className="text-[var(--text-3)]">{hip4.status.endsIn}</span>
                          <RollingNumber
                            value={remainSec}
                            format={formatHms}
                            variant="clock"
                            durationMs={280}
                            className="text-[11px] font-extrabold text-[var(--accent)]"
                          />
                        </>
                      ) : null}
                      {vol !== '—' ? (
                        <span className="text-[var(--text-3)]">
                          {remainSec != null ? '· ' : ''}
                          {interpolate(hip4.row.volume, { amount: vol })}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-extrabold text-[var(--accent-dark)]">
                  {impliedPercent(yes?.probability ?? null)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SidebarList>
  );
}

export function HomePage() {
  const { hip4 } = useCopy();
  const q = useCatalog();
  const { sport } = useCatalogUi();
  const [showAllLive, setShowAllLive] = useState(false);
  const all = q.data ?? [];
  const scoped = useMemo(() => applySportChip(all, sport), [all, sport]);
  const featured = useMemo(() => {
    const inPlay = scoped.filter((m) => m.status === 'live');
    return topMarketsByVolume(inPlay.length ? inPlay : scoped, 5);
  }, [scoped]);
  const trending = useMemo(() => topMarketsByVolume(scoped, 5), [scoped]);
  const endingSoon = useMemo(
    () => applyCatalogView(scoped, 'endingSoon').slice(0, 5),
    [scoped],
  );
  const live = useMemo(() => applyCatalogView(scoped, 'open'), [scoped]);

  useEffect(() => {
    setShowAllLive(false);
  }, [sport]);

  const livePreview = showAllLive ? live : live.slice(0, 14);
  const liveHidden = Math.max(0, live.length - 14);
  const catalogLoading = q.isLoading && !q.data;

  return (
    <div className="min-w-0 w-full max-w-full">
      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 w-full max-w-full">
          <FeaturedEvent markets={featured} catalog={all} loading={catalogLoading} />
        </div>
        <aside className="flex min-w-0 w-full max-w-full flex-col gap-4">
          <TrendingSidebar markets={trending} loading={catalogLoading} />
          <EndingSoonSidebar markets={endingSoon} loading={catalogLoading} />
        </aside>
      </div>

      {catalogLoading ? (
        <HomeLiveSkeleton />
      ) : (
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">{hip4.markets.live} markets</h2>
          <Link to="/markets?view=open" className="text-sm font-bold text-[var(--accent-dark)]">
            {hip4.home.seeAll}
          </Link>
        </div>
        <CatalogBody
          query={q}
          rows={livePreview}
          chip={sport}
          emptyLive
        />
        {liveHidden > 0 && !showAllLive ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllLive(true)}
              className="btn-stamp btn-ghost-stamp px-5 py-2.5 text-sm"
            >
              {`Show More (${liveHidden})`}
            </button>
          </div>
        ) : null}
      </section>
      )}
    </div>
  );
}

export function MarketsPage() {
  const { hip4 } = useCopy();
  const q = useCatalog();
  const { sport, setSport, search, setSearch } = useCatalogUi();
  const [params] = useSearchParams();
  const [view, setView] = useState<MarketCatalogView>('endingSoon');
  const rows = useFilteredCatalog(q.data ?? [], view, sport, search);

  useEffect(() => {
    const qParam = params.get('q');
    if (qParam) setSearch(qParam);
    const s = params.get('sport');
    if (s && (SPORT_CHIPS as string[]).includes(s)) setSport(s as SportChipId);
    const v = params.get('view');
    if (v === 'open' || v === 'endingSoon' || v === 'upcoming') setView(v);
  }, [params, setSearch, setSport]);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">{hip4.header.markets}</h1>
      <CatalogFilters view={view} setView={setView} count={rows.length} />
      <CatalogBody query={q} rows={rows} chip={search.trim() ? undefined : sport} />
    </div>
  );
}

function CatalogBody({
  query,
  rows,
  chip,
  emptyLive,
}: {
  query: ReturnType<typeof useCatalog>;
  rows: ListedMarket[];
  chip?: SportChipId;
  emptyLive?: boolean;
}) {
  const { hip4 } = useCopy();
  if (query.isLoading && !query.data) {
    return <MarketGridSkeleton count={6} />;
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center">
        <p className="font-extrabold">{hip4.home.loadError}</p>
        <p className="mt-1 text-sm text-[var(--text-2)]">{hip4.home.loadErrorHint}</p>
        <button
          type="button"
          className="btn-stamp btn-primary mt-4 px-4 py-2 text-sm"
          onClick={() => void query.refetch()}
        >
          {hip4.home.retry}
        </button>
      </div>
    );
  }
  if (!rows.length) {
    const kind = chip ? catalogEmptyKind(chip, 0) : null;
    const title =
      kind === 'crypto'
        ? hip4.home.noCrypto
        : kind === 'stocks'
          ? hip4.home.noStocks
          : kind === 'economics'
            ? hip4.home.noEconomics
            : kind === 'sports'
              ? hip4.home.noSports
              : emptyLive
                ? hip4.home.noLive
                : hip4.markets.noMatch;
    const hint =
      kind === 'crypto'
        ? hip4.home.noCryptoHint
        : kind === 'stocks'
          ? hip4.home.noStocksHint
          : kind === 'economics'
            ? hip4.home.noEconomicsHint
            : kind === 'sports'
              ? hip4.home.noSportsHint
              : emptyLive
                ? hip4.home.noLiveHint
                : hip4.markets.noMatchHint;
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center">
        <p className="font-extrabold">{title}</p>
        <p className="mt-1 text-sm text-[var(--text-2)]">{hint}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {rows.map((m) => (
        <MarketRow key={m.id} market={m} />
      ))}
    </div>
  );
}
