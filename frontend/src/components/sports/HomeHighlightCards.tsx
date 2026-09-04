import React from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { softShadow } from '../../theme/shadows';
import { type ListedMarket } from '../../lib/hip4';
import { MarketSymbol } from './MarketSymbol';
import { useTranslation } from 'react-i18next';
import { useDisplayCurrency } from '../../providers/CurrencyProvider';
import { ShimmerBone, useShimmerX } from '../skeleton/ShimmerBone';

type Props = {
  markets: ListedMarket[];
  loading?: boolean;
  onPressMarket: (market: ListedMarket) => void;
  onExploreAll: () => void;
};

function marketTitle(m: ListedMarket): string {
  if (m.multiOutcome && m.questionName) return m.questionName;
  return m.title;
}

function TrendingRowSkeleton({
  rank,
  lead,
  shimmerX,
}: {
  rank: number;
  lead: boolean;
  shimmerX: ReturnType<typeof useShimmerX>;
}) {
  return (
    <View
      style={styles.item}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.rank, lead && styles.rankLead]}>{rank}</Text>
      <ShimmerBone shimmerX={shimmerX} style={styles.iconBone} />
      <ShimmerBone shimmerX={shimmerX} style={styles.titleBone} />
      <ShimmerBone shimmerX={shimmerX} style={styles.volBone} />
    </View>
  );
}

export function HomeHighlightCards({ markets, loading, onPressMarket, onExploreAll }: Props) {
  const { t } = useTranslation();
  const { formatDisplayVolume, isConverted } = useDisplayCurrency();
  const shimmerX = useShimmerX([-200, 200]);
  const slots = [0, 1, 2] as const;

  const volumeLabel = (usd: number) => {
    if (!Number.isFinite(usd) || usd < 0.5) return '—';
    const v = formatDisplayVolume(usd);
    if (v === '--') return '—';
    return isConverted ? `≈ ${v}` : v;
  };

  return (
    <View style={[styles.card, softShadow]}>
      <View style={styles.head}>
        <Ionicons name="flame" size={16} color="#F97316" />
        <Text style={styles.headTitle}>{t('hip4.home.trending')}</Text>
        <Text style={styles.volLabel}>{t('hip4.home.volume')}</Text>
      </View>
      {slots.map((i) => {
        if (loading) {
          return (
            <TrendingRowSkeleton
              key={`t-skel-${i}`}
              rank={i + 1}
              lead={i === 0}
              shimmerX={shimmerX}
            />
          );
        }
        const m = markets[i];
        if (!m) {
          return (
            <View key={`t-empty-${i}`} style={styles.item}>
              <Text style={[styles.rank, i === 0 && styles.rankLead]}>{i + 1}</Text>
              <Text style={styles.emptyLine}>—</Text>
            </View>
          );
        }
        return (
          <Pressable
            key={m.id}
            onPress={() => onPressMarket(m)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
          >
            <Text style={[styles.rank, i === 0 && styles.rankLead]}>{i + 1}</Text>
            <MarketSymbol market={m} size={28} radius={9} questionLevel />
            <Text style={styles.itemTitle} numberOfLines={1}>
              {marketTitle(m)}
            </Text>
            <Text style={styles.vol}>{volumeLabel(m.volumeUsd)}</Text>
          </Pressable>
        );
      })}
      <TouchableOpacity style={styles.cta} onPress={onExploreAll} activeOpacity={0.8}>
        <Text style={styles.ctaLabel}>{t('hip4.home.exploreAll')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  headTitle: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  volLabel: {
    minWidth: 64,
    textAlign: 'right',
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    paddingVertical: 7,
  },
  rank: {
    width: 14,
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: '#F97316',
  },
  rankLead: { color: colors.accent.goldDark },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text.primary,
  },
  emptyLine: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text.muted,
  },
  iconBone: {
    width: 28,
    height: 28,
    borderRadius: 9,
  },
  titleBone: {
    flex: 1,
    height: 13,
    borderRadius: 4,
  },
  volBone: {
    width: 52,
    height: 13,
    borderRadius: 4,
  },
  vol: {
    minWidth: 64,
    textAlign: 'right',
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.accent.goldDark,
  },
  cta: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: colors.accent.gold,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  ctaLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.accent.goldDark,
  },
});
