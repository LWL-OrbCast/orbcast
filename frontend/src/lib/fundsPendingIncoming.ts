/**
 * Persists wallet ↔ trade "incoming" pill state across screen navigation.
 * DepositPanel unmounts when leaving /profile; without this the pill vanishes
 * even though the transfer is still in-flight.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'funds_pending_incoming_v1:';

export const FUNDS_PENDING_WITHDRAW_TTL_MS = 5 * 60 * 1000;
export const FUNDS_PENDING_DEPOSIT_TTL_MS = 2 * 60 * 1000;
// Bank digital cash-out (fiat -> USDC) is a cross-chain settlement, similar
// in spirit to Add Money's LayerZero hop — give it the same generous window
// as an HL withdraw before the safety clear kicks in.
export const FUNDS_PENDING_BANK_WITHDRAW_TTL_MS = 5 * 60 * 1000;

export type PersistedPendingWithdraw = {
  amount: string;
  startedAt: number;
  baselineWalletRaw: string | null;
};

export type PersistedPendingDeposit = {
  amount: string;
  startedAt: number;
  baselineTradeUsd: number;
};

/**
 * Bank digital cash-out (UR fiat -> USDC) landing in the user's own connected
 * wallet. The USDC arrives on `destChainId`; the pill only reads as "incoming
 * to Wallet Balance" when that chain is the one DepositPanel's wallet balance
 * tracks (Arbitrum). Clears once the wallet USDC moves past `baselineWalletRaw`
 * or the TTL expires.
 */
export type PersistedPendingBankWithdraw = {
  amount: string;
  startedAt: number;
  baselineWalletRaw: string | null;
  destChainId: number;
};

type StoredFundsPending = {
  withdraw: PersistedPendingWithdraw | null;
  deposit: PersistedPendingDeposit | null;
  bankWithdraw: PersistedPendingBankWithdraw | null;
};

const EMPTY: StoredFundsPending = { withdraw: null, deposit: null, bankWithdraw: null };

function storageKey(walletAddress: string): string {
  return `${KEY_PREFIX}${walletAddress.toLowerCase()}`;
}

export async function loadFundsPendingIncoming(
  walletAddress: string,
): Promise<StoredFundsPending> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(walletAddress));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as StoredFundsPending;
    const now = Date.now();
    return {
      withdraw:
        parsed.withdraw && now - parsed.withdraw.startedAt < FUNDS_PENDING_WITHDRAW_TTL_MS
          ? parsed.withdraw
          : null,
      deposit:
        parsed.deposit && now - parsed.deposit.startedAt < FUNDS_PENDING_DEPOSIT_TTL_MS
          ? parsed.deposit
          : null,
      bankWithdraw:
        parsed.bankWithdraw &&
        now - parsed.bankWithdraw.startedAt < FUNDS_PENDING_BANK_WITHDRAW_TTL_MS
          ? parsed.bankWithdraw
          : null,
    };
  } catch {
    return EMPTY;
  }
}

async function writeFundsPendingIncoming(
  walletAddress: string,
  next: StoredFundsPending,
): Promise<void> {
  try {
    if (!next.withdraw && !next.deposit && !next.bankWithdraw) {
      await AsyncStorage.removeItem(storageKey(walletAddress));
      return;
    }
    await AsyncStorage.setItem(storageKey(walletAddress), JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export async function saveFundsPendingWithdraw(
  walletAddress: string,
  withdraw: PersistedPendingWithdraw | null,
): Promise<void> {
  const current = await loadFundsPendingIncoming(walletAddress);
  await writeFundsPendingIncoming(walletAddress, { ...current, withdraw });
}

export async function saveFundsPendingDeposit(
  walletAddress: string,
  deposit: PersistedPendingDeposit | null,
): Promise<void> {
  const current = await loadFundsPendingIncoming(walletAddress);
  await writeFundsPendingIncoming(walletAddress, { ...current, deposit });
}

export async function saveFundsPendingBankWithdraw(
  walletAddress: string,
  bankWithdraw: PersistedPendingBankWithdraw | null,
): Promise<void> {
  const current = await loadFundsPendingIncoming(walletAddress);
  await writeFundsPendingIncoming(walletAddress, { ...current, bankWithdraw });
}
