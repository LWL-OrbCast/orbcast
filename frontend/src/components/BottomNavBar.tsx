import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { pushRouteOnce, navigateRouteOnce } from '../lib/pushRouteOnce';
import { useAppStore } from '../store/appStore';
import { useTranslation } from 'react-i18next';

/** Profile is a native modal. iOS covers this bar; Android does not — keep it off `/profile`. */
const VISIBLE_ROUTES = ['/', '/markets', '/portfolio', '/rewards'];
const VISIBLE_PREFIXES = ['/market/'];

const NAV_ENTER_DURATION_MS = 340;
const NAV_EXIT_DURATION_MS = 200;
const NAV_EXIT_TRANSLATE_Y = 14;

export function BottomNavBar() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  const shouldShow =
    VISIBLE_ROUTES.includes(pathname) ||
    VISIBLE_PREFIXES.some((p) => pathname.startsWith(p));

  const [isMounted, setIsMounted] = useState(shouldShow);
  const [lastVisiblePathname, setLastVisiblePathname] = useState(pathname);

  const opacity = useSharedValue(shouldShow ? 1 : 0);
  const translateY = useSharedValue(shouldShow ? 0 : NAV_EXIT_TRANSLATE_Y);

  useEffect(() => {
    if (shouldShow) {
      setLastVisiblePathname(pathname);
      setIsMounted(true);
      opacity.value = withTiming(1, {
        duration: NAV_ENTER_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
      });
      translateY.value = withTiming(0, {
        duration: NAV_ENTER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      opacity.value = withTiming(0, {
        duration: NAV_EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
      });
      translateY.value = withTiming(
        NAV_EXIT_TRANSLATE_Y,
        { duration: NAV_EXIT_DURATION_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) scheduleOnRN(setIsMounted, false);
        },
      );
    }
  }, [shouldShow, pathname, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!isMounted) return null;

  const activePathname = shouldShow ? pathname : lastVisiblePathname;
  const isHomeActive = activePathname === '/';
  const isMarketsActive =
    activePathname === '/markets' || activePathname.startsWith('/market/');
  const isPortfolioActive = activePathname === '/portfolio';
  const isRewardsActive = activePathname === '/rewards';
  const isWalletActive = activePathname === '/profile';

  const goAuthed = (href: '/portfolio' | '/rewards' | '/profile') => {
    if (!isAuthenticated) {
      pushRouteOnce(router, '/login');
      return;
    }
    if (pathname === href) return;
    navigateRouteOnce(router, href);
  };

  return (
    <Animated.View
      pointerEvents={shouldShow ? 'auto' : 'none'}
      style={[
        styles.outerWrap,
        { paddingBottom: Math.max(insets.bottom, 8) },
        animatedStyle,
      ]}
    >
      <View style={styles.bar}>
        <NavItem
          icon="home-outline"
          iconActive="home"
          label={t('hip4.nav.home')}
          isActive={isHomeActive}
          onPress={() => {
            if (pathname !== '/') navigateRouteOnce(router, '/');
          }}
        />
        <NavItem
          icon="football-outline"
          iconActive="football"
          label={t('hip4.nav.markets')}
          isActive={isMarketsActive}
          onPress={() => {
            if (pathname !== '/markets') navigateRouteOnce(router, '/markets');
          }}
        />
        <NavItem
          icon="pie-chart-outline"
          iconActive="pie-chart"
          label={t('hip4.nav.positions')}
          isActive={isPortfolioActive}
          onPress={() => goAuthed('/portfolio')}
        />
        <NavItem
          icon="trophy-outline"
          iconActive="trophy"
          label={t('hip4.nav.rewards')}
          isActive={isRewardsActive}
          onPress={() => goAuthed('/rewards')}
        />
        <NavItem
          icon="wallet-outline"
          iconActive="wallet"
          label={t('hip4.nav.wallet')}
          isActive={isWalletActive}
          onPress={() => goAuthed('/profile')}
        />
      </View>
    </Animated.View>
  );
}

function NavItem({
  icon,
  iconActive,
  label,
  isActive,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const iconColor = isActive ? colors.accent.goldDark : colors.text.tertiary;
  return (
    <TouchableOpacity
      style={styles.navItem}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
    >
      <View style={styles.iconSlot}>
        <Ionicons
          name={isActive ? iconActive : icon}
          size={22}
          color={iconColor}
        />
      </View>
      <Text
        style={[styles.navLabel, isActive && styles.navLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: Platform.OS === 'android' ? 10 : 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.background.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingVertical: 8,
    paddingHorizontal: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  iconSlot: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 9,
    lineHeight: 12,
    height: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
    marginTop: 2,
    width: '100%',
    textAlign: 'center',
  },
  navLabelActive: {
    color: colors.accent.goldDark,
    fontWeight: '700',
  },
});
