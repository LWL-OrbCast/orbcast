/**
 * HIP-4 account stream: one socket, spot balances only.
 * Perp/HIP-3 channels from the other project must not be subscribed here.
 */
import React, { useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useAppStore } from '../store/appStore';
import {
  HyperliquidAccountStreamContext,
  HyperliquidSpotStateContext,
  useHyperliquidAccountStreamController,
} from '../lib/useHyperliquidAccountStream';
import { resolveTradingAddress } from '../lib/tradingBook';

type Hex = `0x${string}`;

export function HyperliquidAccountStreamProvider({ children }: { children: ReactNode }) {
  const { walletAddress } = useAuth();
  const activeTradingBook = useAppStore((s) => s.activeTradingBook);

  const user = useMemo((): Hex | undefined => {
    const master =
      walletAddress && walletAddress.startsWith('0x') ? (walletAddress as Hex) : null;
    return resolveTradingAddress(activeTradingBook, master) ?? undefined;
  }, [walletAddress, activeTradingBook]);

  const stream = useHyperliquidAccountStreamController(user);

  return (
    <HyperliquidAccountStreamContext.Provider value={stream}>
      <HyperliquidSpotStateContext.Provider value={stream.spotState ?? null}>
        {children}
      </HyperliquidSpotStateContext.Provider>
    </HyperliquidAccountStreamContext.Provider>
  );
}
