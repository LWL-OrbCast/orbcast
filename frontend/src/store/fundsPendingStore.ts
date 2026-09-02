/**
 * App-wide "funds incoming" state for the sticky top banner
 * ({@link IncomingFundsBanner}). This is a thin, global VIEW of the same
 * pending transfers DepositPanel already tracks — it does NOT replace or
 * change any of DepositPanel's existing detection/clearing logic.
 *
 *   • hlDeposit  — wallet  -> trade  (USDC incoming to Trade Balance)
 *   • hlWithdraw — trade   -> wallet (USDC incoming to Wallet Balance)
 *
 * This app has no bank balance rail. `bankWithdraw` in the store is unused.
 *
 * Ownership of persistence:
 *   - hlDeposit / hlWithdraw: DepositPanel remains the writer to AsyncStorage
 *     (via `saveFundsPending*`). The store setters for these are IN-MEMORY
 *     mirrors so the banner can show/clear them without DepositPanel mounted.
 *     `hydrate()` restores them from AsyncStorage on cold start.
 *   - bankWithdraw: no prior owner, so the store persists it on set.
 */
import { create } from 'zustand';
import {
  loadFundsPendingIncoming,
  saveFundsPendingBankWithdraw,
  FUNDS_PENDING_DEPOSIT_TTL_MS,
  FUNDS_PENDING_WITHDRAW_TTL_MS,
  FUNDS_PENDING_BANK_WITHDRAW_TTL_MS,
} from '../lib/fundsPendingIncoming';

export type HlDepositPending = { amount: string; startedAt: number };
export type HlWithdrawPending = { amount: string; startedAt: number };
export type BankWithdrawPending = {
  amount: string;
  startedAt: number;
  destChainId: number;
};

interface FundsPendingState {
  /** Wallet address the persisted entries were hydrated for (lower-case). */
  address: string | null;
  hlDeposit: HlDepositPending | null;
  hlWithdraw: HlWithdrawPending | null;
  bankWithdraw: BankWithdrawPending | null;

  /** Bumped whenever a wallet-landing transfer is confirmed arrived (the
   *  banner's on-chain poll saw the USDC credit). DepositPanel's Wallet
   *  Balance card watches this to refresh immediately instead of waiting for
   *  its own slower 30s poll — so the card and the banner stay in lock-step. */
  walletCreditNonce: number;
  bumpWalletCredit: () => void;

  /** In-memory mirror — DepositPanel owns AsyncStorage for these two. */
  setHlDeposit: (entry: HlDepositPending | null) => void;
  setHlWithdraw: (entry: HlWithdrawPending | null) => void;

  /** Store-owned: persists alongside the in-memory update. */
  setBankWithdraw: (
    address: string | null,
    entry: BankWithdrawPending | null,
  ) => void;

  /** Restore persisted entries for `address` (cold start / address change). */
  hydrate: (address: string | null) => Promise<void>;

  /** Drop any entry whose TTL has elapsed (banner runs this on a timer). */
  sweepExpired: () => void;
}

export const useFundsPendingStore = create<FundsPendingState>((set, get) => ({
  address: null,
  hlDeposit: null,
  hlWithdraw: null,
  bankWithdraw: null,
  walletCreditNonce: 0,

  bumpWalletCredit: () => set((s) => ({ walletCreditNonce: s.walletCreditNonce + 1 })),

  setHlDeposit: (entry) => set({ hlDeposit: entry }),
  setHlWithdraw: (entry) => set({ hlWithdraw: entry }),

  setBankWithdraw: (address, entry) => {
    set({ bankWithdraw: entry });
    if (address) {
      void saveFundsPendingBankWithdraw(
        address,
        entry
          ? {
              amount: entry.amount,
              startedAt: entry.startedAt,
              baselineWalletRaw: null,
              destChainId: entry.destChainId,
            }
          : null,
      );
    }
  },

  hydrate: async (address) => {
    const key = address ? address.toLowerCase() : null;
    if (!key) {
      set({ address: null, hlDeposit: null, hlWithdraw: null, bankWithdraw: null });
      return;
    }
    try {
      const stored = await loadFundsPendingIncoming(key);
      set({
        address: key,
        hlDeposit: stored.deposit
          ? { amount: stored.deposit.amount, startedAt: stored.deposit.startedAt }
          : null,
        hlWithdraw: stored.withdraw
          ? { amount: stored.withdraw.amount, startedAt: stored.withdraw.startedAt }
          : null,
        bankWithdraw: stored.bankWithdraw
          ? {
              amount: stored.bankWithdraw.amount,
              startedAt: stored.bankWithdraw.startedAt,
              destChainId: stored.bankWithdraw.destChainId,
            }
          : null,
      });
    } catch {
      /* keep whatever we have */
    }
  },

  sweepExpired: () => {
    const now = Date.now();
    const { hlDeposit, hlWithdraw, bankWithdraw, address } = get();
    const patch: Partial<FundsPendingState> = {};
    if (hlDeposit && now - hlDeposit.startedAt >= FUNDS_PENDING_DEPOSIT_TTL_MS) {
      patch.hlDeposit = null;
    }
    if (hlWithdraw && now - hlWithdraw.startedAt >= FUNDS_PENDING_WITHDRAW_TTL_MS) {
      patch.hlWithdraw = null;
    }
    if (
      bankWithdraw &&
      now - bankWithdraw.startedAt >= FUNDS_PENDING_BANK_WITHDRAW_TTL_MS
    ) {
      patch.bankWithdraw = null;
      if (address) void saveFundsPendingBankWithdraw(address, null);
    }
    if (Object.keys(patch).length > 0) set(patch);
  },
}));
