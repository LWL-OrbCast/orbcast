import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import {
  formatUsdCompactPublic,
  marketRulesFacts,
  rankActiveWallets,
  shortWallet,
  type ListedMarket,
  type OutcomePrint,
} from '../../lib/hip4';
import { YES_COLOR, NO_COLOR } from './OddsPill';
import { useTranslation } from 'react-i18next';

type Tab = 'trades' | 'active' | 'rules';

type Props = {
  market: ListedMarket;
  prints: OutcomePrint[];
  tapeReady: boolean;
  multiLeg: boolean;
  legNames: Record<number, string>;
};

function timeAgo(ms: number, t: (key: string) => string): string {
  const d = Math.max(0, Date.now() - ms);
  if (d < 15_000) return t('hip4.activity.now');
  if (d < 60_000) return `${Math.floor(d / 1000)}s`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  return `${Math.floor(d / 3_600_000)}h`;
}

export function MarketActivityTabs({ market, prints, tapeReady, multiLeg, legNames }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('trades');
  const rules = marketRulesFacts(market, multiLeg, t);
  const active = tab === 'active' ? rankActiveWallets(prints, 10) : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {(
          [
            ['trades', 'hip4.activity.trades'],
            ['active', 'hip4.activity.active'],
            ['rules', 'hip4.activity.rules'],
          ] as const
        ).map(([id, key]) => {
          const on = tab === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => setTab(id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t(key)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'trades' ? (
        prints.length === 0 ? (
          <Text style={styles.empty}>
            {tapeReady ? t('hip4.activity.noTrades') : t('hip4.activity.waitingPrints')}
          </Text>
        ) : (
          prints.slice(0, 24).map((p) => {
            const buy = p.takerSide === 'buy';
            const tone = buy ? YES_COLOR : NO_COLOR;
            const fromMap = p.outcomeId >= 0 ? legNames[p.outcomeId] : undefined;
            const sideName =
              fromMap ??
              (p.side === 0 || p.side === 1
                ? market.sides.find((s) => s.side === p.side)?.name ?? (p.side === 0 ? t('hip4.yes') : t('hip4.no'))
                : t('hip4.yes'));
            return (
              <View key={p.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: tone }]} />
                <Text style={[styles.side, { color: tone }]} numberOfLines={1}>
                  {buy ? t('hip4.ticket.buy') : t('hip4.ticket.sell')} {sideName}
                </Text>
                <Text style={styles.px}>{Math.round(p.px * 100)}¢</Text>
                <Text style={styles.sz}>{p.sz.toLocaleString(undefined, { maximumFractionDigits: 1 })}</Text>
                <Text style={styles.when}>{timeAgo(p.time, t)}</Text>
              </View>
            );
          })
        )
      ) : null}

      {tab === 'active' ? (
        active.length === 0 ? (
          <Text style={styles.empty}>{t('hip4.activity.activeEmpty')}</Text>
        ) : (
          active.map((w, i) => (
            <View key={w.address} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.wallet} numberOfLines={1}>
                {shortWallet(w.address)}
              </Text>
              <Text style={styles.vol}>${formatUsdCompactPublic(w.volumeUsd)}</Text>
              <Text style={styles.when}>
                {t('hip4.activity.tx', { count: w.trades })}
              </Text>
            </View>
          ))
        )
      ) : null}

      {tab === 'rules' ? (
        <View style={styles.rules}>
          <Text style={styles.ruleBody}>{rules.body}</Text>
          {rules.facts.map((line) => (
            <Text key={line} style={styles.ruleMeta}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: colors.background.card },
  tabLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  tabLabelOn: { color: colors.text.primary, fontFamily: fonts.bold },
  empty: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.primary,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  side: { flex: 1.2, fontFamily: fonts.bold, fontSize: 12 },
  px: {
    width: 40,
    textAlign: 'right',
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.text.primary,
  },
  sz: {
    width: 52,
    textAlign: 'right',
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  when: {
    width: 44,
    textAlign: 'right',
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  rank: {
    width: 20,
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.accent.goldDark,
  },
  wallet: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text.primary,
  },
  vol: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text.primary,
  },
  rules: { gap: 8, paddingVertical: 4 },
  ruleBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },
  ruleMeta: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text.primary,
  },
});
