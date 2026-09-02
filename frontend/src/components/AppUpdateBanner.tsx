/**
 * Soft in-app update banner.
 *
 * App-wide overlay strip (does not reflow screen layout) shown when the backend
 * `app_version_policy` reports the installed build is behind `latest_version`.
 * Dismissible — stays hidden until a newer version ships. Update opens the
 * Play Store / App Store listing (not Google's in-app installer — that flow
 * can stall on "Installing").
 *
 * Mounted once globally in `_layout.tsx`. Returns null on web and whenever there
 * is nothing to show, so it is safe to render unconditionally.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { cardShadow } from '../theme/shadows';
import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck';
import { useAppStore } from '../store/appStore';
import { useFundsPendingStore } from '../store/fundsPendingStore';

export function AppUpdateBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { visible, message, openUpdate, dismiss, isUpdating } = useAppUpdateCheck();

  // Defer to the other top-of-screen banners so two strips never stack
  // awkwardly above each other. The demo strip owns the top slot in demo mode
  // (same rule the funds banner uses), and the funds banner takes priority
  // whenever a transfer is in flight since that's time-sensitive money movement.
  const tradingEnv = useAppStore((s) => s.tradingEnv);
  const hlDeposit = useFundsPendingStore((s) => s.hlDeposit);
  const hlWithdraw = useFundsPendingStore((s) => s.hlWithdraw);

  const demoActive = tradingEnv === 'demo';
  const fundsActive = !!hlDeposit || !!hlWithdraw;

  // Keep the login modal clean (matches how the funds banner hides there).
  const shouldShow =
    visible && pathname !== '/login' && !demoActive && !fundsActive;

  const [rendered, setRendered] = React.useState(false);
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shouldShow) {
      setRendered(true);
      Animated.timing(appear, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(appear, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [shouldShow, rendered, appear]);

  if (Platform.OS === 'web' || !rendered) return null;

  const translateY = appear.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingTop: insets.top + 6 }]}
    >
      <Animated.View style={[styles.banner, { opacity: appear, transform: [{ translateY }] }]}>
        <Ionicons name="arrow-up-circle" size={18} color={colors.accent.goldDark} />
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {message || t('appUpdate.title')}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.updateBtn, isUpdating && styles.updateBtnDisabled]}
          onPress={() => void openUpdate()}
          disabled={isUpdating}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.updateBtnText}>
            {isUpdating ? t('appUpdate.opening') : t('appUpdate.action')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={dismiss}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('appUpdate.dismiss')}
        >
          <Ionicons name="close" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
    elevation: 90,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    backgroundColor: colors.background.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...cardShadow,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 17,
  },
  updateBtn: {
    backgroundColor: colors.accent.gold,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexShrink: 0,
  },
  updateBtnDisabled: {
    opacity: 0.65,
  },
  updateBtnText: {
    fontFamily: fonts.extraBold,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeBtn: {
    flexShrink: 0,
    padding: 2,
  },
});
