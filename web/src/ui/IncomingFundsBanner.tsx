/**
 * Sticky "funds incoming" overlay — web port of IncomingFundsBanner.
 * Floats under the header, does not reflow layout, survives route changes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { interpolate, useCopy } from '../lib/copy';
import { fetchArbUsdc } from '../lib/arb';
import { useWebAuth } from '../lib/auth';
import {
  hydrateFundsPending,
  setHlDeposit,
  setHlWithdraw,
  sweepFundsPendingExpired,
  useFundsPending,
} from '../lib/fundsPending';
import { fetchHlUsdBalances } from '../lib/webKernel';
import { IconChevron } from './icons';
import usdcIcon from '../../../frontend/assets/images/usdc-icon.webp';

const HL_WITHDRAW_FEE_USDC = 1;

function fmtAmount(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function fmtNetHlWithdraw(raw: string): string {
  const gross = parseFloat(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(gross)) return fmtAmount(raw);
  return fmtAmount(Math.max(0, gross - HL_WITHDRAW_FEE_USDC));
}

function ProgressChevrons() {
  return (
    <span className="funds-chevrons flex shrink-0 items-center" aria-hidden>
      <IconChevron size={15} className="funds-chevron text-[var(--accent-dark)]" />
      <IconChevron size={15} className="funds-chevron -ml-1.5 text-[var(--accent-dark)]" />
      <IconChevron size={15} className="funds-chevron -ml-1.5 text-[var(--accent-dark)]" />
    </span>
  );
}

function BannerRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-[#BBF7D0] bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.08)]">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#ECFDF3]">
        <img src={usdcIcon} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
      </span>
      <p className="min-w-0 flex-1 text-xs font-semibold leading-[18px] text-[var(--text)]">{text}</p>
      <ProgressChevrons />
    </div>
  );
}

export function IncomingFundsBanner() {
  const { fundsBanner } = useCopy();
  const { address, authenticated } = useWebAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const pending = useFundsPending();

  useEffect(() => {
    hydrateFundsPending(authenticated && address ? address : null);
  }, [authenticated, address]);

  useEffect(() => {
    const id = window.setInterval(sweepFundsPendingExpired, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pending.withdraw || !address) return;
    let cancelled = false;
    const net = Math.max(0, parseFloat(pending.withdraw.amount) - HL_WITHDRAW_FEE_USDC);
    const baseline = pending.withdraw.baselineWalletRaw;
    const poll = async () => {
      try {
        const bal = await fetchArbUsdc(address);
        if (cancelled) return;
        const gained = bal - baseline;
        if (net > 0 && gained >= net * 0.95) {
          setHlWithdraw(null);
          void qc.invalidateQueries();
        }
      } catch {
        /* keep polling */
      }
    };
    void poll();
    const id = window.setInterval(poll, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pending.withdraw, address, qc]);

  useEffect(() => {
    if (!pending.deposit || !address) return;
    let cancelled = false;
    const amount = parseFloat(pending.deposit.amount);
    const baseline = pending.deposit.baselineTradeUsd;
    const threshold = baseline + (Number.isFinite(amount) ? Math.max(0.01, amount * 0.5) : 0.01);
    const poll = async () => {
      try {
        const bals = await fetchHlUsdBalances(address);
        if (cancelled) return;
        if (bals.trade >= threshold || bals.total >= threshold) {
          setHlDeposit(null);
          void qc.invalidateQueries();
        }
      } catch {
        /* keep polling */
      }
    };
    void poll();
    const id = window.setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pending.deposit, address, qc]);

  const items = useMemo(() => {
    const list: { key: string; text: string }[] = [];
    if (pending.withdraw) {
      list.push({
        key: 'hlWithdraw',
        text: interpolate(fundsBanner.toWallet, { amount: fmtNetHlWithdraw(pending.withdraw.amount) }),
      });
    }
    if (pending.deposit) {
      list.push({
        key: 'hlDeposit',
        text: interpolate(fundsBanner.toTrade, { amount: fmtAmount(pending.deposit.amount) }),
      });
    }
    return list;
  }, [pending.withdraw, pending.deposit, fundsBanner]);

  const shouldShow = items.length > 0 && location.pathname !== '/login';
  const snapshot = useRef(items);
  if (items.length > 0) snapshot.current = items;

  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    if (shouldShow) {
      setRendered(true);
      return;
    }
    if (!rendered) return;
    const id = window.setTimeout(() => setRendered(false), 240);
    return () => window.clearTimeout(id);
  }, [shouldShow, rendered]);

  if (!rendered || snapshot.current.length === 0) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center px-3 sm:top-[3.65rem] ${
        shouldShow ? 'funds-banner-in' : 'funds-banner-out'
      }`}
      aria-live="polite"
    >
      <div className="flex w-full max-w-[520px] flex-col gap-2">
        {snapshot.current.map((item) => (
          <BannerRow key={item.key} text={item.text} />
        ))}
      </div>
    </div>
  );
}
