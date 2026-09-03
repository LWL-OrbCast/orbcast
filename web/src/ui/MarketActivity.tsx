import { useState } from 'react';
import {
  formatUsdCompactPublic,
  marketRulesFacts,
  rankActiveWallets,
  shortWallet,
  type ListedMarket,
  type OutcomeBook,
  type OutcomePrint,
} from '@hip4';
import { interpolate, tHip4, useCopy } from '../lib/copy';
import { NO_COLOR, YES_COLOR } from './outcomeColors';

type Tab = 'trades' | 'rules' | 'bids' | 'active';

type Props = {
  market: ListedMarket;
  prints: OutcomePrint[];
  tapeReady: boolean;
  multiLeg: boolean;
  legNames: Record<number, string>;
  book: OutcomeBook | null | undefined;
  bookLoading?: boolean;
};

function timeAgo(ms: number, nowLabel: string): string {
  const d = Math.max(0, Date.now() - ms);
  if (d < 15_000) return nowLabel;
  if (d < 60_000) return `${Math.floor(d / 1000)}s`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  return `${Math.floor(d / 3_600_000)}h`;
}

export function MarketActivity({
  market,
  prints,
  tapeReady,
  multiLeg,
  legNames,
  book,
  bookLoading,
}: Props) {
  const { hip4 } = useCopy();
  const [tab, setTab] = useState<Tab>('trades');
  const rules = marketRulesFacts(market, multiLeg, tHip4);
  const active = tab === 'active' ? rankActiveWallets(prints, 10) : [];
  const asks = book?.asks.slice(0, 10) ?? [];
  const bids = book?.bids.slice(0, 10) ?? [];
  const maxSz = Math.max(1, ...asks.map((l) => l.sz), ...bids.map((l) => l.sz));
  const tabs: { id: Tab; label: string }[] = [
    { id: 'trades', label: hip4.activity.trades },
    { id: 'bids', label: hip4.activity.bids },
    { id: 'active', label: hip4.activity.active },
    { id: 'rules', label: hip4.activity.rules },
  ];
  const txLabel = (count: number) =>
    interpolate(count === 1 ? hip4.activity.tx_one : hip4.activity.tx_other, { count });

  return (
    <section className="mt-6">
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-[var(--bg-2)] p-1 no-scrollbar">
        {tabs.map((row) => {
          const on = tab === row.id;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setTab(row.id)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-[12px] ${
                on
                  ? 'bg-white font-extrabold text-[var(--text)] shadow-sm'
                  : 'font-semibold text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
            >
              {row.label}
            </button>
          );
        })}
      </div>

      {tab === 'trades' ? (
        prints.length === 0 ? (
          <p className="py-2 text-[13px] font-medium leading-5 text-[var(--text-2)]">
            {tapeReady ? hip4.activity.noTrades : hip4.activity.waitingPrints}
          </p>
        ) : (
          <ul>
            {prints.slice(0, 12).map((p) => {
              const buy = p.takerSide === 'buy';
              const tone = buy ? YES_COLOR : NO_COLOR;
              const fromMap = p.outcomeId >= 0 ? legNames[p.outcomeId] : undefined;
              const sideName =
                fromMap ??
                (p.side === 0 || p.side === 1
                  ? (market.sides.find((s) => s.side === p.side)?.name ??
                    (p.side === 0 ? hip4.yes : hip4.no))
                  : hip4.yes);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 border-b border-[var(--border)] py-2.5 text-[12px]"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
                  <span className="min-w-0 flex-[1.2] truncate font-bold" style={{ color: tone }}>
                    {buy ? hip4.ticket.buy : hip4.ticket.sell} {sideName}
                  </span>
                  <span className="w-10 text-right font-bold tabular-nums">
                    {Math.round(p.px * 100)}¢
                  </span>
                  <span className="w-14 text-right font-medium tabular-nums text-[var(--text-2)]">
                    {p.sz.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                  <span className="w-10 text-right font-medium text-[var(--text-3)]">
                    {timeAgo(p.time, hip4.activity.now)}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {tab === 'rules' ? (
        <div className="space-y-2 py-1">
          <p className="text-[13px] font-medium leading-5 text-[var(--text-2)]">{rules.body}</p>
          {rules.facts.map((line) => (
            <p key={line} className="text-[13px] font-semibold text-[var(--text)]">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {tab === 'bids' ? (
        !book && bookLoading ? (
          <p className="py-2 text-[13px] font-medium text-[var(--text-2)]">{hip4.activity.waitingPrints}</p>
        ) : !book || (asks.length === 0 && bids.length === 0) ? (
          <p className="py-2 text-[13px] font-medium leading-5 text-[var(--text-2)]">
            {hip4.activity.bidsEmpty}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <div className="mb-1.5 font-extrabold text-[var(--danger)]">Ask</div>
              {asks.map((lvl, i) => (
                <div key={`a${i}`} className="relative flex justify-between py-1 tabular-nums">
                  <span
                    className="absolute inset-y-0 right-0 bg-[var(--danger)]/10"
                    style={{ width: `${Math.max(8, (lvl.sz / maxSz) * 100)}%` }}
                  />
                  <span className="relative">{(lvl.px * 100).toFixed(1)}¢</span>
                  <span className="relative text-[var(--text-2)]">{lvl.sz.toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1.5 font-extrabold text-[var(--yes)]">Bid</div>
              {bids.map((lvl, i) => (
                <div key={`b${i}`} className="relative flex justify-between py-1 tabular-nums">
                  <span
                    className="absolute inset-y-0 right-0 bg-[var(--yes)]/12"
                    style={{ width: `${Math.max(8, (lvl.sz / maxSz) * 100)}%` }}
                  />
                  <span className="relative">{(lvl.px * 100).toFixed(1)}¢</span>
                  <span className="relative text-[var(--text-2)]">{lvl.sz.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}

      {tab === 'active' ? (
        active.length === 0 ? (
          <p className="py-2 text-[13px] font-medium leading-5 text-[var(--text-2)]">
            {hip4.activity.activeEmpty}
          </p>
        ) : (
          <ul>
            {active.map((w, i) => (
              <li
                key={w.address}
                className="flex items-center gap-2 border-b border-[var(--border)] py-2.5 text-[13px]"
              >
                <span className="w-5 font-extrabold text-[var(--accent-dark)]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{shortWallet(w.address)}</span>
                <span className="font-bold">${formatUsdCompactPublic(w.volumeUsd)}</span>
                <span className="w-12 text-right text-[11px] font-medium text-[var(--text-3)]">
                  {txLabel(w.trades)}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
