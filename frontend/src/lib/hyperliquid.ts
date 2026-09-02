import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { HttpTransport, ExchangeClient, InfoClient } from '@nktkas/hyperliquid';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { getGlobalBuilderFee } from '../providers/BuilderConfigProvider';
import {
  getHlInfoUrl,
  getHlExchangeSignatureChainId,
  shouldUseTestnetTransport,
  getTradingEnv,
  envScopedKey,
  onTradingEnvChange,
} from './hlEnv';
import { isWalletUserRejectedRequest, parseTypedDataChainMismatch } from './hlWalletChain';
import type { TradingEnv } from '../store/appStore';
import { apiTracker } from './apiTracker';
import { HL_AGENT_NAME } from './brand';

/**
 * Leftover from our other (perps) repo, kept as a reference for builders.
 * Wallet / agent / builder / withdraw / unified USDC still live here.
 * Do not add HIP-4 or HIP-3 orders — those go through hip4.ts.
 */

/** Same as `fetch(getHlInfoUrl(), …)` plus a __DEV__ HUD tick (`hl/info/<type>`). */
function hlInfoFetch(init: RequestInit): Promise<Response> {
  const req = fetch(getHlInfoUrl(), init);
  if (typeof __DEV__ === 'undefined' || !__DEV__) return req;
  let label = 'hl/info';
  try {
    const body = init.body;
    if (typeof body === 'string') {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.type === 'string') label = `hl/info/${parsed.type}`;
    }
  } catch {
    /* ignore */
  }
  return req.then((res) => {
    apiTracker.record('POST', label, res.status);
    return res;
  });
}

type Hex = `0x${string}`;

// Default values (fallback if provider hasn't loaded yet).
// Pinned builder — forks that want their own fees must set
// EXPO_PUBLIC_HL_BUILDER_ADDRESS / EXPO_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS
// (or replace these defaults). See docs/FORKING.md.
const _envBuilderAddress = (process.env.EXPO_PUBLIC_HL_BUILDER_ADDRESS ?? '').trim();
export const HL_BUILDER_ADDRESS = (
  _envBuilderAddress || '0x29a1D36DaEE6B0E0Dd4873dd964677000B6e23EB'
) as `0x${string}`;
// Keep default in sync with backend BUILDER_FEE / worker HL_BUILDER_FEE_TENTHS_BPS
// (30 tenths = 3 bps = 0.03%). Max approval stays HL_BUILDER_MAX_FEE_RATE.
const _envBuilderFee = Number(process.env.EXPO_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS);
export const HL_BUILDER_FEE_TENTHS_BPS = (
  Number.isFinite(_envBuilderFee) && _envBuilderFee > 0 ? _envBuilderFee : 30
) as number;
export const HL_BUILDER_MAX_FEE_RATE = '0.1%' as const;
// Spot builder fee (tenths of a basis point). 25 => 2.5 bps => 0.025%.
export const HL_SPOT_BUILDER_FEE_TENTHS_BPS = 25 as const;

// Address is always the app-pinned builder (never API-supplied).
// Fee still comes from server config so rewards discounts apply.
export function getBuilderAddress(): string {
  return HL_BUILDER_ADDRESS;
}

export function getBuilderFeeTenthsBps(): number {
  return getGlobalBuilderFee();
}

export function getSpotBuilderFeeTenthsBps(): number {
  const globalFee = getGlobalBuilderFee();
  return Number.isFinite(globalFee) && globalFee > 0 ? globalFee : HL_SPOT_BUILDER_FEE_TENTHS_BPS;
}
// Backward-compat aliases. User-signed HL actions should read the wallet's
// active chain (see createUserExchangeClient). These constants are fallbacks.
export const HL_SIGNATURE_CHAIN_ID = '0xa4b1' as const;
export const HL_WITHDRAW_SIGNATURE_CHAIN_ID = '0xa4b1' as const;

// SecureStore keys — namespaced by trading env so a mainnet-approved agent
// key is never reused on testnet (HL would reject the signature) and vice
// versa. The base names stay versioned; env suffix is appended at read/write
// time via envScopedKey().
const AGENT_PK_KEY_BASE = 'hl_agent_pk_v1';
const AGENT_ADDR_KEY_BASE = 'hl_agent_addr_v1';
const SETUP_COMPLETE_KEY_BASE = 'hl_setup_complete_v1';

// iOS: keep agent material off device backups / migrations. No biometric /
// requireAuthentication — that would prompt on every trade read.
const AGENT_SECURE_STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function agentPkKey(): string { return envScopedKey(AGENT_PK_KEY_BASE); }
function agentAddrKey(): string { return envScopedKey(AGENT_ADDR_KEY_BASE); }
function setupCompleteKey(): string { return envScopedKey(SETUP_COMPLETE_KEY_BASE); }

export async function isTradingSetupComplete(): Promise<boolean> {
  const existing = await SecureStore.getItemAsync(setupCompleteKey());
  return existing === '1';
}

export async function markTradingSetupComplete(): Promise<void> {
  await SecureStore.setItemAsync(setupCompleteKey(), '1', AGENT_SECURE_STORE_OPTS);
}

export async function clearTradingSetupState(): Promise<void> {
  const bases = [AGENT_PK_KEY_BASE, AGENT_ADDR_KEY_BASE, SETUP_COMPLETE_KEY_BASE];
  const envs: TradingEnv[] = ['mainnet', 'demo'];
  await Promise.all(
    envs.flatMap((env) =>
      bases.map((base) => SecureStore.deleteItemAsync(envScopedKey(base, env)).catch(() => undefined)),
    ),
  );
}

// All network-bound singletons + caches live in a per-env bucket so flipping
// between mainnet and demo cleanly drops everything (transport socket pool,
// SDK clients, meta caches, leverage memoization) tied to the previous env.
// On switch we lose cached metadata and reissue fresh requests against the
// new endpoint — that's the correct behavior, the alternative is silent
// cross-env contamination.
type EnvBucket = {
  transport: HttpTransport | null;
  info: InfoClient | null;
  spotMetaAndCtxsPromise: Promise<any> | null;
  usdcTokenPromise: Promise<string> | null;
};

function _newBucket(): EnvBucket {
  return {
    transport: null,
    info: null,
    spotMetaAndCtxsPromise: null,
    usdcTokenPromise: null,
  };
}

const _buckets: Record<TradingEnv, EnvBucket> = {
  mainnet: _newBucket(),
  demo: _newBucket(),
};

function _bucket(): EnvBucket {
  return _buckets[getTradingEnv()];
}

/** Empty: this app is HIP-4 only. Do not fetch xyz/io perp clearinghouses. */
const HIP3_DEXES: string[] = [];

// Drop everything tied to the env that we're leaving. The new env's bucket
// is rebuilt lazily on first access. Fired by the appStore subscription
// below, also exposed for tests.
function _resetEnvBucket(env: TradingEnv): void {
  _buckets[env] = _newBucket();
}

// Whenever the user flips modes, both buckets get reset — the one we're
// leaving (no longer current, stale) and the one we're entering (its caches
// might be from a prior session and should be re-fetched fresh against the
// live endpoint to avoid stale meta tripping order placement).
onTradingEnvChange((newEnv) => {
  _resetEnvBucket(newEnv);
  // Also reset the other one to keep memory bounded — users rarely flip
  // back and forth fast enough for cache warmth to matter.
  const otherEnv: TradingEnv = newEnv === 'mainnet' ? 'demo' : 'mainnet';
  _resetEnvBucket(otherEnv);
});

// ============================================================================
// Global Nonce Manager for Hyperliquid API calls
// ============================================================================
// Hyperliquid uses timestamps (ms) as nonces. Each nonce must be unique and
// greater than previously used nonces. This manager ensures monotonic nonces
// even when multiple calls happen in the same millisecond.
let _lastUsedNonce = 0;
let _withdrawMutexLock = false;

/**
 * Get a unique, monotonically increasing nonce for Hyperliquid API calls.
 * Ensures each nonce is at least 1ms greater than the last, with a small random offset.
 */
function getUniqueNonce(): number {
  const now = Date.now();
  // Ensure nonce is strictly greater than last used, with 1-10ms random offset to avoid collisions
  const randomOffset = Math.floor(Math.random() * 10) + 1;
  const nonce = Math.max(now, _lastUsedNonce + 1) + randomOffset;
  _lastUsedNonce = nonce;
  return nonce;
}

/**
 * Check if an error is a nonce-related error from Hyperliquid.
 */
function isNonceError(error: any): boolean {
  const msg = String(error?.message || error?.shortMessage || error || '').toLowerCase();
  return msg.includes('nonce') || 
         msg.includes('already been used') || 
         msg.includes('stale') ||
         msg.includes('expired');
}

export function getHlTransport(): HttpTransport {
  const b = _bucket();
  if (!b.transport) {
    // The SDK's `isTestnet` flag points the transport at the testnet API URL
    // (https://api.hyperliquid-testnet.xyz) and matching RPC URL automatically.
    // Source: @nktkas/hyperliquid esm/transport/http/mod.js, HttpTransport ctor.
    b.transport = new HttpTransport({ isTestnet: shouldUseTestnetTransport() });
  }
  return b.transport;
}

export function getHlInfoClient(): InfoClient {
  const b = _bucket();
  if (!b.info) b.info = new InfoClient({ transport: getHlTransport() });
  return b.info;
}

export async function getSpotMetaAndAssetCtxsCached(): Promise<any> {
  const b = _bucket();
  if (!b.spotMetaAndCtxsPromise) {
    const info = getHlInfoClient();
    const promise = (
      typeof (info as any).spotMetaAndAssetCtxs === 'function'
        ? (info as any).spotMetaAndAssetCtxs()
        : hlInfoFetch( {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'spotMetaAndAssetCtxs' }),
          }).then((r) => r.json())
    ).catch((err: unknown) => {
      // No TTL on this cache — a rejected promise would stick until app restart.
      if (b.spotMetaAndCtxsPromise === promise) b.spotMetaAndCtxsPromise = null;
      throw err;
    });
    b.spotMetaAndCtxsPromise = promise;
  }
  return b.spotMetaAndCtxsPromise;
}

// Cached USDC token spec for HL `sendAsset` transfers.
// HL expects the `token` field as "USDC:<tokenId>" (see HL exchange-endpoint docs
// → "Send asset"). The tokenId is the canonical 34-char hex hash from spotMeta.
// Per-env because mainnet and testnet USDC have different tokenIds.
export async function getUsdcTokenSpec(): Promise<string> {
  const b = _bucket();
  if (b.usdcTokenPromise) return b.usdcTokenPromise;
  b.usdcTokenPromise = (async () => {
    const data = await getSpotMetaAndAssetCtxsCached();
    const meta = Array.isArray(data) ? data[0] : data;
    const tokens: any[] = meta?.tokens ?? [];
    const usdc = tokens.find((t) => String(t?.name ?? '').toUpperCase() === 'USDC');
    if (!usdc || !usdc.tokenId) {
      throw new Error('Could not resolve USDC token spec from HL spotMeta');
    }
    return `USDC:${usdc.tokenId}`;
  })().catch((err) => {
    b.usdcTokenPromise = null; // allow retry
    throw err;
  });
  return b.usdcTokenPromise;
}

/**
 * Account abstraction modes returned by HL's `userAbstraction` endpoint.
 * See https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes
 *
 *   - `unifiedAccount`  — DEFAULT for app.hyperliquid.xyz. ONE collateral
 *     pool per quote token (USDC, USDH, ...). All cross positions in
 *     USDC-backed dexes (main + xyz + ...) share the same
 *     `margin_available = spotUSDC − sum(isolatedMarginUsed) − sum(crossMaintenanceMarginUsed)`.
 *     Per-dex `crossMarginSummary.accountValue` is NOT meaningful in this
 *     mode (per HL docs: "Individual perp dex user states are not meaningful").
 *     Limited to 50k user actions/day.
 *   - `portfolioMargin` — Pre-alpha. Eligible assets (HYPE, BTC, USDH, USDC)
 *     share a single portfolio. Limited to 50k user actions/day.
 *   - `disabled` / `default` — Standard mode. Separate perp/spot balances,
 *     separate DEX balances, cross margin per-dex. HL's recommended mode for
 *     "market makers, high volume automated users, and deployers/builders".
 *     Builder code ADDRESSES must remain Standard to accrue fees, but end
 *     users do not need Standard mode for builder-fee orders. No action rate
 *     limit. The app keeps this as a fallback mode, not the default UX.
 *   - `dexAbstraction` — LEGACY / "to be discontinued" per HL. USDC defaults
 *     to perps balance, other collateral to spot. HL docs: "Interfaces should
 *     deprecate DEX abstraction support going forward." We no longer flip
 *     users into this mode during onboarding, but existing accounts that
 *     were flipped by earlier app versions remain here until they manually
 *     switch via HL's Settings or HL migrates them. Our margin / liquidation
 *     math treats it as Standard-like (per-dex pools).
 */
export type HyperliquidAbstractionMode =
  | 'unifiedAccount'
  | 'portfolioMargin'
  | 'disabled'
  | 'default'
  | 'dexAbstraction';

export function isPooledAccountMode(
  mode: HyperliquidAbstractionMode | null | undefined,
): boolean {
  return mode === 'unifiedAccount' || mode === 'portfolioMargin';
}

/**
 * Whether orderable USDC is safe to show for sizing / Available labels.
 *
 * Unified users expect the full transferable pool. While abstraction mode or
 * spot collateral is still hydrating, HIP-3 sizing falls through to
 * `targetDexBalance` alone (often a few dollars left on `xyz`) or $0 — worse
 * than waiting. Callers should show "—" (and avoid Max sizing) until this
 * returns true; sticky last-known values are fine after the first hydrate.
 */
export function isOrderAvailableHydrated(args: {
  accountAbstractionMode: HyperliquidAbstractionMode | null | undefined;
  isHip3Order: boolean;
  /** Spot clearinghouse (or REST trading state that includes spot USDC) has loaded. */
  spotBalancesHydrated: boolean;
}): boolean {
  if (args.accountAbstractionMode == null) return false;
  if (isPooledAccountMode(args.accountAbstractionMode) && args.isHip3Order) {
    return args.spotBalancesHydrated;
  }
  return true;
}

export function needsUnifiedAccountMigration(
  mode: HyperliquidAbstractionMode | null | undefined,
): boolean {
  return !isPooledAccountMode(mode);
}

export async function getUserAbstractionMode(
  userAddress: Hex,
): Promise<HyperliquidAbstractionMode | null> {
  try {
    const response = await hlInfoFetch( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userAbstraction', user: userAddress }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data === 'string') return data as HyperliquidAbstractionMode;
    return null;
  } catch {
    return null;
  }
}

export async function getUserDexAbstractionEnabled(userAddress: Hex): Promise<boolean | null> {
  try {
    const response = await hlInfoFetch( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userDexAbstraction', user: userAddress }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data === 'boolean') return data;
    if (data && typeof data === 'object') {
      if (typeof data.enabled === 'boolean') return data.enabled;
      if (typeof data.userDexAbstraction === 'boolean') return data.userDexAbstraction;
    }
    return null;
  } catch {
    return null;
  }
}


export async function ensureAgentKey(): Promise<{ agentPrivateKey: Hex; agentAddress: Hex }> {
  const pkKey = agentPkKey();
  const addrKey = agentAddrKey();
  const existingPk = await SecureStore.getItemAsync(pkKey);
  const existingAddr = await SecureStore.getItemAsync(addrKey);

  if (existingPk && existingAddr) {
    // Best-effort migrate older entries onto THIS_DEVICE_ONLY (no UX prompt).
    void Promise.all([
      SecureStore.setItemAsync(pkKey, existingPk, AGENT_SECURE_STORE_OPTS),
      SecureStore.setItemAsync(addrKey, existingAddr, AGENT_SECURE_STORE_OPTS),
    ]).catch(() => undefined);
    return { agentPrivateKey: existingPk as Hex, agentAddress: existingAddr as Hex };
  }

  const pk = generatePrivateKey();
  const acct = privateKeyToAccount(pk);

  await SecureStore.setItemAsync(pkKey, pk, AGENT_SECURE_STORE_OPTS);
  await SecureStore.setItemAsync(addrKey, acct.address, AGENT_SECURE_STORE_OPTS);

  return { agentPrivateKey: pk, agentAddress: acct.address };
}

/**
 * Rotate the local agent keypair.
 *
 * Hyperliquid strongly suggests not reusing agent addresses once an agent is deregistered or expires,
 * because nonce state may be pruned and previously signed actions could become replayable.
 * See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets
 */
export async function rotateAgentKey(): Promise<{ agentPrivateKey: Hex; agentAddress: Hex }> {
  const pk = generatePrivateKey();
  const acct = privateKeyToAccount(pk);

  await SecureStore.setItemAsync(agentPkKey(), pk, AGENT_SECURE_STORE_OPTS);
  await SecureStore.setItemAsync(agentAddrKey(), acct.address, AGENT_SECURE_STORE_OPTS);

  return { agentPrivateKey: pk, agentAddress: acct.address };
}

export async function getStoredAgentAddress(): Promise<Hex | null> {
  const addr = await SecureStore.getItemAsync(agentAddrKey());
  return (addr as Hex) ?? null;
}

/**
 * Query HL for the user's currently-approved max builder fee (in tenths of
 * a basis point) for the configured builder address. Returns 0 if the user
 * has never approved this builder, or hasn't approved a high enough cap.
 *
 * Uses HL's `info.maxBuilderFee` endpoint (per @nktkas/hyperliquid
 * esm/api/info/_methods/maxBuilderFee.js). Result unit matches our
 * `getBuilderFeeTenthsBps()` getter, so they can be compared directly.
 */
export async function getApprovedBuilderFeeTenths(userAddress: Hex): Promise<number> {
  const info = getHlInfoClient();
  // The SDK's InfoClient method delegates straight through to the
  // /info endpoint with type:"maxBuilderFee", so call it directly.
  const builder = getBuilderAddress();
  // We deliberately do NOT swallow network/SDK errors here. Per HL docs
  // `maxBuilderFee` returns 0 explicitly when no approval exists, so a
  // numeric response (including 0) is a definitive answer. Anything else
  // — fetch reject, malformed value, timeout — is "couldn't determine"
  // and must propagate so callers can distinguish it from "not approved".
  //
  // The asset/trade/portfolio auto-mark effects rely on this to leave
  // `setupComplete` as-is on transient HL hiccups. Returning 0 silently
  // here is what caused the seamless-trading modal to pop on a fully
  // configured account whenever a single `maxBuilderFee` /info call
  // tripped (mobile network blip, HL load spike, app foregrounded
  // mid-request). Setup paths (`setupTradingAccount`) call
  // `approveBuilderFee` directly without consulting this function, so
  // making it strict has no effect on the setup flow.
  const value = await (info as any).maxBuilderFee({ user: userAddress, builder });
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`maxBuilderFee returned invalid value: ${String(value)}`);
  }
  return n;
}

/**
 * True iff the user has approved enough builder fee to cover the currently
 * configured per-order fee. Builder approvals are scoped per (user, builder,
 * network) so this MUST be re-checked when the trading env changes —
 * a mainnet approval does not grant testnet permission.
 *
 * Pass `requiredTenths` to override the default (currently configured fee
 * from `getBuilderFeeTenthsBps()`). Always uses the live config, not the
 * static `HL_BUILDER_FEE_TENTHS_BPS` constant, so a server-side fee bump
 * still triggers a re-approval prompt instead of silent order rejections.
 */
export async function isBuilderFeeApproved(
  userAddress: Hex,
  requiredTenths?: number,
): Promise<boolean> {
  const required = Number.isFinite(requiredTenths) && (requiredTenths as number) > 0
    ? (requiredTenths as number)
    : Math.max(getBuilderFeeTenthsBps(), getSpotBuilderFeeTenthsBps());
  const approved = await getApprovedBuilderFeeTenths(userAddress);
  return approved >= required;
}

export type HyperliquidTradingState = {
  accountValueUsd: number;
  withdrawableUsd: number;
  hasBalance: boolean;
  agentAddress?: Hex;
  isAgentActive: boolean;
  /**
   * Unix-ms expiry of the currently-matched (stored) agent, or null when no
   * active agent matches. Drives proactive silent re-approval before the
   * agent lapses so users aren't re-prompted at order time. HL agents are
   * long-lived (~180d) but finite; we renew within a window of this value.
   */
  agentValidUntil: number | null;
  positions: Array<{
    coin: string;
    szi: string;
    entryPx: string;
    liquidationPx: string | null;
    unrealizedPnl: string;
    returnOnEquity: string;
    leverage?: string | number | null;
    marginUsed?: string | number | null;
    positionValue?: string | number | null;
    maxLeverage?: string | number | null;
    marginType?: 'cross' | 'isolated';
    cumFunding?: {
      allTime: string;
      sinceOpen: string;
      sinceChange: string;
    } | null;
  }>;
  perpAccountValueUsd: number;
  spotBalanceUsd: number;
  perpPositionsCount: number;
  spotPositionsCount: number;
  /**
   * Cross-margin pool equity (`crossMarginSummary.accountValue`) per HL DEX.
   *
   * Key '' is the main perp dex; HIP-3 dexes are keyed by their dex name
   * (e.g. 'xyz'). Use this — NOT `perpAccountValueUsd` — when computing
   * cross liquidation prices, because:
   *
   *   • HL keeps each dex's cross margin SEPARATE under standard account
   *     abstraction, so a HIP-3 dex's equity does not back main-dex
   *     positions and vice versa.
   *   • Within a dex, isolated-position equity is not part of the cross
   *     pool — `crossMarginSummary.accountValue` excludes it, while
   *     `marginSummary.accountValue` does not.
   *
   * Mixing those layers (as the previous `perpAccountValueUsd` summation
   * did) would inflate equity and produce projected liq prices that drift
   * safer than HL's own — sometimes far enough to flip the direction of
   * change when compounding a position.
   */
  perpCrossAccountValueByDex: Record<string, number>;
  /**
   * Sum of every OPEN cross position's maintenance-margin requirement in
   * the dex pool, as exposed by HL at the top level of `clearinghouseState`
   * (`crossMaintenanceMarginUsed`). Pairs with `perpCrossAccountValueByDex`:
   *
   *   margin_available_cross = crossMarginSummary.accountValue
   *                          − crossMaintenanceMarginUsed
   *
   * This is the SHARED `margin_available` scalar HL plugs into its
   * liquidation formula for every cross position in the pool. Without
   * subtracting it, projected liqs for a NEW position on an asset with no
   * existing same-asset position drift dangerously safe — they ignore the
   * maintenance margin already locked up by the user's other cross
   * positions, even though HL's real fill will subtract them.
   *
   * Same key convention as `perpCrossAccountValueByDex`: '' for main perp
   * dex, dex name for HIP-3 dexes.
   */
  perpCrossMaintenanceMarginUsedByDex: Record<string, number>;
  /**
   * Per-dex withdrawable USDC (`clearinghouseState.withdrawable`). Key ''
   * for the main perp dex, dex name for HIP-3 dexes.
   *
   * Used as the `mainDexAvailableUsdc` input for JIT `sendAsset` funding
   * of HIP-3 orders in Standard account-abstraction mode, where per-dex
   * balances are siloed and the target HIP-3 dex may need to be topped
   * up from the main dex before an opening order is placed.
   */
  perpWithdrawableByDex: Record<string, number>;
  /**
   * Per-dex initial-margin room for opening/stacking perp orders:
   *
   *   marginSummary.accountValue - marginSummary.totalMarginUsed
   *
   * This is different from withdrawable. Withdrawable can be zero because of
   * transfer requirements, while the account may still have room to open
   * more notional; conversely, another DEX's withdrawable must not size a
   * Standard-mode main-dex order.
   */
  perpInitialMarginAvailableByDex: Record<string, number>;
  /**
   * HL account abstraction mode (`userAbstraction` endpoint). DEFAULT for
   * app.hyperliquid.xyz is `unifiedAccount`.
   *
   * Liquidation math depends on this:
   *
   *   • `unifiedAccount` / `portfolioMargin` — ONE shared cross-margin pool
   *     across all USDC-backed dexes:
   *
   *       margin_available = spotUsdcBalanceUsd
   *                        − totalIsolatedMarginUsedUsd
   *                        − totalCrossMaintenanceMarginUsedUsd
   *
   *     Per-dex `crossMarginSummary.accountValue` is NOT meaningful in
   *     these modes; we MUST use the unified-pool scalars below.
   *
   *   • `disabled` / `default` / `dexAbstraction` — Per-dex cross pool:
   *
   *       margin_available = perpCrossAccountValueByDex[dex]
   *                        − perpCrossMaintenanceMarginUsedByDex[dex]
   *
   * `null` means we couldn't fetch the mode (treat as per-dex fallback).
   */
  accountAbstractionMode: HyperliquidAbstractionMode | null;
  /**
   * Legacy HIP-3 DEX abstraction flag from HL's separate
   * `userDexAbstraction` endpoint. This can expose migrated/hybrid accounts
   * where `userAbstraction` reports `disabled` but HIP-3 USDC may still
   * affect main-dex behavior in non-obvious ways.
   */
  userDexAbstractionEnabled: boolean | null;
  /**
   * USDC-only spot balance (excludes other coins). Backs cross positions
   * in `unifiedAccount` / `portfolioMargin` modes. Includes balances on
   * hold (matches HL's own ratio formula).
   */
  spotUsdcBalanceUsd: number;
  /**
   * Estimated USDC locked by resting spot BUY orders. Raw
   * `spotClearinghouseState.balances[].hold` can also include unified perp
   * margin reservations, so do not use raw hold as a spot-order lock.
   */
  spotUsdcHoldUsd: number;
  /**
   * Sum of `marginUsed` across every OPEN isolated position on every dex
   * (main + HIP-3). In `unifiedAccount` mode this is what HL deducts from
   * `spotUSDC` to get the pool equity backing cross positions.
   */
  totalIsolatedMarginUsedUsd: number;
  /**
   * Sum of `crossMaintenanceMarginUsed` across every dex (main + HIP-3).
   * In `unifiedAccount` mode this is the total maintenance margin
   * requirement for the unified cross pool.
   */
  totalCrossMaintenanceMarginUsedUsd: number;
  /**
   * Sum of `marginSummary.totalMarginUsed` across every dex (main + HIP-3).
   * Equals every cross / isolated position's INITIAL margin reservation.
   * One half of HL's `transfer_margin_required = max(initial, 0.10 × pos_val)`
   * rule used to cap `sendAsset(spot → <dex>)` transfers in unified mode.
   */
  totalCrossInitialMarginUsedUsd: number;
  /**
   * Sum of `|positionValue|` across every CROSS position on every dex.
   * The other half of HL's transfer rule — at >10× leverage the
   * `0.10 × position_value` floor dominates `initial_margin_used` and is
   * what HL actually enforces on spot-out transfers in unified mode.
   */
  totalCrossPositionValueUsd: number;
  /**
   * Amount transferable out of the spot subaccount in unified /
   * portfolioMargin modes via `sendAsset(spot → <dex>)`. Implements HL's
   * documented "transfer margin" rule (see Margining docs):
   *
   *   transfer_margin_required = max(
   *     totalCrossInitialMarginUsedUsd,
   *     0.10 × totalCrossPositionValueUsd          ← dominates above 10×
   *   )
   *   transferable = max(0,
   *     spotUSDC
   *       − transfer_margin_required
   *       − totalIsolatedMarginUsedUsd
   *   )
   *
   * Sending more than this triggers HL's "Insufficient balance for token
   * transfer" rejection. Use this (not `pooledMarginAvailableUsd`) as the
   * JIT funding source budget for HIP-3 orders in unified mode.
   *
   * In Standard / disabled modes this value is meaningless; callers should
   * gate on `accountAbstractionMode`.
   */
  unifiedSpotTransferableUsd: number;
  /**
   * Coins with resting entry limit orders (not reduce-only / trigger / TP-SL).
   * These lock init margin before fill — Shared agents sit out if they fill
   * into a live position; Dedicated funding/transfers can fail until cancelled
   * or more USDC is added.
   */
  restingLimitCoins: string[];
};

function safeNum(x: string | number | null | undefined): number {
  if (x === null || x === undefined) return 0;
  const n = typeof x === 'number' ? x : parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Best-effort detection of Hyperliquid's 429 rate-limit response. The HL
 * exchange endpoint returns a bare HTTP 429 (no body), which @nktkas/hyperliquid
 * surfaces as either:
 *   • Error: 429 - null
 *   • Error: HTTP error 429 ...
 *   • a property `status === 429` on the thrown object
 *
 * Used so setup / withdraw and humanizeHyperliquidError can all
 * agree on "this is a rate limit, not a margin / balance error".
 */
export function isHlRateLimitError(err: any): boolean {
  if (!err) return false;
  if (err.status === 429 || err.code === 429) return true;
  const msg = String(err?.message ?? err ?? '');
  return /(^|[^\d])429([^\d]|$)/.test(msg) || /rate.?limit/i.test(msg);
}

/**
 * Spot → perp `sendAsset` budget for unified / portfolioMargin mode.
 *
 * Implements Hyperliquid's documented "transfer margin" rule (see
 * https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining):
 *
 *   transfer_margin_required = max(
 *     initial_margin_required,
 *     0.10 × total_cross_notional_position_value
 *   )
 *
 *   spot_transferable        = max(0,
 *     spotUSDC
 *       − transfer_margin_required
 *       − isolated_margin_used
 *   )
 *
 * The 10% floor dominates whenever any cross position is opened above 10×
 * leverage (it equals notional × maintenance_margin_rate doubled, roughly).
 * Without it, slider Max would happily size orders that HL then rejects
 * with "Insufficient balance for token transfer" — regardless of how much
 * spot USDC is showing in the wallet.
 *
 * Centralising this here keeps the slider, preflight, and JIT funding all
 * agreeing on what HL will actually accept. No empirical cushion needed —
 * this matches HL's published rule exactly.
 */
export const UNIFIED_TRANSFER_MARGIN_FLOOR_RATE = 0.1;
export function computeUnifiedSpotTransferableUsd(args: {
  spotUsdcBalanceUsd: number;
  totalCrossInitialMarginUsedUsd: number;
  totalCrossPositionValueUsd: number;
  totalIsolatedMarginUsedUsd: number;
  /**
   * Estimated USDC locked by resting spot BUY orders. This reduces spot -> perp
   * dex funding budgets, but raw spot-state `hold` can include perp margin and
   * should not be subtracted here.
   */
  spotUsdcHoldUsd?: number;
  /**
   * Initial margin locked by RESTING limit orders (cross OR isolated).
   * HL's `clearinghouseState` only fills `marginSummary.totalMarginUsed`
   * and `assetPositions[*].marginUsed` from FILLED positions — resting
   * isolated limits don't show up there until they fill, but HL still
   * reserves their init margin out of the spot pool. Without this, the
   * transferable cap (and the HIP-3 slider) treats resting-order locks
   * as free money and we hit "Insufficient balance for token transfer"
   * at submit time.
   */
  restingOrdersInitMarginUsd?: number;
}): number {
  const initialReq = Math.max(0, args.totalCrossInitialMarginUsedUsd ?? 0);
  const tenPctReq = UNIFIED_TRANSFER_MARGIN_FLOOR_RATE * Math.max(0, args.totalCrossPositionValueUsd ?? 0);
  const transferMarginRequired = Math.max(initialReq, tenPctReq);
  const transferable = (args.spotUsdcBalanceUsd ?? 0)
    - transferMarginRequired
    - Math.max(0, args.totalIsolatedMarginUsedUsd ?? 0)
    - Math.max(0, args.spotUsdcHoldUsd ?? 0)
    - Math.max(0, args.restingOrdersInitMarginUsd ?? 0);
  return Math.max(0, transferable);
}

/**
 * Sum of estimated initial-margin USD locked by RESTING open orders. HL
 * locks `notional / leverage` of init margin the moment a limit order
 * rests on the book — it's not just position-time. This estimate uses
 * the order's leverage when present and falls back to the 10% floor
 * (same as the transfer-rule floor, dominant for L≥10) when not.
 *
 * Used to deduct resting-order locks from the unified-mode
 * `pooledMarginAvailableUsd` so the slider/Max for MAIN-DEX orders
 * doesn't let users size into HL's "insufficient margin" rejection
 * path — without this, a user with two BTC limits resting at 40x
 * sees the full spot pool as transferable and only learns it's locked
 * after submitting another order.
 */
/** Oid for merge/dedupe — matches PortfolioTabs `extractOpenOrderOid`. */
function openOrderOid(o: any): number | null {
  const oid = Number(o?.oid ?? o?.order?.oid ?? o?.o?.oid);
  return Number.isFinite(oid) ? oid : null;
}

/**
 * HL allows at most one position-linked TP and one SL per coin. During modify
 * the WS snapshot can briefly carry the old oid while REST still has the
 * previous row (or vice versa), so oid-keyed merge alone flashes two rows.
 * Collapse those transitions by keeping the newest oid per (coin, tpsl).
 */
function positionLinkedTpslDedupeKey(o: any): string | null {
  const order = o?.order ?? o?.o ?? o;
  const coin = String(order?.coin ?? o?.coin ?? '');
  if (!coin) return null;
  const tpsl = order?.tpsl ?? o?.tpsl;
  if (tpsl !== 'tp' && tpsl !== 'sl') return null;
  const orderType = order?.orderType ?? o?.orderType;
  const triggerPx = parseFloat(order?.triggerPx ?? o?.triggerPx ?? '');
  const isTrigger =
    order?.isTrigger === true ||
    o?.isTrigger === true ||
    orderType?.trigger != null ||
    (Number.isFinite(triggerPx) && triggerPx > 0);
  if (!isTrigger) return null;
  return `${coin}:${tpsl}`;
}

function dedupePositionLinkedTpslOrders(orders: any[]): any[] {
  const passthrough: any[] = [];
  const groups = new Map<string, any[]>();
  for (const o of orders) {
    const key = positionLinkedTpslDedupeKey(o);
    if (!key) {
      passthrough.push(o);
      continue;
    }
    const bucket = groups.get(key) ?? [];
    bucket.push(o);
    groups.set(key, bucket);
  }
  const pickNewest = (group: any[]) =>
    group.reduce((best, cur) => {
      const bestOid = openOrderOid(best) ?? 0;
      const curOid = openOrderOid(cur) ?? 0;
      return curOid >= bestOid ? cur : best;
    });
  const deduped = [...passthrough, ...Array.from(groups.values()).map(pickNewest)];
  return deduped.length === orders.length ? orders : deduped;
}

/**
 * Merge REST-polled open orders with the HL user WS feed for display.
 * When WS is connected we previously only layered HIP-3 (`:`) coins from
 * REST, so a new main-dex limit could land in `refetchOpenOrders` but stay
 * invisible until the next WS tick — PortfolioTabs skeleton dropped early
 * and the row popped in 1–2s later. REST seeds the map; WS overwrites per
 * oid with live ticks.
 */
export function mergeRestAndStreamOpenOrders(
  restOrders: any[] | undefined,
  streamOrders: any[] | undefined,
  wsConnected: boolean,
): any[] {
  const rest = restOrders ?? [];
  if (!wsConnected || !Array.isArray(streamOrders)) {
    return sortOpenOrdersStable(dedupePositionLinkedTpslOrders(rest));
  }
  const merged = new Map<string, any>();
  const put = (o: any) => {
    const oid = openOrderOid(o);
    if (oid != null) merged.set(String(oid), o);
  };
  rest.forEach(put);
  streamOrders.forEach(put);
  return sortOpenOrdersStable(dedupePositionLinkedTpslOrders(Array.from(merged.values())));
}

function openOrderSortTime(o: any): number {
  const order = o?.order ?? o?.o ?? o;
  const t = Number(order?.timestamp ?? o?.timestamp ?? order?.time ?? o?.time ?? 0);
  return Number.isFinite(t) ? t : 0;
}

/** Newest-first, oid tiebreak — keeps Orders UI from reshuffling on WS ticks. */
function sortOpenOrdersStable(orders: any[]): any[] {
  return [...orders].sort((a, b) => {
    const tb = openOrderSortTime(b);
    const ta = openOrderSortTime(a);
    if (tb !== ta) return tb - ta;
    return (openOrderOid(b) ?? 0) - (openOrderOid(a) ?? 0);
  });
}

/** True for entry limits that lock init margin (not TP/SL / reduce-only). */
export function isRestingEntryLimitOrder(order: any | undefined | null): boolean {
  if (!order) return false;
  if (order.reduceOnly) return false;
  if (order.isTrigger) return false;
  if (order.isPositionTpsl) return false;
  return true;
}

/** Unique `coin` values for resting entry limits (perp + spot). */
export function restingEntryLimitCoins(orders: any[] | undefined): string[] {
  if (!Array.isArray(orders)) return [];
  const seen = new Set<string>();
  const coins: string[] = [];
  for (const o of orders) {
    if (!isRestingEntryLimitOrder(o)) continue;
    const coin = String(o.coin ?? '').toUpperCase();
    if (!coin || seen.has(coin)) continue;
    seen.add(coin);
    coins.push(coin);
  }
  return coins;
}

export function estimateRestingOrdersInitMarginUsd(orders: any[] | undefined): number {
  if (!Array.isArray(orders)) return 0;
  let sum = 0;
  for (const o of orders) {
    if (!isRestingEntryLimitOrder(o)) continue;
    const px = parseFloat(o?.limitPx ?? '0');
    const sz = parseFloat(o?.sz ?? o?.origSz ?? '0');
    if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
    const ntl = Math.abs(px * sz);
    if (!Number.isFinite(ntl) || ntl <= 0) continue;
    let lev = 0;
    const rawLev = (o as any)?.leverage;
    if (rawLev != null) {
      lev = typeof rawLev === 'object'
        ? parseFloat(rawLev?.value ?? '0')
        : parseFloat(String(rawLev));
    }
    // No leverage info → fall back to the 10% rule (= leverage 10).
    // For L<10 the actual init lock is bigger; for L≥10 the 10% floor
    // is what HL effectively reserves anyway (transfer rule).
    if (!Number.isFinite(lev) || lev <= 0) lev = 10;
    sum += ntl / lev;
  }
  return sum;
}

/**
 * Same calculation as `estimateRestingOrdersInitMarginUsd` but bucketed
 * by dex (key '' for main perp, e.g. 'xyz' for HIP-3 dexes — derived
 * from the order's `coin` field which is encoded as `dex:SYMBOL` for
 * HIP-3 markets). Used to tighten `perpInitialMarginAvailableByDex`
 * which would otherwise overstate per-dex room for new orders by the
 * sum of resting orders' init margin (HL's `marginSummary.totalMarginUsed`
 * only reflects filled positions, not resting orders).
 */
export function estimateRestingOrdersInitMarginByDex(orders: any[] | undefined): Record<string, number> {
  const byDex: Record<string, number> = {};
  if (!Array.isArray(orders)) return byDex;
  for (const o of orders) {
    if (!isRestingEntryLimitOrder(o)) continue;
    const px = parseFloat(o?.limitPx ?? '0');
    const sz = parseFloat(o?.sz ?? o?.origSz ?? '0');
    if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
    const ntl = Math.abs(px * sz);
    if (!Number.isFinite(ntl) || ntl <= 0) continue;
    let lev = 0;
    const rawLev = (o as any)?.leverage;
    if (rawLev != null) {
      lev = typeof rawLev === 'object'
        ? parseFloat(rawLev?.value ?? '0')
        : parseFloat(String(rawLev));
    }
    if (!Number.isFinite(lev) || lev <= 0) lev = 10;
    // Prefer the explicit `_dex` tag we attach to orders at fetch / WS
    // ingestion time (HL's order payloads carry bare `coin` strings —
    // "BRENTOIL" not "xyz:BRENTOIL" — even when fetched from a HIP-3
    // dex endpoint). Fall back to the symbol-prefix heuristic only when
    // the tag is missing so legacy data still buckets correctly.
    const explicitDex = typeof (o as any)._dex === 'string' ? (o as any)._dex : undefined;
    const coin = String(o?.coin ?? '');
    const dexKey = explicitDex != null
      ? explicitDex
      : coin.includes(':') ? coin.split(':')[0] : '';
    byDex[dexKey] = (byDex[dexKey] ?? 0) + ntl / lev;
  }
  return byDex;
}

/**
 * Compute spot balance in USD from a raw spotClearinghouseState.
 * Mirrors the home-screen logic so multiple screens (home, profile, portfolio) agree
 * on the "Trade Balance = Perps + Spot" definition.
 *
 * Uses `balance.total` (includes holds — e.g. USDC locked by open spot limit orders)
 * so the reported balance stays stable while orders are resting.
 *
 * spotMetaData is the result of `getSpotMetaAndAssetCtxsCached()` — pass null to
 * only count USDC (entryNtl-based non-USDC lookup still works if meta is present).
 */
/**
 * USDC-only spot balance (no other coins). Used as the cross-collateral
 * pool in `unifiedAccount` / `portfolioMargin` abstraction modes.
 *
 * Includes balances on hold so liquidation math doesn't jitter as users
 * place / cancel spot limit orders (matches HL's own ratio formula in
 * https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes).
 */
export function computeSpotUsdcOnlyUsd(spotState: any): number {
  if (!spotState) return 0;
  const balances = spotState?.balances ?? [];
  let total = 0;
  for (const b of balances) {
    const coin = String(b?.coin ?? '').toUpperCase();
    const tokenIdx = b?.token;
    const isUsdc = coin === 'USDC' || tokenIdx === 0;
    if (!isUsdc) continue;
    const v = parseFloat(b?.total ?? '0');
    if (Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

export function computeSpotUsdcHoldUsd(spotState: any): number {
  if (!spotState) return 0;
  const balances = spotState?.balances ?? [];
  let total = 0;
  for (const b of balances) {
    const coin = String(b?.coin ?? '').toUpperCase();
    const tokenIdx = b?.token;
    const isUsdc = coin === 'USDC' || tokenIdx === 0;
    if (!isUsdc) continue;
    const v = parseFloat(b?.hold ?? '0');
    if (Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

export function estimateSpotOpenOrdersUsdcHoldUsd(orders: any[] | undefined): number {
  if (!Array.isArray(orders)) return 0;
  let sum = 0;
  for (const o of orders) {
    if (!o) continue;
    if (o.reduceOnly) continue;
    if (o.isTrigger) continue;
    if (o.isPositionTpsl) continue;
    const side = String(o?.side ?? o?.sideRaw ?? '').toUpperCase();
    const isBuy = side === 'B' || side === 'BUY' || side === 'LONG';
    if (!isBuy) continue;
    const coin = String(o?.coin ?? '');
    const asset = Number(o?.asset ?? o?.a);
    const isSpot = coin.startsWith('@') || coin.toUpperCase().includes('/USDC') || asset >= 10000;
    if (!isSpot) continue;
    const px = parseFloat(o?.limitPx ?? '0');
    const sz = parseFloat(o?.sz ?? o?.origSz ?? '0');
    if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
    const ntl = Math.abs(px * sz);
    if (Number.isFinite(ntl) && ntl > 0) sum += ntl;
  }
  return sum;
}

export function computeSpotBalanceUsd(
  spotState: any,
  spotMetaData: any,
): { spotBalanceUsd: number; spotPositionsCount: number } {
  let spotBalanceUsd = 0;
  let spotPositionsCount = 0;
  if (!spotState) return { spotBalanceUsd, spotPositionsCount };

  const balances = spotState?.balances ?? [];
  const hasMeta = spotMetaData && Array.isArray(spotMetaData) && spotMetaData.length >= 2;
  const meta = hasMeta ? spotMetaData[0] : null;
  const assetCtxs = hasMeta ? (spotMetaData[1] ?? []) : [];
  const tokens = meta?.tokens ?? [];
  const universe = meta?.universe ?? [];
  const usdcIndex = tokens.find((t: any) => String(t?.name ?? '').toUpperCase() === 'USDC')?.index;

  balances.forEach((balance: any) => {
    const tokenStr = String(balance?.token ?? balance?.coin ?? '');
    const total = safeNum(balance?.total);
    if (total <= 0) return;

    const coinName = String(balance?.coin ?? '').toUpperCase();
    // Fast path when spot meta hasn't loaded yet (common on Home right after
    // the account stream connects): still count USDC, and use HL's
    // `entryNtl` cost basis for non-USDC (e.g. spot GOLD) so Trade Balance
    // doesn't flash ~$50 short until mark prices arrive.
    if (!hasMeta) {
      if (coinName === 'USDC') {
        spotBalanceUsd += total;
        return;
      }
      const entryNtl = safeNum(balance?.entryNtl);
      if (entryNtl > 0) {
        spotBalanceUsd += entryNtl;
        if (entryNtl >= 1) spotPositionsCount++;
      }
      return;
    }

    const token = tokens.find((t: any) =>
      String(t?.index ?? '') === tokenStr ||
      String(t?.name ?? '').toUpperCase() === tokenStr.toUpperCase() ||
      String(t?.name ?? '').toUpperCase() === coinName,
    );
    if (!token) {
      if (coinName === 'USDC') spotBalanceUsd += total;
      return;
    }

    if (token.index === 0 || String(token.name).toUpperCase() === 'USDC') {
      spotBalanceUsd += total;
      return;
    }

    const universeEntry = universe.find((u: any) => {
      const uTokens = u?.tokens;
      return (
        Array.isArray(uTokens) &&
        uTokens.length >= 2 &&
        uTokens[0] === token.index &&
        (Number.isFinite(usdcIndex) ? uTokens[1] === usdcIndex : uTokens[1] === 0)
      );
    });
    if (universeEntry?.name) {
      const symbol = String(universeEntry.name).toUpperCase();
      const spotPair = assetCtxs.find((c: any) => String(c?.coin ?? '').toUpperCase() === symbol);
      const markPx = safeNum(spotPair?.markPx ?? spotPair?.midPx);
      const szDecRaw = Number(token?.szDecimals ?? universeEntry?.szDecimals ?? universeEntry?.szDec);
      const minLot = Number.isFinite(szDecRaw) ? Math.pow(10, -szDecRaw) : 0;
      const isSellableLot = !Number.isFinite(minLot) || minLot <= 0 || total >= minLot;
      if (markPx > 0) {
        const valueUsd = total * markPx;
        spotBalanceUsd += valueUsd;
        if (isSellableLot && valueUsd >= 1) spotPositionsCount++;
        return;
      }
    }

    const entryNtl = safeNum(balance?.entryNtl);
    if (entryNtl > 0) {
      spotBalanceUsd += entryNtl;
      const szDecRaw = Number(token?.szDecimals);
      const minLot = Number.isFinite(szDecRaw) ? Math.pow(10, -szDecRaw) : 0;
      const isSellableLot = !Number.isFinite(minLot) || minLot <= 0 || total >= minLot;
      if (isSellableLot && entryNtl >= 1) spotPositionsCount++;
    }
  });

  return { spotBalanceUsd, spotPositionsCount };
}

export async function getHyperliquidTradingState(userAddress: Hex): Promise<HyperliquidTradingState> {
  const info = getHlInfoClient();
  // Open orders are needed to mirror HL's transfer rule, which counts
  // RESTING (non-reduce-only / non-trigger) order notionals in
  // `position_value` for the `max(initial, 0.10 × position_value)` cap.
  // Without these, a $300 resting BTC limit lets the slider/JIT think
  // the spot pool is fully transferable when in fact $30 is locked.
  const [mainState, hip3States, agents, spotState, abstractionMode, userDexAbstractionEnabled, allOpenOrders] = await Promise.all([
    info.clearinghouseState({ user: userAddress }),
    Promise.all(
      HIP3_DEXES.map(async (dex) => {
        try {
          return await info.clearinghouseState({ user: userAddress, dex });
        } catch {
          return null;
        }
      }),
    ),
    // extraAgents lives on the master signer. HL subs return null/[] here —
    // callers must overlay master isAgentActive (useSignerTradingSetup)
    // instead of treating a dedicated book as "agent off".
    info.extraAgents({ user: userAddress }),
    getSpotClearinghouseState(userAddress).catch(() => null),
    getUserAbstractionMode(userAddress).catch(() => null),
    getUserDexAbstractionEnabled(userAddress).catch(() => null),
    getOpenOrders(userAddress).catch(() => [] as any[]),
  ]);

  const allStates = [mainState, ...(hip3States.filter(Boolean) as any[])];
  const rawPerpAccountValueUsd = allStates.reduce((sum, s) => sum + safeNum(s?.marginSummary?.accountValue), 0);
  const rawWithdrawableUsd = allStates.reduce((sum, s) => sum + safeNum(s?.withdrawable), 0);

  const getIsolatedMarginUsed = (st: any): number => {
    const positions = st?.assetPositions ?? [];
    return positions.reduce((sum: number, p: any) => {
      const lev = p?.position?.leverage;
      const isIsolated = typeof lev === 'object' && lev?.type === 'isolated';
      if (!isIsolated) return sum;
      return sum + safeNum(p?.position?.marginUsed);
    }, 0);
  };

  // Cross-backed account value per dex. For Standard mode, cross margin
  // shares all account value in the dex except isolated margin. In live
  // tests, `crossMarginSummary.accountValue` can understate this after
  // cross positions exist, causing too-tight new-position liq previews.
  // So use `marginSummary.accountValue - isolatedMarginUsed` and keep
  // `crossMarginSummary.accountValue` only as a fallback.
  const perpCrossAccountValueByDex: Record<string, number> = {};
  const perpCrossMaintenanceMarginUsedByDex: Record<string, number> = {};
  const perpWithdrawableByDex: Record<string, number> = {};
  const perpInitialMarginAvailableByDex: Record<string, number> = {};
  const mainIsolatedMarginUsed = getIsolatedMarginUsed(mainState);
  perpCrossAccountValueByDex[''] =
    Math.max(0, safeNum((mainState as any)?.marginSummary?.accountValue) - mainIsolatedMarginUsed)
    || safeNum((mainState as any)?.crossMarginSummary?.accountValue);
  perpCrossMaintenanceMarginUsedByDex[''] = safeNum((mainState as any)?.crossMaintenanceMarginUsed);
  perpWithdrawableByDex[''] = safeNum((mainState as any)?.withdrawable);
  perpInitialMarginAvailableByDex[''] = Math.max(
    0,
    safeNum((mainState as any)?.marginSummary?.accountValue) -
      safeNum((mainState as any)?.marginSummary?.totalMarginUsed),
  );
  HIP3_DEXES.forEach((dexName, i) => {
    const s = hip3States[i];
    if (!s) return;
    const iso = getIsolatedMarginUsed(s);
    perpCrossAccountValueByDex[dexName] =
      Math.max(0, safeNum((s as any)?.marginSummary?.accountValue) - iso)
      || safeNum((s as any)?.crossMarginSummary?.accountValue);
    perpCrossMaintenanceMarginUsedByDex[dexName] = safeNum((s as any)?.crossMaintenanceMarginUsed);
    perpWithdrawableByDex[dexName] = safeNum((s as any)?.withdrawable);
    perpInitialMarginAvailableByDex[dexName] = Math.max(
      0,
      safeNum((s as any)?.marginSummary?.accountValue) -
        safeNum((s as any)?.marginSummary?.totalMarginUsed),
    );
  });
  // Subtract resting orders' init-margin locks on a per-dex basis. HL's
  // `marginSummary.totalMarginUsed` only reflects FILLED positions, so
  // a dex with two resting limits otherwise looks completely free even
  // when each limit has reserved init margin out of that dex's pool.
  // Without this the HIP-3 slider cap (`unifiedSpotTransferable +
  // targetDexBalance`) overstates room and HL rejects the next order
  // for "insufficient margin" at submit time.
  const restingOrdersInitMarginByDex = estimateRestingOrdersInitMarginByDex(allOpenOrders as any[]);
  for (const [dex, lock] of Object.entries(restingOrdersInitMarginByDex)) {
    if (perpInitialMarginAvailableByDex[dex] == null) continue;
    perpInitialMarginAvailableByDex[dex] = Math.max(
      0,
      perpInitialMarginAvailableByDex[dex] - (Number.isFinite(lock) ? lock : 0),
    );
  }

  // Unified-pool aggregates (used in `unifiedAccount` / `portfolioMargin` modes
  // where HL collateralises every USDC-backed cross dex from one shared pool).
  // Per HL docs: `available = spotUSDC − sum(isolatedMarginUsed)`; ratio is
  // `sum(crossMaintenanceMarginUsed) / available`. We feed those scalars into
  // estimateLiqPriceCross so projections match HL's own client-side liq math.
  const totalCrossMaintenanceMarginUsedUsd = Object.values(perpCrossMaintenanceMarginUsedByDex)
    .reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const totalIsolatedMarginUsedUsd = allStates.reduce((sum, st) => sum + getIsolatedMarginUsed(st), 0);
  // Sum of every dex's `marginSummary.totalMarginUsed`. In unified mode this
  // captures all initial margin reservations that pin the spot pool — both
  // main perp and HIP-3 dexes contribute. One half of HL's
  // `transfer_margin_required = max(initial, 0.10 × position_value)` rule.
  const totalCrossInitialMarginUsedUsd = allStates.reduce((sum, st) => {
    const mu = safeNum((st as any)?.marginSummary?.totalMarginUsed);
    return sum + (Number.isFinite(mu) ? mu : 0);
  }, 0);
  // Sum of every CROSS position's notional value across every dex. Drives
  // the 10%-of-notional floor on transferable margin. Above 10× leverage
  // this floor dominates and is what locks down spot in your example.
  const positionsCrossPositionValueUsd = allStates.reduce((sum, st) => {
    const aps = ((st as any)?.assetPositions ?? []) as any[];
    let dexSum = 0;
    aps.forEach((ap) => {
      const lev = ap?.position?.leverage;
      const isCross = typeof lev === 'object' ? lev?.type === 'cross' : true;
      if (!isCross) return;
      const pv = Math.abs(safeNum(ap?.position?.positionValue));
      if (Number.isFinite(pv)) dexSum += pv;
    });
    return sum + dexSum;
  }, 0);
  // RESTING limit orders (non-reduce-only / non-trigger / non-position-tpsl)
  // also count toward `position_value` in HL's transfer rule. Without
  // including them, the `max(initial, 0.10 × position_value)` cap looks
  // higher than HL's actual limit and JIT funding gets rejected with
  // "Insufficient balance for token transfer".
  const restingOrdersNotionalUsd = ((allOpenOrders ?? []) as any[]).reduce((sum, o) => {
    if (!o) return sum;
    if (o.reduceOnly) return sum;
    if (o.isTrigger) return sum;
    if (o.isPositionTpsl) return sum;
    const px = parseFloat(o?.limitPx ?? '0');
    const sz = parseFloat(o?.sz ?? o?.origSz ?? '0');
    if (!Number.isFinite(px) || !Number.isFinite(sz)) return sum;
    const ntl = Math.abs(px * sz);
    return Number.isFinite(ntl) ? sum + ntl : sum;
  }, 0);
  const totalCrossPositionValueUsd = positionsCrossPositionValueUsd + restingOrdersNotionalUsd;

  // Spot balance (USDC + non-USDC priced via entryNtl / spot meta). Shared with DepositPanel
  // so "Trade Balance" matches across home, profile, and portfolio screens.
  const spotMetaData = spotState ? await getSpotMetaAndAssetCtxsCached().catch(() => null) : null;
  const { spotBalanceUsd, spotPositionsCount } = computeSpotBalanceUsd(spotState, spotMetaData);
  const spotUsdcBalanceUsd = computeSpotUsdcOnlyUsd(spotState);
  const spotUsdcHoldUsd = estimateSpotOpenOrdersUsdcHoldUsd(allOpenOrders as any[]);
  /*
   * Debug note (2026-06-03): kept commented for future unified spot/perp margin
   * investigations. We used this to confirm raw spot `hold` can represent perp
   * margin reservation, while `spotOrderHoldUsd` should only count resting spot
   * BUY orders for spot -> HIP-3 funding budgets.
   *
   * if (__DEV__ && spotState) {
   *   try {
   *     const rawSpotUsdcHoldUsd = computeSpotUsdcHoldUsd(spotState);
   *     const spotBalances = ((spotState as any)?.balances ?? []) as any[];
   *     const nonUsdcBalances = spotBalances
   *       .filter((b) => {
   *         const coin = String(b?.coin ?? '').toUpperCase();
   *         return coin && coin !== 'USDC' && safeNum(b?.total) > 0;
   *       })
   *       .map((b) => ({
   *         coin: b?.coin,
   *         total: b?.total,
   *         hold: b?.hold,
   *         entryNtl: b?.entryNtl,
   *       }));
   *     const likelySpotOrders = ((allOpenOrders ?? []) as any[])
   *       .filter((o) => {
   *         const coin = String(o?.coin ?? '');
   *         const asset = Number(o?.asset ?? o?.a);
   *         return coin.startsWith('@') || coin.toUpperCase().includes('/USDC') || asset >= 10000;
   *       })
   *       .map((o) => ({
   *         coin: o?.coin,
   *         side: o?.side,
   *         limitPx: o?.limitPx,
   *         sz: o?.sz ?? o?.origSz,
   *         reduceOnly: o?.reduceOnly,
   *         isTrigger: o?.isTrigger,
   *       }))
   *       .slice(0, 8);
   *     if (rawSpotUsdcHoldUsd > 0.01 || spotUsdcHoldUsd > 0.01 || nonUsdcBalances.length > 0 || likelySpotOrders.length > 0) {
   *       console.log('[HLSpotBalanceDebug]', {
   *         spotBalanceUsd,
   *         spotUsdcBalanceUsd,
   *         spotHoldUsd: rawSpotUsdcHoldUsd,
   *         spotOrderHoldUsd: spotUsdcHoldUsd,
   *         pooledMode: isPooledAccountMode(abstractionMode),
   *         openSpotOrders: likelySpotOrders,
   *         nonUsdcBalances,
   *       });
   *     }
   *   } catch {}
   * }
   */

  const isPooledAbstraction = isPooledAccountMode(abstractionMode);
  // Unified-mode "free margin available for new orders":
  //   accountValue − (existing cross init margins + resting orders'
  //   init margins + isolated margins)
  // HL's order-acceptance check is `accountValue ≥ initialMargin` (per HL
  // Margining docs), so we subtract INITIAL — not maintenance — for
  // existing positions. Resting orders also lock initial margin from the
  // moment they hit the book, so we estimate and subtract those too.
  // Without the resting-order term, a user with two BTC limits at 40x
  // sees the full spot pool as available and HL rejects their next order.
  const restingOrdersInitMarginUsd = estimateRestingOrdersInitMarginUsd(allOpenOrders as any[]);
  const pooledMarginAvailableUsd = Math.max(
    0,
    spotUsdcBalanceUsd
      - totalIsolatedMarginUsedUsd
      - totalCrossInitialMarginUsedUsd
      - restingOrdersInitMarginUsd,
  );
  // Spot → perp transferable budget in unified mode using HL's documented
  // `max(initial, 0.10 × position_value)` rule. Resting limit orders
  // (cross or isolated) lock additional init margin out of the spot pool
  // even before they fill, so we pass them in too — without this, the
  // HIP-3 slider treats those locks as free transferable USDC.
  const unifiedSpotTransferableUsd = computeUnifiedSpotTransferableUsd({
    spotUsdcBalanceUsd,
    totalCrossInitialMarginUsedUsd,
    totalCrossPositionValueUsd,
    totalIsolatedMarginUsedUsd,
    spotUsdcHoldUsd,
    restingOrdersInitMarginUsd,
  });
  const perpAccountValueUsd = isPooledAbstraction ? 0 : rawPerpAccountValueUsd;
  const withdrawableUsd = isPooledAbstraction ? pooledMarginAvailableUsd : rawWithdrawableUsd;
  const accountValueUsd = isPooledAbstraction ? spotBalanceUsd : rawPerpAccountValueUsd + spotBalanceUsd;
  const hasBalance = accountValueUsd > 0.01 || withdrawableUsd > 0.01;

  const agentAddress = await getStoredAgentAddress();
  const now = Date.now();
  // `extraAgents` can be null/non-array for HL sub-accounts — don't throw.
  const agentList = Array.isArray(agents) ? agents : [];
  const matchedAgent = agentAddress
    ? agentList.find((a) => a.address.toLowerCase() === agentAddress.toLowerCase() && a.validUntil > now)
    : undefined;
  const isAgentActive = !!matchedAgent;
  const agentValidUntil = matchedAgent ? Number(matchedAgent.validUntil) : null;

  // Count perp positions
  const perpPositionsCount = allStates.flatMap((state) => state?.assetPositions ?? []).length;

  return {
    accountValueUsd,
    withdrawableUsd,
    hasBalance,
    agentAddress: agentAddress ?? undefined,
    isAgentActive,
    agentValidUntil,
    positions: allStates.flatMap((state) => state?.assetPositions ?? []).map((p) => {
      const lev = (p.position as any)?.leverage;
      // Hyperliquid leverage can be an object { type: "cross"|"isolated", value: number } or just a number
      const marginType: 'cross' | 'isolated' =
        typeof lev === 'object' && lev?.type === 'cross' ? 'cross' : 'isolated';
      // cumFunding: { allTime, sinceOpen, sinceChange } — accumulated funding for this position
      const rawCumFunding = (p.position as any)?.cumFunding;
      const cumFunding = rawCumFunding && typeof rawCumFunding === 'object'
        ? {
            allTime: String(rawCumFunding.allTime ?? '0'),
            sinceOpen: String(rawCumFunding.sinceOpen ?? '0'),
            sinceChange: String(rawCumFunding.sinceChange ?? '0'),
          }
        : null;
      return {
        coin: p.position.coin,
        szi: p.position.szi,
        entryPx: p.position.entryPx,
        liquidationPx: p.position.liquidationPx,
        unrealizedPnl: p.position.unrealizedPnl,
        returnOnEquity: p.position.returnOnEquity,
        leverage: lev ?? null,
        marginUsed: (p.position as any)?.marginUsed ?? (p.position as any)?.marginUsedUsd ?? null,
        positionValue: (p.position as any)?.positionValue ?? (p.position as any)?.position_value ?? null,
        maxLeverage: (p.position as any)?.maxLeverage ?? null,
        marginType,
        cumFunding,
      };
    }),
    perpAccountValueUsd,
    spotBalanceUsd,
    perpPositionsCount,
    spotPositionsCount,
    perpCrossAccountValueByDex,
    perpCrossMaintenanceMarginUsedByDex,
    perpWithdrawableByDex,
    perpInitialMarginAvailableByDex,
    accountAbstractionMode: abstractionMode,
    userDexAbstractionEnabled,
    spotUsdcBalanceUsd,
    spotUsdcHoldUsd,
    totalIsolatedMarginUsedUsd,
    totalCrossMaintenanceMarginUsedUsd,
    totalCrossInitialMarginUsedUsd,
    totalCrossPositionValueUsd,
    unifiedSpotTransferableUsd,
    restingLimitCoins: restingEntryLimitCoins(allOpenOrders as any[]),
  };
}

export async function getUserFills(userAddress: Hex, opts?: { aggregateByTime?: boolean }) {
  const info = getHlInfoClient();
  return info.userFills({
    user: userAddress,
    aggregateByTime: opts?.aggregateByTime ?? true,
  });
}

/** Per-fill replay (`startPosition`, flatten gaps). Needed for round-trip win rate. */
export async function getUserFillsReplay(userAddress: Hex) {
  return getUserFills(userAddress, { aggregateByTime: false });
}

export async function getUserFunding(userAddress: Hex, opts?: { startTimeMs?: number; endTimeMs?: number }) {
  const info = getHlInfoClient();
  const fetchUserFunding = async (dex?: string) => {
    const endTimeMs = opts?.endTimeMs ?? Date.now();
    const startTimeMs = opts?.startTimeMs ?? endTimeMs - 30 * 24 * 60 * 60 * 1000;
    if (typeof (info as any).userFunding === 'function') {
      return (info as any).userFunding(
        dex ? { user: userAddress, startTime: startTimeMs, endTime: endTimeMs, dex } : { user: userAddress, startTime: startTimeMs, endTime: endTimeMs },
      );
    }
    const payload: any = { type: 'userFunding', user: userAddress, startTime: startTimeMs, endTime: endTimeMs };
    if (dex) payload.dex = dex;
    const response = await hlInfoFetch( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  };

  const [mainFunding, hip3Funding] = await Promise.all([
    fetchUserFunding(),
    Promise.all(
      HIP3_DEXES.map(async (dex) => {
        try {
          return await fetchUserFunding(dex);
        } catch {
          return [];
        }
      }),
    ),
  ]);

  const normalize = (data: any) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.funding)) return data.funding;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  return [...normalize(mainFunding), ...hip3Funding.flatMap(normalize)];
}

/**
 * Get historical PnL timeseries for a user.
 * Returns account value history and PnL history for day, week, month, allTime periods.
 * 
 * According to Hyperliquid docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 * Response format:
 * [
 *   ["day", { "accountValueHistory": [[timestamp, value], ...], "pnlHistory": [[timestamp, value], ...], "vlm": "0.0" }],
 *   ["week", { ... }],
 *   ["month", { ... }],
 *   ["allTime", { ... }]
 * ]
 */
export type PnlTimeseriesEntry = {
  accountValueHistory: [number, string][];
  pnlHistory: [number, string][];
  vlm: string;
};

export type PnlTimeseries = {
  day: PnlTimeseriesEntry | null;
  week: PnlTimeseriesEntry | null;
  month: PnlTimeseriesEntry | null;
  allTime: PnlTimeseriesEntry | null;
};

export type UserPortfolioSummary = {
  allTimePnl: number | null;
  allTimeVlm: number | null;
};

/**
 * Calculate total PnL from user fills as a fallback verification method.
 * This sums all closedPnl from fills, which represents realized trading PnL.
 * Note: This may not include funding payments, so portfolio API is preferred.
 */
async function calculateTotalPnlFromFills(userAddress: Hex): Promise<number | null> {
  try {
    const fills = await getUserFills(userAddress);
    if (!Array.isArray(fills) || fills.length === 0) return null;
    
    let totalPnl = 0;
    for (const fill of fills) {
      // closedPnl is the realized PnL from closed positions
      const closedPnl = (fill as any)?.closedPnl ?? (fill as any)?.pnl ?? (fill as any)?.realizedPnl ?? 0;
      const pnlNum = typeof closedPnl === 'string' ? parseFloat(closedPnl) : typeof closedPnl === 'number' ? closedPnl : 0;
      if (Number.isFinite(pnlNum)) {
        totalPnl += pnlNum;
      }
      
      // Also subtract fees (fees are negative for the user)
      const fee = (fill as any)?.fee ?? 0;
      const feeNum = typeof fee === 'string' ? parseFloat(fee) : typeof fee === 'number' ? fee : 0;
      if (Number.isFinite(feeNum)) {
        totalPnl -= feeNum;
      }
    }
    
    return Number.isFinite(totalPnl) ? totalPnl : null;
  } catch {
    return null;
  }
}

export async function getUserPortfolioSummary(userAddress: Hex): Promise<UserPortfolioSummary> {
  const info = getHlInfoClient();
  let data: any;
  if (typeof (info as any).portfolio === 'function') {
    data = await (info as any).portfolio({ user: userAddress });
  } else {
    const response = await hlInfoFetch( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'portfolio',
        user: userAddress,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText} ${errorBody}`);
    }

    data = await response.json();
  }
  
  /**
   * Extract PnL from pnlHistory array (pure trading PnL, excludes deposits/withdrawals).
   * pnlHistory format: [[timestamp, value], ...]
   * For "allTime", the last value should be the total cumulative PnL from account creation.
   * Returns the last value from the array, or null if not available.
   */
  const extractPnlFromHistory = (entry: any): number | null => {
    if (!entry) return null;
    
    // First, try to get from pnlHistory array (pure trading PnL)
    const pnlHistory = entry.pnlHistory;
    if (Array.isArray(pnlHistory) && pnlHistory.length > 0) {
      // For allTime, the last entry should be the total cumulative PnL
      const lastEntry = pnlHistory[pnlHistory.length - 1];
      if (Array.isArray(lastEntry) && lastEntry.length >= 2) {
        const rawPnl = lastEntry[1];
        const pnl = typeof rawPnl === 'string' ? parseFloat(rawPnl) : typeof rawPnl === 'number' ? rawPnl : NaN;
        if (Number.isFinite(pnl)) return pnl;
      }
    }
    
    // Fallback to direct fields (for backwards compatibility)
    const rawPnl =
      entry.pnl ??
      entry.pnls ??
      entry.pnlUsd ??
      entry.totalPnl ??
      entry.allTimePnl ??
      entry.allTimePnlUsd ??
      null;
    const pnl = typeof rawPnl === 'string' ? parseFloat(rawPnl) : typeof rawPnl === 'number' ? rawPnl : NaN;
    return Number.isFinite(pnl) ? pnl : null;
  };
  
  const extractVlm = (entry: any): number | null => {
    if (!entry) return null;
    const rawVlm =
      entry.vlm ??
      entry.volume ??
      entry.totalVlm ??
      entry.allTimeVlm ??
      entry.allTimeVolume ??
      null;
    const vlm = typeof rawVlm === 'string' ? parseFloat(rawVlm) : typeof rawVlm === 'number' ? rawVlm : NaN;
    return Number.isFinite(vlm) ? vlm : null;
  };

  // Formats seen in the docs include array tuples or keyed objects.
  let extractedPnl: number | null = null;
  let extractedVlm: number | null = null;
  
  if (Array.isArray(data)) {
    for (const [period, entry] of data) {
      if (period === 'allTime' || period === 'perpAllTime') {
        extractedPnl = extractPnlFromHistory(entry);
        extractedVlm = extractVlm(entry);
        break;
      }
    }
  }

  // If not found in array format, try candidate entries
  if (extractedPnl === null) {
    const candidateEntries = [
      data?.allTime,
      data?.perpAllTime,
      data?.portfolio?.allTime,
      data?.portfolio?.perpAllTime,
      data?.perp?.allTime,
      data?.perp?.perpAllTime,
      data?.summary?.allTime,
    ].filter(Boolean);

    for (const entry of candidateEntries) {
      extractedPnl = extractPnlFromHistory(entry);
      extractedVlm = extractVlm(entry);
      if (extractedPnl != null || extractedVlm != null) {
        break;
      }
    }
  }

  // Final fallback to root data
  if (extractedPnl === null) {
    extractedPnl = extractPnlFromHistory(data);
    extractedVlm = extractVlm(data);
  }

  // If still no PnL found from portfolio API, try calculating from fills as verification
  // This is a fallback and may not include funding payments
  if (extractedPnl === null) {
    const fillsPnl = await calculateTotalPnlFromFills(userAddress);
    if (fillsPnl !== null) {
      extractedPnl = fillsPnl;
    }
  }

  return { allTimePnl: extractedPnl, allTimeVlm: extractedVlm };
}

export async function getHistoricalPnlTimeseries(userAddress: Hex): Promise<PnlTimeseries> {
  const info = getHlInfoClient();
  let data: any;
  if (typeof (info as any).portfolio === 'function') {
    data = await (info as any).portfolio({ user: userAddress });
  } else {
    const response = await hlInfoFetch( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'portfolio',
        user: userAddress,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText} ${errorBody}`);
    }

    data = await response.json();
  }
  
  // Parse the array format into a more usable object
  const result: PnlTimeseries = {
    day: null,
    week: null,
    month: null,
    allTime: null,
  };

  if (Array.isArray(data)) {
    for (const [period, entry] of data) {
      if (period === 'day' || period === 'perpDay') {
        result.day = entry as PnlTimeseriesEntry;
      } else if (period === 'week' || period === 'perpWeek') {
        result.week = entry as PnlTimeseriesEntry;
      } else if (period === 'month' || period === 'perpMonth') {
        result.month = entry as PnlTimeseriesEntry;
      } else if (period === 'allTime' || period === 'perpAllTime') {
        result.allTime = entry as PnlTimeseriesEntry;
      }
    }
  }

  return result;
}

/**
 * Calculate 24h PnL percentage from historical data.
 * Uses pnlHistory (pure trading PnL) - NOT accountValueHistory which includes deposits/withdrawals.
 * 
 * IMPORTANT: Returns 0 for tiny/inactive accounts to avoid misleading percentages.
 * When account values are very small (< $1), tiny fluctuations can cause
 * massive percentage swings (e.g., $0.003 -> $0.01 = +233%) which are meaningless.
 */
export function calculate24hPnlPercent(timeseries: PnlTimeseries, currentAccountValue: number): number {
  // Minimum threshold to avoid misleading percentages from tiny balances
  const MIN_MEANINGFUL_VALUE = 1.0;
  
  const dayData = timeseries.day;
  if (!dayData) {
    return 0;
  }

  // Use pnlHistory for pure trading PnL (excludes deposits/withdrawals)
  // pnlHistory contains cumulative PnL, so 24h PnL = latest - oldest in the day period
  const pnlHistory = dayData.pnlHistory;
  if (!pnlHistory || pnlHistory.length < 2) {
    return 0;
  }

  // Get 24h trading PnL (difference between latest and oldest cumulative PnL in the day)
  const oldestPnl = parseFloat(pnlHistory[0]?.[1] ?? '0');
  const latestPnl = parseFloat(pnlHistory[pnlHistory.length - 1]?.[1] ?? '0');
  const tradingPnl24h = latestPnl - oldestPnl;

  // If account value is too small, any percentage is noise
  if (currentAccountValue < MIN_MEANINGFUL_VALUE) {
    return 0;
  }

  // Derive the capital base in a deposit/withdrawal-aware way.
  //
  // We must NOT divide by the oldest account value in the window: if a deposit
  // (or withdrawal) happened during the last 24h, that value predates it and is
  // unrelated to the capital the PnL was actually earned on. Example: account
  // sat at $50, user deposits $3,000, trades to +$275 -> 275/50 = 550% which is
  // meaningless and hits the display cap.
  //
  // `currentAccountValue - tradingPnl24h` algebraically equals
  // `accountValue_24h_ago + netDeposits_in_window`, i.e. the total capital that
  // was actually at work over the period. That is the correct denominator.
  let baseValue = currentAccountValue - tradingPnl24h;

  // Fallback only if the derived base is unusable (e.g. rounds to ~0).
  if (!Number.isFinite(baseValue) || baseValue < MIN_MEANINGFUL_VALUE) {
    const accountHistory = dayData.accountValueHistory;
    const oldestAccountValue = accountHistory && accountHistory.length > 0
      ? parseFloat(accountHistory[0]?.[1] ?? '0')
      : NaN;
    if (Number.isFinite(oldestAccountValue) && oldestAccountValue > MIN_MEANINGFUL_VALUE) {
      baseValue = oldestAccountValue;
    } else {
      baseValue = currentAccountValue;
    }
  }

  if (!Number.isFinite(baseValue) || baseValue < MIN_MEANINGFUL_VALUE) {
    return 0;
  }

  // Calculate percentage based on trading PnL relative to the capital base
  const pnlPercent = (tradingPnl24h / baseValue) * 100;
  
  // Cap extreme percentages to avoid display issues
  const cappedChange = Math.max(-99.9, Math.min(pnlPercent, 999.9));
  
  return Number.isFinite(cappedChange) ? cappedChange : 0;
}

/**
 * Get deposit/withdrawal history for a user.
 * Returns ledger updates including deposits, withdrawals, transfers, liquidations, etc.
 * 
 * According to Hyperliquid docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 * This uses the "userNonFundingLedgerUpdates" endpoint which returns all non-funding ledger changes.
 * 
 * @param userAddress - User's wallet address
 * @param startTime - Start time in milliseconds (optional)
 * @param endTime - End time in milliseconds (optional, defaults to now)
 * @returns Array of ledger update entries
 */
export async function getUserDepositWithdrawalHistory(
  userAddress: Hex,
  startTime?: number,
  endTime?: number
) {
  const info = getHlInfoClient();
  
  // Try SDK method first, fallback to direct API call if not available
  if (typeof (info as any).userNonFundingLedgerUpdates === 'function') {
    return (info as any).userNonFundingLedgerUpdates({
      user: userAddress,
      startTime,
      endTime,
    });
  }
  
  // Fallback: direct API call
  const payload: any = {
    type: 'userNonFundingLedgerUpdates',
    user: userAddress,
  };
  if (startTime !== undefined) payload.startTime = startTime;
  if (endTime !== undefined) payload.endTime = endTime;
  
      const response = await hlInfoFetch( {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

function parseLedgerUsd(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : NaN;
}

/** Internal capital moves that HL does **not** net out of `portfolio.pnlHistory`. */
const INTERNAL_CAPITAL_LEDGER_TYPES = new Set([
  'send', // sendAsset (dedicated fund/reclaim, cross-user)
  'internaltransfer',
  'subaccounttransfer',
  'spottransfer',
]);

/**
 * Net USDC inflow to `address` from internal transfers (sendAsset, usdSend,
 * subAccountTransfer, spotTransfer). Positive = capital arrived.
 *
 * HL's portfolio graphs define PnL as `accountValue + deposits - withdrawals`
 * (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-graphs).
 * Dedicated ↔ Main `sendAsset` is neither a deposit nor a withdrawal, so it
 * leaks into `pnlHistory` as fake trading PnL. Subtract this from the
 * displayed period figure.
 *
 * Amounts are unsigned in the ledger (`user` = sender, `destination` =
 * recipient). Same-address dex shuffles are skipped. Pass `counterparties`
 * (the other book: Dedicated subs on Main, master on a sub) so we only
 * strip those moves — and so a Main series is never adjusted with a sub
 * ledger (that double-applies a 1k fund as −2k).
 */
export function netInternalCapitalInflowUsd(
  ledger: unknown,
  address: string,
  startMs = 0,
  endMs = Number.POSITIVE_INFINITY,
  counterparties?: Iterable<string>,
): number {
  const self = String(address ?? '').toLowerCase();
  if (!self.startsWith('0x')) return 0;
  const peers = new Set(
    [...(counterparties ?? [])].map((a) => String(a ?? '').toLowerCase()).filter((a) => a.startsWith('0x') && a !== self),
  );
  const rows = Array.isArray(ledger) ? ledger : [];
  const seen = new Set<string>();
  let net = 0;
  for (const row of rows) {
    const time = Number(row?.time ?? 0);
    if (Number.isFinite(time) && time > 0 && (time < startMs || time > endMs)) continue;
    const delta = row?.delta ?? row;
    const type = String(delta?.type ?? '').toLowerCase();
    if (!INTERNAL_CAPITAL_LEDGER_TYPES.has(type)) continue;

    const dest = String(delta?.destination ?? '').toLowerCase();
    const user = String(delta?.user ?? '').toLowerCase();
    if (!dest && !user) continue;
    if (dest === self && user === self) continue;

    if (peers.size > 0) {
      const otherIsPeer = (dest.startsWith('0x') && peers.has(dest)) || (user.startsWith('0x') && peers.has(user));
      if (!otherIsPeer) continue;
    }

    let usd = parseLedgerUsd(delta?.usdcValue ?? delta?.usdc);
    if (!Number.isFinite(usd)) {
      const token = String(delta?.token ?? '').toUpperCase();
      if (token === 'USDC' || token.startsWith('USDC:')) {
        usd = parseLedgerUsd(delta?.amount);
      }
    }
    if (!Number.isFinite(usd) || usd === 0) continue;
    const mag = Math.abs(usd);

    const feeRaw = parseLedgerUsd(delta?.fee);
    const feeToken = String(delta?.feeToken ?? 'USDC').toUpperCase();
    const feeUsd =
      Number.isFinite(feeRaw) && feeRaw > 0 && (feeToken === 'USDC' || feeToken.startsWith('USDC:'))
        ? feeRaw
        : 0;

    const hash = String(row?.hash ?? '').toLowerCase();
    const dedupe = hash.startsWith('0x') ? hash : `${time}|${user}|${dest}|${mag}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    // Direction from addresses only — never trust the unsigned amount's sign.
    if (peers.size > 0) {
      if (peers.has(dest) && dest !== self) {
        net -= mag + feeUsd;
        continue;
      }
      if (peers.has(user) && user !== self) {
        net += mag;
        continue;
      }
    }
    if (dest === self) net += mag;
    else if (user === self) net -= mag + feeUsd;
  }
  return net;
}

/** Last sample of a PnL series (all-time cumulative, or a 1-point window). */
export function lastPnlHistoryValue(history: [number, string][] | null | undefined): number | null {
  if (!Array.isArray(history) || history.length === 0) return null;
  const raw = history[history.length - 1]?.[1];
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Trading PnL over a window. HL `day`/`week`/`month` series are cumulative
 * snapshots — period change is last − first (homepage 24h % already does this).
 */
export function windowPnlHistoryDelta(history: [number, string][] | null | undefined): number | null {
  if (!Array.isArray(history) || history.length === 0) return null;
  const last = lastPnlHistoryValue(history);
  if (last == null) return null;
  if (history.length === 1) return last;
  const firstRaw = history[0]?.[1];
  const first = typeof firstRaw === 'number' ? firstRaw : parseFloat(String(firstRaw ?? ''));
  if (!Number.isFinite(first)) return last;
  return last - first;
}

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
};

/**
 * Minimal viem JSON-RPC account adapter compatible with @nktkas/hyperliquid signing.
 * Uses Privy's embedded wallet provider underneath.
 */
export function createViemJsonRpcAccount(args: { provider: Eip1193Provider; address: Hex }) {
  const { provider, address } = args;
  return {
    async getAddresses() {
      return [address];
    },
    async getChainId() {
      const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
      return parseInt(chainIdHex, 16);
    },
    async signTypedData(params: {
      domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, unknown>;
    }) {
      // Hyperliquid SDK already gives domain/types/primaryType/message.
      // Most wallets expect EIP712Domain included.
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          ...params.types,
        },
        domain: params.domain,
        primaryType: params.primaryType,
        message: params.message,
      };

      const sig = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      })) as Hex;

      return sig;
    },
  };
}

function normalizeHexChainId(hex: string): `0x${string}` | null {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    return `0x${BigInt(hex).toString(16)}` as `0x${string}`;
  } catch {
    return null;
  }
}

/**
 * `signatureChainId` for user-signed HL actions. Hyperliquid accepts any id as
 * long as it matches the EIP-712 domain; wallets require it to match their
 * selected network.
 *
 * Embedded Privy providers answer `eth_chainId` with the wallet's real chain.
 * WalletConnect/AppKit providers answer with the dapp-session default chain
 * (Arbitrum) — NOT the network selected inside MetaMask — which is why external
 * flows call `ensureExternalWalletOnHlSigningChain()` first to move the wallet
 * onto Arbitrum before any typed-data prompt (same requirement as HL's own UI).
 */
async function readWalletSignatureChainId(
  provider: Eip1193Provider,
): Promise<`0x${string}`> {
  try {
    const hex = await provider.request({ method: 'eth_chainId' });
    if (typeof hex === 'string') {
      const normalized = normalizeHexChainId(hex);
      if (normalized) return normalized;
    }
  } catch {
    /* wallet may not answer; use env fallback */
  }
  return getHlExchangeSignatureChainId();
}

async function createUserExchangeClient(
  provider: Eip1193Provider,
  address: Hex,
  chainIdOverride?: `0x${string}`,
) {
  const wallet = createViemJsonRpcAccount({ provider, address });
  const signatureChainId = chainIdOverride ?? (() => readWalletSignatureChainId(provider));
  return new ExchangeClient({
    transport: getHlTransport(),
    wallet,
    signatureChainId,
  });
}

async function withUserSignedExchange<T>(
  provider: Eip1193Provider,
  address: Hex,
  fn: (exchange: ExchangeClient) => Promise<T>,
): Promise<T> {
  const run = (chain?: `0x${string}`) =>
    createUserExchangeClient(provider, address, chain).then(fn);

  try {
    return await run();
  } catch (err) {
    // Backstop only (e.g. the user declined the network-switch request): retry
    // ONCE on the chain the wallet says it is actually on. Never loop — every
    // extra attempt is another wallet round-trip the user has to sit through.
    const mismatch = parseTypedDataChainMismatch(err);
    if (!mismatch?.active) throw err;
    if (__DEV__) {
      console.log('[hl] EIP-712 chain mismatch; single retry on wallet chain', mismatch);
    }
    return await run(mismatch.active);
  }
}

export async function setupTradingAccount(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  agentAddress: Hex;
  /** Deprecated/ignored: HIP-3 trading no longer requires enabling dex abstraction on the agent. */
  agentPrivateKey?: Hex;
}): Promise<void> {
  const { userWalletProvider: provider, userAddress } = args;

  // 1) Approve the agent (API wallet) for one-tap trading.
  await withUserSignedExchange(provider, userAddress, (exchange) =>
    exchange.approveAgent({ agentAddress: args.agentAddress, agentName: HL_AGENT_NAME }),
  );

  // 2) Approve builder fee cap for the active builder address (10 bps).
  await withUserSignedExchange(provider, userAddress, (exchange) =>
    exchange.approveBuilderFee({
      builder: getBuilderAddress() as Hex,
      maxFeeRate: HL_BUILDER_MAX_FEE_RATE,
    }),
  );

  // 3) Move app users into HL's recommended consumer mode.
  const currentMode = await getUserAbstractionMode(args.userAddress).catch(() => null);
  if (!isPooledAccountMode(currentMode)) {
    await withUserSignedExchange(provider, userAddress, (exchange) =>
      (exchange as any).userSetAbstraction({
        user: args.userAddress,
        abstraction: 'unifiedAccount',
      }),
    );
  }
}

/**
 * Run the full seamless-trading setup end-to-end and confirm it landed.
 *
 * This is the headless core shared by the on-screen "Activate" button and the
 * silent auto-setup hook. With Privy embedded wallets every signature here is
 * auto-signed (no wallet popup), so callers can run this in the background.
 *
 * Steps: rotate a fresh agent key → `setupTradingAccount` (approveAgent +
 * approveBuilderFee + unified account) → poll HL until the SAME three
 * conditions that define `setupComplete` are observable on-chain (agent
 * active, pooled mode, builder fee approved). Returns `true` when confirmed,
 * `false` if it didn't confirm within the deadline. Throws only on a hard
 * failure during the signing/submission phase.
 *
 * The success criteria deliberately mirror the auto-mark effect's checks so a
 * silent success can't be downgraded into a surprise re-prompt afterwards.
 */
export async function runSeamlessTradingSetup(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  /** Total time to wait for HL to reflect the new state. Default 45s. */
  confirmTimeoutMs?: number;
}): Promise<boolean> {
  const rotated = await rotateAgentKey();
  await setupTradingAccount({
    userWalletProvider: args.userWalletProvider,
    userAddress: args.userAddress,
    agentAddress: rotated.agentAddress,
    agentPrivateKey: rotated.agentPrivateKey,
  });

  const deadline = Date.now() + (args.confirmTimeoutMs ?? 45_000);
  while (Date.now() < deadline) {
    try {
      const next = await getHyperliquidTradingState(args.userAddress);
      if (next.isAgentActive && isPooledAccountMode(next.accountAbstractionMode)) {
        const builderApproved = await isBuilderFeeApproved(args.userAddress).catch(() => false);
        if (builderApproved) return true;
      }
    } catch {
      // transient network/HL error — keep polling until the deadline
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stepwise seamless setup — external (WalletConnect) wallets only.
//
// Embedded (email/social) Privy wallets auto-sign silently via
// `runSeamlessTradingSetup`. External wallet users must approve each Hyperliquid
// admin signature inside their own wallet app, so we drive the SAME three
// actions one signature at a time, with progress and full resumability:
//
//   • Each run inspects on-chain state and only requests the signatures that are
//     still missing. Signing 1 step then closing the app resumes cleanly.
//   • The agent key is REUSED (`ensureAgentKey`, not `rotateAgentKey`) so a
//     half-finished setup approves the SAME agent instead of orphaning it.
//   • Signing happens in the user's wallet over WalletConnect — the private key
//     never touches this app, so only the wallet owner can approve each action.
// ─────────────────────────────────────────────────────────────────────────────

export type SeamlessStepId = 'agent' | 'builderFee' | 'accountMode';

export interface SeamlessSetupStatus {
  /** Stored agent is approved + active on HL. */
  agent: boolean;
  /** Builder-fee cap approved for the active builder (network-scoped). */
  builderFee: boolean;
  /** Account is in a pooled (unified / portfolio-margin) mode. */
  accountMode: boolean;
  /** All three conditions satisfied — equivalent to `setupComplete`. */
  allComplete: boolean;
}

/**
 * Inspect chain + locally-stored state to determine which of the three
 * seamless-setup steps still require a signature. Safe to call repeatedly; it
 * performs no signing and no mutation.
 */
export async function inspectSeamlessSetupStatus(
  userAddress: Hex,
): Promise<SeamlessSetupStatus> {
  const state = await getHyperliquidTradingState(userAddress);
  const agent = state.isAgentActive;
  const accountMode = isPooledAccountMode(state.accountAbstractionMode);
  let builderFee = false;
  try {
    builderFee = await isBuilderFeeApproved(userAddress);
  } catch {
    // Couldn't determine (network/HL blip) → treat as not-approved so the step
    // is offered rather than silently skipped. A redundant re-approval is a
    // harmless no-op signature; a wrongly-skipped one would block orders.
    builderFee = false;
  }
  return {
    agent,
    builderFee,
    accountMode,
    allComplete: agent && builderFee && accountMode,
  };
}

export type SeamlessStepPhase = 'signing' | 'done';

/**
 * Run only the missing seamless-setup steps, one signature at a time.
 *
 * Resumable and idempotent: already-satisfied steps are skipped, so a user who
 * signed 1–2 of 3 and returned later completes only what remains. Throws if a
 * signature is rejected/fails — already-applied steps stay applied, and the next
 * run resumes from the first still-missing step.
 *
 * @param onStep       progress callback fired as each remaining step is signed.
 * @param isCancelled  cooperative-cancel check evaluated between steps; when it
 *                     returns true the run stops before the next signature
 *                     (a signature already handed to the wallet cannot be
 *                     recalled, but no further prompts are issued).
 */
function isUserRejectedWalletError(err: unknown): boolean {
  return isWalletUserRejectedRequest(err);
}

/**
 * Light on-chain check for one setup step. Avoids the full trading-state
 * fetch so we can poll while a WalletConnect promise is outstanding.
 */
async function isSeamlessStepSatisfied(userAddress: Hex, step: SeamlessStepId): Promise<boolean> {
  if (step === 'agent') {
    const agentAddress = await getStoredAgentAddress();
    if (!agentAddress) return false;
    const extras = await listHlExtraAgents(userAddress);
    return extras.some((a) => a.address.toLowerCase() === agentAddress.toLowerCase());
  }
  if (step === 'builderFee') {
    return isBuilderFeeApproved(userAddress);
  }
  const mode = await getUserAbstractionMode(userAddress).catch(() => null);
  return isPooledAccountMode(mode);
}

export type SeamlessSetupRunPhase = 'complete' | 'hl_confirm' | 'more_signatures';

type SeamlessSignWait = { via: 'sign' } | { via: 'onchain'; signPending: boolean };

/**
 * WalletConnect often never settles `eth_signTypedData_v4` after the user
 * leaves the wallet app — even when they signed and HL already applied it.
 * Race the local promise against `isLanded`, and time out shortly after
 * the app returns to the foreground so the UI cannot spin forever.
 */
function waitForWalletSignedAction(args: {
  sign: () => Promise<unknown>;
  isLanded: () => Promise<boolean>;
  isCancelled?: () => boolean;
  timeoutMs?: number;
  postForegroundGraceMs?: number;
}): Promise<SeamlessSignWait> {
  const timeoutMs = args.timeoutMs ?? 90_000;
  const postForegroundGraceMs = args.postForegroundGraceMs ?? 15_000;
  const startedAt = Date.now();
  const cancelled = () => args.isCancelled?.() === true;

  return new Promise<SeamlessSignWait>((resolve, reject) => {
    let settled = false;
    let signPending = true;
    let sawBackground = false;
    let foregroundedAt: number | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let appSub: { remove: () => void } | undefined;

    const cleanup = () => {
      if (intervalId != null) clearInterval(intervalId);
      appSub?.remove();
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const signPromise = args.sign();
    void signPromise.then(
      () => {
        signPending = false;
        finish(() => resolve({ via: 'sign' }));
      },
      (err) => {
        signPending = false;
        if (settled) return;
        if (cancelled() || isUserRejectedWalletError(err)) {
          finish(() => reject(err));
          return;
        }
        void args.isLanded()
          .then((ok) => {
            if (ok) finish(() => resolve({ via: 'onchain', signPending: false }));
            else finish(() => reject(err));
          })
          .catch(() => finish(() => reject(err)));
      },
    );
    void signPromise.catch(() => undefined);

    const tryInspect = async () => {
      if (settled) return;
      if (cancelled()) {
        finish(() => reject(new Error('__setup_cancelled__')));
        return;
      }
      try {
        if (await args.isLanded()) {
          finish(() => resolve({ via: 'onchain', signPending }));
          return;
        }
      } catch {
        /* keep waiting */
      }
      const now = Date.now();
      if (now - startedAt >= timeoutMs) {
        finish(() => reject(new Error('__approve_timeout__')));
        return;
      }
      if (foregroundedAt != null && now - foregroundedAt >= postForegroundGraceMs) {
        finish(() => reject(new Error('__approve_timeout__')));
      }
    };

    intervalId = setInterval(() => { void tryInspect(); }, 2_000);
    appSub = AppState.addEventListener('change', (state) => {
      if (state === 'background') sawBackground = true;
      if (state === 'active' && sawBackground) {
        foregroundedAt = Date.now();
        void tryInspect();
      }
    });
  });
}

function waitForSeamlessSignature(args: {
  sign: () => Promise<unknown>;
  userAddress: Hex;
  step: SeamlessStepId;
  isCancelled: () => boolean;
  timeoutMs?: number;
  postForegroundGraceMs?: number;
}): Promise<SeamlessSignWait> {
  return waitForWalletSignedAction({
    sign: args.sign,
    isLanded: () => isSeamlessStepSatisfied(args.userAddress, args.step),
    isCancelled: args.isCancelled,
    timeoutMs: args.timeoutMs,
    postForegroundGraceMs: args.postForegroundGraceMs,
  });
}

export async function runSeamlessSetupStepwise(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  onStep?: (step: SeamlessStepId, phase: SeamlessStepPhase) => void;
  isCancelled?: () => boolean;
  /** Total time to wait for HL to reflect the new state. Default 45s. */
  confirmTimeoutMs?: number;
}): Promise<{ confirmed: boolean; status: SeamlessSetupStatus; phase: SeamlessSetupRunPhase }> {
  const { userAddress } = args;
  const cancelled = () => args.isCancelled?.() === true;

  // Reuse the persisted agent key so a resumed setup approves the SAME agent
  // rather than orphaning a previously-approved one.
  const agent = await ensureAgentKey();

  let status = await inspectSeamlessSetupStatus(userAddress);
  const stopForMoreSignatures = async (): Promise<{
    confirmed: boolean;
    status: SeamlessSetupStatus;
    phase: SeamlessSetupRunPhase;
  }> => {
    const next = await inspectSeamlessSetupStatus(userAddress).catch(() => status);
    status = next;
    if (next.allComplete) {
      await markTradingSetupComplete().catch(() => { /* ignore storage errors */ });
      return { confirmed: true, status: next, phase: 'complete' };
    }
    return { confirmed: false, status: next, phase: 'more_signatures' };
  };
  if (status.allComplete) {
    await markTradingSetupComplete().catch(() => { /* ignore storage errors */ });
    return { confirmed: true, status, phase: 'complete' };
  }

  const runSignedStep = async (
    step: SeamlessStepId,
    sign: () => Promise<unknown>,
  ): Promise<'continue' | 'yield'> => {
    if (cancelled()) return 'yield';
    args.onStep?.(step, 'signing');
    let wait: SeamlessSignWait;
    try {
      wait = await waitForSeamlessSignature({
        sign,
        userAddress,
        step,
        isCancelled: cancelled,
      });
    } catch (err) {
      if (isUserRejectedWalletError(err) || cancelled()) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === '__setup_cancelled__') throw err;
      // Last look: the action may have landed while the wallet hung.
      if (await isSeamlessStepSatisfied(userAddress, step).catch(() => false)) {
        args.onStep?.(step, 'done');
        return 'yield';
      }
      throw err;
    }
    args.onStep?.(step, 'done');
    if (wait.via === 'onchain' && wait.signPending) {
      // WC request is still open — do not stack the next session_request.
      await new Promise((r) => setTimeout(r, 1_500));
      return 'yield';
    }
    await new Promise((r) => setTimeout(r, 1_200));
    return 'continue';
  };

  // 1) Authorize the agent (API wallet) for one-tap order placement.
  if (!status.agent) {
    if (cancelled()) return stopForMoreSignatures();
    const next = await runSignedStep('agent', () =>
      withUserSignedExchange(args.userWalletProvider, userAddress, (exchange) =>
        exchange.approveAgent({ agentAddress: agent.agentAddress, agentName: HL_AGENT_NAME }),
      ),
    );
    if (next === 'yield') return stopForMoreSignatures();
  }

  // 2) Approve the builder-fee cap for the active builder address.
  // Re-inspect so a recovered agent step doesn't still look "pending".
  status = await inspectSeamlessSetupStatus(userAddress).catch(() => status);
  if (!status.builderFee) {
    if (cancelled()) return stopForMoreSignatures();
    const next = await runSignedStep('builderFee', () =>
      withUserSignedExchange(args.userWalletProvider, userAddress, (exchange) =>
        exchange.approveBuilderFee({
          builder: getBuilderAddress() as Hex,
          maxFeeRate: HL_BUILDER_MAX_FEE_RATE,
        }),
      ),
    );
    if (next === 'yield') return stopForMoreSignatures();
  }

  // 3) Move into HL's unified (pooled) account mode.
  status = await inspectSeamlessSetupStatus(userAddress).catch(() => status);
  if (!status.accountMode) {
    if (cancelled()) return stopForMoreSignatures();
    const next = await runSignedStep('accountMode', () =>
      withUserSignedExchange(args.userWalletProvider, userAddress, (exchange) =>
        (exchange as any).userSetAbstraction({
          user: userAddress,
          abstraction: 'unifiedAccount',
        }),
      ),
    );
    if (next === 'yield') return stopForMoreSignatures();
  }

  // Confirm the new state is observable on HL before declaring success — mirrors
  // the exact conditions that define `setupComplete` so a confirmed run can't be
  // downgraded into a later surprise re-prompt.
  const deadline = Date.now() + (args.confirmTimeoutMs ?? 45_000);
  let finalStatus = await inspectSeamlessSetupStatus(userAddress).catch(() => status);
  while (!finalStatus.allComplete && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    finalStatus = await inspectSeamlessSetupStatus(userAddress).catch(() => finalStatus);
  }
  if (finalStatus.allComplete) {
    await markTradingSetupComplete().catch(() => { /* ignore storage errors */ });
    return { confirmed: true, status: finalStatus, phase: 'complete' };
  }
  return { confirmed: false, status: finalStatus, phase: 'hl_confirm' };
}

/**
 * Approve an arbitrary NAMED agent wallet for this user (AI trading agents).
 *
 * Unlike the device trading key (agentName `HL_AGENT_NAME`, key held locally),
 * extra named agents are server-generated keys named per instance.
 * HL allows multiple named agents per master, each separately revocable, and
 * the approval binds the agent key to THIS master only. Embedded Privy
 * wallets auto-sign; external wallets surface one wallet prompt.
 */
export async function approveNamedAgent(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  agentAddress: Hex;
  agentName: string;
}): Promise<void> {
  await withUserSignedExchange(args.userWalletProvider, args.userAddress, (exchange) =>
    exchange.approveAgent({
      agentAddress: args.agentAddress,
      agentName: args.agentName,
    }),
  );
}

/**
 * Lifetime HL volume (USD) that counts toward fee tiers / sub-account gates.
 *
 * Prefer `referral.cumVlm` over `portfolio.allTime.vlm`: portfolio reports raw
 * traded notional, while HIP-3 markets in growth mode only contribute ~10% to
 * HL "volume contributions" (fees, rate limits, and the ~$100k sub-account
 * create gate). Using portfolio alone falsely unlocks Dedicated for XYZ-heavy
 * wallets that HL still rejects.
 *
 * Falls back to portfolio allTime when referral is unavailable.
 * Throws on total network failure so callers can distinguish "ineligible"
 * from "unknown".
 */
export async function getUserLifetimeVolumeUsd(userAddress: Hex): Promise<number> {
  try {
    // SDK may not expose `referral`; hit info HTTP directly (same as perpDexs).
    const r = await hlInfoFetch( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'referral', user: userAddress }),
    });
    if (r.ok) {
      const referral = await r.json();
      const cum = Number(referral?.cumVlm);
      if (Number.isFinite(cum) && cum >= 0) return cum;
    }
  } catch {
    // fall through to portfolio
  }
  const info = getHlInfoClient();
  const res = await (info as any).portfolio({ user: userAddress });
  if (!Array.isArray(res)) return 0;
  for (const entry of res) {
    if (Array.isArray(entry) && entry[0] === 'allTime') {
      const vlm = Number(entry[1]?.vlm);
      return Number.isFinite(vlm) ? vlm : 0;
    }
  }
  return 0;
}

/**
 * Deauthorize a named agent and free its approval slot.
 *
 * HL has no separate "remove agent" action. Approving the same `agentName`
 * with the zero address deregisters that named wallet (same pattern as the
 * HL API / community SDKs) — the old key can no longer trade AND the slot
 * becomes available for a new named agent. Works for embedded (silent) and
 * external (wallet prompt) masters alike.
 */
export async function revokeNamedAgent(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  agentName: string;
}): Promise<void> {
  await withUserSignedExchange(args.userWalletProvider, args.userAddress, (exchange) =>
    exchange.approveAgent({
      agentAddress: '0x0000000000000000000000000000000000000000',
      agentName: args.agentName,
    }),
  );
}

export type HlExtraAgent = {
  name: string;
  address: Hex;
  validUntil: number;
};

/** Named API wallets currently approved for `userAddress` (HL `extraAgents`). */
export async function listHlExtraAgents(userAddress: Hex): Promise<HlExtraAgent[]> {
  const info = getHlInfoClient();
  const res = await info.extraAgents({ user: userAddress });
  if (!Array.isArray(res)) return [];
  const now = Date.now();
  return res
    .map((a: any) => ({
      name: String(a?.name ?? ''),
      address: a?.address as Hex,
      validUntil: Number(a?.validUntil ?? 0),
    }))
    .filter((a) => a.name && a.address && a.validUntil > now);
}

// ── HL sub-accounts (AI agents "Dedicated" mode) ─────────────────────────────

export interface HlSubAccount {
  name: string;
  subAccountUser: Hex;
  master: Hex;
}

/** List the user's HL sub-accounts (null → none). */
export async function listHlSubAccounts(userAddress: Hex): Promise<HlSubAccount[]> {
  const info = getHlInfoClient();
  const res = await (info as any).subAccounts({ user: userAddress });
  if (!Array.isArray(res)) return [];
  return res.map((s: any) => ({
    name: String(s.name),
    subAccountUser: s.subAccountUser as Hex,
    master: s.master as Hex,
  }));
}

/**
 * Create an HL sub-account and resolve its address.
 *
 * Signed by the MASTER wallet (L1 action — embedded Privy auto-signs, external
 * wallets get one prompt). HL gates creation behind ~$100k cumulative volume
 * ([sub-accounts](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/sub-accounts)).
 * Works under `unifiedAccount`; fund via {@link transferUsdToSubAccount}
 * (`sendAsset` spot↔spot) after {@link ensureSubAccountUnified}.
 *
 * The address is resolved by re-querying `subAccounts` and matching the name
 * (robust across SDK response-shape versions).
 */
export async function createHlSubAccount(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  /** 1-16 chars, unique per master. */
  name: string;
}): Promise<Hex> {
  const exchange = await createUserExchangeClient(args.userWalletProvider, args.userAddress);
  await (exchange as any).createSubAccount({ name: args.name });

  // HL reflects new sub-accounts in /info immediately after the L1 action acks.
  const subs = await listHlSubAccounts(args.userAddress);
  const match = subs.find((s) => s.name === args.name);
  if (!match) {
    throw new Error('Sub-account created but not yet visible. Try again in a few seconds.');
  }
  return match.subAccountUser;
}

/**
 * New HL sub-accounts often report abstraction `"default"` (standard). Spot
 * USDC on a standard sub does **not** sit in unified spot the way this
 * app's masters do — set the sub to `unifiedAccount` so sendAsset spot
 * funding is immediately usable.
 *
 * Master-signed `userSetAbstraction` with `user` = sub address (HL allows this).
 */
export async function ensureSubAccountUnified(args: {
  userWalletProvider: Eip1193Provider;
  /** Master wallet that signs. */
  userAddress: Hex;
  subAccountAddress: Hex;
}): Promise<void> {
  const info = getHlInfoClient();
  let mode: string | null = null;
  try {
    const raw = await (info as any).userAbstraction({ user: args.subAccountAddress });
    mode =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object'
          ? String((raw as any).abstraction ?? (raw as any).type ?? '') || null
          : null;
  } catch {
    mode = null;
  }
  if (mode === 'unifiedAccount' || mode === 'portfolioMargin') return;

  const exchange = await createUserExchangeClient(args.userWalletProvider, args.userAddress);
  await (exchange as any).userSetAbstraction({
    user: args.subAccountAddress,
    abstraction: 'unifiedAccount',
  });
}

/**
 * Move USDC between master and a sub-account via `sendAsset` spot↔spot.
 *
 * Classic `subAccountTransfer` / `subAccountSpotTransfer` are rejected when the
 * master is `unifiedAccount` ("Action disabled when unified account is active").
 * Proven path: destination=sub / fromSubAccount="" to fund; reverse to reclaim.
 *
 * Prefer calling {@link ensureSubAccountUnified} before the first fund so the
 * sub can trade from spot USDC.
 */
export async function transferUsdToSubAccount(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  subAccountAddress: Hex;
  usd: number;
  /** true = master → sub-account, false = sub-account → master. */
  isDeposit: boolean;
}): Promise<void> {
  if (!(args.usd > 0) || !Number.isFinite(args.usd)) {
    throw new Error('Transfer amount must be positive');
  }
  const tokenSpec = await getUsdcTokenSpec();
  const amount = args.usd.toFixed(6).replace(/\.?0+$/, '');
  if (!(Number(amount) > 0)) throw new Error('Transfer amount must be positive');

  const exchange = await createUserExchangeClient(args.userWalletProvider, args.userAddress);

  if (args.isDeposit) {
    await (exchange as any).sendAsset({
      destination: args.subAccountAddress,
      sourceDex: 'spot',
      destinationDex: 'spot',
      token: tokenSpec,
      amount,
      fromSubAccount: '',
    });
  } else {
    await (exchange as any).sendAsset({
      destination: args.userAddress,
      sourceDex: 'spot',
      destinationDex: 'spot',
      token: tokenSpec,
      amount,
      fromSubAccount: args.subAccountAddress,
    });
  }
}

/**
 * Flip an existing user account into HL's "Unified account" mode.
 *
 * Used by the Profile page migration banner and one-tap setup flow. HL
 * recommends unified account for most users because one USDC balance backs
 * validator perps, HIP-3 perps, and spot trading against USDC.
 *
 * Implementation notes:
 *   • `abstraction: 'unifiedAccount'` is the exact HL API value for Unified
 *     (see `UserSetAbstractionParameters` in @nktkas/hyperliquid v0.31+).
 *   • Signed by the USER's embedded wallet. Privy auto-signs EIP-712 without
 *     surfacing a popup (same UX path as `withdraw3` in DepositPanel).
 *   • The builder code address itself should remain Standard and funded; this
 *     helper is only for end-user accounts.
 *   • Caller should refetch `userAbstraction` after resolution to update the
 *     UI (the `accountAbstractionMode` field propagated through
 *     `getHyperliquidTradingState`).
 */
export async function switchAccountAbstractionToUnified(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
}): Promise<void> {
  const exchange = await createUserExchangeClient(args.userWalletProvider, args.userAddress);
  await (exchange as any).userSetAbstraction({
    user: args.userAddress,
    abstraction: 'unifiedAccount',
  });
}


export async function withdrawFromHyperliquid(args: {
  userWalletProvider: Eip1193Provider;
  userAddress: Hex;
  destination: Hex;
  amountUsd: string; // "12.3"
}): Promise<void> {
  // Mutex lock to prevent concurrent withdrawal attempts (which can cause nonce collisions)
  if (_withdrawMutexLock) {
    throw new Error('A withdrawal is already in progress. Please wait.');
  }
  
  _withdrawMutexLock = true;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500;
  
  try {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Force a fresh nonce by ensuring we're past the last used timestamp
        const freshNonce = getUniqueNonce();
        console.log(`[Withdraw] Attempt ${attempt}/${MAX_RETRIES}, nonce: ${freshNonce}`);
        
        // The SDK generates its own nonce, but we've updated _lastUsedNonce to ensure
        // any subsequent calls will use a higher nonce. Adding a small delay helps
        // ensure the SDK's Date.now() call gets a fresh timestamp.
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Same user-signed path as approveAgent: WalletConnect/MetaMask will
        // reject the typed-data if signatureChainId ≠ the wallet's selected
        // network. Callers should have already switched to Arbitrum; this
        // wrapper is the one-shot mismatch backstop.
        await withUserSignedExchange(args.userWalletProvider, args.userAddress, (exchange) =>
          exchange.withdraw3({ destination: args.destination, amount: args.amountUsd }),
        );
        console.log(`[Withdraw] Success on attempt ${attempt}`);
        return; // Success!
        
      } catch (error: any) {
        lastError = error;
        const errorMsg = String(error?.message || error?.shortMessage || error || '');
        console.warn(`[Withdraw] Attempt ${attempt} failed: ${errorMsg}`);
        
        // If it's a nonce error, we can retry
        if (isNonceError(error) && attempt < MAX_RETRIES) {
          console.log(`[Withdraw] Nonce error detected, retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        
        // For non-nonce errors or final attempt, throw immediately
        throw error;
      }
    }
    
    // If we exhausted all retries
    throw lastError || new Error('Withdrawal failed after max retries');
    
  } finally {
    _withdrawMutexLock = false;
  }
}


export async function getSpotClearinghouseState(userAddress: Hex): Promise<any> {
  const info = getHlInfoClient();
  if (typeof (info as any).spotClearinghouseState === 'function') {
    return (info as any).spotClearinghouseState({ user: userAddress });
  }
      const response = await hlInfoFetch( {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'spotClearinghouseState', user: userAddress }),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}


export async function getOpenOrders(userAddress: Hex) {
  const info = getHlInfoClient();
  const fetchFrontendOrders = async (dex?: string) => {
    // Prefer SDK method if available
    if (typeof (info as any).frontendOpenOrders === 'function') {
      return (info as any).frontendOpenOrders(dex ? { user: userAddress, dex } : { user: userAddress });
    }
    // Fallback to direct API call
    const payload: any = { type: 'frontendOpenOrders', user: userAddress };
    if (dex) payload.dex = dex;
    const response = await hlInfoFetch( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  };

  const [mainOrders, hip3Orders] = await Promise.all([
    fetchFrontendOrders(),
    Promise.all(
      HIP3_DEXES.map(async (dex) => {
        try {
          return await fetchFrontendOrders(dex);
        } catch {
          return [];
        }
      }),
    ),
  ]);
  const normalizeOrder = (o: any) => {
    if (!o || typeof o !== 'object') return o;
    const inner = (o as any).order ?? (o as any).o;
    if (!inner || typeof inner !== 'object') return o;
    const merged: any = { ...inner, ...o };
    if (inner.coin != null && merged.coin == null) merged.coin = inner.coin;
    if (inner.side != null && merged.side == null) merged.side = inner.side;
    if (inner.limitPx != null && merged.limitPx == null) merged.limitPx = inner.limitPx;
    if (inner.sz != null && merged.sz == null) merged.sz = inner.sz;
    if (inner.t != null && merged.t == null) merged.t = inner.t;
    if (inner.orderType != null && merged.orderType == null) merged.orderType = inner.orderType;
    if (inner.leverage != null && merged.leverage == null) merged.leverage = inner.leverage;
    if (inner.isCross != null && merged.isCross == null) merged.isCross = inner.isCross;
    if (inner.marginType != null && merged.marginType == null) merged.marginType = inner.marginType;
    if (inner.marginUsed != null && merged.marginUsed == null) merged.marginUsed = inner.marginUsed;
    if (inner.marginUsedUsd != null && merged.marginUsedUsd == null) merged.marginUsedUsd = inner.marginUsedUsd;
    return merged;
  };
  // Tag each order with its dex (`_dex`). HL's frontendOpenOrders payload
  // uses bare `coin` (no `dex:` prefix) even when fetched from a HIP-3
  // dex endpoint, so consumers that need to bucket margin/state per dex
  // (e.g. `estimateRestingOrdersInitMarginByDex`) would otherwise have
  // to look the dex up by symbol.
  const tagOrder = (o: any, dex: string) =>
    o && typeof o === 'object' && o._dex == null ? { ...normalizeOrder(o), _dex: dex } : normalizeOrder(o);
  return [
    ...((mainOrders ?? []) as any[]).map((o) => tagOrder(o, '')),
    ...HIP3_DEXES.flatMap((dex, i) => ((hip3Orders[i] ?? []) as any[]).map((o) => tagOrder(o, dex))),
  ];
}

