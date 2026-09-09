import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchFootballEvents,
  footballEventKind,
  footballEventLabel,
  footballEventMinute,
  type EplFixture,
  type FootballEvent,
  type FootballEventKind,
} from '../lib/api';
import { useCopy } from '../lib/copy';
import {
  IconCardRect,
  IconClose,
  IconGoalBall,
  IconSubArrows,
  IconVarWhistle,
} from './icons';

function EventIcon({ kind }: { kind: FootballEventKind }) {
  const wrap =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full';
  if (kind === 'goal' || kind === 'penalty') {
    return (
      <span className={`${wrap} bg-[#ECFDF3] text-[var(--accent-dark)]`}>
        <IconGoalBall size={16} />
      </span>
    );
  }
  if (kind === 'ownGoal' || kind === 'missedPenalty') {
    return (
      <span className={`${wrap} bg-[#FFF1F2] text-[var(--no)]`}>
        <IconGoalBall size={16} />
      </span>
    );
  }
  if (kind === 'sub') {
    return (
      <span className={`${wrap} bg-[#EFF6FF] text-[#2563EB]`}>
        <IconSubArrows size={16} />
      </span>
    );
  }
  if (kind === 'yellow') {
    return (
      <span className={`${wrap} bg-[#FFFBEB]`}>
        <IconCardRect size={15} className="text-[#EAB308]" />
      </span>
    );
  }
  if (kind === 'red') {
    return (
      <span className={`${wrap} bg-[#FFF1F2]`}>
        <IconCardRect size={15} className="text-[#E11D48]" />
      </span>
    );
  }
  if (kind === 'var') {
    return (
      <span className={`${wrap} bg-[var(--bg-2)] text-[var(--text-2)]`}>
        <IconVarWhistle size={16} />
      </span>
    );
  }
  return (
    <span className={`${wrap} bg-[var(--bg-2)] text-[var(--text-3)]`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

function EventBody({ ev }: { ev: FootballEvent }) {
  const kind = footballEventKind(ev);
  const minute = footballEventMinute(ev);
  const label = footballEventLabel(ev);
  const team = ev.team?.trim();
  const assist = ev.assist?.trim();
  let primary: ReactNode = ev.player?.trim() || team || label;
  let secondary = [label, team].filter(Boolean).join(' · ');
  let extra: string | null = null;

  if (kind === 'sub') {
    const off = assist;
    const on = ev.player?.trim();
    primary = (
      <span className="flex flex-col gap-1">
        {off ? (
          <span>
            <span className="mr-1.5 font-extrabold text-[#E11D48]">↓</span>
            {off}
          </span>
        ) : null}
        {on ? (
          <span>
            <span className="mr-1.5 font-extrabold text-[var(--accent-dark)]">↑</span>
            {on}
          </span>
        ) : null}
        {!off && !on ? team || label : null}
      </span>
    );
  } else if ((kind === 'goal' || kind === 'penalty') && assist) {
    extra = `Assist ${assist}`;
  }

  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold leading-snug text-[var(--text)]">{primary}</div>
        {secondary ? (
          <div className="mt-1 text-xs font-semibold text-[var(--text-2)]">{secondary}</div>
        ) : null}
        {extra ? (
          <div className="mt-0.5 text-xs font-semibold text-[var(--text-3)]">{extra}</div>
        ) : null}
      </div>
      {minute ? (
        <span className="shrink-0 pt-0.5 text-xs font-extrabold tabular-nums text-[var(--text-2)]">
          {minute}
        </span>
      ) : null}
    </>
  );
}

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
      <div className="relative z-10 flex max-h-[min(34rem,82dvh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.25)]">
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
            <p className="py-8 text-center text-sm font-semibold text-[var(--text-2)]">
              {hip4.featured.events}…
            </p>
          ) : q.isError && !rows.length ? (
            <p className="py-8 text-center text-sm font-semibold text-[var(--text-2)]">
              {hip4.featured.eventsLoadError}
            </p>
          ) : !rows.length ? (
            <p className="py-8 text-center text-sm font-semibold text-[var(--text-2)]">
              {hip4.featured.eventsEmpty}
            </p>
          ) : (
            <ol className="flex flex-col">
              {rows.map((ev, i) => {
                const kind = footballEventKind(ev);
                return (
                  <li
                    key={`${i}-${footballEventMinute(ev)}-${ev.player}-${ev.type}`}
                    className="flex items-start gap-3.5 border-b border-[var(--border)] py-3.5 last:border-b-0 last:pb-1 first:pt-1"
                  >
                    <EventIcon kind={kind} />
                    <EventBody ev={ev} />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
