import { useEffect, useMemo, useRef, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  displayListedTitle,
  formatHighlightVolume,
  formatMarketVolumeAmount,
  heldOutcomeIdsFromBalances,
  impliedPercent,
  questionTicketMarket,
} from '@hip4';
import { questionVolumeUsd, searchCatalogRows, trendingCatalogMarkets } from '@hip4/catalog';
import { useWebAuth } from '../lib/auth';
import { useSpotAccount } from '../lib/useSpotAccount';
import { interpolate, useCopy } from '../lib/copy';
import { boardHasLiveFixture, catalogFootballFixtures, fetchEplBoard } from '../lib/api';
import { useCatalog } from './catalog';
import { IconClose, IconSearch } from './icons';
import { MarketSymbol } from './MarketSymbol';

const PREVIEW = 6;

export function SearchModal({
  query,
  onQuery,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { hip4 } = useCopy();
  const inputRef = useRef<HTMLInputElement>(null);
  const catalog = useCatalog();
  const all = catalog.data ?? [];
  const eplQ = useQuery({
    queryKey: ['sports', 'football', 'epl'],
    queryFn: fetchEplBoard,
    staleTime: 45_000,
    refetchInterval: (q) => (boardHasLiveFixture(q.state.data) ? 45_000 : 90_000),
    retry: 1,
  });
  const fixtures = useMemo(() => catalogFootballFixtures(eplQ.data), [eplQ.data]);
  const { address, authenticated } = useWebAuth();
  const spot = useSpotAccount(address, authenticated);
  const heldOutcomeIds = useMemo(
    () => heldOutcomeIdsFromBalances(spot.balances),
    [spot.balances],
  );

  const rows = useMemo(() => {
    const needle = query.trim();
    if (!needle) return trendingCatalogMarkets(all, 'all', PREVIEW, heldOutcomeIds, fixtures);
    return searchCatalogRows(all, needle, heldOutcomeIds, fixtures).slice(0, PREVIEW);
  }, [all, query, heldOutcomeIds, fixtures]);

  const totalMatch = useMemo(() => {
    const needle = query.trim();
    if (!needle) return all.length;
    return searchCatalogRows(all, needle, heldOutcomeIds, fixtures).length;
  }, [all, query, heldOutcomeIds, fixtures]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const goAll = (e?: FormEvent) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    params.set('view', 'open');
    onClose();
    navigate(`/markets?${params.toString()}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        className="card-shadow w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-white"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={goAll} className="relative border-b border-[var(--border)]">
          <IconSearch
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={hip4.markets.searchPlaceholder}
            className="w-full bg-[var(--bg-2)] py-3.5 pl-11 pr-11 text-sm outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-3)] hover:bg-white"
              onClick={() => onQuery('')}
            >
              <IconClose size={16} />
            </button>
          ) : null}
        </form>

        <div className="px-4 pt-3 pb-1">
          <span className="inline-flex rounded-full bg-[var(--bg-2)] px-3 py-1 text-xs font-bold text-[var(--text)]">
            {hip4.nav.markets}
          </span>
        </div>

        <ul className="max-h-[min(420px,50vh)] overflow-y-auto py-1">
          {catalog.isLoading && !catalog.data ? (
            <li className="px-4 py-8 text-center text-sm text-[var(--text-2)]">{hip4.home.loading}</li>
          ) : rows.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-[var(--text-2)]">{hip4.markets.noMatch}</li>
          ) : (
            rows.map((m) => {
              const yes = m.sides[0];
              const heading = displayListedTitle(m);
              const volUsd = questionVolumeUsd(all, m);
              const vol = formatHighlightVolume(volUsd);
              const amount = formatMarketVolumeAmount(volUsd);
              const meta =
                vol !== '—'
                  ? interpolate(hip4.row.volume, { amount: amount || vol })
                  : m.expiresAt
                    ? new Date(m.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : '';
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg)]"
                    onClick={() => {
                      onClose();
                      navigate(`/market/${questionTicketMarket(all, m, heldOutcomeIds).id}`);
                    }}
                  >
                    <MarketSymbol market={m} size={36} className="rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-semibold leading-snug">{heading}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-extrabold">{impliedPercent(yes?.probability ?? null)}</span>
                      {meta ? (
                        <span className="block text-[11px] font-medium text-[var(--text-3)]">{meta}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={() => goAll()}
            className="text-sm font-bold text-[var(--accent-dark)]"
          >
            See all results →{totalMatch > PREVIEW ? ` (${totalMatch})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
