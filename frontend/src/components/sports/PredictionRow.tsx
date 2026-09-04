import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { ListedMarket } from '../../lib/hip4';
import { impliedPercent } from '../../lib/hip4';
import { colors } from '../../theme/colors';
import { MarketSymbol } from './MarketSymbol';
import { fonts } from '../../theme/fonts';
import { softShadow } from '../../theme/shadows';
import { useTranslation } from 'react-i18next';
import { useDisplayCurrency } from '../../providers/CurrencyProvider';

type Props = {
  market: ListedMarket;
  onPress: () => void;
};

export const PredictionRow = React.memo(function PredictionRow({ market, onPress }: Props) {
  const { t } = useTranslation();
  const { formatDisplayVolume, isConverted } = useDisplayCurrency();
  const yes = market.sides[0];
  const lead = yes?.probability ?? 0.5;
  const leadPct = impliedPercent(yes?.probability ?? null);
  const grouped = market.multiOutcome;
  const heading = grouped && market.questionName ? market.questionName : market.title;
  const sub = grouped ? market.legLabel : market.subtitle;
  const leadName = grouped ? market.legLabel : (yes?.name ?? t('hip4.yes'));
  const rawVol = formatDisplayVolume(market.volumeUsd);
  const amount =
    Number.isFinite(market.volumeUsd) && market.volumeUsd >= 0.5 && rawVol !== '--'
      ? isConverted
        ? `≈ ${rawVol}`
        : rawVol
      : '';
  const vol = amount ? t('hip4.row.volume', { amount }) : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, softShadow, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.meta}>
        {market.status === 'live' ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t('hip4.status.live')}</Text>
          </View>
        ) : (
          <Text style={styles.when}>
            {market.status === 'upcoming' ? t('hip4.status.upcoming') : t('hip4.status.settled')}
          </Text>
        )}
        {vol ? <Text style={styles.vol}>{vol}</Text> : null}
      </View>
      <View style={styles.body}>
        <MarketSymbol market={market} size={44} radius={14} />
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={2}>
            {heading}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View style={styles.pctWrap}>
          <Text style={styles.pct}>{leadPct}</Text>
          <Text style={styles.pctSide} numberOfLines={1}>
            {leadName}
          </Text>
          <View style={styles.miniBar}>
            <View style={[styles.miniFill, { width: `${Math.round(Math.min(1, Math.max(0, lead)) * 100)}%` }]} />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mid: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  liveText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: '#B91C1C',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  when: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  vol: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.text.muted,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 19,
  },
  sub: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  pctWrap: { width: 78, alignItems: 'flex-end' },
  pct: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.accent.goldDark,
  },
  pctSide: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 1,
  },
  miniBar: {
    marginTop: 6,
    width: 64,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.background.tertiary,
    overflow: 'hidden',
  },
  miniFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent.gold,
  },
});
