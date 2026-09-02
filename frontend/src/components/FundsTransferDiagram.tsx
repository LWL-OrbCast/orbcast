import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';

const MID_COL_WIDTH = 18;
const ROW_GAP = 10;
const RAIL_HEIGHT = 32;
const PARTICLE_TRAVEL = 22;

export type FundsTransferTarget = 'trade' | 'bank';
export type FundsTransferDirection = 'toDestination' | 'toWallet';

type FlowRailProps = {
  target: FundsTransferTarget;
  activeTarget?: FundsTransferTarget | null;
  activeDirection?: FundsTransferDirection | null;
};

type FlowParticleProps = {
  progress: Animated.Value;
  direction: FundsTransferDirection;
  delay: number;
};

function FlowParticle({ progress, direction, delay }: FlowParticleProps) {
  const inputRange = useMemo(
    () => [0, Math.max(delay, 0.001), Math.min(delay + 0.18, 0.92), Math.min(delay + 0.58, 1)],
    [delay],
  );
  const opacity = progress.interpolate({
    inputRange,
    outputRange: [0, 0, 1, 0],
    extrapolate: 'clamp',
  });
  const scale = progress.interpolate({
    inputRange,
    outputRange: [0.65, 0.65, 1.08, 0.72],
    extrapolate: 'clamp',
  });
  const translateY = progress.interpolate({
    inputRange,
    outputRange:
      direction === 'toDestination'
        ? [-2, -2, PARTICLE_TRAVEL * 0.28, PARTICLE_TRAVEL]
        : [PARTICLE_TRAVEL, PARTICLE_TRAVEL, PARTICLE_TRAVEL * 0.72, -2],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
      pointerEvents="none"
    >
      <View style={styles.particleGlow} />
    </Animated.View>
  );
}

function FlowRail({ target, activeTarget, activeDirection }: FlowRailProps) {
  const flow = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const isActive = activeTarget === target;
  const activeOrIdleDirection = activeDirection ?? 'toDestination';

  useEffect(() => {
    flow.setValue(0);
    const duration = isActive ? 1250 : 2400;
    const loop = Animated.loop(
      Animated.timing(flow, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [flow, isActive, activeOrIdleDirection]);

  useEffect(() => {
    shimmer.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: isActive ? 900 : 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: isActive ? 900 : 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer, isActive]);

  const railOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: isActive ? [0.55, 1] : [0.26, 0.48],
  });
  const haloScale = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: isActive ? [0.9, 1.16] : [0.82, 1],
  });
  const haloOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: isActive ? [0.18, 0.42] : [0.08, 0.18],
  });
  const arrowOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: isActive ? [0.75, 1] : [0.34, 0.58],
  });

  return (
    <View style={styles.railWrap}>
      <Animated.View
        style={[
          styles.endpointHalo,
          styles.endpointHaloTop,
          { opacity: haloOpacity, transform: [{ scale: haloScale }] },
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.endpointHalo,
          styles.endpointHaloBottom,
          { opacity: haloOpacity, transform: [{ scale: haloScale }] },
        ]}
        pointerEvents="none"
      />
      <View style={styles.railTrack}>
        <Animated.View style={[styles.railGlow, { opacity: railOpacity }]} />
        {activeDirection ? (
          <>
            <FlowParticle progress={flow} direction={activeOrIdleDirection} delay={0} />
            <FlowParticle progress={flow} direction={activeOrIdleDirection} delay={0.36} />
          </>
        ) : (
          <>
            <FlowParticle progress={flow} direction="toDestination" delay={0} />
            <FlowParticle progress={flow} direction="toWallet" delay={0.48} />
          </>
        )}
      </View>
      <Animated.View style={[styles.arrowChip, { opacity: arrowOpacity }]}>
        <Ionicons
          name={
            activeDirection === 'toWallet'
              ? 'arrow-up'
              : activeDirection === 'toDestination'
                ? 'arrow-down'
                : 'swap-vertical'
          }
          size={12}
          color={colors.accent.gold}
        />
      </Animated.View>
    </View>
  );
}

type FundsTransferBridgeProps = {
  activeTarget?: FundsTransferTarget | null;
  activeDirection?: FundsTransferDirection | null;
  /**
   * When false (Tier-3 banking UI off), render a single centered Wallet→Trade
   * rail instead of the dual Trade|Bank arms. Banking-on layout is unchanged.
   */
  showBankRail?: boolean;
};

/** Premium funds-flow indicator — Wallet is the hub, Trade / Bank are rails. */
export function FundsTransferBridge({
  activeTarget = null,
  activeDirection = null,
  showBankRail = true,
}: FundsTransferBridgeProps) {
  if (!showBankRail) {
    return (
      <View style={[styles.bridgeRow, styles.bridgeRowSingle]}>
        <FlowRail
          target="trade"
          activeTarget={activeTarget}
          activeDirection={activeTarget === 'trade' ? activeDirection : null}
        />
      </View>
    );
  }

  return (
    <View style={styles.bridgeRow}>
      <View style={styles.armSlot}>
        <FlowRail
          target="trade"
          activeTarget={activeTarget}
          activeDirection={activeTarget === 'trade' ? activeDirection : null}
        />
      </View>
      <View style={styles.midSpacer} />
      <View style={styles.armSlot}>
        <FlowRail
          target="bank"
          activeTarget={activeTarget}
          activeDirection={activeTarget === 'bank' ? activeDirection : null}
        />
      </View>
    </View>
  );
}

type TradeBankDividerProps = {
  onPress: () => void;
};

/** Muted divider between Trade and Bank — tap for no direct transfer explainer. */
export function TradeBankDivider({ onPress }: TradeBankDividerProps) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={styles.midCol}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={t('deposit.tradeBankNoDirectTransfer')}
    >
      <View style={styles.noLinkLine} />
      <Ionicons name="ban-outline" size={15} color={colors.text.muted} />
      <View style={styles.noLinkLine} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bridgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ROW_GAP,
  },
  /** Single Wallet→Trade rail, centered under the wallet hub. */
  bridgeRowSingle: {
    justifyContent: 'center',
    gap: 0,
  },
  armSlot: { flex: 1, alignItems: 'center', height: RAIL_HEIGHT },
  midSpacer: { width: MID_COL_WIDTH },
  railWrap: {
    width: 42,
    height: RAIL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  railTrack: {
    width: 8,
    height: RAIL_HEIGHT,
    alignItems: 'center',
    position: 'relative',
  },
  railGlow: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: 2,
    borderRadius: 999,
    backgroundColor: colors.accent.gold,
  },
  particle: {
    position: 'absolute',
    top: 3,
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.accent.gold,
    shadowColor: colors.accent.gold,
    shadowOpacity: 0.65,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  particleGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 999,
    backgroundColor: `${colors.accent.gold}24`,
  },
  endpointHalo: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}70`,
    backgroundColor: `${colors.accent.gold}10`,
  },
  endpointHaloTop: {
    top: 0,
  },
  endpointHaloBottom: {
    bottom: 0,
  },
  arrowChip: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.background.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.primary,
  },
  midCol: {
    width: MID_COL_WIDTH,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    opacity: 0.75,
  },
  noLinkLine: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.secondary,
  },
});
