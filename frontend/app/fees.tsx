import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme/colors';
import { useBuilderConfig } from '../src/providers/BuilderConfigProvider';
import { BRAND_NAME } from '../src/lib/brand';

type FeeRow = {
  category: string;
  assets: string;
  buy: string;
  sellMaker: string;
  sellTaker: string;
};

type OtherFeeValue = 'free' | '0.2%' | '1USDC' | '5USD' | '50USD';

const OTHER_FEES_CORE: { key: string; fee: OtherFeeValue }[] = [
  { key: 'walletCreation', fee: 'free' },
  { key: 'deposits', fee: 'free' },
  { key: 'walletToTrade', fee: 'free' },
  { key: 'tradeToWallet', fee: '1USDC' },
  { key: 'withdrawals', fee: 'free' },
];

const OTHER_FEES = OTHER_FEES_CORE;

function formatOtherFeeValue(fee: OtherFeeValue, freeLabel: string): string {
  switch (fee) {
    case 'free':
      return freeLabel;
    case '1USDC':
      return '1 USDC';
    case '5USD':
      return '5 USD';
    case '50USD':
      return '50 USD';
    default:
      return fee;
  }
}

function formatBuilderPercent(rate: number, freeLabel: string, digits = 3): string {
  if (!Number.isFinite(rate) || rate <= 0) return freeLabel;
  return `${(rate * 100).toFixed(digits)}%`;
}

export default function FeesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { builderFeeRate, isLoading } = useBuilderConfig();
  const freeLabel = t('fees.free');

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const sellFeeLabel = useMemo(
    () => formatBuilderPercent(builderFeeRate, freeLabel),
    [builderFeeRate, freeLabel],
  );

  const tradingRows: FeeRow[] = useMemo(
    () => [
      {
        category: 'predictions',
        assets: t('fees.categories.predictionsAssets'),
        buy: freeLabel,
        sellMaker: sellFeeLabel,
        sellTaker: sellFeeLabel,
      },
    ],
    [freeLabel, sellFeeLabel, t],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('fees.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[`${colors.accent.gold}12`, `${colors.accent.purple}12`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.compareBanner}
        >
          <View style={styles.compareRow}>
            <View style={styles.compareItem}>
              <Text style={styles.compareLabel}>{t('fees.binance')}</Text>
              <Text style={styles.compareFeeStrike}>0.100%</Text>
              <Text style={styles.compareNote}>{t('fees.standardUser')}</Text>
            </View>
            <View style={styles.compareDivider} />
            <View style={styles.compareItem}>
              <Text style={[styles.compareLabel, { color: colors.accent.gold }]}>
                {BRAND_NAME}
              </Text>
              <Text style={styles.compareFeeGood}>{freeLabel}</Text>
              <Text style={[styles.compareNote, { color: colors.accent.gold }]}>{t('fees.startsAt')}</Text>
            </View>
          </View>
        </LinearGradient>

        <Text style={styles.sectionNote}>{t('fees.tradingFeesNote')}</Text>

        <Text style={styles.sectionTitle}>{t('fees.tradingFees')}</Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.cellWide, { textAlign: 'left' }]}>
            {t('fees.market')}
          </Text>
          <Text style={styles.tableHeaderCell}>{t('fees.buy')}</Text>
          <Text style={styles.tableHeaderCell}>{t('fees.sellMaker')}</Text>
          <Text style={styles.tableHeaderCell}>{t('fees.sellTaker')}</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent.gold} />
          </View>
        ) : (
          tradingRows.map((row, idx) => (
            <View key={row.category} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowAlt]}>
              <View style={styles.cellWide}>
                <Text style={styles.cellLabel}>{t(`fees.categories.${row.category}`)}</Text>
                <Text style={styles.cellAssets}>{row.assets}</Text>
              </View>
              <View style={styles.cellNarrow}>
                <Text style={[styles.cellFee, row.buy === freeLabel && { color: colors.status.success }]}>
                  {row.buy}
                </Text>
              </View>
              <View style={styles.cellNarrow}>
                <Text
                  style={[styles.cellFee, row.sellMaker === freeLabel && { color: colors.status.success }]}
                >
                  {row.sellMaker}
                </Text>
              </View>
              <View style={styles.cellNarrow}>
                <Text
                  style={[styles.cellFee, row.sellTaker === freeLabel && { color: colors.status.success }]}
                >
                  {row.sellTaker}
                </Text>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionHint}>{t('fees.makerTakerHint')}</Text>

        <Text style={styles.sectionTitle}>{t('fees.otherFees')}</Text>

        {OTHER_FEES.map((item, idx) => (
          <View key={item.key} style={[styles.otherFeeRow, idx % 2 === 0 && styles.tableRowAlt]}>
            <Text style={styles.otherFeeLabel}>{t(`fees.other.${item.key}`)}</Text>
            <View style={styles.otherFeeBadge}>
              <Text style={[
                styles.otherFeeValue,
                item.fee === 'free' && { color: colors.status.success },
              ]}>
                {formatOtherFeeValue(item.fee, freeLabel)}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.rewardsNote}>
          <Ionicons name="trophy-outline" size={16} color={colors.accent.gold} />
          <Text style={styles.rewardsNoteText}>{t('fees.rewardsNote')}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  backButton: { padding: 6 },
  headerSpacer: { width: 28 },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 56 },

  compareBanner: {
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}20`,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compareItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  compareDivider: {
    width: 1,
    height: 48,
    backgroundColor: colors.border.primary,
    marginHorizontal: 8,
  },
  compareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  compareFeeStrike: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.tertiary,
    textDecorationLine: 'line-through',
  },
  compareFeeGood: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.accent.gold,
  },
  compareNote: {
    fontSize: 11,
    color: colors.text.tertiary,
  },

  sectionNote: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 10,
    marginTop: 8,
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'right',
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.tertiary,
    marginTop: 4,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tableRowAlt: {
    backgroundColor: colors.background.secondary,
  },
  cellWide: { flex: 1.7 },
  cellNarrow: { flex: 1, alignItems: 'flex-end' },
  cellLabel: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  cellAssets: { fontSize: 11, color: colors.text.tertiary, marginTop: 2 },
  cellFee: { fontSize: 11, fontWeight: '700', color: colors.text.primary, textAlign: 'right' },

  loadingRow: {
    paddingVertical: 28,
    alignItems: 'center',
  },

  otherFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  otherFeeLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    paddingRight: 12,
  },
  otherFeeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  otherFeeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },

  rewardsNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: `${colors.accent.gold}10`,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}25`,
  },
  rewardsNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
});
