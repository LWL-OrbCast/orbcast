/**
 * Review ticket before a market order, then a fill/resting receipt.
 * Nested-modal safe: backdrop is its own press target (same as ConfirmModal).
 */
import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { RollingNumber } from '../RollingNumber';
import { CurrencyHint } from '../CurrencyHint';
import { YES_COLOR } from './OddsPill';
import { useTranslation } from 'react-i18next';

const CONFETTI = require('../../../assets/trade-confetti.json');

export type OrderTicketPayload = {
  tradeSide: 'buy' | 'sell';
  sideName: string;
  heading: string;
  shares: number;
  usd: number;
  px: number | null;
  accent: string;
  closingAll: boolean;
  wait?: boolean;
  fillHint?: string;
};

type Props = {
  visible: boolean;
  phase: 'confirm' | 'receipt' | 'error';
  payload: OrderTicketPayload | null;
  status?: 'filled' | 'resting' | 'unknown';
  error?: { title: string; message: string } | null;
  busy?: boolean;
  /** Confirm phase: price/shares follow the live mid. */
  livePrice?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

function formatShares(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return n.toFixed(1);
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCents(px: number | null): string {
  if (px == null || !Number.isFinite(px)) return '—';
  return `${Math.round(px * 100)}¢`;
}

function MetricRow({
  label,
  value,
  format,
  strong,
  live,
  hintUsd,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  strong?: boolean;
  live?: boolean;
  hintUsd?: number | null;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.priceLabel}>
        <Text style={styles.rowLabel}>{label}</Text>
        {live ? (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>{t('hip4.order.live')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.metricSlot}>
        <RollingNumber
          value={value}
          format={format}
          align="right"
          durationMs={400}
          emptyText="—"
          style={
            strong
              ? { ...styles.rowValue, ...styles.rowValueStrong }
              : styles.rowValue
          }
        />
        {hintUsd != null ? <CurrencyHint usd={hintUsd} /> : null}
      </View>
    </View>
  );
}

export function OrderTicketModal({
  visible,
  phase,
  payload,
  status,
  error,
  busy,
  livePrice,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const handleConfirm = useCallback(() => {
    if (phase === 'receipt' || phase === 'error') {
      onClose();
      return;
    }
    if (busy) return;
    onConfirm();
  }, [phase, busy, onConfirm, onClose]);

  if (!payload) return null;

  const isBuy = payload.tradeSide === 'buy';
  const isReceipt = phase === 'receipt';
  const isError = phase === 'error';
  const accent = payload.accent || YES_COLOR;
  const actionColor = isBuy ? accent : colors.status.error;

  const headline = isError
    ? error?.title || t('hip4.order.failed')
    : isReceipt
      ? status === 'resting'
        ? t('hip4.order.resting')
        : status === 'unknown'
          ? t('hip4.order.sent')
          : isBuy
            ? t('hip4.order.acquired')
            : t('hip4.order.sold')
      : t('hip4.order.review');

  const subhead = isError
    ? error?.message || ''
    : isReceipt
      ? status === 'resting'
        ? t('hip4.order.restingHint')
        : isBuy
          ? t('hip4.order.acquiredHint')
          : t('hip4.order.soldHint')
      : payload.wait
        ? t('hip4.order.waitHint')
        : t('hip4.order.reviewHint');

  const confirmLabel = isError
    ? t('hip4.order.gotIt')
    : isReceipt
      ? t('hip4.order.done')
      : t('hip4.order.confirm');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('hip4.order.close')}
        />
        {isReceipt && isBuy && status !== 'resting' ? (
          <View style={styles.confetti} pointerEvents="none">
            <LottieView source={CONFETTI} autoPlay loop={false} style={StyleSheet.absoluteFill} />
          </View>
        ) : null}
        <View style={styles.ticket}>
          <View style={styles.stub}>
            <View style={styles.stubLeft}>
              {isError ? (
                <View style={[styles.statusDot, { backgroundColor: colors.status.error }]}>
                  <Ionicons name="alert" size={14} color="#FFFFFF" />
                </View>
              ) : isReceipt ? (
                <View style={[styles.statusDot, { backgroundColor: actionColor }]}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
              ) : (
                <Ionicons name="ticket-outline" size={18} color={actionColor} />
              )}
              <Text style={styles.headline}>{headline}</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={10}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={t('hip4.order.close')}
            >
              <Ionicons name="close" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.market} numberOfLines={3}>
            {payload.heading}
          </Text>
          <Text style={[styles.subhead, isError ? styles.errorBody : null]}>{subhead}</Text>

          <View style={styles.perforation}>
            {Array.from({ length: 16 }).map((_, i) => (
              <View key={i} style={styles.dash} />
            ))}
          </View>

          <View style={styles.direction}>
            <View style={[styles.dirPill, { backgroundColor: `${actionColor}22` }]}>
              <Text style={[styles.dirAction, { color: actionColor }]}>
                {isBuy ? t('hip4.ticket.buy') : t('hip4.ticket.sell')}
              </Text>
            </View>
            <Text style={styles.dirSide} numberOfLines={1}>
              {payload.sideName}
            </Text>
          </View>

          <MetricRow
            label={t('hip4.order.shares')}
            value={payload.shares > 0 ? payload.shares : null}
            format={formatShares}
            strong
          />
          <MetricRow
            label={isBuy ? t('hip4.order.amount') : t('hip4.order.proceeds')}
            value={Number.isFinite(payload.usd) ? payload.usd : null}
            format={formatUsd}
            strong
            hintUsd={Number.isFinite(payload.usd) ? payload.usd : null}
          />
          <MetricRow
            label={t('hip4.order.price')}
            value={payload.px}
            format={formatCents}
            strong={!!livePrice}
            live={livePrice}
          />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('hip4.order.type')}</Text>
            <Text style={styles.rowValue}>
              {payload.wait ? t('hip4.order.wait') : t('hip4.order.fillNow')}
            </Text>
          </View>
          {payload.fillHint ? <Text style={styles.closeNote}>{payload.fillHint}</Text> : null}
          {payload.closingAll ? (
            <Text style={styles.closeNote}>{t('hip4.order.closeNote', { name: payload.sideName })}</Text>
          ) : null}

          <View style={styles.actions}>
            {!isReceipt && !isError ? (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleClose}
                disabled={!!busy}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>{t('hip4.order.cancel')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: isReceipt || isError ? colors.text.primary : actionColor },
                (isReceipt || isError) && styles.confirmBtnAlone,
                busy ? styles.confirmBusy : null,
              ]}
              onPress={handleConfirm}
              disabled={!!busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  confetti: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  ticket: {
    backgroundColor: colors.background.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 18,
    zIndex: 3,
    elevation: 10,
  },
  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stubLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.text.primary,
    flexShrink: 1,
  },
  market: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.text.primary,
  },
  subhead: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  errorBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.primary,
  },
  perforation: {
    marginVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  dash: {
    width: 7,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.border.secondary,
  },
  direction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  dirPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dirAction: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dirSide: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.text.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  rowLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  metricSlot: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  priceLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.gold,
  },
  liveTagText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.accent.goldDark,
  },
  rowValue: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text.primary,
  },
  rowValueStrong: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    lineHeight: 22,
  },
  closeNote: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  cancelText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text.secondary,
  },
  confirmBtn: {
    flex: 1.2,
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnAlone: {
    flex: 1,
  },
  confirmBusy: {
    opacity: 0.85,
  },
  confirmText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
