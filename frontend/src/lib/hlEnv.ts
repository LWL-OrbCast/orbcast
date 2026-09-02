/**
 * Hyperliquid environment routing.
 *
 * Single source of truth for which HL endpoint, signing chainId, and bridge
 * the app talks to. Reads the current `tradingEnv` ('mainnet' | 'demo') from
 * the app store and exposes synchronous getters so non-React modules (the SDK
 * transport singleton, raw `fetch` callers, EIP-712 signers, the WebSocket
 * provider) can branch without React lifecycle.
 *
 * Demo mode points the entire HL stack at testnet — same SDK, same signing
 * shape, just different endpoints.
 *
 * User-signed actions (approveAgent, builder fee, usdClassTransfer, …) use
 * `signatureChainId` = the wallet's *active* chain. Hyperliquid accepts any
 * value as long as it matches the EIP-712 domain; `hyperliquidChain` binds
 * Mainnet vs Testnet. Official HL UI sends Arbitrum One `0xa4b1`. Hardcoding
 * `0x66eee` (Sepolia) makes MetaMask / WalletConnect reject while the user
 * is correctly on Arbitrum. L1 order signing still uses phantom chain 1337
 * via the local agent key — never the browser wallet.
 */

import { getTradingEnvSync, subscribeTradingEnv, type TradingEnv } from '../store/appStore';
import {
  hlApiUrl,
  hlExchangeUrl,
  hlInfoUrl,
  hlUserSignedChainId,
  hlWsUrl,
} from './hlEndpoints';

export function getTradingEnv(): TradingEnv {
  return getTradingEnvSync();
}

export function isDemoEnv(): boolean {
  return getTradingEnvSync() === 'demo';
}

export function getHlApiUrl(): string {
  return hlApiUrl(isDemoEnv());
}

export function getHlInfoUrl(): string {
  return hlInfoUrl(isDemoEnv());
}

export function getHlExchangeUrl(): string {
  return hlExchangeUrl(isDemoEnv());
}

export function getHlWsUrl(): string {
  return hlWsUrl(isDemoEnv());
}

/** Fallback EIP-712 chainId for user-signed HL actions (wallet chain unknown). */
export function getHlExchangeSignatureChainId(): `0x${string}` {
  return hlUserSignedChainId(isDemoEnv());
}

/** Same fallback as other user-signed actions (withdraw3 included). */
export function getHlWithdrawSignatureChainId(): `0x${string}` {
  return getHlExchangeSignatureChainId();
}

/** True iff the SDK transport should be constructed with `isTestnet: true`. */
export function shouldUseTestnetTransport(): boolean {
  return isDemoEnv();
}

/**
 * Subscribe to env changes. Use this from non-React modules (SDK transport,
 * WS provider) to invalidate caches and rebuild connections on switch.
 * Returns an unsubscribe function.
 */
export function onTradingEnvChange(cb: (env: TradingEnv) => void): () => void {
  return subscribeTradingEnv(cb);
}

/**
 * Helper to namespace storage / cache keys by env so a user switching modes
 * never reads a key written under the other mode (e.g. an agent key approved
 * on mainnet must not be reused on testnet — HL would reject the signature).
 */
export function envScopedKey(baseKey: string, env: TradingEnv = getTradingEnvSync()): string {
  return `${baseKey}_${env}`;
}
