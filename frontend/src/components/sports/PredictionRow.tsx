import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  displayFeaturedHeading,
  questionCatalogLegs,
  type ListedMarket,
} from '../../lib/hip4';
import { colors } from '../../theme/colors';
import { MarketSymbol } from './MarketSymbol';
import { fonts } from '../../theme/fonts';
import { softShadow } from '../../theme/shadows';
import { useTranslation } from 'react-i18next';
import { useDisplayCurrency } from '../../providers/CurrencyProvider';
import { LEG_PALETTE, OddsPill } from './OddsPill';

type Props = {
  market: ListedMarket;
  catalog?: ListedMarket[];
  onPress: () => void;
  onPressLeg?: (market: ListedMarket) => void;
};

export const PredictionRow = React.memo(function PredictionRow({
  market,
  catalog = [],
  onPress,
  onPressLeg,
}: Props) {
  const { t } = useTranslation();
  const { formatDisplayVolume, isConverted } = useDisplayCurrency();
  const yes = market.sides[0];
  const no = market.sides[1];
  const siblings = useMemo(
    () => (catalog.length ? questionCatalogLegs(catalog, market) : [market]),
    [catalog, market],
  );
  const multiLeg = siblings.length > 1;
  const heading = displayFeaturedHeading(market);
  const sub = multiLeg
    ? null
    : market.subtitle && market.subtitle !== heading
      ? market.subtitle
      : null;
  const volUsd = multiLeg
    ? siblings.reduce((sum, m) => sum + (m.volumeUsd ?? 0), 0)
    : (market.volumeUsd ?? 0);
  const rawVol = formatDisplayVolume(volUsd);
  const amount =
    Number.isFinite(volUsd) && volUsd >= 0.5 && rawVol !== '--'
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
        <MarketSymbol market={market} size={44} radius={14} questionLevel={multiLeg} />
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={2}>
            {heading}
          </Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      {multiLeg ? (
        <View style={styles.stamps} pointerEvents="box-none">
          {siblings.map((leg, i) => {
            const px = leg.sides.find((s) => s.side === 0)?.probability ?? null;
            return (
              <View
                key={leg.id}
                style={[styles.stamp, siblings.length === 3 ? styles.stampTriple : null]}
              >
                <OddsPill
                  label={leg.legLabel || t('hip4.yes')}
                  probability={px}
                  accent={LEG_PALETTE[i % LEG_PALETTE.length]}
                  compact
                  onPress={onPressLeg ? () => onPressLeg(leg) : undefined}
                />
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.yesNo} pointerEvents="box-none">
          <OddsPill
            label={yes?.name ?? t('hip4.yes')}
            probability={yes?.probability ?? null}
            variant="yes"
            compact
            onPress={onPress}
          />
          {no ? (
            <OddsPill
              label={no.name ?? t('hip4.no')}
              probability={no.probability ?? null}
              variant="no"
              compact
              onPress={onPress}
            />
          ) : null}
        </View>
      )}
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
  stamps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  stamp: {
    width: '47%',
    flexGrow: 1,
  },
  stampTriple: {
    width: '31%',
    flexGrow: 1,
  },
  yesNo: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
