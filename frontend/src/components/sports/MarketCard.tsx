import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { ListedMarket } from '../../lib/hip4';
import { displayListedTitle, impliedPercent } from '../../lib/hip4';
import { colors } from '../../theme/colors';
import { MarketSymbol } from './MarketSymbol';
import { OddsPill, YES_COLOR } from './OddsPill';
import { ProbabilityLine } from './ProbabilityLine';
import { useTranslation } from 'react-i18next';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  market: ListedMarket;
  onPress: () => void;
};

export function MarketCard({ market, onPress }: Props) {
  const { t } = useTranslation();
  const yes = market.sides[0];
  const no = market.sides[1];
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const spark = useMemo(() => {
    const p = yes?.probability ?? 0.5;
    return [p * 0.86, p * 0.92, p * 0.88, p, p * 0.97, p];
  }, [yes?.probability]);

  const statusLabel =
    market.status === 'live'
      ? t('hip4.status.live')
      : market.status === 'upcoming'
        ? t('hip4.status.upcoming')
        : t('hip4.status.settled');

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.985, { damping: 18, stiffness: 280 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 240 });
      }}
      style={[styles.card, animated]}
    >
      <View style={styles.topRow}>
        <View style={[styles.dot, market.status === 'live' && styles.dotLive]} />
        <Text style={styles.status}>{statusLabel}</Text>
      </View>
      <View style={styles.titleRow}>
        <MarketSymbol market={market} size={36} radius={12} questionLevel={market.multiOutcome} />
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={3}>
            {displayListedTitle(market)}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {market.multiOutcome ? market.legLabel : market.subtitle}
          </Text>
        </View>
      </View>
      <View style={styles.chartWrap}>
        <ProbabilityLine points={spark} height={46} color={YES_COLOR} />
        <Text style={styles.heroPct}>{impliedPercent(yes?.probability ?? null)}</Text>
      </View>
      <View style={styles.pills}>
        <OddsPill label={yes?.name ?? t('hip4.yes')} probability={yes?.probability ?? null} variant="yes" compact />
        <OddsPill label={no?.name ?? t('hip4.no')} probability={no?.probability ?? null} variant="no" compact />
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.text.muted,
  },
  dotLive: {
    backgroundColor: YES_COLOR,
  },
  status: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  sub: {
    marginTop: 4,
    color: colors.text.tertiary,
    fontSize: 13,
  },
  chartWrap: {
    marginTop: 10,
    marginBottom: 4,
    position: 'relative',
  },
  heroPct: {
    position: 'absolute',
    right: 0,
    top: 0,
    color: YES_COLOR,
    fontSize: 20,
    fontWeight: '800',
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
