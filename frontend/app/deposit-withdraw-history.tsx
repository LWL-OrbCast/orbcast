import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useActiveEthereumWallet } from '../src/hooks/useActiveEthereumWallet';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { colors } from '../src/theme/colors';
import { useAuth } from '../src/providers/AuthContext';
import { showToast } from '../src/lib/toast';
import { getUserDepositWithdrawalHistory } from '../src/lib/hyperliquid';
import { openHttpsUrl } from '../src/lib/openHttpsUrl';
import { 
  fetchArbitrumUsdcTransfers, 
  getPendingTransactions, 
  cleanupOldPendingTransactions,
  removePendingTransaction,
  PendingTransaction,
} from '../src/lib/arbTransfers';

type Hex = `0x${string}`;

// Hyperliquid Bridge2 address (deposits/withdrawals go through this)
const HL_BRIDGE2 = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7'.toLowerCase();

// Unified transaction type for display
type UnifiedTransaction = {
  id: string;
  hash: string | null;
  type: 'deposit_trade' | 'withdraw_trade' | 'receive_wallet' | 'send_wallet' | 'pending';
  amount: string;
  timestamp: number;
  status: 'pending' | 'confirmed';
  description: string;
  from?: string;
  to?: string;
};

const INITIAL_DISPLAY_COUNT = 7;
const LOAD_MORE_COUNT = 10;
const PENDING_GRACE_MS = 3 * 60 * 1000; // Keep "processing" for ≥3 min after initiation

function arbiscanTxUrl(hash: string): string {
  return `https://arbiscan.io/tx/${hash}`;
}

export default function DepositWithdrawHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();
  const { wallet: embeddedWallet, address: activeAddr } = useActiveEthereumWallet();
  const embeddedAddress = (activeAddr || '') as Hex;
  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isReady, router]);

  if (!isReady) {
    return <SafeAreaView style={styles.container} />;
  }

  const userAddress = embeddedAddress;
  const userAddressLower = userAddress?.toLowerCase() || '';

  // Fetch pending transactions from local storage
  const loadPendingTxs = useCallback(async () => {
    await cleanupOldPendingTransactions();
    const pending = await getPendingTransactions();
    setPendingTxs(pending);
  }, []);

  useEffect(() => {
    loadPendingTxs();
  }, [loadPendingTxs]);

  // Fetch Hyperliquid ledger updates (trade balance movements)
  const { data: hlLedger, isLoading: hlLoading, refetch: refetchHl, isRefetching: hlRefetching } = useQuery({
    queryKey: ['hl_deposit_withdraw_history', userAddress],
    queryFn: () => getUserDepositWithdrawalHistory(userAddress),
    enabled: !!userAddress && userAddress.startsWith('0x'),
    refetchInterval: 30000,
  });

  // Fetch Arbitrum USDC transfers (wallet balance movements)
  const { data: arbTransfers, isLoading: arbLoading, refetch: refetchArb, isRefetching: arbRefetching } = useQuery({
    queryKey: ['arb_usdc_transfers', userAddress],
    queryFn: () => fetchArbitrumUsdcTransfers(userAddress),
    enabled: !!userAddress && userAddress.startsWith('0x'),
    refetchInterval: 30000,
  });

  const isLoading = hlLoading || arbLoading;
  const isRefetching = hlRefetching || arbRefetching;

  const refetch = useCallback(() => {
    setDisplayCount(INITIAL_DISPLAY_COUNT); // Reset pagination on refresh
    refetchHl();
    refetchArb();
    loadPendingTxs();
  }, [refetchHl, refetchArb, loadPendingTxs]);

  // Track which pending tx hashes should be cleaned up (collected during memo, flushed via effect)
  const pendingToRemoveRef = useRef<string[]>([]);

  // Merge and deduplicate all transactions
  const unifiedTransactions = useMemo(() => {
    const transactions: UnifiedTransaction[] = [];
    const seenHashes = new Set<string>();
    const toRemove: string[] = [];

    // 1. Add pending transactions first
    for (const pending of pendingTxs) {
      const hashLower = pending.hash.toLowerCase();
      seenHashes.add(hashLower);
      
      let description = t('transactionHistory.processing');
      let unifiedType: UnifiedTransaction['type'] = 'pending';
      if (pending.type === 'deposit') { description = t('transactionHistory.depositToTradeBalance'); unifiedType = 'deposit_trade'; }
      else if (pending.type === 'withdraw') { description = t('transactionHistory.withdrawToWallet'); unifiedType = 'withdraw_trade'; }
      else if (pending.type === 'transfer_out') { description = t('transactionHistory.sendingToExternalWallet'); unifiedType = 'send_wallet'; }
      else if (pending.type === 'transfer_in') { description = t('transactionHistory.receivingUsdc'); unifiedType = 'receive_wallet'; }

      transactions.push({
        id: `pending-${pending.hash}`,
        hash: pending.hash,
        type: unifiedType,
        amount: pending.amount,
        timestamp: pending.timestamp,
        status: 'pending',
        description,
        from: pending.from,
        to: pending.to,
      });
    }

    // 2. Add Hyperliquid ledger updates (trade balance movements)
    const hlUpdates = Array.isArray(hlLedger) ? hlLedger : [];
    for (const update of hlUpdates) {
      const delta = update?.delta || {};
      const type = delta.type;
      if (type !== 'deposit' && type !== 'withdraw' && type !== 'withdrawal') continue;

      const hash = update?.hash || '';
      const hashLower = hash.toLowerCase();
      const isDeposit = type === 'deposit';
      const amount = delta.usdc || '0';
      const timestamp = update?.time || Date.now();
      
      // Check if this was a pending transaction that's now confirmed (by matching hash)
      if (hashLower && seenHashes.has(hashLower)) {
        const pendingIdx = transactions.findIndex(t => t.hash?.toLowerCase() === hashLower);
        if (pendingIdx >= 0) {
          const isStillRecent = Date.now() - transactions[pendingIdx].timestamp < PENDING_GRACE_MS;
          if (isStillRecent) {
            // Keep as "pending" during grace period so user sees processing state
          } else {
            transactions[pendingIdx].status = 'confirmed';
            transactions[pendingIdx].description = isDeposit ? t('transactionHistory.depositToTradeBalance') : t('transactionHistory.withdrawToWallet');
            toRemove.push(hash);
          }
        }
        continue;
      }
      
      // For HL withdrawals, check if there's a matching pending withdraw by amount + time
      // Note: HL deducts a 1 USDC fee from withdrawals, so the ledger amount is NET (after fee)
      // while the pending amount is GROSS (before fee)
      if (!isDeposit) {
        const amountFloat = parseFloat(Math.abs(parseFloat(amount)).toString());
        const pendingWithdrawIdx = transactions.findIndex(t => {
          if (t.status !== 'pending') return false;
          if (!t.hash?.startsWith('hl-withdraw-')) return false;
          const pendingAmount = parseFloat(t.amount);
          const diff = pendingAmount - amountFloat;
          if (diff < 0 || diff > 1.10) return false;
          // Only match HL entries that occurred AFTER the pending tx was created
          const timeDiff = timestamp - t.timestamp;
          return timeDiff >= -5000 && timeDiff < 30 * 60 * 1000;
        });
        
        if (pendingWithdrawIdx >= 0) {
          const pendingTx = transactions[pendingWithdrawIdx];
          const isStillRecent = Date.now() - pendingTx.timestamp < PENDING_GRACE_MS;

          if (isStillRecent) {
            // Keep as "pending" during grace period — USDC is still in transit to Arbitrum
          } else {
            toRemove.push(pendingTx.hash || '');
            transactions[pendingWithdrawIdx] = {
              ...pendingTx,
              id: `hl-${hash || timestamp}`,
              hash: hash || null,
              status: 'confirmed',
              description: t('transactionHistory.withdrawToWallet'),
              amount,
              timestamp,
            };
          }
          if (hashLower) seenHashes.add(hashLower);
          continue;
        }
      }
      
      if (hashLower) seenHashes.add(hashLower);

      transactions.push({
        id: `hl-${hash || timestamp}`,
        hash: hash || null,
        type: isDeposit ? 'deposit_trade' : 'withdraw_trade',
        amount,
        timestamp,
        status: 'confirmed',
        description: isDeposit ? t('transactionHistory.depositToTradeBalance') : t('transactionHistory.withdrawToWallet'),
      });
    }

    // 3. Add Arbitrum USDC transfers (wallet balance movements)
    // Filter out Bridge2 transactions (already covered by HL ledger)
    const arbTxs = arbTransfers || [];
    for (const transfer of arbTxs) {
      const hashLower = transfer.hash.toLowerCase();
      const fromLower = transfer.from.toLowerCase();
      const toLower = transfer.to.toLowerCase();
      
      // Skip 0-value or invalid transfers
      const transferAmount = parseFloat(transfer.amount || '0');
      if (!Number.isFinite(transferAmount) || transferAmount <= 0) continue;

      // Skip if this involves Bridge2 (already tracked by HL ledger)
      // Use includes check for safety in case of any address format differences
      if (fromLower === HL_BRIDGE2 || toLower === HL_BRIDGE2) continue;
      if (fromLower.includes(HL_BRIDGE2.slice(2)) || toLower.includes(HL_BRIDGE2.slice(2))) continue;

      // Skip if already seen (e.g., from pending)
      if (seenHashes.has(hashLower)) {
        const pendingIdx = transactions.findIndex(t => t.hash?.toLowerCase() === hashLower);
        if (pendingIdx >= 0 && transactions[pendingIdx].status === 'pending') {
          transactions[pendingIdx].status = 'confirmed';
          toRemove.push(transfer.hash);
        }
        continue;
      }

      seenHashes.add(hashLower);

      const isIncoming = transfer.type === 'in';

      transactions.push({
        id: `arb-${transfer.hash}`,
        hash: transfer.hash,
        type: isIncoming ? 'receive_wallet' : 'send_wallet',
        amount: transfer.amount,
        timestamp: transfer.timestamp,
        status: 'confirmed',
        description: isIncoming ? t('transactionHistory.receivedUsdc') : t('transactionHistory.sentUsdc'),
        from: transfer.from,
        to: transfer.to,
      });
    }

    // Sort by timestamp descending (most recent first)
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    pendingToRemoveRef.current = toRemove;
    return transactions;
  }, [hlLedger, arbTransfers, pendingTxs, t]);

  // Flush pending-tx cleanup outside of render (side effects must not live in useMemo)
  useEffect(() => {
    const hashes = pendingToRemoveRef.current;
    if (hashes.length === 0) return;
    pendingToRemoveRef.current = [];
    hashes.forEach((h) => removePendingTransaction(h));
  }, [unifiedTransactions]);

  // Paginated display
  const displayedTransactions = useMemo(() => {
    return unifiedTransactions.slice(0, displayCount);
  }, [unifiedTransactions, displayCount]);

  const hasMore = displayCount < unifiedTransactions.length;

  const handleShowMore = useCallback(() => {
    setDisplayCount((prev) => prev + LOAD_MORE_COUNT);
  }, []);

  const formatTime = (ms: number | string | null | undefined): string => {
    const n = typeof ms === 'number' ? ms : parseFloat(String(ms ?? ''));
    if (!Number.isFinite(n)) return '--';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatAmountNumber = (amount: string | number | null | undefined): { value: string; valid: boolean } => {
    const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? ''));
    if (!Number.isFinite(n)) return { value: '--', valid: false };
    return {
      value: Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      valid: true,
    };
  };

  const truncateAddress = (addr: string | undefined): string => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getTypeIcon = (type: UnifiedTransaction['type']): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'deposit_trade': return 'arrow-down-circle';
      case 'withdraw_trade': return 'arrow-up-circle';
      case 'receive_wallet': return 'download';
      case 'send_wallet': return 'send';
      case 'pending': return 'time';
      default: return 'swap-vertical';
    }
  };

  const getTypeColor = (type: UnifiedTransaction['type'], status: 'pending' | 'confirmed'): string => {
    if (status === 'pending') return colors.text.tertiary;
    switch (type) {
      case 'deposit_trade':
      case 'receive_wallet':
        return colors.accent.gold;
      case 'withdraw_trade':
      case 'send_wallet':
        return colors.accent.purple;
      default:
        return colors.text.secondary;
    }
  };

  const getAmountPrefix = (type: UnifiedTransaction['type']): string => {
    switch (type) {
      case 'deposit_trade':
      case 'receive_wallet':
        return '+';
      case 'withdraw_trade':
      case 'send_wallet':
        return '-';
      default:
        return '';
    }
  };

  const renderItem = ({ item }: { item: UnifiedTransaction }) => {
    const iconColor = getTypeColor(item.type, item.status);
    const isPending = item.status === 'pending';
    const amountParts = formatAmountNumber(item.amount);

    return (
      <View style={[styles.historyItem, isPending && styles.historyItemPending]}>
        <View style={styles.historyItemLeft}>
          <View style={[styles.historyIcon, { backgroundColor: `${iconColor}20` }]}>
            {isPending ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : (
              <Ionicons name={getTypeIcon(item.type)} size={20} color={iconColor} />
            )}
          </View>
          <View style={styles.historyItemContent}>
            <View style={styles.historyItemTitleRow}>
              <Text
                style={styles.historyItemType}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.62}
              >
                {item.description}
              </Text>
              {isPending && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{t('transactionHistory.pending')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.historyItemTime}>{formatTime(item.timestamp)}</Text>
            {(() => {
              const h = item.hash;
              if (!h) return null;
              return (
              <View style={styles.hashRow}>
                <Text style={styles.historyItemHash} numberOfLines={1}>
                  {`${h.slice(0, 10)}...${h.slice(-8)}`}
                </Text>
                {h.startsWith('0x') && h.length === 66 && (
                  <View style={styles.hashActions}>
                    <TouchableOpacity
                      style={styles.hashActionButton}
                      onPress={async () => {
                        await Clipboard.setStringAsync(arbiscanTxUrl(h));
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showToast(t('transactionHistory.arbiscanLinkCopied'), 'success');
                      }}
                      activeOpacity={0.6}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('transactionHistory.copyArbiscanLink')}
                    >
                      <Ionicons name="copy-outline" size={14} color={colors.text.tertiary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.hashActionButton}
                      onPress={async () => {
                        const url = arbiscanTxUrl(h);
                        try {
                          const opened = await openHttpsUrl(url);
                          if (!opened) throw new Error('blocked');
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        } catch {
                          showToast(t('transactionHistory.openArbiscanFailed'), 'error');
                        }
                      }}
                      activeOpacity={0.6}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('transactionHistory.viewOnArbiscan')}
                    >
                      <Ionicons name="open-outline" size={14} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              );
            })()}
            {(item.type === 'receive_wallet' || item.type === 'send_wallet') && (
              <Text style={styles.historyItemAddress} numberOfLines={1}>
                {item.type === 'receive_wallet' ? t('transactionHistory.from') : t('transactionHistory.to')}
                {truncateAddress(item.type === 'receive_wallet' ? item.from : item.to)}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.historyItemRight}>
          {amountParts.valid ? (
            <View style={styles.amountStack}>
              <Text
                style={[styles.historyItemAmount, { color: iconColor }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                {getAmountPrefix(item.type)}
                {amountParts.value}
              </Text>
              <Text style={styles.amountUnit}>USDC</Text>
            </View>
          ) : (
            <Text style={[styles.historyItemAmount, { color: iconColor }]}>--</Text>
          )}
        </View>
      </View>
    );
  };


  if (!isAuthenticated) {
    return <SafeAreaView style={styles.container} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIconButton} accessibilityRole="button" accessibilityLabel={t('common.goBack')}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerCenter}>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {t('transactionHistory.title')}
          </Text>
        </View>
        <View style={styles.headerSide} />
      </View>

      {isLoading && unifiedTransactions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.gold} />
          <Text style={styles.loadingText}>{t('transactionHistory.loading')}</Text>
        </View>
      ) : unifiedTransactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="swap-vertical-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>{t('transactionHistory.noTransactionHistory')}</Text>
          <Text style={styles.emptySubtext}>{t('transactionHistory.transactionsWillAppear')}</Text>
        </View>
      ) : (
        <FlatList
          data={displayedTransactions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent.gold}
              colors={[colors.accent.gold]}
            />
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.showMoreButton} onPress={handleShowMore}>
                <Text style={styles.showMoreText}>
                  {t('transactionHistory.showMoreCount', { count: unifiedTransactions.length - displayCount })}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.accent.gold} />
              </TouchableOpacity>
            ) : unifiedTransactions.length > INITIAL_DISPLAY_COUNT ? (
              <Text style={styles.endOfListText}>{t('transactionHistory.endOfHistory')}</Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  /** Same width left/right so the title stays visually centered (incl. RTL). */
  headerSide: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    width: '100%',
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 14, color: colors.text.secondary },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text.primary },
  emptySubtext: { fontSize: 14, color: colors.text.secondary, textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  historyItemPending: {
    opacity: 0.7,
    borderStyle: 'dashed',
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyItemContent: {
    flex: 1,
    gap: 2,
  },
  historyItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  historyItemType: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    paddingVertical: 0,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  pendingBadge: {
    flexShrink: 0,
    backgroundColor: colors.accent.gold + '30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent.gold,
  },
  historyItemTime: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyItemHash: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: 'monospace',
  },
  hashActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  hashActionButton: {
    padding: 2,
  },
  historyItemAddress: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  historyItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
    minWidth: 72,
    maxWidth: '42%',
    marginLeft: 10,
  },
  amountStack: {
    alignSelf: 'stretch',
    alignItems: 'flex-end',
    gap: 2,
    maxWidth: '100%',
  },
  amountUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  historyItemAmount: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    width: '100%',
    paddingVertical: 0,
    fontVariant: ['tabular-nums'],
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
    gap: 6,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.gold,
  },
  endOfListText: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
