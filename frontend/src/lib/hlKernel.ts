/**
 * Live HL kernel for this app: agent, builder, setup, withdraw, balances.
 *
 * Perp / HIP-3 order placement was removed from hyperliquid.ts. HIP-4 orders
 * go through hip4.ts. This module re-exports the wallet/setup surface and
 * registers the Expo HIP-4 runtime (SecureStore agent + builder) so hip4.ts
 * does not import Expo-only code (Vite-safe catalog reads).
 */

import { ExchangeClient } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { getHlExchangeUrl, getHlInfoUrl, getHlWsUrl, shouldUseTestnetTransport } from './hlEnv';
import { registerHip4Runtime } from './hip4Runtime';
import {
  ensureAgentKey,
  getBuilderAddress,
  getBuilderFeeTenthsBps,
  getHlTransport,
} from './hyperliquid';

registerHip4Runtime({
  infoUrl: getHlInfoUrl,
  exchangeUrl: getHlExchangeUrl,
  wsUrl: getHlWsUrl,
  isTestnet: shouldUseTestnetTransport,
  agentExchange: async () => {
    const { agentPrivateKey } = await ensureAgentKey();
    return new ExchangeClient({
      transport: getHlTransport(),
      wallet: privateKeyToAccount(agentPrivateKey),
    });
  },
  getBuilderAddress,
  getBuilderFeeTenthsBps,
});

export {
  HL_BUILDER_ADDRESS,
  HL_BUILDER_FEE_TENTHS_BPS,
  HL_BUILDER_MAX_FEE_RATE,
  getBuilderAddress,
  getBuilderFeeTenthsBps,
  getSpotBuilderFeeTenthsBps,
  getHlTransport,
  getHlInfoClient,
  ensureAgentKey,
  rotateAgentKey,
  getStoredAgentAddress,
  getApprovedBuilderFeeTenths,
  isBuilderFeeApproved,
  approveNamedAgent,
  revokeNamedAgent,
  setupTradingAccount,
  runSeamlessTradingSetup,
  withdrawFromHyperliquid,
  createViemJsonRpcAccount,
  computeSpotBalanceUsd,
  getHyperliquidTradingState,
  getSpotMetaAndAssetCtxsCached,
  isPooledAccountMode,
} from './hyperliquid';
