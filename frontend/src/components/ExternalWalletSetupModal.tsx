/**
 * ExternalWalletSetupModal — guided Hyperliquid activation for EXTERNAL wallets.
 *
 * Embedded (email/social) Privy users auto-sign the same three admin actions
 * silently and never see this modal. External (WalletConnect) users must approve
 * each signature in their own wallet app, so we walk them through the three
 * steps one at a time with short descriptions and live progress.
 *
 * Design goals baked in here:
 *   • Resumable: on open we inspect on-chain state, so steps already signed in a
 *     previous (possibly abandoned) session render as done and are skipped.
 *   • Owner-only: signing happens in the user's wallet over WalletConnect; we
 *     additionally refuse to start unless the connected wallet address matches
 *     the logged-in trading address, so a switched/other wallet can't be used.
 *   • Interruption-safe: closing mid-flow cancels before the next prompt; any
 *     already-applied step stays applied and the next open resumes cleanly.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import {
  inspectSeamlessSetupStatus,
  markTradingSetupComplete,
  runSeamlessSetupStepwise,
  type Eip1193Provider,
  type SeamlessStepId,
} from '../lib/hyperliquid';
import { isHlSigningChainError, isWalletUserRejectedRequest } from '../lib/hlWalletChain';
import { ensureExternalWalletOnHlSigningChain } from '../lib/externalWalletConnect';

type StepUiState = 'pending' | 'signing' | 'done';

interface Props {
  visible: boolean;
  /** The logged-in (SIWE) trading address. */
  tradingAddress: `0x${string}`;
  /** Address of the currently-connected WalletConnect session, for owner check. */
  connectedAddress: string | null;
  /** Resolve the active EIP-1193 provider (throws if the session expired). */
  getProvider: () => Promise<Eip1193Provider>;
  /** User dismissed without finishing. */
  onClose: () => void;
  /** All three steps confirmed on-chain. */
  onComplete: () => void;
  /**
   * Fired when a WC signing run starts/stops so the parent can keep this modal
   * mounted across walletReady flickers on return-from-wallet.
   */
  onRunningChange?: (running: boolean) => void;
}

const STEP_ORDER: SeamlessStepId[] = ['agent', 'builderFee', 'accountMode'];

export function ExternalWalletSetupModal({
  visible,
  tradingAddress,
  connectedAddress,
  getProvider,
  onClose,
  onComplete,
  onRunningChange,
}: Props) {
  const { t } = useTranslation();

  const [stepStates, setStepStates] = useState<Record<SeamlessStepId, StepUiState>>({
    agent: 'pending',
    builderFee: 'pending',
    accountMode: 'pending',
  });
  const [inspecting, setInspecting] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSignedAny, setHasSignedAny] = useState(false);
  // HL defaults every new account to Unified mode, so the account-mode step is
  // MUTED from the UI unless this account genuinely needs the signature
  // (legacy Standard/dexAbstraction accounts only). Keeps the sheet at two
  // steps for virtually all users.
  const [showAccountModeStep, setShowAccountModeStep] = useState(false);
  // All signatures submitted but HL hasn't reflected them yet — auto-poll until
  // it does instead of making the user tap retry. Re-kicks on app foreground
  // because JS timers pause while the user is inside their wallet app.
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onRunningChangeRef = useRef(onRunningChange);
  onRunningChangeRef.current = onRunningChange;

  const setRunActive = useCallback((active: boolean) => {
    runningRef.current = active;
    setRunning(active);
    onRunningChangeRef.current?.(active);
  }, []);

  // Keep parent pin alive through HL confirm polling too (after `running` ends).
  useEffect(() => {
    if (awaitingConfirm) onRunningChangeRef.current?.(true);
  }, [awaitingConfirm]);

  const applyStatusToUi = useCallback((status: Awaited<ReturnType<typeof inspectSeamlessSetupStatus>>) => {
    // Monotonic while the sheet is open: these approvals are one-way during
    // setup, but a rate-limited/failed HL inspection reports `false` — never
    // take a green tick (or an in-flight spinner) back on such a blip.
    setStepStates((prev) => ({
      agent: status.agent ? 'done' : prev.agent,
      builderFee: status.builderFee ? 'done' : prev.builderFee,
      accountMode: status.accountMode ? 'done' : prev.accountMode,
    }));
    setShowAccountModeStep((prev) => prev || !status.accountMode);
  }, []);

  /**
   * After a WC return-from-wallet race, HL may already have the signature even
   * though the local promise rejected. Wait before showing "try again".
   */
  const reconcileAfterWalletError = useCallback(async (): Promise<'complete' | 'progress' | 'none'> => {
    setAwaitingConfirm(true);
    setError(null);
    // Only count NEW on-chain progress vs what the UI already knew.
    const baseline = await new Promise<Record<SeamlessStepId, StepUiState>>((resolve) => {
      setStepStates((prev) => {
        resolve(prev);
        return prev;
      });
    });
    const deadline = Date.now() + 10_000;
    let sawNewProgress = false;
    let last = await inspectSeamlessSetupStatus(tradingAddress).catch(() => null);
    while (!cancelledRef.current) {
      if (last) {
        applyStatusToUi(last);
        if (
          (last.agent && baseline.agent !== 'done') ||
          (last.builderFee && baseline.builderFee !== 'done') ||
          (last.accountMode && baseline.accountMode !== 'done')
        ) {
          sawNewProgress = true;
        }
        if (last.allComplete) {
          setAwaitingConfirm(false);
          onRunningChangeRef.current?.(false);
          await markTradingSetupComplete().catch(() => { /* ignore */ });
          if (Platform.OS !== 'web') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          onCompleteRef.current();
          return 'complete';
        }
      }
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 1_500));
      last = await inspectSeamlessSetupStatus(tradingAddress).catch(() => last);
    }
    // New progress means a signature landed — clear spinner so Continue can
    // finish remaining steps (don't hang on confirm forever).
    setAwaitingConfirm(false);
    if (!sawNewProgress) onRunningChangeRef.current?.(false);
    return sawNewProgress ? 'progress' : 'none';
  }, [tradingAddress, applyStatusToUi]);

  const ownerMismatch =
    !!connectedAddress &&
    connectedAddress.toLowerCase() !== tradingAddress.toLowerCase();

  const markStep = useCallback((step: SeamlessStepId, state: StepUiState) => {
    setStepStates((prev) => (prev[step] === state ? prev : { ...prev, [step]: state }));
  }, []);

  // On open: reset transient state and inspect chain so already-done steps show
  // as complete (covers a user returning after a partial / abandoned setup).
  // Skip the reset while a run is active — visible can flicker when WC
  // reconnects on return-from-wallet, and resetting would drop progress.
  useEffect(() => {
    if (!visible) return;
    if (runningRef.current || awaitingConfirm) return;
    let aborted = false;
    cancelledRef.current = false;
    setError(null);
    setHasSignedAny(false);
    setStepStates({ agent: 'pending', builderFee: 'pending', accountMode: 'pending' });
    setShowAccountModeStep(false);
    setAwaitingConfirm(false);
    setInspecting(true);
    (async () => {
      try {
        const status = await inspectSeamlessSetupStatus(tradingAddress);
        if (aborted || runningRef.current) return;
        setStepStates({
          agent: status.agent ? 'done' : 'pending',
          builderFee: status.builderFee ? 'done' : 'pending',
          accountMode: status.accountMode ? 'done' : 'pending',
        });
        // Only legacy (non-unified) accounts ever see the third step.
        setShowAccountModeStep(!status.accountMode);
        if (status.allComplete) {
          onCompleteRef.current();
        }
      } catch {
        // Inspection failure is non-fatal — the run itself re-checks each step.
      } finally {
        if (!aborted) setInspecting(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [visible, tradingAddress, awaitingConfirm]);

  // Auto-confirmation loop: once signatures are in but HL hasn't reflected the
  // final state, keep re-inspecting until it does — no user taps required. An
  // AppState listener re-checks immediately on foreground since setInterval
  // ticks are frozen while the wallet app is in front.
  useEffect(() => {
    if (!visible || !awaitingConfirm) return;
    let stopped = false;
    const poll = async () => {
      try {
        const status = await inspectSeamlessSetupStatus(tradingAddress);
        if (stopped) return;
        applyStatusToUi(status);
        if (status.allComplete) {
          stopped = true;
          setAwaitingConfirm(false);
          setError(null);
          onRunningChangeRef.current?.(false);
          await markTradingSetupComplete().catch(() => { /* ignore storage errors */ });
          if (Platform.OS !== 'web') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          onCompleteRef.current();
        }
      } catch {
        // Transient network/HL error — keep polling.
      }
    };
    const interval = setInterval(() => { void poll(); }, 3000);
    void poll();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void poll();
    });
    return () => {
      stopped = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [visible, awaitingConfirm, tradingAddress, applyStatusToUi]);

  const handleRun = useCallback(async () => {
    if (runningRef.current) return;
    if (ownerMismatch) {
      setError(
        t(
          'trading.externalSetup.ownerMismatch',
          'Connected wallet does not match your account. Reconnect the wallet you signed in with, then try again.',
        ),
      );
      return;
    }
    cancelledRef.current = false;
    setRunActive(true);
    setError(null);
    let keepParentPinned = false;
    try {
      const provider = await getProvider();
      // Move the wallet onto Arbitrum BEFORE the first EIP-712 prompt — the
      // only deterministic cure for MetaMask's "active chainId is X but
      // received Y" rejection over WalletConnect. One switch per run.
      if (!cancelledRef.current) await ensureExternalWalletOnHlSigningChain();
      const result = await runSeamlessSetupStepwise({
        userWalletProvider: provider,
        userAddress: tradingAddress,
        // Foreground round-trips to the wallet pause JS timers, so give HL a
        // generous window before falling back to the auto-confirm poller.
        confirmTimeoutMs: 60_000,
        isCancelled: () => cancelledRef.current,
        onStep: (step, phase) => {
          // If the run discovers the account-mode signature IS needed (e.g.
          // the open-time inspection failed), un-mute the step so the user
          // sees what their wallet is asking them to sign.
          if (step === 'accountMode') setShowAccountModeStep(true);
          if (phase === 'signing') {
            setHasSignedAny(true);
            markStep(step, 'signing');
          } else {
            markStep(step, 'done');
          }
        },
      });
      if (result.confirmed || result.phase === 'complete') {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        onCompleteRef.current();
      } else if (!cancelledRef.current && result.phase === 'hl_confirm') {
        // Signed but HL hasn't reflected all state yet — reflect what we know
        // and hand off to the auto-confirm poller (no user tap needed).
        applyStatusToUi(result.status);
        setAwaitingConfirm(true);
        keepParentPinned = true;
      } else if (!cancelledRef.current) {
        // One step landed (or WalletConnect hung after the user signed). Unlock
        // so Continue can request the next signature instead of spinning.
        applyStatusToUi(result.status);
        keepParentPinned = true;
      }
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isWalletUserRejectedRequest(e) || /reject|denied|cancel/i.test(msg)) {
          setError(
            t('trading.externalSetup.rejected', 'Signature declined. You can resume anytime.'),
          );
        } else if (msg === '__setup_cancelled__') {
          // User closed the sheet.
        } else if (msg === '__approve_timeout__') {
          const status = await inspectSeamlessSetupStatus(tradingAddress).catch(() => null);
          if (status) applyStatusToUi(status);
          if (status?.allComplete) {
            await markTradingSetupComplete().catch(() => { /* ignore */ });
            onCompleteRef.current();
          } else if (status?.agent || status?.builderFee) {
            keepParentPinned = true;
          } else {
            setError(
              t(
                'trading.externalSetup.timeout',
                "Your wallet didn't return the signature. If you already signed, tap continue. If a request is still loading in the wallet, dismiss it, then try again.",
              ),
            );
          }
        } else if (isHlSigningChainError(e)) {
          setError(
            t(
              'trading.externalSetup.chainSwitch',
              'Your wallet is on a different network than this request. Dismiss the failed prompt, then tap continue.',
            ),
          );
        } else {
          // WC often errors on return-from-wallet even when HL already applied
          // the signature. Wait/reconcile before asking the user to retry.
          const recovered = await reconcileAfterWalletError();
          if (recovered === 'complete' || cancelledRef.current) {
            // Finished (or user closed mid-reconcile).
          } else if (recovered === 'progress') {
            // At least one step landed — leave error clear so Continue resumes.
            keepParentPinned = true;
          } else if (/session|expired|not ready|no active/i.test(msg)) {
            setError(
              t(
                'trading.externalSetup.sessionExpired',
                'Wallet session expired. Reconnect your wallet and try again.',
              ),
            );
          } else {
            setError(
              t('trading.externalSetup.failed', 'Setup could not be completed. Please try again.'),
            );
          }
        }
      }
      // Any step left mid-sign returns to pending so it can be retried —
      // unless reconcile already marked it done from on-chain state.
      setStepStates((prev) => ({
        agent: prev.agent === 'signing' ? 'pending' : prev.agent,
        builderFee: prev.builderFee === 'signing' ? 'pending' : prev.builderFee,
        accountMode: prev.accountMode === 'signing' ? 'pending' : prev.accountMode,
      }));
    } finally {
      runningRef.current = false;
      setRunning(false);
      // Don't drop the parent mount-pin during HL confirm / partial progress —
      // walletReady flickers on return-from-wallet would unmount us mid-sync.
      if (!keepParentPinned && !cancelledRef.current) {
        // awaitingConfirm may have been set synchronously above; re-read via pin effect.
        onRunningChangeRef.current?.(false);
      } else if (keepParentPinned) {
        onRunningChangeRef.current?.(true);
      }
    }
  }, [
    ownerMismatch,
    getProvider,
    tradingAddress,
    markStep,
    t,
    applyStatusToUi,
    reconcileAfterWalletError,
    setRunActive,
  ]);

  const handleClose = useCallback(() => {
    // Stop before the next prompt; a signature already in the wallet can't be
    // recalled but no further steps will be requested.
    cancelledRef.current = true;
    setRunActive(false);
    onClose();
  }, [onClose, setRunActive]);

  const stepMeta: Record<SeamlessStepId, { title: string; desc: string }> = {
    agent: {
      title: t('trading.externalSetup.step.agent.title', 'Authorize trading agent'),
      desc: t(
        'trading.externalSetup.step.agent.desc',
        'Lets the app place your orders. Your funds never leave your wallet.',
      ),
    },
    builderFee: {
      title: t('trading.externalSetup.step.builderFee.title', 'Approve trading fee'),
      desc: t(
        'trading.externalSetup.step.builderFee.desc',
        'One-time builder-fee approval, capped at 0.1%.',
      ),
    },
    accountMode: {
      title: t('trading.externalSetup.step.accountMode.title', 'Enable unified balance'),
      desc: t(
        'trading.externalSetup.step.accountMode.desc',
        'Use one USDC balance across every market.',
      ),
    },
  };

  // Account-mode is muted unless this account actually needs it — HL defaults
  // new accounts to Unified, so nearly everyone sees just two steps.
  const visibleSteps = STEP_ORDER.filter(
    (s) => s !== 'accountMode' || showAccountModeStep,
  );
  const allDone = STEP_ORDER.every((s) => stepStates[s] === 'done');
  const anyStepSigning = STEP_ORDER.some((s) => stepStates[s] === 'signing');
  const primaryLabel = hasSignedAny || error
    ? t('trading.externalSetup.resume', 'Continue in wallet')
    : t('trading.externalSetup.start', 'Continue in wallet');
  // One loader max: step spinner while the wallet prompt is open; button
  // spinner only for inspect / HL confirm (when no step is mid-sign).
  const showButtonLoader =
    inspecting || awaitingConfirm || (running && !anyStepSigning);

  const renderIcon = (state: StepUiState) => {
    if (state === 'done') {
      return <Ionicons name="checkmark-circle" size={22} color={colors.status.success} />;
    }
    if (state === 'signing') {
      // During HL confirm polling, keep the active step marked without a
      // second spinner — the button already shows the loader.
      if (awaitingConfirm) {
        return <Ionicons name="time-outline" size={22} color={colors.accent.gold} />;
      }
      return <ActivityIndicator size="small" color={colors.accent.gold} />;
    }
    return <Ionicons name="ellipse-outline" size={22} color={colors.text.tertiary} />;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('trading.externalSetup.title', 'Activate trading')}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={10}>
              <Ionicons
                name="close"
                size={22}
                color={colors.text.primary}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            {t(
              'trading.externalSetup.subtitle',
              'Approve these one-time signatures in your wallet to start trading. You can stop and resume anytime.',
            )}
          </Text>

          <View style={styles.steps}>
            {visibleSteps.map((step, idx) => {
              const state = stepStates[step];
              return (
                <View key={step} style={styles.stepRow}>
                  <View style={styles.stepIcon}>{renderIcon(state)}</View>
                  <View style={styles.stepTextWrap}>
                    <Text
                      style={[
                        styles.stepTitle,
                        state === 'done' && styles.stepTitleDone,
                      ]}
                    >
                      {idx + 1}. {stepMeta[step].title}
                    </Text>
                    <Text style={styles.stepDesc}>{stepMeta[step].desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {ownerMismatch ? (
            <Text style={styles.error}>
              {t(
                'trading.externalSetup.ownerMismatch',
                'Connected wallet does not match your account. Reconnect the wallet you signed in with, then try again.',
              )}
            </Text>
          ) : null}
          {!!error && !ownerMismatch ? <Text style={styles.error}>{error}</Text> : null}
          {awaitingConfirm && !error && !ownerMismatch ? (
            <Text style={styles.confirming}>
              {t('trading.externalSetup.confirming', 'Confirming on Hyperliquid…')}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primary, (running || inspecting || ownerMismatch || awaitingConfirm) && styles.primaryDisabled]}
            onPress={handleRun}
            disabled={running || inspecting || ownerMismatch || allDone || awaitingConfirm}
            activeOpacity={0.85}
          >
            {showButtonLoader ? (
              <ActivityIndicator color={colors.background.primary} />
            ) : (
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.background.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: colors.text.primary, fontSize: 16, fontWeight: '900' },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 14,
  },
  steps: { gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepIcon: { width: 24, alignItems: 'center', marginTop: 1 },
  stepTextWrap: { flex: 1 },
  stepTitle: { color: colors.text.primary, fontSize: 13, fontWeight: '800' },
  stepTitleDone: { color: colors.text.secondary },
  stepDesc: { color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 },
  error: { color: colors.status.error, fontSize: 12, fontWeight: '700', marginTop: 12 },
  confirming: { color: colors.accent.gold, fontSize: 12, fontWeight: '700', marginTop: 12 },
  primary: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.accent.gold,
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: colors.background.primary, fontSize: 13, fontWeight: '900' },
});
