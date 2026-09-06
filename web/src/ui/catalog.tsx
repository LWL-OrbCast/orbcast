import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  HIP4_CATALOG_POLL_MS,
  HIP4_CATALOG_STALE_MS,
  displayFeaturedHeading,
  formatHighlightVolume,
  formatMarketVolumeAmount,
  heldOutcomeIdsFromBalances,
  impliedPercent,
  isOtherOutcomeLeg,
  listOutcomes,
  questionCatalogLegs,
  questionTicketMarket,
  topQuestionLegsByChance,
  type ListedMarket,
} from '@hip4';
import {
  applySportChip,
  catalogEmptyKind,
  catalogListRows,
  featuredCatalogMarkets,
  hip4ContestForTeams,
  isFinishedFootballContest,
  isFootballContestMarket,
  marketMatchesFixture,
  sameContestEvent,
  questionVolumeUsd,
  sportOnlyChipForMarket,
  trendingCatalogMarkets,
  type MarketCatalogView,
  type SportChipId,
} from '@hip4/catalog';
import { useWebAuth } from '../lib/auth';
import { useSpotAccount } from '../lib/useSpotAccount';
import { catalogLegChipStyle } from './outcomeColors';
import {
  boardHasLiveFixture,
  catalogFootballFixtures,
  fetchEplBoard,
  footballChromeFixture,
  type EplFixture,
} from '../lib/api';
import { useFeaturedAutoplay, useFeaturedOverlayHold } from '@hip4/autoplay';
import { FeaturedCrossfade } from './FeaturedCrossfade';
import { interpolate, useCopy } from '../lib/copy';
import { useCatalogUi } from './catalogUi';
import { EplFeatured } from './EplFeatured';
import { FeaturedAdjacentNav, FeaturedEvent } from './FeaturedEvent';
import { looksLikeScheduleSubtitle, formatHms } from './formatTime';
import { IconChevron, IconFlame } from './icons';
import { MarketSymbol } from './MarketSymbol';
import { RollingNumber } from './RollingNumber';
import {
  FeaturedEventSkeleton,
  HomeLiveSkeleton,
  MarketGridSkeleton,
  SidebarListSkeleton,
} from './skeleton';
import { SPORT_CHIPS } from './SportCategoryBar';

export function useCatalog() {
  return useQuery({
    queryKey: ['hip4', 'outcomes'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    refetchInterval: HIP4_CATALOG_POLL_MS,
  });
}

export function MarketRow({
  market,
  catalog = [],
  heldOutcomeIds,
}: {
  market: ListedMarket;
  catalog?: ListedMarket[];
  heldOutcomeIds?: Iterable<number> | null;
}) {
  const { hip4 } = useCopy();
  const navigate = useNavigate();
  const yes = market.sides[0];
  const no = market.sides[1];
  const siblings = catalog.length ? questionCatalogLegs(catalog, market) : [market];
  const multiLeg = siblings.length > 1;
  const shownLegs = multiLeg ? topQuestionLegsByChance(siblings, 2) : siblings;
  const extraLegs = Math.max(0, siblings.length - shownLegs.length);
  const heading = displayFeaturedHeading(market);
  const sub =
    !multiLeg &&
    market.subtitle &&
    market.subtitle !== heading &&
    !looksLikeScheduleSubtitle(market.subtitle, market.expiresAt)
      ? market.subtitle
      : '';
  const volUsd = multiLeg
    ? siblings.reduce((sum, m) => sum + (m.volumeUsd ?? 0), 0)
    : (market.volumeUsd ?? 0);
  const vol = formatMarketVolumeAmount(volUsd);
  const href = `/market/${questionTicketMarket(catalog, market, heldOutcomeIds).id}`;
  return (
    <article className="card-shadow flex h-full min-w-0 flex-col rounded-[18px] border border-[var(--border)] bg-white p-3 hover:border-[var(--accent)]">
      <Link to={href} className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
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
          {extraLegs > 0 ? (
            <span className="font-medium normal-case text-[var(--text-3)]">
              {interpolate(hip4.row.moreOutcomes, { count: extraLegs })}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-3.5">
          <MarketSymbol
            market={market}
            size={36}
            questionLevel={multiLeg}
            className="rounded-[12px]"
          />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-sm font-bold leading-snug">{heading}</div>
            {sub ? <div className="truncate text-xs text-[var(--text-3)]">{sub}</div> : null}
          </div>
        </div>
      </Link>
      {multiLeg ? (
        <div className="mt-auto grid min-w-0 grid-cols-2 gap-1.5 pt-2.5">
          {shownLegs.map((m) => {
            const i = siblings.findIndex((s) => s.id === m.id);
            const px = m.sides.find((s) => s.side === 0)?.probability ?? null;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/market/${m.id}`)}
                className="btn-catalog min-w-0 truncate px-1.5 py-1 text-[13px] font-semibold leading-tight"
                style={catalogLegChipStyle(isOtherOutcomeLeg(m), i < 0 ? 0 : i)}
              >
                {m.legLabel || hip4.yes} {impliedPercent(px)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-auto grid min-w-0 grid-cols-2 gap-1.5 pt-2.5">
          <button
            type="button"
            onClick={() => navigate(href)}
            className="btn-catalog btn-catalog-yes min-w-0 truncate px-1.5 py-1 text-[13px] font-semibold leading-tight"
          >
            {yes?.name ?? hip4.yes} {impliedPercent(yes?.probability ?? null)}
          </button>
          {no ? (
            <button
              type="button"
              onClick={() => navigate(href)}
              className="btn-catalog btn-catalog-no min-w-0 truncate px-1.5 py-1 text-[13px] font-semibold leading-tight"
            >
              {no.name ?? hip4.no} {impliedPercent(no.probability ?? null)}
            </button>
          ) : null}
        </div>
      )}
    </article>
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

export function useHeldOutcomeIds() {
  const { address, authenticated } = useWebAuth();
  const spot = useSpotAccount(address, authenticated);
  return useMemo(() => heldOutcomeIdsFromBalances(spot.balances), [spot.balances]);
}

export function useFilteredCatalog(
  all: ListedMarket[],
  view: MarketCatalogView,
  chip: SportChipId,
  query: string,
  heldOutcomeIds?: Iterable<number> | null,
  fixtures?: EplFixture[] | null,
) {
  return useMemo(
    () => catalogListRows(all, view, chip, query, heldOutcomeIds, fixtures),
    [all, view, chip, query, heldOutcomeIds, fixtures],
  );
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

function TrendingSidebar({
  markets,
  catalog,
  heldOutcomeIds,
  loading,
  sport,
}: {
  markets: ListedMarket[];
  catalog: ListedMarket[];
  heldOutcomeIds?: Iterable<number> | null;
  loading?: boolean;
  sport: SportChipId;
}) {
  const { hip4 } = useCopy();
  if (loading) return <SidebarListSkeleton />;
  if (!markets.length) return null;
  const to = sport === 'all' ? '/markets?view=open' : `/markets?view=open&sport=${sport}`;
  return (
    <SidebarList
      title={
        <>
          <span aria-hidden>🔥</span> {hip4.home.trending}
        </>
      }
      to={to}
    >
      <ol>
        {markets.map((m, i) => {
          const vol = formatHighlightVolume(questionVolumeUsd(catalog, m));
          const heading = m.multiOutcome && m.questionName ? m.questionName : m.title;
          return (
            <li key={m.id}>
              <Link
                to={`/market/${questionTicketMarket(catalog, m, heldOutcomeIds).id}`}
                className="flex min-w-0 items-center gap-2 px-3 py-3 hover:bg-[var(--bg)] sm:gap-3 sm:px-4"
              >
                <span className="w-5 shrink-0 text-sm font-extrabold text-[var(--text-3)]">{i + 1}</span>
                <MarketSymbol market={m} size={28} questionLevel className="rounded-[9px]" />
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

function EndingSoonSidebar({
  markets,
  catalog = [],
  heldOutcomeIds,
  loading,
  sport,
}: {
  markets: ListedMarket[];
  catalog?: ListedMarket[];
  heldOutcomeIds?: Iterable<number> | null;
  loading?: boolean;
  sport: SportChipId;
}) {
  const { hip4 } = useCopy();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (loading) return <SidebarListSkeleton />;
  if (!markets.length) return null;
  const to =
    sport === 'all' ? '/markets?view=endingSoon' : `/markets?view=endingSoon&sport=${sport}`;
  return (
    <SidebarList
      title={
        <>
          <span aria-hidden>⏳</span> {hip4.home.endingSoon}
        </>
      }
      to={to}
    >
      <ul>
        {markets.map((m) => {
          const heading = m.multiOutcome && m.questionName ? m.questionName : m.title;
          const remainSec =
            m.expiresAt != null && m.expiresAt > now
              ? Math.max(0, Math.ceil((m.expiresAt - now) / 1000))
              : null;
          const vol = formatHighlightVolume(questionVolumeUsd(catalog, m));
          const yes = m.sides[0];
          return (
            <li key={m.id}>
              <Link
                to={`/market/${questionTicketMarket(catalog, m, heldOutcomeIds).id}`}
                className="flex min-w-0 items-center gap-3 px-3 py-3 hover:bg-[var(--bg)] sm:px-4"
              >
                <MarketSymbol market={m} size={36} questionLevel className="rounded-xl" />
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

type FeaturedSlide =
  | { key: string; kind: 'football'; fixture: EplFixture; book: ListedMarket | null; href: string }
  | { key: string; kind: 'generic'; market: ListedMarket };

function slideLabel(slide: FeaturedSlide): string {
  if (slide.kind === 'football') {
    return `${slide.fixture.home.name} vs ${slide.fixture.away.name}`;
  }
  return displayFeaturedHeading(slide.market);
}

function slideIdentity(slide: FeaturedSlide): string {
  return slide.kind === 'football'
    ? `fb:${slide.fixture.fixtureId || slide.book?.id || slide.key}`
    : `g:${slide.market.id}`;
}

function HomeFeatured({
  title,
  seeAllHref,
  pinFixture,
  pinHref,
  pinBook,
  markets,
  fixtures,
  catalog,
  heldOutcomeIds,
  loading,
}: {
  title: string;
  seeAllHref: string;
  pinFixture: EplFixture | null;
  pinHref: string;
  pinBook: ListedMarket | null;
  markets: ListedMarket[];
  fixtures: EplFixture[] | null;
  catalog: ListedMarket[];
  heldOutcomeIds?: Iterable<number> | null;
  loading: boolean;
}) {
  const slides = useMemo<FeaturedSlide[]>(() => {
    const out: FeaturedSlide[] = [];
    const addedBooks: ListedMarket[] = [];
    const seenFixtureIds = new Set<number>();
    const pinBookResolved =
      pinBook ??
      (pinFixture
        ? markets.find((m) =>
            marketMatchesFixture(m, pinFixture.home.name, pinFixture.away.name),
          ) ?? null
        : null);
    const alreadyShown = (m: ListedMarket, fx: EplFixture | null) => {
      if (
        pinFixture &&
        pinBookResolved &&
        marketMatchesFixture(m, pinFixture.home.name, pinFixture.away.name)
      ) {
        return true;
      }
      if (fx && fx.fixtureId > 0 && seenFixtureIds.has(fx.fixtureId)) return true;
      return addedBooks.some((row) => sameContestEvent(row, m));
    };
    if (pinFixture) {
      if (pinFixture.fixtureId > 0) seenFixtureIds.add(pinFixture.fixtureId);
      if (pinBookResolved) addedBooks.push(pinBookResolved);
      out.push({
        key: `fx-${pinFixture.fixtureId}`,
        kind: 'football',
        fixture: pinFixture,
        book: pinBookResolved,
        href: pinBookResolved
          ? `/market/${questionTicketMarket(catalog, pinBookResolved, heldOutcomeIds).id}`
          : pinHref,
      });
    }
    for (const m of markets) {
      if (isFinishedFootballContest(m, fixtures)) continue;
      const fx = isFootballContestMarket(m)
        ? footballChromeFixture(fixtures ?? [], m)
        : null;
      if (fx?.finished) continue;
      if (alreadyShown(m, fx)) continue;
      if (fx) {
        if (fx.fixtureId > 0) seenFixtureIds.add(fx.fixtureId);
        addedBooks.push(m);
        out.push({
          key: `m-${m.id}`,
          kind: 'football',
          fixture: fx,
          book: m,
          href: `/market/${questionTicketMarket(catalog, m, heldOutcomeIds).id}`,
        });
      } else {
        addedBooks.push(m);
        out.push({ key: `m-${m.id}`, kind: 'generic', market: m });
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [catalog, fixtures, heldOutcomeIds, markets, pinBook, pinFixture, pinHref]);

  const { hip4 } = useCopy();
  const count = slides.length;
  const { index, go, pause, resume } = useFeaturedAutoplay(count);
  const slidesRef = useRef(slides);
  const indexRef = useRef(index);
  indexRef.current = index;
  useLayoutEffect(() => {
    const prevSlides = slidesRef.current;
    slidesRef.current = slides;
    const i = indexRef.current;
    if (i === 0) return;
    const was = prevSlides[i];
    if (!was) return;
    const nextIdx = slides.findIndex((s) => s.key === was.key);
    if (nextIdx >= 0 && nextIdx !== i) go(nextIdx);
  }, [slides, go]);
  const prev = count > 1 ? slides[(index - 1 + count) % count] : null;
  const next = count > 1 ? slides[(index + 1) % count] : null;
  const slide = slides[Math.min(index, Math.max(0, count - 1))] ?? null;

  const header = (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
        {prev && next ? (
          <FeaturedAdjacentNav
            prevLabel={slideLabel(prev)}
            nextLabel={slideLabel(next)}
            onPrev={() => go(index - 1)}
            onNext={() => go(index + 1)}
          />
        ) : null}
        <Link
          to={seeAllHref}
          className="shrink-0 text-sm font-bold text-[var(--accent-dark)]"
        >
          {hip4.home.seeAll}
        </Link>
      </div>
    </div>
  );

  const stageId = slide
    ? slideIdentity(slide)
    : loading
      ? 'skel'
      : 'empty';
  const stage = slide ? (
    slide.kind === 'football' ? (
      <EplFeatured
        fixture={slide.fixture}
        href={slide.href}
        catalog={catalog}
        book={slide.book}
      />
    ) : (
      <FeaturedEvent
        markets={[slide.market]}
        catalog={catalog}
        heldOutcomeIds={heldOutcomeIds}
        loading={false}
      />
    )
  ) : loading ? (
    <FeaturedEventSkeleton />
  ) : (
    <FeaturedEvent
      markets={[]}
      catalog={catalog}
      heldOutcomeIds={heldOutcomeIds}
      loading={false}
    />
  );

  return (
    <>
      {header}
      <div onPointerEnter={pause} onPointerLeave={resume}>
        <FeaturedCrossfade id={stageId}>{stage}</FeaturedCrossfade>
      </div>
    </>
  );
}

export function HomePage() {
  const { hip4 } = useCopy();
  const q = useCatalog();
  const { sport } = useCatalogUi();
  const heldOutcomeIds = useHeldOutcomeIds();
  const [showAllLive, setShowAllLive] = useState(false);
  const all = q.data ?? [];
  const scoped = useMemo(() => applySportChip(all, sport), [all, sport]);
  const eplQ = useQuery({
    queryKey: ['sports', 'football', 'epl'],
    queryFn: fetchEplBoard,
    staleTime: 45_000,
    refetchInterval: (q) => (boardHasLiveFixture(q.state.data) ? 45_000 : 90_000),
    retry: 1,
  });
  const catalogLoading = q.isLoading && !q.data;
  const showFootballHero = sport === 'all' || sport === 'football';
  const overlayHold = useFeaturedOverlayHold(
    showFootballHero,
    eplQ.isFetched || !!eplQ.data,
  );
  const heroLoading = catalogLoading || overlayHold;
  const fixtures = useMemo(() => catalogFootballFixtures(eplQ.data), [eplQ.data]);
  const featured = useMemo(
    () =>
      featuredCatalogMarkets(
        all,
        sport,
        sport === 'all' || sport === 'football' ? 8 : 5,
        heldOutcomeIds,
        fixtures,
      ),
    [all, sport, heldOutcomeIds, fixtures],
  );
  const trending = useMemo(
    () => trendingCatalogMarkets(all, sport, 5, heldOutcomeIds, fixtures),
    [all, sport, heldOutcomeIds, fixtures],
  );
  const eplBoardFixture =
    eplQ.data?.configured && eplQ.data.featured ? eplQ.data.featured : null;
  const eplBook = useMemo(() => {
    if (!eplBoardFixture) return null;
    return hip4ContestForTeams(
      all,
      eplBoardFixture.home.name,
      eplBoardFixture.away.name,
      heldOutcomeIds,
    );
  }, [all, eplBoardFixture, heldOutcomeIds]);
  const pinFixture = (() => {
    if (!eplBoardFixture || eplBoardFixture.finished) return null;
    // Football chip: keep the overlay live/upcoming hero even when team
    // names do not yet join a HIP-4 book. All still requires a book.
    return sport === 'football' || eplBook ? eplBoardFixture : null;
  })();
  const sliderMarkets = featured;
  const heroKey = showFootballHero ? `fb-${sport}` : sport;
  const eplHref = (() => {
    const footballBook =
      eplBook ??
      featured.find((m) => sportOnlyChipForMarket(m) === 'football') ??
      scoped.find((m) => sportOnlyChipForMarket(m) === 'football');
    return footballBook
      ? `/market/${questionTicketMarket(all, footballBook, heldOutcomeIds).id}`
      : '/markets?view=open&sport=football';
  })();
  const endingSoon = useMemo(
    () => catalogListRows(all, 'endingSoon', sport, '', heldOutcomeIds, fixtures).slice(0, 5),
    [all, sport, heldOutcomeIds, fixtures],
  );
  const live = useMemo(
    () => catalogListRows(all, 'open', sport, '', heldOutcomeIds, fixtures),
    [all, sport, heldOutcomeIds, fixtures],
  );

  useEffect(() => {
    setShowAllLive(false);
  }, [sport]);

  const livePreview = showAllLive ? live : live.slice(0, 16);
  const liveHidden = Math.max(0, live.length - 16);

  return (
    <div className="min-w-0 w-full max-w-full">
      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 w-full max-w-full">
          <div key={heroKey} className="page-enter">
            <HomeFeatured
              title={hip4.home.topEvent}
              seeAllHref={
                sport === 'all' ? '/markets?view=open' : `/markets?view=open&sport=${sport}`
              }
              pinFixture={heroLoading || !showFootballHero ? null : pinFixture}
              pinHref={eplHref}
              pinBook={heroLoading || !showFootballHero ? null : eplBook}
              markets={heroLoading ? [] : sliderMarkets}
              fixtures={heroLoading || !showFootballHero ? null : fixtures}
              catalog={all}
              heldOutcomeIds={heldOutcomeIds}
              loading={heroLoading}
            />
          </div>
        </div>
        <aside className="flex min-w-0 w-full max-w-full flex-col gap-4">
          <TrendingSidebar
            markets={trending}
            catalog={all}
            heldOutcomeIds={heldOutcomeIds}
            loading={catalogLoading}
            sport={sport}
          />
          <EndingSoonSidebar
            markets={endingSoon}
            catalog={all}
            heldOutcomeIds={heldOutcomeIds}
            loading={catalogLoading}
            sport={sport}
          />
        </aside>
      </div>

      {catalogLoading ? (
        <HomeLiveSkeleton />
      ) : (
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">{hip4.markets.live} markets</h2>
          <Link
            to={sport === 'all' ? '/markets?view=open' : `/markets?view=open&sport=${sport}`}
            className="text-sm font-bold text-[var(--accent-dark)]"
          >
            {hip4.home.seeAll}
          </Link>
        </div>
        <CatalogBody
          query={q}
          rows={livePreview}
          catalog={all}
          heldOutcomeIds={heldOutcomeIds}
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
  const heldOutcomeIds = useHeldOutcomeIds();
  const [params] = useSearchParams();
  const [view, setView] = useState<MarketCatalogView>('endingSoon');
  const eplQ = useQuery({
    queryKey: ['sports', 'football', 'epl'],
    queryFn: fetchEplBoard,
    staleTime: 45_000,
    refetchInterval: (q) => (boardHasLiveFixture(q.state.data) ? 45_000 : 90_000),
    retry: 1,
  });
  const fixtures = useMemo(() => catalogFootballFixtures(eplQ.data), [eplQ.data]);
  const rows = useFilteredCatalog(q.data ?? [], view, sport, search, heldOutcomeIds, fixtures);

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
      <CatalogBody
        query={q}
        rows={rows}
        catalog={q.data ?? []}
        heldOutcomeIds={heldOutcomeIds}
        chip={
          search.trim() || applySportChip(q.data ?? [], sport).length > 0 ? undefined : sport
        }
        view={view}
        searching={Boolean(search.trim())}
      />
    </div>
  );
}

function CatalogBody({
  query,
  rows,
  catalog = [],
  heldOutcomeIds,
  chip,
  emptyLive,
  view,
  searching,
}: {
  query: ReturnType<typeof useCatalog>;
  rows: ListedMarket[];
  catalog?: ListedMarket[];
  heldOutcomeIds?: Iterable<number> | null;
  chip?: SportChipId;
  emptyLive?: boolean;
  view?: MarketCatalogView;
  searching?: boolean;
}) {
  const { hip4 } = useCopy();
  if (query.isLoading && !query.data) {
    return <MarketGridSkeleton count={8} />;
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
    const kind = !searching && chip ? catalogEmptyKind(chip, 0) : null;
    const endingSoonEmpty = !searching && view === 'endingSoon';
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
                : endingSoonEmpty
                  ? hip4.home.noEndingSoon
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
                : endingSoonEmpty
                  ? null
                  : hip4.markets.noMatchHint;
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center">
        <p className="font-extrabold">{title}</p>
        {hint ? <p className="mt-1 text-sm text-[var(--text-2)]">{hint}</p> : null}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((m) => (
        <MarketRow
          key={m.id}
          market={m}
          catalog={catalog}
          heldOutcomeIds={heldOutcomeIds}
        />
      ))}
    </div>
  );
}
