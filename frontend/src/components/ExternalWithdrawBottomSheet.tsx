import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  PanResponder,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { isAddress } from 'viem';

import { colors } from '../theme/colors';

const SHEET_TRAVEL = 720;
const MIN_USDC = 5;

export interface ExternalWithdrawBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  isWithdrawing: boolean;
  withdrawAddress: string;
  onWithdrawAddressChange: (value: string) => void;
  withdrawAmount: string;
  onWithdrawAmountChange: (value: string) => void;
  walletUsdcFloat: number | null;
  walletLoading: boolean;
  showTradeToWalletHint: boolean;
  transferLimit: {
    remaining: number;
    resetInSeconds: number | null;
  } | null;
  canSubmit: boolean;
  onSubmit: () => void;
  onScanPress: () => void;
  onMaxPress: () => void;
  confirmOpen: boolean;
  confirmAmount: string;
  confirmDestination: string;
  onConfirmYes: () => void;
  onConfirmNo: () => void;
}

export function ExternalWithdrawBottomSheet({
  visible,
  onClose,
  isWithdrawing,
  withdrawAddress,
  onWithdrawAddressChange,
  withdrawAmount,
  onWithdrawAmountChange,
  walletUsdcFloat,
  walletLoading,
  showTradeToWalletHint,
  transferLimit,
  canSubmit,
  onSubmit,
  onScanPress,
  onMaxPress,
  confirmOpen,
  confirmAmount,
  confirmDestination,
  onConfirmYes,
  onConfirmNo,
}: ExternalWithdrawBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const prevVisibleRef = useRef(visible);
  const [mounted, setMounted] = useState(false);

  const busy = isWithdrawing || confirmOpen;

  const finishClose = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  const animateClose = useCallback(() => {
    if (closingRef.current || busy) return;
    closingRef.current = true;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SHEET_TRAVEL,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      closingRef.current = false;
      if (finished) finishClose();
    });
  }, [slideAnim, backdropAnim, finishClose, busy]);

  /**
   * Parent cleared `visible` (e.g. open QR scanner). Must unmount immediately —
   * a 200ms animate-close leaves this Modal up while the scanner Modal opens,
   * and RN nested Modals freeze the UI.
   */
  const forceCloseFromParent = useCallback(() => {
    closingRef.current = false;
    Keyboard.dismiss();
    slideAnim.stopAnimation();
    backdropAnim.stopAnimation();
    slideAnim.setValue(SHEET_TRAVEL);
    backdropAnim.setValue(0);
    finishClose();
  }, [slideAnim, backdropAnim, finishClose]);

  const animateOpen = useCallback(() => {
    slideAnim.setValue(SHEET_TRAVEL);
    backdropAnim.setValue(0);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    if (visible && !wasVisible) {
      closingRef.current = false;
      setMounted(true);
      animateOpen();
    } else if (!visible && wasVisible && mounted) {
      forceCloseFromParent();
    }
    prevVisibleRef.current = visible;
  }, [visible, mounted, animateOpen, forceCloseFromParent]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !busy,
        onMoveShouldSetPanResponder: (_, g) => !busy && Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => {
          if (busy) return;
          if (g.dy > 0) slideAnim.setValue(g.dy);
          else slideAnim.setValue(g.dy * 0.25);
        },
        onPanResponderRelease: (_, g) => {
          if (busy) return;
          if (g.dy > 60 || g.vy > 0.45) animateClose();
          else {
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 5,
              speed: 18,
            }).start();
          }
        },
      }),
    [slideAnim, animateClose, busy],
  );

  if (!mounted) return null;

  const amountNum = Number(withdrawAmount);
  const addressInvalid = withdrawAddress.length > 0 && !isAddress(withdrawAddress);
  const belowMin = amountNum > 0 && amountNum < MIN_USDC;
  const exceedsBalance =
    walletUsdcFloat !== null && amountNum >= MIN_USDC && amountNum > walletUsdcFloat;
  const showNetNote =
    amountNum >= MIN_USDC && walletUsdcFloat !== null && amountNum <= walletUsdcFloat;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={busy ? undefined : animateClose}
    >
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) },
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={busy ? undefined : animateClose}
            disabled={busy}
          />
        </Animated.View>

        {/*
          Same keyboard path as TradeTransferBottomSheet. RN KeyboardAvoidingView
          with behavior=undefined on Android does nothing inside a Modal (keyboard
          covers inputs). KeyboardAwareScrollView from keyboard-controller lifts
          the focused field; keep offsets mild so the sheet doesn't jump too high.
        */}
        <View style={styles.kav} pointerEvents="box-none">
          <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: slideAnim }] }]}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <View {...panResponder.panHandlers} style={styles.handleArea}>
                <View style={styles.handle} />
              </View>

              <View style={styles.headerRow}>
                <Text style={styles.title}>{t('withdraw.title')}</Text>
                <TouchableOpacity
                  onPress={busy ? undefined : animateClose}
                  style={styles.closeBtn}
                  disabled={busy}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                bottomOffset={10}
                extraKeyboardSpace={0}
              >
                <Text style={styles.description} numberOfLines={2}>
                  {t('withdraw.description')}
                </Text>
                <Text style={styles.networkNote} numberOfLines={2}>
                  {t('withdraw.arbitrumNetworkNote')}
                </Text>

                {showTradeToWalletHint ? (
                  <View style={styles.hintBanner}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.accent.gold} />
                    <Text style={styles.hintText} numberOfLines={3}>
                      {t('withdraw.tradeBalanceWalletFirstHint', {
                        cta: t('deposit.toWalletBalance'),
                      })}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.inputLabel}>{t('withdraw.destinationAddress')}</Text>
                <View style={styles.addressRow}>
                  <TextInput
                    value={withdrawAddress}
                    onChangeText={onWithdrawAddressChange}
                    placeholder="0x..."
                    placeholderTextColor={colors.text.tertiary}
                    style={[
                      styles.textInput,
                      styles.addressInput,
                      addressInvalid && styles.inputError,
                    ]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isWithdrawing}
                  />
                  <View style={styles.sideColumn}>
                    <Text style={styles.sideLabel}>{t('withdraw.scanLabel')}</Text>
                    <TouchableOpacity
                      style={styles.scanButton}
                      onPress={onScanPress}
                      disabled={isWithdrawing}
                    >
                      <Ionicons name="scan-outline" size={18} color={colors.accent.gold} />
                    </TouchableOpacity>
                  </View>
                </View>
                {addressInvalid ? (
                  <Text style={styles.errorText}>{t('withdraw.invalidAddress')}</Text>
                ) : null}

                {/* Balance sits with amount (like trade-transfer "Available") — keep last
                    value while refreshing so polls don't flash "Loading…". */}
                <Text style={[styles.balanceLine, styles.amountLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {t('withdraw.walletBalance')}{' '}
                  <Text style={styles.balanceAmount}>
                    {walletUsdcFloat === null
                      ? walletLoading
                        ? t('deposit.loading')
                        : '—'
                      : `${walletUsdcFloat.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} ${t('common.USDC')}`}
                  </Text>
                </Text>

                <Text style={styles.inputLabel}>{t('withdraw.amountUsdc')}</Text>
                <View style={styles.addressRow}>
                  <TextInput
                    value={withdrawAmount}
                    onChangeText={onWithdrawAmountChange}
                    placeholder="0.00"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="decimal-pad"
                    style={[styles.textInput, styles.amountInput]}
                    editable={!isWithdrawing}
                  />
                  <View style={styles.sideColumn}>
                    <Text style={styles.sideLabel}>{t('withdraw.minUsdc')}</Text>
                    <TouchableOpacity
                      style={styles.maxButton}
                      onPress={onMaxPress}
                      disabled={isWithdrawing || walletUsdcFloat === null || walletUsdcFloat <= 0}
                    >
                      <Text style={styles.maxButtonText}>Max</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showNetNote ? (
                  <Text style={styles.netNote}>
                    {t('withdraw.recipientReceives', { amount: amountNum.toFixed(2) })}
                  </Text>
                ) : null}
                {belowMin ? (
                  <Text style={styles.errorText}>{t('withdraw.minTransfer')}</Text>
                ) : null}
                {exceedsBalance ? (
                  <Text style={styles.errorText}>{t('withdraw.exceedsBalance')}</Text>
                ) : null}
                {transferLimit && transferLimit.remaining === 0 ? (
                  <Text style={styles.errorText}>
                    {t('profile.dailyLimitReached')}
                    {transferLimit.resetInSeconds !== null && transferLimit.resetInSeconds > 0
                      ? t('withdraw.resetsIn', {
                          hours: Math.ceil(transferLimit.resetInSeconds / 3600),
                        })
                      : t('withdraw.tryAgainLater')}
                  </Text>
                ) : null}

                <TouchableOpacity
                  style={[styles.primaryButton, !canSubmit && !isWithdrawing && styles.primaryButtonDisabled]}
                  onPress={onSubmit}
                  disabled={!canSubmit}
                >
                  {isWithdrawing ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={colors.background.primary} />
                      <Text style={styles.primaryButtonText}>{t('common.processing')}</Text>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.primaryButtonText,
                        !canSubmit && styles.primaryButtonTextDisabled,
                      ]}
                    >
                      {t('withdraw.withdraw')}
                    </Text>
                  )}
                </TouchableOpacity>
              </KeyboardAwareScrollView>
            </View>
          </Animated.View>
        </View>

        {/* Confirm overlay inside this Modal — avoids flaky nested Modal stacking. */}
        {confirmOpen ? (
          <View style={styles.confirmOverlay} pointerEvents="box-none">
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onConfirmNo} />
            <View style={styles.confirmCard}>
              <View style={styles.confirmHeader}>
                <Text style={styles.confirmTitle}>{t('withdraw.confirmTitle')}</Text>
                <TouchableOpacity onPress={onConfirmNo} style={styles.closeBtn}>
                  <Ionicons name="close" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.confirmMessage}>
                {t('withdraw.confirmMessage', { amount: confirmAmount })}
              </Text>

              <View style={styles.confirmAddressBox}>
                <Text style={styles.confirmAddressLabel}>{t('withdraw.toAddress')}</Text>
                <Text style={styles.confirmAddressValue} numberOfLines={1} ellipsizeMode="middle">
                  {confirmDestination}
                </Text>
              </View>

              <View style={styles.confirmWarningBox}>
                <Ionicons name="warning-outline" size={14} color={colors.status.warning} />
                <Text style={styles.confirmWarningText}>{t('withdraw.arbitrumNetworkNote')}</Text>
              </View>

              <View style={styles.confirmActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={onConfirmNo}>
                  <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmPrimaryButton} onPress={onConfirmYes}>
                  <Text style={styles.primaryButtonText}>{t('common.confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  kav: { width: '100%' },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: colors.background.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handleArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 2,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
  },
  closeBtn: { padding: 6 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 2 },
  description: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  networkNote: {
    color: colors.accent.gold,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}55`,
    backgroundColor: `${colors.accent.gold}14`,
  },
  hintText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  balanceLine: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  balanceAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  amountLabel: { marginTop: 12 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  addressInput: { flex: 1 },
  amountInput: { flex: 1, fontFamily: undefined, fontWeight: '700' },
  inputError: { borderColor: colors.status.error },
  sideColumn: { alignItems: 'center' },
  sideLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: '500',
    marginBottom: 3,
    textAlign: 'center',
  },
  scanButton: {
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    backgroundColor: `${colors.accent.gold}15`,
  },
  maxButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.elevated,
  },
  maxButtonText: { fontSize: 12, fontWeight: '700', color: colors.accent.gold },
  netNote: { marginTop: 5, fontSize: 12, fontWeight: '700', color: colors.accent.gold },
  errorText: { marginTop: 5, fontSize: 11, color: colors.status.warning, fontWeight: '600' },
  primaryButton: {
    marginTop: 12,
    backgroundColor: colors.accent.gold,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    opacity: 0.55,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.background.primary,
    textAlign: 'center',
  },
  primaryButtonTextDisabled: { color: colors.text.tertiary },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 28,
    zIndex: 50,
    elevation: 50,
  },
  confirmCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 16,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  confirmTitle: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  confirmMessage: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  confirmAddressBox: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  confirmAddressLabel: {
    color: colors.text.tertiary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  confirmAddressValue: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  confirmWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 179, 0, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 0, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  confirmWarningText: {
    flex: 1,
    color: colors.status.warning,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  secondaryButtonText: { color: colors.text.primary, fontSize: 13, fontWeight: '800' },
  confirmPrimaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.gold,
  },
});
