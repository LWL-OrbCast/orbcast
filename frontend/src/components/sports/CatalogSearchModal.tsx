import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import {
  displayListedTitle,
  HIP4_CATALOG_STALE_MS,
  impliedPercent,
  listOutcomes,
  topMarketsByVolume,
} from '../../lib/hip4';
import { applySearch } from '../../lib/marketCatalog';
import { pushRouteOnce } from '../../lib/pushRouteOnce';
import { MarketSymbol } from './MarketSymbol';

const PREVIEW = 6;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CatalogSearchModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');

  const catalog = useQuery({
    queryKey: ['hip4', 'outcomes', 'all'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    enabled: visible,
  });
  const all = catalog.data ?? [];

  const rows = useMemo(() => {
    const needle = query.trim();
    if (!needle) return topMarketsByVolume(all, PREVIEW);
    return applySearch(all, needle).slice(0, PREVIEW);
  }, [all, query]);

  const totalMatch = useMemo(() => {
    const needle = query.trim();
    if (!needle) return all.length;
    return applySearch(all, needle).length;
  }, [all, query]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [visible]);

  const goMarket = (id: string) => {
    onClose();
    pushRouteOnce(router, `/market/${id}`);
  };

  const goAll = () => {
    const needle = query.trim();
    onClose();
    const href = (
      needle
        ? `/markets?q=${encodeURIComponent(needle)}&view=open`
        : '/markets?view=open'
    ) as Href;
    router.navigate(href);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.host}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={styles.card}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.text.muted} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={t('hip4.markets.searchPlaceholder')}
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={goAll}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('common.close')}>
                <Ionicons name="close-circle" size={18} color={colors.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.chipWrap}>
            <Text style={styles.chip}>{t('hip4.nav.markets')}</Text>
          </View>

          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {catalog.isLoading && !catalog.data ? (
              <View style={styles.empty}>
                <ActivityIndicator color={colors.accent.gold} />
                <Text style={styles.emptyText}>{t('hip4.home.loading')}</Text>
              </View>
            ) : rows.length === 0 ? (
              <Text style={styles.emptyText}>{t('hip4.markets.noMatch')}</Text>
            ) : (
              rows.map((m) => {
                const yes = m.sides[0];
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.row}
                    onPress={() => goMarket(m.id)}
                    activeOpacity={0.8}
                  >
                    <MarketSymbol market={m} size={36} radius={12} />
                    <Text style={styles.heading} numberOfLines={2}>
                      {displayListedTitle(m)}
                    </Text>
                    <Text style={styles.pct}>{impliedPercent(yes?.probability ?? null)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity style={styles.seeAll} onPress={goAll} activeOpacity={0.8}>
            <Text style={styles.seeAllLabel}>
              {totalMatch > PREVIEW
                ? t('hip4.markets.seeAllResultsCount', { count: totalMatch })
                : t('hip4.markets.seeAllResults')}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accent.goldDark} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: '12%',
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.primary,
    overflow: 'hidden',
    maxHeight: '78%',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.primary,
    backgroundColor: colors.background.secondary,
  },
  input: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text.primary,
    paddingVertical: 12,
  },
  chipWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  chip: {
    alignSelf: 'flex-start',
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.text.primary,
    backgroundColor: colors.background.secondary,
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  list: { maxHeight: 360 },
  empty: { paddingVertical: 28, alignItems: 'center', gap: 8 },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heading: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.text.primary,
  },
  pct: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.text.primary,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  seeAllLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.accent.goldDark,
  },
});
