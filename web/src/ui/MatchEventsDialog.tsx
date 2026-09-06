import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchFootballEvents,
  formatFootballEvent,
  type EplFixture,
} from '../lib/api';
import { useCopy } from '../lib/copy';
import { IconClose } from './icons';

export function MatchEventsDialog({
  fixture,
  onClose,
}: {
  fixture: EplFixture;
  onClose: () => void;
}) {
  const { hip4 } = useCopy();
  const seeded = fixture.events ?? [];
  const q = useQuery({
    queryKey: ['sports', 'football', 'events', fixture.fixtureId],
    queryFn: () => fetchFootballEvents(fixture.fixtureId),
    enabled: fixture.fixtureId > 0,
    staleTime: 45_000,
    retry: 1,
  });
  const rows = q.data?.events?.length ? q.data.events : seeded;

  useEffect(() => {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-label={hip4.featured.events}
    >
      <button
        type="button"
        aria-label={hip4.order.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.45)]"
        tabIndex={-1}
      />
      <div className="relative z-10 flex max-h-[min(32rem,80dvh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold">{hip4.featured.events}</h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-2)]">
              {fixture.home.name} vs {fixture.away.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]"
            aria-label={hip4.order.close}
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {q.isPending && !rows.length ? (
            <p className="py-6 text-center text-sm font-semibold text-[var(--text-2)]">
              {hip4.featured.events}…
            </p>
          ) : q.isError && !rows.length ? (
            <p className="py-6 text-center text-sm font-semibold text-[var(--text-2)]">
              {hip4.featured.eventsLoadError}
            </p>
          ) : !rows.length ? (
            <p className="py-6 text-center text-sm font-semibold text-[var(--text-2)]">
              {hip4.featured.eventsEmpty}
            </p>
          ) : (
            <ol className="space-y-2">
              {rows.map((ev, i) => {
                const line = formatFootballEvent(ev);
                return line ? (
                  <li
                    key={`${i}-${line}`}
                    className="text-sm font-semibold leading-snug text-[var(--text)]"
                  >
                    {line}
                  </li>
                ) : null;
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
