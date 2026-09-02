export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/$/, '');
export const API_BASE = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';
export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID ?? '').trim();
/** Optional. Privy dashboard → Clients → the **Web** client, not the Expo/mobile one. */
export const PRIVY_CLIENT_ID = (import.meta.env.VITE_PRIVY_CLIENT_ID ?? '').trim();
export const IS_TESTNET = (import.meta.env.VITE_HL_NETWORK ?? 'mainnet').trim() === 'testnet';

const envBuilder = (import.meta.env.VITE_HL_BUILDER_ADDRESS ?? '').trim();
export const BUILDER_ADDRESS = (
  envBuilder || '0x29a1D36DaEE6B0E0Dd4873dd964677000B6e23EB'
) as `0x${string}`;

const envFee = Number(import.meta.env.VITE_HL_BUILDER_FEE_TENTHS_BPS);
export const BUILDER_FEE_TENTHS = Number.isFinite(envFee) && envFee > 0 ? envFee : 30;
export const BUILDER_MAX_FEE_RATE = '0.1%' as const;

export const ARBITRUM_RPC =
  (import.meta.env.VITE_ARBITRUM_RPC_URL ?? '').trim() || 'https://arb1.arbitrum.io/rpc';
export const ARBITRUM_CHAIN_ID = 42161;
export const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
export const HL_BRIDGE2 = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7' as const;
