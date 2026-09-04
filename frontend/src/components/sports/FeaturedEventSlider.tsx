import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ListedMarket } from '../../lib/hip4';
import { displayListedTitle, questionSiblings } from '../../lib/hip4';
import { useFeaturedAutoplay } from '../../lib/useFeaturedAutoplay';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { MarketSymbol } from './MarketSymbol';
import { LEG_PALETTE, OddsPill, YES_COLOR } from './OddsPill';
import { useTranslation } from 'react-i18next';

type Props = {
  markets: ListedMarket[];
  catalog: ListedMarket[];
  onPressQuestion: (market: ListedMarket) => void;
  onPressLeg: (market: ListedMarket) => void;
};

export function FeaturedEventSlider({ markets, catalog, onPressQuestion, onPressLeg }: Props) {
  const [pageW, setPageW] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const scroller = useRef<ScrollView>(null);
  const fromScroll = useRef(false);
  const { index, progress, go, pause, resume } = useFeaturedAutoplay(markets.length);
  const pageH = heights[markets[index]?.id ?? ''] ?? 0;

  useEffect(() => {
    if (pageW <= 0) return;
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    scroller.current?.scrollTo({ x: index * pageW, animated: true });
  }, [index, pageW]);

  if (!markets.length) return null;

  return (
    <View onLayout={(e) => setPageW(e.nativeEvent.layout.width)}>
      <View style={pageH > 0 ? { height: pageH, overflow: 'hidden' } : undefined}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          style={pageH > 0 ? { height: pageH } : undefined}
          contentContainerStyle={styles.pagerRow}
          onScrollBeginDrag={pause}
          onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            resume();
            if (pageW <= 0) return;
            fromScroll.current = true;
            go(Math.round(e.nativeEvent.contentOffset.x / pageW));
          }}
        >
          {markets.map((m) => (
            <View
              key={m.id}
              style={[pageW > 0 ? { width: pageW } : styles.pageFallback, styles.page]}
            >
              <FeaturedSlide
                market={m}
                catalog={catalog}
                pageW={pageW}
                onHeight={(next) => {
                  setHeights((prev) => (prev[m.id] === next ? prev : { ...prev, [m.id]: next }));
                }}
                pager={
                  markets.length > 1 ? (
                    <FeaturedDots
                      markets={markets}
                      index={index}
                      progress={progress}
                      onDot={go}
                    />
                  ) : null
                }
                onPressQuestion={onPressQuestion}
                onPressLeg={onPressLeg}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function FeaturedDots({
  markets,
  index,
  progress,
  onDot,
}: {
  markets: ListedMarket[];
  index: number;
  progress: number;
  onDot: (i: number) => void;
}) {
  return (
    <View style={styles.dots}>
      {markets.map((m, i) => {
        const on = i === index;
        return (
          <Pressable
            key={m.id}
            onPress={() => onDot(i)}
            hitSlop={8}
            style={[styles.dot, on && styles.dotOn]}
          >
            {on ? (
              <View style={[styles.dotFill, { width: `${Math.round(progress * 100)}%` }]} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const CARD_PAD = 18;
const TITLE_ICON = 44;
const TITLE_GAP = 12;

function FeaturedSlide({
  market,
  catalog,
  pageW,
  pager,
  onHeight,
  onPressQuestion,
  onPressLeg,
}: {
  market: ListedMarket;
  catalog: ListedMarket[];
  pageW: number;
  pager: React.ReactNode;
  onHeight: (h: number) => void;
  onPressQuestion: (market: ListedMarket) => void;
  onPressLeg: (market: ListedMarket) => void;
}) {
  const { t } = useTranslation();
  const siblings = useMemo(() => questionSiblings(catalog, market), [catalog, market]);
  const multiLeg = siblings.length > 1;
  const heading = multiLeg
    ? market.questionName || displayListedTitle(market)
    : displayListedTitle(market);
  const yes = market.sides[0];
  const no = market.sides[1];
  const statusLabel =
    market.status === 'live'
      ? t('hip4.status.live')
      : market.status === 'upcoming'
        ? t('hip4.status.upcoming')
        : t('hip4.status.settled');
  const titleMaxW = pageW > 0 ? Math.max(0, pageW - CARD_PAD * 2 - TITLE_ICON - TITLE_GAP) : undefined;

  return (
    <View
      style={styles.card}
      onLayout={(e) => onHeight(Math.ceil(e.nativeEvent.layout.height))}
    >
      <View style={styles.topRow}>
        <View style={[styles.statusDot, market.status === 'live' && styles.statusDotLive]} />
        <Text style={styles.status}>{statusLabel}</Text>
      </View>
      <Pressable
        onPress={() => onPressQuestion(market)}
        style={({ pressed }) => [styles.titleRow, pressed && { opacity: 0.88 }]}
      >
        <MarketSymbol market={market} size={TITLE_ICON} radius={12} questionLevel />
        <View style={[styles.titleWrap, titleMaxW != null ? { maxWidth: titleMaxW } : null]}>
          <Text style={styles.title}>
            {heading}
          </Text>
        </View>
      </Pressable>
      {multiLeg ? (
        <View style={styles.stamps}>
          {siblings.map((leg, i) => {
            const px = leg.sides.find((s) => s.side === 0)?.probability ?? null;
            return (
              <View key={leg.id} style={styles.stamp}>
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
      {pager ? <View style={styles.pager}>{pager}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pagerRow: { alignItems: 'flex-start' },
  pageFallback: { width: '100%' },
  page: { alignSelf: 'stretch' },
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
    alignItems: 'flex-start',
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
  yesNo: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  pager: {
    marginTop: 14,
    alignItems: 'flex-end',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border.primary,
    overflow: 'hidden',
  },
  dotOn: {
    width: 32,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border.primary,
  },
  dotFill: {
    height: '100%',
    backgroundColor: colors.text.primary,
    borderRadius: 4,
  },
});
