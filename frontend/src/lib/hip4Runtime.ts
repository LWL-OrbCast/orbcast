/**
 * Platform-injected HIP-4 I/O. Expo registers SecureStore + kernel;
 * the Vite web app registers IndexedDB + Privy. `hip4.ts` never imports
 * `hlKernel` / `hyperliquid.ts`.
 */

import type { ExchangeClient } from '@nktkas/hyperliquid';

export type Hip4Runtime = {
  infoUrl: () => string;
  exchangeUrl: () => string;
  wsUrl: () => string;
  isTestnet: () => boolean;
  agentExchange: () => Promise<ExchangeClient>;
  getBuilderAddress: () => string;
  getBuilderFeeTenthsBps: () => number;
};

let runtime: Hip4Runtime | null = null;

export function registerHip4Runtime(next: Hip4Runtime): void {
  runtime = next;
}

export function getHip4Runtime(): Hip4Runtime | null {
  return runtime;
}

export function requireHip4Runtime(): Hip4Runtime {
  if (!runtime) {
    throw new Error(
      'HIP-4 runtime is not registered. Expo should import hlKernel at boot; web should call registerWebHip4Runtime.',
    );
  }
  return runtime;
}
