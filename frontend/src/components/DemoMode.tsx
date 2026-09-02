/**
 * Demo-mode UI primitives.
 *
 * Three small components used across the app to make demo mode unmistakably
 * different from real trading without redesigning every screen:
 *
 *   • <DemoBanner /> — full-width strip shown at the very top of home /
 *     asset / trade screens. Uses a subtle gold gradient to match the
 *     existing "claim free credit" strip slot.
 *   • <DemoBadge />  — small inline pill ("DEMO"). Drop-in replacement for
 *     the perp/spot market badge on QuickTradeCard, trade screen header,
 *     and the portfolio tabs filter row.
 *   • <DemoLiveDot /> — a small blinking yellow dot used in the homepage
 *     account card to replace the green "Live" dot.
 *
 * All three are inert when `tradingEnv === 'mainnet'` — they early-return
 * `null` so existing screens stay byte-identical in real-trading flows.
 *
 * Localized via the `demo.*` namespace in i18n. Mainnet behavior unchanged.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/appStore';
import { colors } from '../theme/colors';

/** True iff the user is currently in demo (testnet) mode. */
export function useIsDemo(): boolean {
  return useAppStore((s) => s.tradingEnv) === 'demo';
}

// ─── DemoBanner ─────────────────────────────────────────────────────────

/**
 * Full-width demo-mode strip. Render at the very top of a screen (above
 * everything else) when in demo mode. Returns null in mainnet so callers
 * can render it unconditionally without an outer guard.
 *
 * Style is flat (no gradient) so it doesn't compete with hero gradients
 * on the same screen. Subtle gold border separates it from the page.
 */
export function DemoBanner({
  style,
  /** When true, applies extra top padding to absorb the device safe area. */
  withSafeArea = false,
  /** Additional top inset when withSafeArea is true. */
  safeAreaInset = 0,
}: {
  style?: StyleProp<ViewStyle>;
  withSafeArea?: boolean;
  safeAreaInset?: number;
}) {
  const { t } = useTranslation();
  const isDemo = useIsDemo();
  if (!isDemo) return null;

  return (
    <View
      style={[
        bannerStyles.root,
        withSafeArea && { paddingTop: safeAreaInset + 6 },
        style,
      ]}
    >
      <Ionicons name="flask" size={13} color={colors.accent.gold} />
      <Text style={bannerStyles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {t('demo.bannerText')}
      </Text>
    </View>
  );
}

// ─── DemoBadge ──────────────────────────────────────────────────────────

/**
 * Small "DEMO" pill. Drop-in replacement for the perp/spot market badge
 * on QuickTradeCard and the trade screen header. In mainnet this returns
 * null so callers can keep their existing perp/spot badge as the fallback.
 *
 * Two visual variants:
 *   • 'standard'  → matches the size of the existing market badge (padding
 *     and font tuned to drop in next to a symbol header).
 *   • 'compact'   → smaller, no icon, used in the portfolio tabs filter
 *     row where horizontal space is tight.
 */
export function DemoBadge({
  variant = 'standard',
  style,
}: {
  variant?: 'standard' | 'compact';
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const isDemo = useIsDemo();
  if (!isDemo) return null;

  if (variant === 'compact') {
    return (
      <View style={[badgeStyles.compact, style]}>
        <Text style={badgeStyles.compactText}>{t('demo.badgeLabel')}</Text>
      </View>
    );
  }

  return (
    <View style={[badgeStyles.standard, style]}>
      <Ionicons name="flask" size={10} color={colors.accent.gold} />
      <Text style={badgeStyles.standardText}>{t('demo.badgeLabel')}</Text>
    </View>
  );
}

// ─── DemoLiveDot ────────────────────────────────────────────────────────

/**
 * Yellow blinking dot used in the home account card to replace the green
 * "Live" dot. The blink is a slow opacity loop — visible enough to read as
 * "this is special", subtle enough not to be distracting on a dashboard.
 *
 * Returns the standard green dot in mainnet so the home card can keep its
 * existing JSX shape (no conditional needed at the call site beyond a
 * one-line color/text swap).
 */
export function DemoLiveDot({
  size = 8,
  /** Override active color (used when the connection is degraded). */
  activeColor,
}: {
  size?: number;
  activeColor?: string;
}) {
  const isDemo = useIsDemo();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isDemo) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isDemo, opacity]);

  if (!isDemo) {
    // Mainnet path — render the standard solid dot the caller would have
    // had inline. Color override lets the caller pass a degraded color
    // (e.g. gold for "syncing"). Keeps the call-site code simple.
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: activeColor ?? colors.status.success,
        }}
      />
    );
  }

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent.gold,
        opacity,
      }}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────

const bannerStyles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: `${colors.accent.gold}1A`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.accent.gold}40`,
  },
  text: {
    color: colors.accent.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

const badgeStyles = StyleSheet.create({
  standard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: `${colors.accent.gold}25`,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}55`,
  },
  standardText: {
    color: colors.accent.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  compact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: `${colors.accent.gold}25`,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}55`,
  },
  compactText: {
    color: colors.accent.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
