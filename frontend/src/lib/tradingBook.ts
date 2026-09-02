/**
 * Global active trading book — Main wallet vs a Dedicated AI agent sub-account.
 *
 * When Dedicated is selected, reads (balances/positions) and writes (orders)
 * target the sub via HL `vaultAddress` while the master device-agent signs.
 * See HL exchange docs: subaccounts have no keys; master/agent signs with
 * vaultAddress set to the sub.
 */
import type { Hex } from 'viem';

export type ActiveTradingBook = {
  /** null = Main book */
  agentId: string | null;
  /** HL sub-account address when Dedicated; null on Main */
  subAddress: Hex | null;
  /** Agent display name for UI chrome */
  name: string | null;
};

export const MAIN_TRADING_BOOK: ActiveTradingBook = {
  agentId: null,
  subAddress: null,
  name: null,
};

export function isDedicatedTradingBook(book: ActiveTradingBook | null | undefined): boolean {
  return !!(book?.agentId && book?.subAddress?.startsWith('0x'));
}

/**
 * Dedicated books in Home / Portfolio switchers.
 * Stopped is parked (funds usually drained; resume lives on AI Agents).
 * Paused stays — it still has equity / positions. Do not gate on live $100
 * equity: active/paused books can sit under the activate floor.
 */
export function isDedicatedSwitcherAgent(a: {
  mode?: string | null;
  status?: string | null;
  hlSubaccountAddress?: string | null;
}): boolean {
  if (a.mode !== 'dedicated' || !a.hlSubaccountAddress) return false;
  if (a.status === 'draft' || a.status === 'revoked' || a.status === 'stopped') return false;
  return true;
}

/** Address used for HL info queries (clearinghouse, open orders, fills). */
export function resolveTradingAddress(
  book: ActiveTradingBook | null | undefined,
  masterAddress: Hex | string | null | undefined,
): Hex | null {
  if (isDedicatedTradingBook(book) && book!.subAddress) {
    return book!.subAddress;
  }
  if (masterAddress && String(masterAddress).startsWith('0x')) {
    return masterAddress as Hex;
  }
  return null;
}

/** Passed to ExchangeClient as defaultVaultAddress; undefined on Main. */
export function resolveVaultAddress(book: ActiveTradingBook | null | undefined): Hex | undefined {
  if (isDedicatedTradingBook(book) && book!.subAddress) {
    return book!.subAddress;
  }
  return undefined;
}
