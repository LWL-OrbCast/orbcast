import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { buildWhatsAppSupportUrl } from '../lib/support';
import { useAppStore } from '../store/appStore';
import { BRAND_NAME } from '../lib/brand';

/**
 * Free-$10 WhatsApp campaign banner (home screen only).
 * Set to `true` to turn the campaign back on; keep `false` to hide it while leaving all code in place.
 */
export const CLAIM_CREDIT_BANNER_CAMPAIGN_ENABLED = false;

const DISMISS_KEY = '@orbcast/claim_credit_banner_dismissed';

/** Extra breathing room below the demo strip on home only (px). */
export const HOME_DEMO_STRIP_EXTRA_GAP_PX = 2;
/** Extra content height for the two-line demo strip vs the single-line claim strip. */
export const DEMO_STRIP_TWO_LINE_EXTRA_PX = 16;

type ClaimBannerContextValue = {
  /** When true, the global claim strip is visible — Header should not add top safe-area padding again */
  suppressHeaderTopInset: boolean;
  /** Added to {@link TOP_STRIP_CONTENT_HEIGHT} when laying out below the strip (demo + home). */
  extraTopStripContentPx: number;
};

const ClaimBannerContext = createContext<ClaimBannerContextValue>({
  suppressHeaderTopInset: false,
  extraTopStripContentPx: 0,
});

export function useClaimBannerTopInset(): boolean {
  return useContext(ClaimBannerContext).suppressHeaderTopInset;
}

/** Strip row height below the status bar (includes home-only demo gap when applicable). */
export function useTopStripContentHeight(): number {
  const { extraTopStripContentPx } = useContext(ClaimBannerContext);
  return TOP_STRIP_CONTENT_HEIGHT + extraTopStripContentPx;
}

/**
 * Visual height the active top strip (claim or demo) adds on TOP of the
 * device's safe-area inset. Header and pad-only screens share this value.
 * Slightly under the legacy 36px so the pad tracks the real strip row
 * (icon + label + paddingBottom) and avoids a dark band under the strip.
 */
export const TOP_STRIP_CONTENT_HEIGHT = 28;

/**
 * Background color to paint the safe-area pad region BENEATH the demo
 * strip, so the gap between the strip's bottom edge and the next content
 * doesn't expose the dark page background. Returns null when the strip
 * isn't a demo strip (claim strip uses a different tint and screens
 * should leave their default background visible).
 *
 * Screens that pad themselves down by {@link useTopStripContentHeight} to
 * clear the strip should set this as the SafeAreaView's background color when
 * the demo banner is active.
 */
export function useTopStripPadBackgroundColor(): string | null {
  const { suppressHeaderTopInset } = useContext(ClaimBannerContext);
  const isDemo = useAppStore((s) => s.tradingEnv) === 'demo';
  if (!suppressHeaderTopInset || !isDemo) return null;
  // Match `demoStrip` background tint exactly so the pad region merges
  // with the strip into a single visual block.
  return `${colors.accent.gold}1F`;
}

/**
 * Wraps Stack; shows the claim strip only on the home screen (not on every route).
 * Provides suppressHeaderTopInset for {@link Header} when the strip is visible.
 */
export function ClaimBannerRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Demo banner takes priority over the (currently disabled) free-credit
  // strip — both occupy the same top slot, but demo mode is a stronger
  // signal that needs to be surfaced unconditionally on every screen
  // (not just home). The header inset suppression piggy-backs on the
  // existing context so screens don't need to know which strip is active.
  const isDemo = useAppStore((s) => s.tradingEnv) === 'demo';

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY)
      .then((v) => setDismissed(v === '1'))
      .finally(() => setHydrated(true));
  }, []);

  const notLogin = pathname !== '/login';
  const isHome = pathname === '/' || pathname === '/index';
  const showClaimStrip =
    CLAIM_CREDIT_BANNER_CAMPAIGN_ENABLED &&
    hydrated &&
    !dismissed &&
    isHome &&
    notLogin;
  // Demo strip shows on every authed screen except login. It's not
  // dismissable — that's the whole point of the indicator.
  const showDemoStrip = isDemo && notLogin;
  const extraTopStripContentPx =
    (showDemoStrip ? DEMO_STRIP_TWO_LINE_EXTRA_PX : 0) +
    (showDemoStrip && isHome ? HOME_DEMO_STRIP_EXTRA_GAP_PX : 0);

  const value = useMemo(
    () => ({
      suppressHeaderTopInset: showClaimStrip || showDemoStrip,
      extraTopStripContentPx,
    }),
    [showClaimStrip, showDemoStrip, extraTopStripContentPx],
  );

  const dismiss = useCallback(() => {
    setDismissed(true);
    void AsyncStorage.setItem(DISMISS_KEY, '1');
  }, []);

  return (
    <ClaimBannerContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {/* Demo strip wins when active — same slot, simpler shape, no
            dismiss button. */}
        {showDemoStrip ? (
          <DemoModeStrip />
        ) : showClaimStrip ? (
          <ClaimBannerStrip onDismiss={dismiss} visible={isHome && notLogin} />
        ) : null}
      </View>
    </ClaimBannerContext.Provider>
  );
}

function DemoModeStrip() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.strip, styles.demoStrip, { paddingTop: insets.top }]} pointerEvents="none">
      <View style={styles.demoBody}>
        <View style={styles.demoTitleRow}>
          <Ionicons name="flask" size={12} color={colors.accent.gold} style={styles.leadIcon} />
          <Text
            style={[styles.message, styles.demoMessage]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {t('demo.bannerText')}
          </Text>
        </View>
        <Text
          style={styles.demoHint}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {t('demo.bannerHint')}
        </Text>
      </View>
    </View>
  );
}

function ClaimBannerStrip({ onDismiss, visible }: { onDismiss: () => void; visible: boolean }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const openWhatsApp = useCallback(() => {
    const url = buildWhatsAppSupportUrl(
      t('banner.claimWhatsappPrefill', {
        defaultValue: `Hello ${BRAND_NAME}, I want to claim my $10 bonus`,
      }),
    );
    void Linking.openURL(url);
  }, [t]);

  return (
    <View style={[styles.strip, { paddingTop: insets.top, opacity: visible ? 1 : 0 }]} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Same width as dismiss column so icon+text stay visually centered */}
      <View style={styles.sideBalance} />
      <TouchableOpacity
        style={styles.mainHit}
        onPress={openWhatsApp}
        activeOpacity={0.85}
        accessibilityRole="link"
        accessibilityLabel={t('banner.claimBannerA11y', {
          defaultValue: 'Claim ten dollars — opens chat',
        })}
      >
        <View style={styles.centerCluster}>
          <Ionicons name="gift-outline" size={14} color={colors.accent.gold} style={styles.leadIcon} />
          <Text
            style={styles.message}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {t('banner.claimFreeCreditLine', {
              defaultValue: 'Free $10 — tap here 👆',
            })}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.dismissWrap}>
        <TouchableOpacity
          style={styles.dismiss}
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Ionicons name="close" size={15} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: `${colors.accent.gold}35`,
    paddingBottom: 4,
    paddingHorizontal: 10,
  },
  sideBalance: {
    width: 34,
    flexShrink: 0,
  },
  mainHit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingVertical: 3,
  },
  centerCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    minWidth: 0,
    justifyContent: 'center',
  },
  leadIcon: {
    flexShrink: 0,
  },
  message: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 15,
    textAlign: 'center',
  },
  dismissWrap: {
    width: 34,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismiss: {
    padding: 2,
  },
  // Demo strip variant — same dimensions as the claim strip but a stronger
  // gold tint and gold border so it reads at a glance as "this is special".
  demoStrip: {
    backgroundColor: `${colors.accent.gold}1F`,
    borderBottomColor: `${colors.accent.gold}60`,
    borderTopColor: `${colors.accent.gold}60`,
  },
  demoMessage: {
    color: colors.accent.gold,
    fontWeight: '900',
    letterSpacing: 0.6,
    lineHeight: 14,
  },
  demoBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 2,
    minWidth: 0,
  },
  demoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    minWidth: 0,
  },
  demoHint: {
    marginTop: 1,
    paddingHorizontal: 12,
    maxWidth: '100%',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
});
