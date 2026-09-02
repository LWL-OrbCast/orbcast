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
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';
import { ConfirmModal } from './ConfirmModal';

export type TradeTransferDirection = 'toTrade' | 'toWallet';

const SHEET_TRAVEL = 600;
const MIN_USDC = 5;

export interface TradeTransferBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  direction: TradeTransferDirection;
  onDirectionChange: (direction: TradeTransferDirection) => void;
  isDepositing: boolean;
  isWithdrawing: boolean;
  depositAmount: string;
  onDepositAmountChange: (value: string) => void;
  walletUsdcFloat: number | null;
  onQuickDepositFraction: (fraction: number) => void;
  canSubmitTransfer: boolean;
  onMoveToTrading: () => void;
  lastTransferError: string | null;
  isMinNotMet: boolean;
  isInsufficientWallet: boolean;
  withdrawAmount: string;
  onWithdrawAmountChange: (value: string) => void;
  tradeWithdrawableUsd: number;
  onQuickWithdrawFraction: (fraction: number) => void;
  onWithdrawMax: () => void;
  canWithdraw: boolean;
  onWithdraw: () => void;
  isInsufficientTrade: boolean;
  confirmOpen: boolean;
  confirmTitle: string;
  confirmMessage: string;
  onConfirmYes: () => void;
  onConfirmNo: () => void;
}

export function TradeTransferBottomSheet({
  visible,
  onClose,
  direction,
  onDirectionChange,
  isDepositing,
  isWithdrawing,
  depositAmount,
  onDepositAmountChange,
  walletUsdcFloat,
  onQuickDepositFraction,
  canSubmitTransfer,
  onMoveToTrading,
  lastTransferError,
  isMinNotMet,
  isInsufficientWallet,
  withdrawAmount,
  onWithdrawAmountChange,
  tradeWithdrawableUsd,
  onQuickWithdrawFraction,
  onWithdrawMax,
  canWithdraw,
  onWithdraw,
  isInsufficientTrade,
  confirmOpen,
  confirmTitle,
  confirmMessage,
  onConfirmYes,
  onConfirmNo,
}: TradeTransferBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const prevVisibleRef = useRef(visible);
  const [mounted, setMounted] = useState(false);

  const busy = isDepositing || isWithdrawing || confirmOpen;

  // Freeze Available while confirm/submit so post-tx / refetch blips don't flash
  // $0 → insufficient. Live values still update while the user is editing.
  const walletAvailAtBusyRef = useRef(walletUsdcFloat);
  const tradeAvailAtBusyRef = useRef(tradeWithdrawableUsd);
  useEffect(() => {
    if (!busy) {
      walletAvailAtBusyRef.current = walletUsdcFloat;
      tradeAvailAtBusyRef.current = tradeWithdrawableUsd;
    }
  }, [busy, walletUsdcFloat, tradeWithdrawableUsd]);
  const displayWalletUsdc = busy ? walletAvailAtBusyRef.current : walletUsdcFloat;
  const displayTradeWithdrawable = busy ? tradeAvailAtBusyRef.current : tradeWithdrawableUsd;

  const finishClose = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  const animateClose = useCallback(() => {
    if (closingRef.current || busy) return;
    closingRef.current = true;
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
      animateClose();
    }
    prevVisibleRef.current = visible;
  }, [visible, mounted, animateOpen, animateClose]);

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

  const withdrawableDisplay = (Math.floor(displayTradeWithdrawable * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

        <View style={styles.kav} pointerEvents="box-none">
          <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: slideAnim }] }]}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <View {...panResponder.panHandlers} style={styles.handleArea}>
                  <View style={styles.handle} />
                </View>

                <View style={styles.directionTabs}>
                  <TouchableOpacity
                    style={[styles.directionTab, direction === 'toTrade' && styles.directionTabActive]}
                    onPress={() => onDirectionChange('toTrade')}
                    disabled={busy}
                  >
                    <Text
                      style={[styles.directionTabText, direction === 'toTrade' && styles.directionTabTextActive]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {t('deposit.toTradeBalance')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.directionTab, direction === 'toWallet' && styles.directionTabActive]}
                    onPress={() => onDirectionChange('toWallet')}
                    disabled={busy}
                  >
                    <Text
                      style={[styles.directionTabText, direction === 'toWallet' && styles.directionTabTextActive]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {t('deposit.toWalletBalance')}
                    </Text>
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
                  {direction === 'toTrade' ? (
                    <View style={styles.block}>
                      <Text style={styles.cardLabel}>{t('deposit.transferToTrade')}</Text>
                      <Text style={styles.mutedText}>{t('deposit.approx1to2min')}</Text>
                      <Text style={styles.availableText}>
                        {t('deposit.availableInWallet')}{' '}
                        <Text style={styles.availableAmount}>
                          {displayWalletUsdc === null
                            ? '—'
                            : displayWalletUsdc.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                          {t('common.USDC')}
                        </Text>
                      </Text>

                      <View style={styles.amountRow}>
                        <TextInput
                          value={depositAmount}
                          onChangeText={onDepositAmountChange}
                          placeholder="0"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="decimal-pad"
                          style={styles.amountInput}
                          editable={!isDepositing}
                        />
                        <Text style={styles.amountSuffix}>{t('common.USDC')}</Text>
                      </View>

                      <View style={styles.quickRow}>
                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={() => onQuickDepositFraction(0.25)}
                          disabled={isDepositing}
                        >
                          <Text style={styles.quickBtnText}>25%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={() => onQuickDepositFraction(0.5)}
                          disabled={isDepositing}
                        >
                          <Text style={styles.quickBtnText}>50%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={() => onQuickDepositFraction(1)}
                          disabled={isDepositing}
                        >
                          <Text style={styles.quickBtnText}>Max</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[styles.primaryButton, !canSubmitTransfer && !isDepositing && styles.primaryButtonDisabled]}
                        onPress={onMoveToTrading}
                        disabled={!canSubmitTransfer}
                      >
                        {isDepositing ? (
                          <View style={styles.loadingRow}>
                            <ActivityIndicator color={colors.background.primary} />
                            <Text style={styles.primaryButtonText}>{t('common.processing')}</Text>
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.primaryButtonText,
                              styles.primaryButtonTextWrap,
                              !canSubmitTransfer && styles.primaryButtonTextDisabled,
                            ]}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                          >
                            {t('deposit.transferWalletToTrade')}
                          </Text>
                        )}
                      </TouchableOpacity>

                      {!!lastTransferError && (
                        <Text style={styles.errorText} numberOfLines={3}>
                          {lastTransferError}
                        </Text>
                      )}

                      {isInsufficientWallet ? (
                        <Text style={[styles.finePrint, styles.finePrintError]}>{t('deposit.notEnoughWallet')}</Text>
                      ) : isMinNotMet ? (
                        <Text style={[styles.finePrint, styles.finePrintError]}>
                          {t('deposit.minimumUsdc', { min: MIN_USDC })}
                        </Text>
                      ) : (
                        <Text style={styles.finePrint}>{t('deposit.freeNoFees', { min: MIN_USDC })}</Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.block}>
                      <Text style={styles.cardLabel}>{t('deposit.transferToWallet')}</Text>
                      <Text style={styles.mutedText}>{t('deposit.moveFundsBack')}</Text>
                      <Text style={styles.availableText}>
                        {t('deposit.transferable')}{' '}
                        <Text style={styles.availableAmount}>
                          ${withdrawableDisplay} {t('common.USDC')}
                        </Text>
                      </Text>

                      <View style={styles.amountRow}>
                        <TextInput
                          value={withdrawAmount}
                          onChangeText={onWithdrawAmountChange}
                          placeholder="0"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="decimal-pad"
                          style={styles.amountInput}
                          editable={!isWithdrawing}
                        />
                        <Text style={styles.amountSuffix}>{t('common.USDC')}</Text>
                      </View>

                      <View style={styles.quickRow}>
                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={() => onQuickWithdrawFraction(0.25)}
                          disabled={isWithdrawing}
                        >
                          <Text style={styles.quickBtnText}>25%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={() => onQuickWithdrawFraction(0.5)}
                          disabled={isWithdrawing}
                        >
                          <Text style={styles.quickBtnText}>50%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={onWithdrawMax}
                          disabled={isWithdrawing || displayTradeWithdrawable <= 0}
                        >
                          <Text style={styles.quickBtnText}>Max</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[styles.primaryButton, !canWithdraw && !isWithdrawing && styles.primaryButtonDisabled]}
                        onPress={onWithdraw}
                        disabled={!canWithdraw}
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
                              styles.primaryButtonTextWrap,
                              !canWithdraw && styles.primaryButtonTextDisabled,
                            ]}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                          >
                            {t('deposit.transferTradeToWallet')}
                          </Text>
                        )}
                      </TouchableOpacity>

                      <Text style={styles.finePrint}>{t('deposit.withdrawalFee')}</Text>

                      {isInsufficientTrade ? (
                        <Text style={[styles.finePrint, styles.finePrintError]}>{t('deposit.notEnoughTrade')}</Text>
                      ) : null}
                    </View>
                  )}
                </KeyboardAwareScrollView>
            </View>
          </Animated.View>
        </View>

        <ConfirmModal
          visible={confirmOpen}
          title={confirmTitle}
          message={confirmMessage}
          onConfirm={onConfirmYes}
          onCancel={onConfirmNo}
        />
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
    paddingVertical: 8,
    marginBottom: 2,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.primary,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 2 },
  directionTabs: {
    flexDirection: 'row',
    gap: 8,
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.primary,
    marginBottom: 10,
  },
  directionTab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionTabActive: {
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  directionTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.secondary,
    lineHeight: 15,
    textAlign: 'center',
  },
  directionTabTextActive: { color: colors.text.primary },
  block: {
    backgroundColor: colors.background.elevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 18,
  },
  mutedText: { fontSize: 12, color: colors.text.secondary, lineHeight: 16, marginTop: 2 },
  availableText: { marginTop: 6, fontSize: 11, color: colors.text.secondary, lineHeight: 16 },
  availableAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  finePrint: { marginTop: 8, fontSize: 11, color: colors.text.tertiary, lineHeight: 15 },
  finePrintError: { color: colors.status.warning, fontWeight: '800' },
  errorText: { marginTop: 8, fontSize: 11, color: colors.status.warning, textAlign: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  amountRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    paddingVertical: 0,
  },
  amountSuffix: { fontSize: 12, color: colors.text.secondary, marginLeft: 8, fontWeight: '700' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.card,
    alignItems: 'center',
  },
  quickBtnText: { fontSize: 12, fontWeight: '700', color: colors.text.primary },
  primaryButton: {
    marginTop: 10,
    backgroundColor: colors.accent.gold,
    paddingVertical: 12,
    paddingHorizontal: 8,
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
  primaryButtonText: { fontSize: 13, fontWeight: '800', color: colors.background.primary, textAlign: 'center' },
  primaryButtonTextWrap: { width: '100%' },
  primaryButtonTextDisabled: { color: colors.text.tertiary },
});
