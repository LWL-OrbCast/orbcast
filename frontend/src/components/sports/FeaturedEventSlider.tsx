import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  displayFeaturedHeading,
  formatHighlightVolume,
  questionSiblings,
  type ListedMarket,
} from '../../lib/hip4';
import { footballChromeFixture, type FootballFixture } from '../../lib/sportsFootball';
import { isFootballContestMarket } from '../../lib/marketCatalog';
import { FootballFeaturedCard } from './FeaturedMatchCard';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { MarketSymbol } from './MarketSymbol';
import { LEG_PALETTE, OddsPill, YES_COLOR } from './OddsPill';
import { useTranslation } from 'react-i18next';

type Props = {
  markets: ListedMarket[];
  catalog: ListedMarket[];
  fixtures?: FootballFixture[];
  onPressQuestion: (market: ListedMarket) => void;
  onPressLeg: (market: ListedMarket) => void;
};

export function FeaturedEventSlider({
  markets,
  catalog,
  fixtures = [],
  onPressQuestion,
  onPressLeg,
}: Props) {
  const market = markets[0];
  if (!market) return null;

  const football = footballChromeFixture(fixtures, market);
  if (isFootballContestMarket(market) && football) {
    return (
      <FootballFeaturedCard
        fixture={football}
        book={market}
        catalog={catalog}
        onPress={() => onPressQuestion(market)}
        onPressLeg={onPressLeg}
      />
    );
  }

  return (
    <GenericFeaturedCard
      market={market}
      catalog={catalog}
      onPressQuestion={onPressQuestion}
      onPressLeg={onPressLeg}
    />
  );
}

const CARD_PAD = 18;
const TITLE_ICON = 44;
const TITLE_GAP = 12;

const GenericFeaturedCard = React.memo(function GenericFeaturedCard({
  market,
  catalog,
  onPressQuestion,
  onPressLeg,
}: {
  market: ListedMarket;
  catalog: ListedMarket[];
  onPressQuestion: (market: ListedMarket) => void;
  onPressLeg: (market: ListedMarket) => void;
}) {
  const { t } = useTranslation();
  const siblings = useMemo(() => questionSiblings(catalog, market), [catalog, market]);
  const multiLeg = siblings.length > 1;
  const heading = displayFeaturedHeading(market);
  const yes = market.sides[0];
  const no = market.sides[1];
  const statusLabel =
    market.status === 'live'
      ? t('hip4.status.live')
      : market.status === 'upcoming'
        ? t('hip4.status.upcoming')
        : t('hip4.status.settled');
  const volUsd = multiLeg
    ? siblings.reduce((sum, m) => sum + (m.volumeUsd ?? 0), 0)
    : (market.volumeUsd ?? 0);
  const vol = formatHighlightVolume(volUsd);
  const endLabel = market.expiresAt
    ? `Ends ${new Date(market.expiresAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`
    : null;
  const metaParts = [vol !== '—' ? `${vol} Vol` : null, endLabel].filter(Boolean);
  const meta = metaParts.join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.statusDot, market.status === 'live' && styles.statusDotLive]} />
        <Text style={styles.status}>{statusLabel}</Text>
      </View>
      <Pressable
        onPress={() => onPressQuestion(market)}
        style={({ pressed }) => [styles.titleRow, pressed && { opacity: 0.88 }]}
      >
        <MarketSymbol market={market} size={TITLE_ICON} radius={12} questionLevel />
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{heading}</Text>
        </View>
      </Pressable>
      {multiLeg ? (
        <View style={styles.stamps}>
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
                  onPress={() => onPressLeg(leg)}
                />
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.yesNo}>
          <OddsPill
            label={yes?.name ?? t('hip4.yes')}
            probability={yes?.probability ?? null}
            variant="yes"
            compact
            onPress={() => onPressQuestion(market)}
          />
          <OddsPill
            label={no?.name ?? t('hip4.no')}
            probability={no?.probability ?? null}
            variant="no"
            compact
            onPress={() => onPressQuestion(market)}
          />
        </View>
      )}
      {meta ? (
        <View style={styles.footer}>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: colors.background.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: CARD_PAD,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.text.muted,
  },
  statusDotLive: { backgroundColor: YES_COLOR },
  status: {
    color: colors.text.secondary,
    fontSize: 12,
    fontFamily: fonts.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
    gap: TITLE_GAP,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  title: {
    color: colors.text.primary,
    fontSize: 18,
    fontFamily: fonts.extraBold,
    lineHeight: 24,
    flexShrink: 1,
  },
  stamps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
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
  footer: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    flex: 1,
    minWidth: 0,
    color: colors.text.tertiary,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
});
