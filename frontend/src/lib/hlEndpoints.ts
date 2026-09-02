/**
 * Pure Hyperliquid URLs — no Zustand, no AsyncStorage, safe for Vite.
 * Expo wraps these in `hlEnv.ts` with the live trading-env flag.
 */

export const HL_MAINNET_API_URL = 'https://api.hyperliquid.xyz';
export const HL_TESTNET_API_URL = 'https://api.hyperliquid-testnet.xyz';
export const HL_MAINNET_WS_URL = 'wss://api.hyperliquid.xyz/ws';
export const HL_TESTNET_WS_URL = 'wss://api.hyperliquid-testnet.xyz/ws';

export const HL_USER_SIGNED_CHAIN_ID_MAINNET = '0xa4b1' as const;
export const HL_USER_SIGNED_CHAIN_ID_TESTNET = '0x66eee' as const;

export function hlApiUrl(testnet: boolean): string {
  return testnet ? HL_TESTNET_API_URL : HL_MAINNET_API_URL;
}

export function hlInfoUrl(testnet: boolean): string {
  return `${hlApiUrl(testnet)}/info`;
}

export function hlExchangeUrl(testnet: boolean): string {
  return `${hlApiUrl(testnet)}/exchange`;
}

export function hlWsUrl(testnet: boolean): string {
  return testnet ? HL_TESTNET_WS_URL : HL_MAINNET_WS_URL;
}

export function hlUserSignedChainId(testnet: boolean): `0x${string}` {
  return testnet ? HL_USER_SIGNED_CHAIN_ID_TESTNET : HL_USER_SIGNED_CHAIN_ID_MAINNET;
}
