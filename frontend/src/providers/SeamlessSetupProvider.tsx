import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/appStore';
import {
  getHyperliquidTradingState,
  isBuilderFeeApproved,
  isPooledAccountMode,
  isTradingSetupComplete,
  markTradingSetupComplete,
} from '../lib/hyperliquid';
import { useSeamlessAutoSetup } from '../hooks/useSeamlessAutoSetup';
import { useActiveEthereumWallet } from '../hooks/useActiveEthereumWallet';
import { getExternalWalletConnectAddress } from '../lib/externalWalletConnect';
import { ExternalWalletSetupModal } from '../components/ExternalWalletSetupModal';

interface SeamlessSetupContextValue {
  /** A silent attempt is currently running — suppress the fallback modal. */
  autoSetupInFlight: boolean;
  /** Silent first-run exhausted its retries — allow the fallback modal. */
  autoSetupFailed: boolean;
  /** Provider-authoritative setup flag (agent + builder fee + pooled mode). */
  setupComplete: boolean;
  /** Suspend the silent path while a screen runs a manual setup (ref-counted). */
  pauseAutoSetup: () => void;
  /** Release one manual-setup suspension. */
  resumeAutoSetup: () => void;
  /** External wallet users must approve signatures in their wallet app. */
  isExternalWalletUser: boolean;
  /**
   * Open the guided external-wallet activation modal (external users only).
   * Screens call this instead of their embedded fallback modal when an external
   * user attempts to trade before setup is complete.
   */
  requestExternalSetup: () => void;
}

const SeamlessSetupContext = createContext<SeamlessSetupContextValue>({
  autoSetupInFlight: false,
  autoSetupFailed: false,
  setupComplete: false,
  pauseAutoSetup: () => {},
  resumeAutoSetup: () => {},
  isExternalWalletUser: false,
  requestExternalSetup: () => {},
});

export function SeamlessSetupProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const tradingEnv = useAppStore((s) => s.tradingEnv);
  const { wallet: activeWallet, address: activeAddress, isEmbedded, isExternal, isReady: walletReady } =
    useActiveEthereumWallet();
  const tradingAddress = (activeAddress || '') as `0x${string}`;

  const {
    data: tradingState,
    refetch: refetchTradingState,
    isLoading: tradingStateLoading,
  } = useQuery({
    queryKey: ['hl_trading_state', tradingEnv, tradingAddress],
    queryFn: () => getHyperliquidTradingState(tradingAddress),
    enabled: !!tradingAddress && isAuthenticated && walletReady,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
  const tradingStateReady = !tradingStateLoading && !!tradingState;

  const [pauseCount, setPauseCount] = useState(0);
  const pauseAutoSetup = useCallback(() => setPauseCount((c) => c + 1), []);
  const resumeAutoSetup = useCallback(() => setPauseCount((c) => Math.max(0, c - 1)), []);
  const paused = pauseCount > 0;

  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    let mounted = true;
    isTradingSetupComplete()
      .then((complete) => { if (mounted) setSetupComplete(complete); })
      .catch(() => { /* ignore storage errors */ });
    return () => { mounted = false; };
  }, [tradingEnv, tradingAddress]);

  useEffect(() => {
    if (!tradingStateReady) return;
    if (!tradingState?.isAgentActive) { setSetupComplete(false); return; }
    if (!tradingAddress) return;
    if (tradingState?.accountAbstractionMode == null) return;
    let aborted = false;
    (async () => {
      try {
        const approved = await isBuilderFeeApproved(tradingAddress);
        if (aborted) return;
        if (approved && isPooledAccountMode(tradingState?.accountAbstractionMode)) {
          setSetupComplete(true);
          markTradingSetupComplete().catch(() => { /* ignore storage errors */ });
        } else {
          setSetupComplete(false);
        }
      } catch {
        // Network failure → leave as-is.
      }
    })();
    return () => { aborted = true; };
  }, [tradingStateReady, tradingState?.isAgentActive, tradingState?.accountAbstractionMode, tradingAddress]);

  const handleAutoSetupComplete = useCallback(() => setSetupComplete(true), []);

  // Guided activation modal for EXTERNAL wallet users. `dismissed` lets a user
  // close it; it re-arms on a new wallet or when a screen calls
  // `requestExternalSetup` (e.g. an order attempt before setup is complete).
  const [externalDismissed, setExternalDismissed] = useState(false);
  // While a WalletConnect round-trip is in flight, WC `isConnected` often
  // flickers false on return-from-wallet. If we unmount the modal then, the
  // in-flight approveAgent/approveBuilderFee promise is orphaned (SIWE login
  // does NOT have this bug — login.tsx stays mounted). Pin the modal open for
  // the whole run so HL still receives the signed action after the user returns.
  const [externalSetupBusy, setExternalSetupBusy] = useState(false);
  useEffect(() => {
    // Re-arm whenever the active wallet changes (new login / switched wallet).
    setExternalDismissed(false);
    setExternalSetupBusy(false);
  }, [tradingAddress]);
  const requestExternalSetup = useCallback(() => setExternalDismissed(false), []);
  const handleExternalComplete = useCallback(() => {
    setSetupComplete(true);
    setExternalDismissed(false);
    setExternalSetupBusy(false);
    refetchTradingState();
  }, [refetchTradingState]);

  const showExternalSetup =
    isExternal &&
    !!activeWallet &&
    !!tradingAddress &&
    // Once signing has started, keep showing even if walletReady / trading
    // state briefly drop while returning from MetaMask/Rainbow.
    (externalSetupBusy ||
      (walletReady &&
        tradingStateReady &&
        !!tradingState?.hasBalance &&
        !paused)) &&
    !setupComplete &&
    !externalDismissed;

  // Keep the modal component mounted for the whole busy run so React does not
  // destroy in-flight state when `showExternalSetup` flickers.
  const mountExternalModal =
    isExternal &&
    !!activeWallet &&
    !!tradingAddress &&
    !setupComplete &&
    (showExternalSetup || externalSetupBusy);

  // Silent auto-setup only for Privy embedded wallets (email/social). External wallets
  // sign approveAgent / approveBuilderFee in their wallet app per Privy SIWE flow.
  const { autoSetupInFlight, autoSetupFailed } = useSeamlessAutoSetup({
    embeddedWallet: activeWallet,
    embeddedAddress: tradingAddress,
    tradingStateReady,
    hasBalance: tradingState?.hasBalance,
    agentValidUntil: tradingState?.agentValidUntil ?? null,
    setupComplete,
    paused,
    silentEnabled: isEmbedded,
    refetchTradingState,
    onSetupComplete: handleAutoSetupComplete,
  });

  const value = useMemo<SeamlessSetupContextValue>(
    () => ({
      autoSetupInFlight,
      // External users never run silent setup — surface the manual modal when needed.
      autoSetupFailed: isExternal ? true : autoSetupFailed,
      setupComplete,
      pauseAutoSetup,
      resumeAutoSetup,
      isExternalWalletUser: isExternal,
      requestExternalSetup,
    }),
    [
      autoSetupInFlight,
      autoSetupFailed,
      setupComplete,
      pauseAutoSetup,
      resumeAutoSetup,
      isExternal,
      requestExternalSetup,
    ],
  );

  return (
    <SeamlessSetupContext.Provider value={value}>
      {children}
      {mountExternalModal && activeWallet ? (
        <ExternalWalletSetupModal
          visible={showExternalSetup}
          tradingAddress={tradingAddress}
          connectedAddress={getExternalWalletConnectAddress()}
          getProvider={activeWallet.getProvider}
          onClose={() => {
            setExternalSetupBusy(false);
            setExternalDismissed(true);
          }}
          onComplete={handleExternalComplete}
          onRunningChange={setExternalSetupBusy}
        />
      ) : null}
    </SeamlessSetupContext.Provider>
  );
}

export function useSeamlessSetup(): SeamlessSetupContextValue {
  return useContext(SeamlessSetupContext);
}
