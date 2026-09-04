import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import { HIP4_CATALOG_POLL_MS, HIP4_CATALOG_STALE_MS, listOutcomes } from '../src/lib/hip4';
import {
  applyCatalogView,
  applySearch,
  applySportChip,
  type MarketCatalogView,
} from '../src/lib/marketCatalog';
import { HomeHeader } from '../src/components/sports/HomeHeader';
import { SportCategoryRow, type SportChipId } from '../src/components/sports/SportCategoryRow';
import { PredictionRow } from '../src/components/sports/PredictionRow';
import { useAppStore } from '../src/store/appStore';
import { pushRouteOnce } from '../src/lib/pushRouteOnce';
import { useTranslation } from 'react-i18next';

const VIEWS: { id: MarketCatalogView; labelKey: string }[] = [
  { id: 'endingSoon', labelKey: 'hip4.markets.endingSoon' },
  // View id `open` = unsettled books; chip copy is Live (see AGENTS.md).
  { id: 'open', labelKey: 'hip4.markets.live' },
  { id: 'upcoming', labelKey: 'hip4.status.upcoming' },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function MarketsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[]; view?: string | string[] }>();
  const focused = useIsFocused();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [queryText, setQueryText] = useState(() => firstParam(params.q) ?? '');
  const [view, setView] = useState<MarketCatalogView>(() => {
    const v = firstParam(params.view);
    return v === 'open' || v === 'upcoming' || v === 'endingSoon' ? v : 'endingSoon';
  });
  const [chip, setChip] = useState<SportChipId>('all');
  const [pullRefreshing, setPullRefreshing] = useState(false);

  useEffect(() => {
    const q = firstParam(params.q);
    if (q != null) setQueryText(q);
  }, [params.q]);

  useEffect(() => {
    const v = firstParam(params.view);
    if (v === 'open' || v === 'upcoming' || v === 'endingSoon') setView(v);
  }, [params.view]);

  const catalogQuery = useQuery({
    queryKey: ['hip4', 'outcomes', 'all'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    refetchInterval: focused ? HIP4_CATALOG_POLL_MS : false,
  });

  const all = catalogQuery.data ?? [];

  const rows = useMemo(() => {
    let next = applyCatalogView(all, view);
    next = applySportChip(next, chip);
    next = applySearch(next, queryText);
    return next;
  }, [all, view, chip, queryText]);

  const onPullRefresh = async () => {
    setPullRefreshing(true);
    try {
      await catalogQuery.refetch();
    } finally {
      setPullRefreshing(false);
    }
  };

  const openWalletOrLogin = () => {
    if (!isAuthenticated) {
      pushRouteOnce(router, '/login');
      return;
    }
    pushRouteOnce(router, '/profile');
  };

  const filters = (
    <View>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.text.muted} />
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder={t('hip4.markets.searchPlaceholder')}
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {queryText ? (
          <TouchableOpacity onPress={() => setQueryText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.text.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statusRow}
      >
        {VIEWS.map((s) => {
          const on = view === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.statusChip, on && styles.statusChipOn]}
              onPress={() => {
                setView(s.id);
                void Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.statusLabel, on && styles.statusLabelOn]}>{t(s.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.listHead}>
        <Text style={styles.countLabel}>{t('hip4.markets.count', { count: rows.length })}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HomeHeader kicker={t('hip4.header.markets')} onPressAvatar={openWalletOrLogin} />
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
        data={catalogQuery.isError || (catalogQuery.isLoading && !catalogQuery.data) ? [] : rows}
        style={styles.flex}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={filters}
        keyboardShouldPersistTaps="handled"
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
        ListEmptyComponent={
          catalogQuery.isLoading && !catalogQuery.data ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent.gold} />
              <Text style={styles.muted}>{t('hip4.home.loading')}</Text>
            </View>
          ) : catalogQuery.isError ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>{t('hip4.home.loadError')}</Text>
              <Text style={styles.muted}>{t('hip4.home.loadErrorHint')}</Text>
              <TouchableOpacity style={styles.retry} onPress={() => catalogQuery.refetch()}>
                <Text style={styles.retryLabel}>{t('hip4.home.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('hip4.markets.noMatch')}</Text>
              <Text style={styles.muted}>{t('hip4.markets.noMatchHint')}</Text>
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 10,
  },
  statusRow: { gap: 8, paddingBottom: 8 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  statusChipOn: {
    backgroundColor: '#ECFDF3',
    borderColor: colors.accent.gold,
  },
  statusLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.secondary,
  },
  statusLabelOn: {
    color: colors.accent.goldDark,
    fontFamily: fonts.bold,
  },
  listHead: { marginTop: 8, marginBottom: 8 },
  countLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text.tertiary,
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
