/**
 * Web mirror of Expo IncomingFundsBanner state: wallet ⇄ trade USDC still
 * in-flight. Persisted in localStorage so a refresh does not drop the pill.
 */
import { useSyncExternalStore } from 'react';

export const FUNDS_PENDING_DEPOSIT_TTL_MS = 2 * 60 * 1000;
export const FUNDS_PENDING_WITHDRAW_TTL_MS = 5 * 60 * 1000;

const KEY_PREFIX = 'orbcast_funds_pending_v1:';

export type HlDepositPending = {
  amount: string;
  startedAt: number;
  baselineTradeUsd: number;
};

export type HlWithdrawPending = {
  amount: string;
  startedAt: number;
  baselineWalletRaw: number;
};

export type FundsPendingState = {
  address: string | null;
  deposit: HlDepositPending | null;
  withdraw: HlWithdrawPending | null;
};

const EMPTY: FundsPendingState = { address: null, deposit: null, withdraw: null };

let snap: FundsPendingState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: FundsPendingState) {
  snap = next;
  for (const fn of listeners) fn();
}

function storageKey(address: string): string {
  return `${KEY_PREFIX}${address.toLowerCase()}`;
}

function persist(address: string, deposit: HlDepositPending | null, withdraw: HlWithdrawPending | null) {
  try {
    if (!deposit && !withdraw) {
      localStorage.removeItem(storageKey(address));
      return;
    }
    localStorage.setItem(storageKey(address), JSON.stringify({ deposit, withdraw }));
  } catch {
    /* ignore quota / private mode */
  }
}

function readStored(address: string): { deposit: HlDepositPending | null; withdraw: HlWithdrawPending | null } {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return { deposit: null, withdraw: null };
    const parsed = JSON.parse(raw) as {
      deposit?: HlDepositPending | null;
      withdraw?: HlWithdrawPending | null;
    };
    const now = Date.now();
    const deposit =
      parsed.deposit && now - parsed.deposit.startedAt < FUNDS_PENDING_DEPOSIT_TTL_MS
        ? parsed.deposit
        : null;
    const withdraw =
      parsed.withdraw && now - parsed.withdraw.startedAt < FUNDS_PENDING_WITHDRAW_TTL_MS
        ? parsed.withdraw
        : null;
    return { deposit, withdraw };
  } catch {
    return { deposit: null, withdraw: null };
  }
}

export function subscribeFundsPending(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getFundsPending(): FundsPendingState {
  return snap;
}

export function useFundsPending(): FundsPendingState {
  return useSyncExternalStore(subscribeFundsPending, getFundsPending, getFundsPending);
}

export function hydrateFundsPending(address: string | null): void {
  if (!address) {
    emit(EMPTY);
    return;
  }
  const key = address.toLowerCase();
  const stored = readStored(key);
  emit({ address: key, deposit: stored.deposit, withdraw: stored.withdraw });
}

export function setHlDeposit(entry: HlDepositPending | null, walletAddress?: string | null): void {
  const key = (walletAddress ?? snap.address)?.toLowerCase() ?? null;
  const next: FundsPendingState = {
    address: key ?? snap.address,
    deposit: entry,
    withdraw: snap.withdraw,
  };
  emit(next);
  if (next.address) persist(next.address, next.deposit, next.withdraw);
}

export function setHlWithdraw(entry: HlWithdrawPending | null, walletAddress?: string | null): void {
  const key = (walletAddress ?? snap.address)?.toLowerCase() ?? null;
  const next: FundsPendingState = {
    address: key ?? snap.address,
    deposit: snap.deposit,
    withdraw: entry,
  };
  emit(next);
  if (next.address) persist(next.address, next.deposit, next.withdraw);
}

export function sweepFundsPendingExpired(): void {
  const now = Date.now();
  let deposit = snap.deposit;
  let withdraw = snap.withdraw;
  if (deposit && now - deposit.startedAt >= FUNDS_PENDING_DEPOSIT_TTL_MS) deposit = null;
  if (withdraw && now - withdraw.startedAt >= FUNDS_PENDING_WITHDRAW_TTL_MS) withdraw = null;
  if (deposit === snap.deposit && withdraw === snap.withdraw) return;
  const next = { ...snap, deposit, withdraw };
  emit(next);
  if (next.address) persist(next.address, deposit, withdraw);
}
