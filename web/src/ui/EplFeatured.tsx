import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EplFixture } from '../lib/api';
import { interpolate, useCopy } from '../lib/copy';
import { formatHms } from './formatTime';
import { RollingNumber } from './RollingNumber';
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

function formatEvent(ev: NonNullable<EplFixture['events']>[number]): string {
  const minute =
    ev.elapsed == null
      ? ''
      : ev.extra != null
        ? `${ev.elapsed}+${ev.extra}'`
        : `${ev.elapsed}'`;
  const who = ev.player || ev.team;
  const what = ev.type === 'Card' ? ev.detail || ev.type : ev.type;
  return [minute, who, what].filter(Boolean).join(' · ');
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

export function EplFeatured({ fixture, href }: { fixture: EplFixture; href: string }) {
  const { hip4 } = useCopy();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const showScore = fixture.live || fixture.finished;
  const mid = showScore ? scoreText(fixture) : '';
  const events = (fixture.events ?? []).slice(-2).map(formatEvent).filter(Boolean);
  const startRemain =
    fixture.kickoffAt != null && fixture.kickoffAt > now
      ? Math.max(0, Math.ceil((fixture.kickoffAt - now) / 1000))
      : null;
  const hint =
    !fixture.live && !fixture.finished && fixture.kickoffAt
      ? formatKickoff(fixture.kickoffAt)
      : fixture.venue;

  return (
    <Link
      to={href}
      className="card-shadow relative block w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-white"
    >
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
      <article className="relative z-10 flex min-h-[260px] min-w-0 flex-col justify-end px-3.5 pb-3.5 pt-3 sm:min-h-[300px] sm:px-6 sm:pb-5 sm:pt-4">
        {fixture.league.logo ? (
          <img
            src={fixture.league.logo}
            alt={hip4.featured.epl}
            className="mx-auto mb-1.5 h-[68px] w-[72px] object-contain"
          />
        ) : (
          <p className="mb-1 text-center text-[13px] font-extrabold tracking-wide text-[var(--text)]">
            {hip4.featured.epl}
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
              <img src={fixture.home.logo} alt="" className="h-11 w-11 object-contain sm:h-14 sm:w-14" />
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
              <img src={fixture.away.logo} alt="" className="h-11 w-11 object-contain sm:h-14 sm:w-14" />
            ) : (
              <div className="h-11 w-11 rounded-full bg-[var(--bg-2)] sm:h-14 sm:w-14" />
            )}
            <p className="w-full truncate text-center text-[13px] font-bold sm:text-sm">{fixture.away.name}</p>
          </div>
        </div>

        {events.length > 0 ? (
          <ul className="min-h-9 space-y-0.5 text-center text-xs font-semibold text-[var(--text-2)]">
            {events.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : hint ? (
          <p className="min-h-9 truncate text-center text-xs font-semibold leading-9 text-[var(--text-2)]">
            {hint}
          </p>
        ) : null}
      </article>
    </Link>
  );
}
