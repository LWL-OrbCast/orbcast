/**
 * Sticky, app-wide "funds incoming" banner. Floats over the top of whatever
 * screen is active (it does NOT reflow screen layout — it's an overlay, like a
 * persistent toast) and stays put across navigation for as long as a transfer
 * is still in-flight. Replaces the old per-card incoming pills.
 *
 * Data sources (this component is a pure VIEW — it owns no transfer logic):
 *   • useFundsPendingStore — HL wallet⇄trade transfers (mirrored from DepositPanel).
 *
 * The animated chevrons sweep left→right on a loop to read as "in progress".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { arbitrum } from 'viem/chains';
import { createPublicClient, http } from 'viem';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { cardShadow } from '../theme/shadows';
import { useAppStore } from '../store/appStore';
import { useFundsPendingStore } from '../store/fundsPendingStore';
import {
  saveFundsPendingDeposit,
  saveFundsPendingWithdraw,
} from '../lib/fundsPendingIncoming';
import { getHyperliquidTradingState } from '../lib/hyperliquid';

const USDC_ICON = require('../../assets/images/usdc-icon.webp');

const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
const BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/** Single resolved banner row. */
type BannerItem = {
  key: string;
  text: string;
};

const fmtAmount = (raw: string | number): string => {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

/** HL Bridge2 charges ~1 USDC to land on Arbitrum; the wallet receives net.
 *  Mirrors the figure the old per-card pill displayed. */
const HL_WITHDRAW_FEE_USDC = 1;
const fmtNetHlWithdraw = (raw: string): string => {
  const gross = parseFloat(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(gross)) return fmtAmount(raw);
  return fmtAmount(Math.max(0, gross - HL_WITHDRAW_FEE_USDC));
};

/** Three chevrons whose bright spot sweeps left→right forever. */
function ProgressChevrons() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const opacityFor = (idx: number) => {
    // Bright at this chevron's phase; dim elsewhere. Wraps cleanly at 1→0.
    const peaks = [
      [1, 0.3, 0.3, 1],
      [0.3, 1, 0.3, 0.3],
      [0.3, 0.3, 1, 0.3],
    ][idx];
    return anim.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: peaks });
  };

  return (
    <View style={styles.chevrons}>
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={{ opacity: opacityFor(i) }}>
          <Ionicons
            name="chevron-forward"
            size={15}
            color={colors.accent.goldDark}
            style={i > 0 ? styles.chevronOverlap : undefined}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/** One stacked banner row. Owns its own mount fade/slide so newly-stacked
 *  transfers animate in without re-animating the rows that were already up. */
function BannerRow({ item }: { item: BannerItem }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });
  return (
    <Animated.View style={[styles.banner, { opacity: enter, transform: [{ translateY }] }]}>
      <View style={styles.iconWrap}>
        <Image source={USDC_ICON} style={styles.usdcIcon} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.text} numberOfLines={2}>
          {item.text}
        </Text>
      </View>
      <ProgressChevrons />
    </Animated.View>
  );
}

/** Collapsed summary row shown when more transfers are in-flight than we want
 *  to stack at once. */
function OverflowRow({ count }: { count: number }) {
  const { t } = useTranslation();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);
  return (
    <Animated.View style={[styles.banner, styles.overflowRow, { opacity: enter }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.accent.goldDark} />
      </View>
      <Text style={styles.overflowText} numberOfLines={1}>
        {t('fundsBanner.more', { count })}
      </Text>
    </Animated.View>
  );
}

/** Cap on simultaneously-stacked rows; extra transfers collapse into a count. */
const MAX_ROWS = 3;

/** Drop below the screen header band so the banner never covers header controls
 *  (home wallet icon, back arrows, modal close button). The shared Header's
 *  content sits roughly within insets.top + 6 .. +48, so clear it. */
const HEADER_CLEARANCE = 56;

/**
 * `secondary` mounts a VIEW-ONLY copy (e.g. inside an iOS modal screen like
 * Profile, which the root-level overlay can't draw over). It renders from the
 * same global store but skips hydrate/sweep/polling/clearing so only the single
 * root instance owns that work — no duplicate RPC polls or storage writes.
 */
export function IncomingFundsBanner({ secondary = false }: { secondary?: boolean } = {}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const address = useAppStore((s) => s.user?.wallet?.address ?? null);
  const tradingEnv = useAppStore((s) => s.tradingEnv);

  const hlDeposit = useFundsPendingStore((s) => s.hlDeposit);
  const hlWithdraw = useFundsPendingStore((s) => s.hlWithdraw);
  const hydrate = useFundsPendingStore((s) => s.hydrate);
  const sweepExpired = useFundsPendingStore((s) => s.sweepExpired);
  const setHlDeposit = useFundsPendingStore((s) => s.setHlDeposit);
  const setHlWithdraw = useFundsPendingStore((s) => s.setHlWithdraw);
  const bumpWalletCredit = useFundsPendingStore((s) => s.bumpWalletCredit);

  // Clearing an HL entry must drop BOTH the in-memory mirror (hides the banner)
  // and the AsyncStorage record DepositPanel persisted — otherwise a cold-start
  // hydrate would resurrect a transfer that already landed.
  const clearHlWithdraw = useCallback(() => {
    setHlWithdraw(null);
    if (address) void saveFundsPendingWithdraw(address, null);
  }, [setHlWithdraw, address]);
  const clearHlDeposit = useCallback(() => {
    setHlDeposit(null);
    if (address) void saveFundsPendingDeposit(address, null);
  }, [setHlDeposit, address]);

  // Restore persisted entries for the connected wallet (cold start / switch).
  useEffect(() => {
    if (secondary) return;
    void hydrate(address);
  }, [address, hydrate, secondary]);

  // TTL sweep — drops entries whose safety window elapsed even while the user
  // is on a screen that can't observe the balance landing.
  useEffect(() => {
    if (secondary) return;
    const id = setInterval(sweepExpired, 1000);
    return () => clearInterval(id);
  }, [sweepExpired, secondary]);

  const publicClient = useMemo(
    () => createPublicClient({ chain: arbitrum, transport: http() }),
    [],
  );
  // ─── Real-time clear, app-wide ───────────────────────────────────────────
  // Watch destination balances so HL transfers clear the banner on ANY screen —
  // not only while DepositPanel is mounted. DepositPanel's own (WS-driven)
  // clear still fires first when the user is on Profile. Both paths are
  // idempotent. Polls run ONLY while something is in-flight.

  // (1) Wallet USDC (Arbitrum) — HL trade→wallet.
  const walletBaselineRef = useRef<bigint | null>(null);
  const walletPollActive = !!hlWithdraw;
  useEffect(() => {
    if (secondary || !walletPollActive || !address) {
      walletBaselineRef.current = null;
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const bal = (await publicClient.readContract({
          address: ARBITRUM_USDC,
          abi: BALANCE_OF_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        })) as bigint;
        if (cancelled) return;
        if (walletBaselineRef.current === null) {
          walletBaselineRef.current = bal;
          return;
        }
        // 6-decimal USDC; clear each entry once the balance covers ~95% of it.
        const gained = Number(bal - walletBaselineRef.current) / 1e6;
        if (hlWithdraw) {
          const net = Math.max(0, parseFloat(hlWithdraw.amount) - HL_WITHDRAW_FEE_USDC);
          if (net > 0 && gained >= net * 0.95) {
            clearHlWithdraw();
            // Funds are provably on-chain now — nudge the Wallet Balance card to
            // re-read immediately so it never lags behind the banner clearing.
            bumpWalletCredit();
          }
        }
      } catch {
        /* transient RPC error — keep polling */
      }
    };
    void poll();
    const id = setInterval(poll, 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    secondary,
    walletPollActive,
    address,
    hlWithdraw,
    publicClient,
    clearHlWithdraw,
    bumpWalletCredit,
  ]);

  // (2) Trade balance (Hyperliquid) — covers HL wallet→trade deposits. Mirrors
  //     DepositPanel's threshold (baseline + amount*0.5) so the clear point is
  //     identical to the on-Profile behaviour.
  const tradeBaselineRef = useRef<number | null>(null);
  useEffect(() => {
    if (secondary || !hlDeposit || !address) {
      tradeBaselineRef.current = null;
      return;
    }
    let cancelled = false;
    const amount = parseFloat(hlDeposit.amount);
    const poll = async () => {
      try {
        const st = await getHyperliquidTradingState(address as `0x${string}`);
        if (cancelled) return;
        const val = st?.accountValueUsd;
        if (!Number.isFinite(val)) return;
        if (tradeBaselineRef.current === null) {
          tradeBaselineRef.current = val;
          return;
        }
        const threshold =
          tradeBaselineRef.current +
          (Number.isFinite(amount) ? Math.max(0.01, amount * 0.5) : 0.01);
        if (val >= threshold) clearHlDeposit();
      } catch {
        /* transient error — keep polling */
      }
    };
    void poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secondary, hlDeposit, address, clearHlDeposit]);

  const items = useMemo<BannerItem[]>(() => {
    const list: BannerItem[] = [];
    if (hlWithdraw) {
      list.push({
        key: 'hlWithdraw',
        text: t('fundsBanner.toWallet', { amount: fmtNetHlWithdraw(hlWithdraw.amount) }),
      });
    }
    if (hlDeposit) {
      list.push({
        key: 'hlDeposit',
        text: t('fundsBanner.toTrade', { amount: fmtAmount(hlDeposit.amount) }),
      });
    }
    return list;
  }, [hlWithdraw, hlDeposit, t]);

  // Demo strip owns the top slot when active (per product decision); suppress
  // the banner there. Also hide on login.
  const demoActive = tradingEnv === 'demo' && pathname !== '/login';
  const shouldShow = items.length > 0 && pathname !== '/login' && !demoActive;

  // Stack concurrent transfers as separate rows (capped). Beyond the cap they
  // collapse into a single "+N more" summary so the stack never eats the screen.
  const visibleItems =
    items.length > MAX_ROWS ? items.slice(0, MAX_ROWS - 1) : items;
  const overflowCount = items.length - visibleItems.length;

  // Keep the last non-empty stack around so the container can finish its
  // slide-out animation after the final transfer clears.
  const snapshotRef = useRef<{ visible: BannerItem[]; overflow: number }>({
    visible: [],
    overflow: 0,
  });
  if (items.length > 0) {
    snapshotRef.current = { visible: visibleItems, overflow: overflowCount };
  }
  const shown = snapshotRef.current;

  // Container enter/exit animation. Kept mounted through the exit.
  const [rendered, setRendered] = useState(false);
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (shouldShow) {
      setRendered(true);
      Animated.timing(appear, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(appear, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [shouldShow, rendered, appear]);

  if (!rendered || shown.visible.length === 0) return null;

  const translateY = appear.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, 0],
  });

  return (
    <View
      pointerEvents="none"
      style={[styles.host, { paddingTop: insets.top + HEADER_CLEARANCE }]}
    >
      <Animated.View
        style={[styles.stack, { opacity: appear, transform: [{ translateY }] }]}
      >
        {shown.visible.map((item) => (
          <BannerRow key={item.key} item={item} />
        ))}
        {shown.overflow > 0 ? <OverflowRow count={shown.overflow} /> : null}
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
    zIndex: 95,
    elevation: 95,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  stack: {
    alignSelf: 'stretch',
    gap: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.background.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
    ...cardShadow,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usdcIcon: {
    width: 28,
    height: 28,
    borderRadius: 15,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 18,
  },
  overflowRow: {
    paddingVertical: 9,
  },
  overflowText: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bold,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  chevrons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  chevronOverlap: {
    marginLeft: -7,
  },
});
