/**
 * ProfileAccountInfoSheet — wallet profile identifiers (creation date, email, address).
 *
 * Opened from the Wallet Balance card on /profile. Mirrors the Cash tab Account info chip.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Platform,
  PanResponder,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_TRAVEL = SCREEN_HEIGHT;

export interface ProfileAccountInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  email?: string | null;
  walletAddress?: string | null;
  /** ISO timestamp from user_onboarding.created_at (falls back to Privy createdAt). */
  accountCreatedAt?: string | Date | null;
}

function formatAccountCreatedDate(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function ProfileAccountInfoSheet({
  visible,
  onClose,
  email,
  walletAddress,
  accountCreatedAt,
}: ProfileAccountInfoSheetProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.min(windowHeight * 0.92, windowHeight - insets.top - 8);
  const slideAnim = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const prevVisibleRef = useRef(visible);
  const [mounted, setMounted] = useState(false);

  const createdLabel = useMemo(() => {
    if (!accountCreatedAt) return null;
    return formatAccountCreatedDate(accountCreatedAt, i18n.language);
  }, [accountCreatedAt, i18n.language]);

  const finishClose = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
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
  }, [slideAnim, backdropAnim, finishClose]);

  const animateOpen = useCallback(() => {
    slideAnim.setValue(SHEET_TRAVEL);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 240,
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
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) slideAnim.setValue(g.dy);
          else slideAnim.setValue(g.dy * 0.25);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 80 || g.vy > 0.45) animateClose();
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
    [slideAnim, animateClose],
  );

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={animateClose}>
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={animateClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: sheetMaxHeight,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
            <View style={styles.header}>
              <Text style={styles.title}>{t('cash.accountInfoTitle')}</Text>
              <TouchableOpacity onPress={animateClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.detailsCard}>
              {createdLabel ? (
                <DetailRow label={t('profile.accountInfoCreationDate')} value={createdLabel} />
              ) : null}
              {email ? (
                <>
                  {createdLabel ? <View style={styles.divider} /> : null}
                  <DetailRow
                    label={t('profile.accountInfoEmail')}
                    value={email}
                    copyValue={email}
                  />
                </>
              ) : null}
              {walletAddress ? (
                <>
                  {createdLabel || email ? <View style={styles.divider} /> : null}
                  <DetailRow
                    label={t('cash.accountInfoWallet')}
                    value={walletAddress}
                    mono
                    multiline
                    copyValue={walletAddress}
                  />
                </>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const COPY_FEEDBACK_MS = 2000;

function DetailRow({
  label,
  value,
  copyValue,
  mono,
  multiline,
}: {
  label: string;
  value?: string;
  /** When set, shows a copy button that briefly flips to a green checkmark on success. */
  copyValue?: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!copyValue) return;
    await Clipboard.setStringAsync(copyValue);
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [copyValue]);

  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text
          style={[
            styles.detailValue,
            mono && {
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              letterSpacing: 0.3,
            },
          ]}
          numberOfLines={multiline ? 4 : 2}
        >
          {value}
        </Text>
      </View>
      {copyValue ? (
        <TouchableOpacity onPress={handleCopy} hitSlop={10} style={styles.detailCopyBtn}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? colors.status.success : colors.text.secondary}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    backgroundColor: colors.background.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 0,
    width: '100%',
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border.primary,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text.primary,
  },
  detailsCard: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 20,
  },
  detailCopyBtn: {
    paddingTop: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.primary,
  },
});
