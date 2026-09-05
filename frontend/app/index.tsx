import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import {
  HIP4_CATALOG_POLL_MS,
  HIP4_CATALOG_STALE_MS,
  listOutcomes,
  questionTicketMarket,
} from '../src/lib/hip4';
import {
  applyCatalogView,
  applySportChip,
  catalogEmptyKind,
  featuredCatalogMarkets,
  sportOnlyChipForMarket,
  trendingCatalogMarkets,
} from '../src/lib/marketCatalog';
import { fetchEplBoard } from '../src/lib/sportsFootball';
import { HomeHeader } from '../src/components/sports/HomeHeader';
import { SportCategoryRow, type SportChipId } from '../src/components/sports/SportCategoryRow';
import { FeaturedEventSlider } from '../src/components/sports/FeaturedEventSlider';
import { FeaturedMatchCard } from '../src/components/sports/FeaturedMatchCard';
import { HomeHighlightCards } from '../src/components/sports/HomeHighlightCards';
import { PredictionRow } from '../src/components/sports/PredictionRow';
import { useAppStore } from '../src/store/appStore';
import { navigateRouteOnce, pushRouteOnce } from '../src/lib/pushRouteOnce';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

const ENDING_SOON_PREVIEW = 12;

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const focused = useIsFocused();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [chip, setChip] = useState<SportChipId>('all');
  const [showAllEndingSoon, setShowAllEndingSoon] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['hip4', 'outcomes', 'all'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    refetchInterval: focused ? HIP4_CATALOG_POLL_MS : false,
  });

  const all = query.data ?? [];
  const scoped = useMemo(() => applySportChip(all, chip), [all, chip]);
  const trending = useMemo(() => trendingCatalogMarkets(all, chip, 3), [all, chip]);
  const featured = useMemo(() => featuredCatalogMarkets(all, chip, 5), [all, chip]);

  const eplQuery = useQuery({
    queryKey: ['sports', 'football', 'epl'],
    queryFn: fetchEplBoard,
    staleTime: 45_000,
    refetchInterval: (q) => (q.state.data?.featured?.live ? 45_000 : 90_000),
    retry: 1,
  });
  const showEplHero = chip === 'football';
  const eplTapTarget =
    featured.find((m) => sportOnlyChipForMarket(m) === 'football') ??
    scoped.find((m) => sportOnlyChipForMarket(m) === 'football') ??
    null;

  const onPullRefresh = async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ['sports', 'football', 'epl'] }),
      ]);
    } finally {
      setPullRefreshing(false);
    }
  };

  const rows = useMemo(
    () => applyCatalogView(scoped, 'endingSoon'),
    [scoped],
  );
  const visibleRows = useMemo(
    () => (showAllEndingSoon ? rows : rows.slice(0, ENDING_SOON_PREVIEW)),
    [rows, showAllEndingSoon],
  );
  const endingSoonHidden = Math.max(0, rows.length - ENDING_SOON_PREVIEW);
  const emptyKind = catalogEmptyKind(chip, scoped.length);

  useEffect(() => {
    setShowAllEndingSoon(false);
  }, [chip]);

  const openWalletOrLogin = () => {
    if (!isAuthenticated) {
      pushRouteOnce(router, '/login');
      return;
    }
    pushRouteOnce(router, '/profile');
  };

  const header = (
    <View>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="sparkles" size={16} color={colors.accent.gold} />
          <Text style={styles.sectionTitle}>{t('hip4.home.topEvent')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            void Haptics.selectionAsync();
            navigateRouteOnce(router, '/markets');
          }}
          hitSlop={8}
        >
          <Text style={styles.seeAll}>{t('hip4.home.seeAll')}</Text>
        </TouchableOpacity>
      </View>
      {showEplHero ? (
        <FeaturedMatchCard
          onPress={() => {
            const target = eplTapTarget ?? scoped[0];
            if (!target) return;
            pushRouteOnce(router, `/market/${target.id}`);
          }}
        />
      ) : featured.length ? (
        <FeaturedEventSlider
          markets={featured}
          catalog={all}
          onPressQuestion={(m) =>
            pushRouteOnce(router, `/market/${questionTicketMarket(all, m).id}`)
          }
          onPressLeg={(m) => pushRouteOnce(router, `/market/${m.id}`)}
        />
      ) : query.isPending && !query.data ? null : (
        <Text style={styles.muted}>{t('hip4.home.noTodayEvents')}</Text>
      )}
      <View style={styles.highlightWrap}>
        <HomeHighlightCards
          markets={trending}
          loading={query.isPending && !query.data}
          onPressMarket={(m) =>
            pushRouteOnce(router, `/market/${questionTicketMarket(all, m).id}`)
          }
          onExploreAll={() => {
            void Haptics.selectionAsync();
            navigateRouteOnce(router, '/markets');
          }}
        />
      </View>
      <View style={[styles.sectionHead, styles.listHead]}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="trending-up" size={16} color={colors.accent.gold} />
          <Text style={styles.sectionTitle}>{t('hip4.home.endingSoon')}</Text>
        </View>
        <Text style={styles.count}>{rows.length}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HomeHeader onPressAvatar={openWalletOrLogin} />
      <View style={styles.catsWrap}>
        <SportCategoryRow
          active={chip}
          onChange={(id) => {
            setChip(id);
            void Haptics.selectionAsync();
          }}
        />
      </View>

      <FlashList
        data={query.isError || (query.isLoading && !query.data) ? [] : visibleRows}
        style={styles.flex}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.accent.gold}
          />
        }
        renderItem={({ item }) => (
          <PredictionRow
            market={item}
            onPress={() => pushRouteOnce(router, `/market/${item.id}`)}
          />
        )}
        ListFooterComponent={
          endingSoonHidden > 0 && !showAllEndingSoon && visibleRows.length > 0 ? (
            <TouchableOpacity
              style={styles.showMore}
              onPress={() => {
                void Haptics.selectionAsync();
                setShowAllEndingSoon(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.showMoreLabel}>
                {t('hip4.home.showMore', { count: endingSoonHidden })}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          query.isLoading && !query.data ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent.gold} />
              <Text style={styles.muted}>{t('hip4.home.loading')}</Text>
            </View>
          ) : query.isError ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>{t('hip4.home.loadError')}</Text>
              <Text style={styles.muted}>{t('hip4.home.loadErrorHint')}</Text>
              <TouchableOpacity style={styles.retry} onPress={() => query.refetch()}>
                <Text style={styles.retryLabel}>{t('hip4.home.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {emptyKind === 'crypto'
                  ? t('hip4.home.noCrypto')
                  : emptyKind === 'stocks'
                    ? t('hip4.home.noStocks')
                    : emptyKind === 'economics'
                      ? t('hip4.home.noEconomics')
                      : emptyKind === 'sports'
                        ? t('hip4.home.noSports')
                        : t('hip4.home.noEndingSoon')}
              </Text>
              {emptyKind ? (
                <Text style={styles.muted}>
                  {emptyKind === 'crypto'
                    ? t('hip4.home.noCryptoHint')
                    : emptyKind === 'stocks'
                      ? t('hip4.home.noStocksHint')
                      : emptyKind === 'economics'
                        ? t('hip4.home.noEconomicsHint')
                        : t('hip4.home.noSportsHint')}
                </Text>
              ) : null}
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.primary },
  catsWrap: { flexGrow: 0, flexShrink: 0 },
  flex: { flex: 1, minHeight: 0 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginBottom: 10,
  },
  listHead: { marginTop: 18, marginBottom: 12, paddingHorizontal: 0 },
  highlightWrap: { marginTop: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.text.primary,
  },
  seeAll: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.accent.goldDark,
  },
  count: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  showMore: {
    marginTop: 8,
    marginBottom: 8,
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.card,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  showMoreLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.accent.goldDark,
  },
  center: { paddingHorizontal: 28, paddingTop: 16, alignItems: 'center', gap: 8 },
  emptyCard: {
    backgroundColor: colors.background.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.text.primary,
    textAlign: 'center',
  },
  muted: {
    fontFamily: fonts.medium,
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retry: {
    marginTop: 8,
    backgroundColor: colors.accent.gold,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryLabel: { fontFamily: fonts.bold, color: '#FFFFFF' },
});
