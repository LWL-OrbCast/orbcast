/**
 * useSeamlessAutoSetup — runs Hyperliquid one-tap trading setup SILENTLY.
 *
 * Background: with Privy embedded wallets every approveAgent / approveBuilderFee
 * / userSetAbstraction signature is auto-signed (no wallet popup). The old
 * "Activate seamless trading" modal was therefore a UX choice, not a technical
 * requirement. The builder fee is disclosed in the ToS, so we can enable
 * trading without any prompt.
 *
 * This hook does two things, both invisible to the user:
 *   1. First-run  — the moment the user first has a Trade Balance and setup
 *      isn't complete, it runs `runSeamlessTradingSetup` in the background.
 *   2. Renewal    — when the active agent is within `RENEW_WINDOW_MS` of its
 *      `validUntil`, it silently re-approves so the ~180-day HL agent expiry
 *      never surfaces a re-prompt at order time.
 *
 * The on-screen modal becomes a FALLBACK: it should only show after the silent
 * first-run has failed `MAX_FIRSTRUN_ATTEMPTS` times in a row. The first
 * attempt right after a fresh login often fails transiently (Privy provider
 * still hydrating, HL not yet reflecting state) — so we retry quietly a few
 * times before ever surfacing the modal. Renewal failures are swallowed: the
 * existing agent keeps working until its real expiry and we retry next session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hex } from 'viem';
import { runSeamlessTradingSetup, markTradingSetupComplete, type Eip1193Provider } from '../lib/hyperliquid';

/** Renew when the agent has this long (or less) until expiry. */
const RENEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Quiet retries before the modal fallback is allowed to show. */
const MAX_FIRSTRUN_ATTEMPTS = 3;
/** Spacing between quiet first-run retries (post-login warm-up window). */
const FIRSTRUN_RETRY_MS = 8_000;
/** Minimum spacing between renewal attempts while conditions hold. */
const RENEWAL_COOLDOWN_MS = 60_000;

function devLog(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[seamless]', ...args);
  }
}

interface EmbeddedWalletLike {
  getProvider: () => Promise<unknown>;
}

export interface UseSeamlessAutoSetupArgs {
  embeddedWallet: EmbeddedWalletLike | undefined;
  embeddedAddress: string;
  /** Gate work until REST trading state has shipped (avoids transient runs). */
  tradingStateReady: boolean;
  hasBalance: boolean | undefined;
  /** From REST trading state — agent expiry (unix ms) or null. */
  agentValidUntil: number | null | undefined;
  /** Local setupComplete flag (agent + builder fee + pooled mode). */
  setupComplete: boolean;
  /**
   * Suspend the silent path while a manual setup is running (the fallback
   * modal's "Activate" button). Prevents two concurrent rotate+approve flows
   * from racing the stored agent key out of sync.
   */
  paused?: boolean;
  /** When false, external-wallet users skip silent auto-setup (they sign in-wallet). */
  silentEnabled?: boolean;
  refetchTradingState: () => unknown;
  /** Called after a confirmed silent setup so the screen can flip its flag. */
  onSetupComplete: () => void;
}

export interface UseSeamlessAutoSetupResult {
  /** A silent attempt is currently running — suppress the fallback modal. */
  autoSetupInFlight: boolean;
  /** Silent first-run exhausted its retries — allow the fallback modal. */
  autoSetupFailed: boolean;
}

export function useSeamlessAutoSetup({
  embeddedWallet,
  embeddedAddress,
  tradingStateReady,
  hasBalance,
  agentValidUntil,
  setupComplete,
  paused = false,
  silentEnabled = true,
  refetchTradingState,
  onSetupComplete,
}: UseSeamlessAutoSetupArgs): UseSeamlessAutoSetupResult {
  const [autoSetupInFlight, setAutoSetupInFlight] = useState(false);
  const [autoSetupFailed, setAutoSetupFailed] = useState(false);
  const inFlightRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const firstRunFailuresRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // Reset attempt bookkeeping when the wallet/account changes (new user).
  useEffect(() => {
    lastAttemptRef.current = 0;
    firstRunFailuresRef.current = 0;
    clearRetry();
    setAutoSetupFailed(false);
  }, [embeddedAddress, clearRetry]);

  const onSetupCompleteRef = useRef(onSetupComplete);
  onSetupCompleteRef.current = onSetupComplete;
  const refetchRef = useRef(refetchTradingState);
  refetchRef.current = refetchTradingState;
  // Hold a ref to runAttempt so the retry timer can call the latest version.
  const runAttemptRef = useRef<((kind: 'firstRun' | 'renewal', opts?: { force?: boolean }) => Promise<void>) | null>(null);

  const runAttempt = useCallback(
    async (kind: 'firstRun' | 'renewal', opts?: { force?: boolean }) => {
      if (inFlightRef.current || !embeddedWallet || !embeddedAddress) return;
      const cooldown = kind === 'firstRun' ? FIRSTRUN_RETRY_MS : RENEWAL_COOLDOWN_MS;
      if (!opts?.force && Date.now() - lastAttemptRef.current < cooldown) return;
      lastAttemptRef.current = Date.now();
      inFlightRef.current = true;
      setAutoSetupInFlight(true);
      devLog(`${kind} attempt starting`, { attempt: firstRunFailuresRef.current + 1 });
      try {
        const provider = (await embeddedWallet.getProvider()) as unknown as Eip1193Provider;
        const confirmed = await runSeamlessTradingSetup({
          userWalletProvider: provider,
          userAddress: embeddedAddress as Hex,
        });
        refetchRef.current?.();
        if (confirmed) {
          firstRunFailuresRef.current = 0;
          clearRetry();
          await markTradingSetupComplete().catch(() => { /* ignore storage errors */ });
          onSetupCompleteRef.current?.();
          setAutoSetupFailed(false);
          devLog(`${kind} confirmed ✓`);
        } else if (kind === 'firstRun') {
          handleFirstRunFailure('confirm-timeout');
        }
      } catch (err) {
        // Hard failure during signing/submit. Only first-run can fall back to
        // the modal (after retries); a failed renewal keeps the still-valid
        // agent and retries next session.
        if (kind === 'firstRun') handleFirstRunFailure(err);
        else devLog('renewal failed (ignored)', err);
      } finally {
        inFlightRef.current = false;
        setAutoSetupInFlight(false);
      }

      function handleFirstRunFailure(reason: unknown) {
        firstRunFailuresRef.current += 1;
        const count = firstRunFailuresRef.current;
        devLog(`firstRun failed (${count}/${MAX_FIRSTRUN_ATTEMPTS})`, reason);
        if (count >= MAX_FIRSTRUN_ATTEMPTS) {
          // Out of quiet retries — surface the manual modal fallback.
          setAutoSetupFailed(true);
          return;
        }
        // Schedule another quiet retry; force past the cooldown.
        clearRetry();
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void runAttemptRef.current?.('firstRun', { force: true });
        }, FIRSTRUN_RETRY_MS);
      }
    },
    [embeddedWallet, embeddedAddress, clearRetry],
  );
  runAttemptRef.current = runAttempt;

  // Cancel pending retries once setup completes or the manual flow takes over.
  useEffect(() => {
    if (setupComplete || paused) clearRetry();
  }, [setupComplete, paused, clearRetry]);

  // Clear any pending retry on unmount.
  useEffect(() => clearRetry, [clearRetry]);

  useEffect(() => {
    if (!silentEnabled) return;
    if (paused) return;
    if (!tradingStateReady || !embeddedWallet || !embeddedAddress) return;

    const needsFirstRun = !setupComplete && !!hasBalance;
    const needsRenewal =
      setupComplete &&
      agentValidUntil != null &&
      agentValidUntil - Date.now() <= RENEW_WINDOW_MS;

    if (needsFirstRun) {
      void runAttempt('firstRun');
    } else if (needsRenewal) {
      void runAttempt('renewal');
    }
  }, [
    silentEnabled,
    paused,
    tradingStateReady,
    embeddedWallet,
    embeddedAddress,
    setupComplete,
    hasBalance,
    agentValidUntil,
    runAttempt,
  ]);

  return { autoSetupInFlight, autoSetupFailed };
}
