/**
 * Nested confirm/alert dialog. Safe inside another Modal on native: the
 * backdrop is a separate absolute-fill target so Confirm is not eaten by cancel.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';

export type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** `alert` = single dismiss button (no Cancel). Default `confirm`. */
  mode?: 'confirm' | 'alert';
  confirmLabel?: string;
  /** Optional “do not ask again” — never required to continue. */
  dontAskAgain?: boolean;
  onToggleDontAskAgain?: () => void;
  dontAskAgainLabel?: string;
};

export function ConfirmModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  mode = 'confirm',
  confirmLabel,
  dontAskAgain,
  onToggleDontAskAgain,
  dontAskAgainLabel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const confirmLockRef = useRef(false);
  const isAlert = mode === 'alert';

  useEffect(() => {
    if (!visible) confirmLockRef.current = false;
  }, [visible]);

  const handleConfirm = useCallback(() => {
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    if (confirmLockRef.current) return;
    onCancel();
  }, [onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              onPress={handleCancel}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel', 'Cancel')}
            >
              <Ionicons name="close" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {onToggleDontAskAgain ? (
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={onToggleDontAskAgain}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!dontAskAgain }}
            >
              <View style={[styles.checkbox, dontAskAgain && styles.checkboxChecked]}>
                {dontAskAgain ? (
                  <Ionicons name="checkmark" size={14} color={colors.background.primary} />
                ) : null}
              </View>
              <Text style={styles.checkboxText}>
                {dontAskAgainLabel ?? t('trading.doNotAskAgain', 'Do not ask again')}
              </Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.actions}>
            {!isAlert ? (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
                <Text style={styles.cancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.confirmBtn, isAlert && styles.confirmBtnAlone]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmText}>
                {confirmLabel ??
                  (isAlert ? t('common.gotIt', 'Got it') : t('common.confirm', 'Confirm'))}
              </Text>
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
    paddingHorizontal: 28,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 16,
    gap: 12,
    zIndex: 1,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.elevated,
  },
  checkboxChecked: {
    backgroundColor: colors.accent.gold,
    borderColor: colors.accent.gold,
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.accent.gold,
  },
  confirmBtnAlone: {
    flex: 1,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.background.primary,
  },
});
