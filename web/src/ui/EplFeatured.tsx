import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EplFixture } from '../lib/api';
import { interpolate, useCopy } from '../lib/copy';
import { formatHms } from './formatTime';
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
      <article className="relative z-10 flex min-h-[280px] min-w-0 flex-col justify-end p-4 sm:min-h-[320px] sm:p-6">
        <div className="mb-3 flex items-center gap-3">
          {fixture.league.logo ? (
            <img
              src={fixture.league.logo}
              alt={hip4.featured.epl}
              className="h-10 w-10 object-contain"
            />
          ) : (
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-3)]">
              {hip4.featured.epl}
            </p>
          )}
          {fixture.live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--live-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--live-dark)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
              {fixture.elapsed != null
                ? `${hip4.status.live} · ${interpolate(hip4.featured.minute, { n: fixture.elapsed })}`
                : hip4.status.live}
            </span>
          ) : fixture.status === 'HT' ? (
            <span className="text-[11px] font-bold text-[var(--text-3)]">{hip4.featured.ht}</span>
          ) : startRemain != null ? (
            <div className="min-w-0 text-sm font-bold tabular-nums text-[var(--text-2)]">
              {formatHms(startRemain)}
              <span className="ml-1.5 text-[11px] font-semibold text-[var(--text-3)]">
                {hip4.featured.startsIn}
              </span>
            </div>
          ) : (
            <span className="text-[11px] font-bold text-[var(--text-3)]">
              {fixture.statusLong || fixture.status}
            </span>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-center gap-2">
            {fixture.home.logo ? (
              <img src={fixture.home.logo} alt="" className="h-14 w-14 object-contain" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-[var(--bg-2)]" />
            )}
            <p className="w-full truncate text-center text-sm font-extrabold">{fixture.home.name}</p>
          </div>
          <p className="shrink-0 text-center text-xl font-extrabold tabular-nums">
            {showScore && mid ? mid : hip4.featured.vs}
          </p>
          <div className="flex min-w-0 flex-col items-center gap-2">
            {fixture.away.logo ? (
              <img src={fixture.away.logo} alt="" className="h-14 w-14 object-contain" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-[var(--bg-2)]" />
            )}
            <p className="w-full truncate text-center text-sm font-extrabold">{fixture.away.name}</p>
          </div>
        </div>

        {events.length > 0 ? (
          <ul className="mt-4 space-y-1 text-center text-xs font-semibold text-[var(--text-2)]">
            {events.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : hint ? (
          <p className="mt-4 truncate text-center text-xs font-semibold text-[var(--text-3)]">{hint}</p>
        ) : null}
      </article>
    </Link>
  );
}
