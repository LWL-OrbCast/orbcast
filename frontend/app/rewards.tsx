import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  RefreshControl,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useActiveEthereumWallet } from '../src/hooks/useActiveEthereumWallet';
import { colors } from '../src/theme/colors';
import { useAuth } from '../src/providers/AuthContext';
import { useAppStore } from '../src/store/appStore';
import { RewardsTabSkeleton } from '../src/components/skeleton/RewardsTabSkeleton';
import { pushRouteOnce } from '../src/lib/pushRouteOnce';
import {
  fetchRewardsProfile,
  applyReferralCode,
  fetchReferrals,
  fetchRewardsAchievements,
  fetchLeaderboard,
  reportTrade,
  RewardsProfile,
  ReferralEntry,
  AchievementDef,
  VolumeMilestone,
  TierInfo,
} from '../src/lib/api';
import { BRAND_NAME } from '../src/lib/brand';

// ──────────────────────────────────────────────────────────────────────────── //
// Constants
// ──────────────────────────────────────────────────────────────────────────── //

const TIER_COLORS: Record<string, string[]> = {
  bronze:   ['#CD7F32', '#A0522D'],
  silver:   ['#C0C0C0', '#808080'],
  gold:     ['#FFD700', '#DAA520'],
  diamond:  ['#B9F2FF', '#7DF9FF'],
  legend: ['#A78BFA', '#1E1B2E'],
};

const TIER_ICONS: Record<string, string> = {
  bronze:   'shield-outline',
  silver:   'shield-half-outline',
  gold:     'shield',
  diamond:  'diamond',
  legend: 'sparkles',
};

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/** Trading volume on the rewards card — extra decimal at $1M+ for milestone progress. */
function formatTradingVolumeProgress(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ──────────────────────────────────────────────────────────────────────────── //
// Animated Progress Bar
// ──────────────────────────────────────────────────────────────────────────── //

function AnimatedProgressBar({
  progress,
  gradientColors,
  height = 10,
  milestoneMarkers,
}: {
  progress: number; // 0–100
  gradientColors: string[];
  height?: number;
  milestoneMarkers?: { pct: number; label: string; reached: boolean }[];
}) {
  const animVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: Math.min(progress, 100),
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterp = animVal.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View>
      <View style={[styles.progressTrack, { height }]}>
        <Animated.View style={[styles.progressFillContainer, { width: widthInterp, height }]}>
          <LinearGradient
            colors={gradientColors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { height }]}
          />
        </Animated.View>
        {milestoneMarkers?.map((m) => (
          <View
            key={m.label}
            style={[
              styles.milestoneMarker,
              { left: `${m.pct}%` },
              m.reached && styles.milestoneMarkerReached,
            ]}
          >
            <View
              style={[
                styles.milestoneMarkerDot,
                m.reached
                  ? { backgroundColor: colors.accent.gold }
                  : { backgroundColor: colors.text.muted },
              ]}
            />
          </View>
        ))}
      </View>
      {milestoneMarkers && milestoneMarkers.length > 0 && (
        <View style={styles.milestoneLabels}>
          {milestoneMarkers.map((m) => (
            <Text
              key={m.label}
              style={[
                styles.milestoneLabel,
                { left: `${m.pct}%` },
                m.reached && { color: colors.accent.gold },
              ]}
            >
              {m.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────── //
// Tier Badge
// ──────────────────────────────────────────────────────────────────────────── //

function TierBadge({ tier, size = 'large' }: { tier: string; size?: 'large' | 'small' }) {
  const gradColors = TIER_COLORS[tier] || TIER_COLORS.bronze;
  const iconName = TIER_ICONS[tier] || 'shield-outline';
  const sz = size === 'large' ? 48 : 24;
  const iconSz = size === 'large' ? 28 : 14;

  return (
    <LinearGradient
      colors={gradColors as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.tierBadge,
        { width: sz, height: sz, borderRadius: sz / 2 },
      ]}
    >
      <Ionicons name={iconName as any} size={iconSz} color="#fff" />
    </LinearGradient>
  );
}

// ──────────────────────────────────────────────────────────────────────────── //
// Achievement Card
// ──────────────────────────────────────────────────────────────────────────── //

function AchievementCard({
  id,
  def,
  unlocked,
}: {
  id: string;
  def: AchievementDef;
  unlocked: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.achievementCard, unlocked && styles.achievementCardUnlocked]}>
      <View style={styles.achievementIconWrap}>
        {unlocked ? (
          <LinearGradient
            colors={[colors.accent.gold, colors.accent.purple]}
            style={styles.achievementIconBg}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
          </LinearGradient>
        ) : (
          <View style={styles.achievementIconBgLocked}>
            <Ionicons name="lock-closed" size={14} color={colors.text.muted} />
          </View>
        )}
      </View>
      <View style={styles.achievementText}>
        <Text
          style={[styles.achievementTitle, !unlocked && { color: colors.text.tertiary }]}
          numberOfLines={1}
        >
          {t(`rewards.ach_${id}_title`, { defaultValue: def.title })}
        </Text>
        <Text style={styles.achievementDesc} numberOfLines={2}>
          {t(`rewards.ach_${id}_desc`, { defaultValue: def.desc })}
        </Text>
      </View>
      <Text style={[styles.achievementPts, unlocked && { color: colors.accent.gold }]}>
        +{def.points}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────── //
// Main Screen
// ──────────────────────────────────────────────────────────────────────────── //

export default function RewardsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAppStore();
  const { getAccessToken } = useAuth();
  const { address: activeAddr } = useActiveEthereumWallet();
  const embeddedAddress = activeAddr || '';

  // State
  const [tab, setTab] = useState<'rewards' | 'referrals'>('rewards');
  const [profile, setProfile] = useState<RewardsProfile | null>(null);
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [achievements, setAchievements] = useState<Record<string, AchievementDef>>({});
  const [allMilestones, setAllMilestones] = useState<VolumeMilestone[]>([]);
  const [allTiers, setAllTiers] = useState<TierInfo[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [applyingCode, setApplyingCode] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Toast helper
  const showToast = useCallback((msg: string) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Simple in-component toast via state — could use a toast library
  }, []);

  // Fetch data
  const loadData = useCallback(async () => {
    if (!embeddedAddress) return;
    try {
      const token = await getAccessToken();
      if (!token) return;

      // Trigger a volume sync from HL first (fire-and-forget but awaited)
      // This ensures historical volume gets credited on first visit
      try {
        await reportTrade(embeddedAddress, token);
      } catch {
        // Non-critical — profile will still load, just without latest volume
      }

      const [profileData, achData, refsData, boardData] = await Promise.all([
        fetchRewardsProfile(embeddedAddress, token),
        fetchRewardsAchievements(),
        fetchReferrals(embeddedAddress, token),
        fetchLeaderboard(token, 10).catch(() => ({ leaderboard: [] })),
      ]);

      setProfile(profileData);
      setAchievements(achData.achievements);
      setAllMilestones(achData.volume_milestones);
      setAllTiers(achData.tiers);
      setReferrals(refsData.referrals);
      setLeaderboard(boardData.leaderboard);
    } catch (e) {
      console.warn('[Rewards] Load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [embeddedAddress, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated && embeddedAddress) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, embeddedAddress, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Apply referral code
  const handleApplyCode = useCallback(async () => {
    if (!referralInput.trim() || !embeddedAddress) return;
    setApplyingCode(true);
    setApplyError(null);
    setApplySuccess(false);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await applyReferralCode(embeddedAddress, referralInput.trim(), token);
      if (res.success) {
        setApplySuccess(true);
        setReferralInput('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadData(); // refresh profile
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || t('rewards.referralError');
      setApplyError(detail);
    } finally {
      setApplyingCode(false);
    }
  }, [referralInput, embeddedAddress, getAccessToken, loadData, t]);

  // Copy referral code
  const handleCopyCode = useCallback(async () => {
    if (!profile?.referral_code) return;
    await Clipboard.setStringAsync(profile.referral_code);
    setCodeCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [profile?.referral_code]);

  // Share referral code
  const handleShareCode = useCallback(async () => {
    if (!profile?.referral_code) return;
    try {
      await Share.share({
        message: t('rewards.shareMessage', {
          name: BRAND_NAME,
          code: profile.referral_code,
          defaultValue: `Join me on ${BRAND_NAME}! Use my referral code: ${profile.referral_code}`,
        }),
      });
    } catch {}
  }, [profile?.referral_code, t]);

  // Tier progress
  const tierProgressPct = useMemo(() => {
    if (!profile || !allTiers.length) return 0;
    // Find current and next tier
    let currentMin = 0;
    let nextMin = allTiers[allTiers.length - 1].min_points;
    for (let i = 0; i < allTiers.length; i++) {
      if (profile.total_points >= allTiers[i].min_points) {
        currentMin = allTiers[i].min_points;
        if (i + 1 < allTiers.length) {
          nextMin = allTiers[i + 1].min_points;
        } else {
          return 100; // max tier
        }
      }
    }
    const span = nextMin - currentMin;
    if (span <= 0) return 100;
    return Math.min(((profile.total_points - currentMin) / span) * 100, 100);
  }, [profile, allTiers]);

  // Fee savings string
  const savingsText = useMemo(() => {
    if (!profile || profile.fee_discount_tenths <= 0) return null;
    // fee_discount_tenths is in tenths-of-bps
    // 1 tenth = 0.1 bps = 0.001%
    const pct = (profile.fee_discount_tenths * 0.001).toFixed(3);
    return t('rewards.savingsPerTrade', { savings: `${pct}%` });
  }, [profile, t]);

  // ── Not authenticated ──
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>{t('rewards.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="trophy" size={64} color={colors.text.muted} />
          <Text style={styles.emptyText}>{t('rewards.loginRequired')}</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => pushRouteOnce(router, '/login')}
          >
            <Text style={styles.loginButtonText}>{t('rewards.loginButton')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <MaskedView
          maskElement={<Text style={styles.headerTitleGradient}>{t('rewards.title')}</Text>}
        >
          <LinearGradient
            colors={[colors.accent.gold, colors.accent.purple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[styles.headerTitleGradient, { opacity: 0 }]}>{t('rewards.title')}</Text>
          </LinearGradient>
        </MaskedView>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'rewards' && styles.tabButtonActive]}
          onPress={() => setTab('rewards')}
        >
          <Ionicons
            name="trophy"
            size={16}
            color={tab === 'rewards' ? colors.accent.gold : colors.text.tertiary}
          />
          <Text style={[styles.tabText, tab === 'rewards' && styles.tabTextActive]}>
            {t('rewards.rewardsTab')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'referrals' && styles.tabButtonActive]}
          onPress={() => setTab('referrals')}
        >
          <Ionicons
            name="people"
            size={16}
            color={tab === 'referrals' ? colors.accent.gold : colors.text.tertiary}
          />
          <Text style={[styles.tabText, tab === 'referrals' && styles.tabTextActive]}>
            {t('rewards.referralsTab')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 16 + 80 + Math.max(0, insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.gold} />}
      >
        {loading ? (
          tab === 'rewards' ? (
            <RewardsTabSkeleton />
          ) : (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          )
        ) : tab === 'rewards' ? (
          <>

            {/* ─── Tier Card ─── */}
            <View style={styles.tierCard}>
              <View style={styles.tierCardTop}>
                <TierBadge tier={profile?.tier || 'bronze'} />
                <View style={styles.tierInfo}>
                  <Text style={styles.tierName}>
                    {t(`rewards.${profile?.tier || 'bronze'}`)}
                  </Text>
                  <Text style={styles.tierSeasonLabel}>{t('rewards.seasonLabel')}</Text>
                  {savingsText && (
                    <Text style={styles.tierSavings}>{savingsText}</Text>
                  )}
                </View>
                <View style={styles.pointsBadge}>
                  <Text style={styles.pointsValue}>{formatNumber(profile?.total_points || 0)}</Text>
                  <Text style={styles.pointsLabel}>{t('rewards.pts')}</Text>
                </View>
              </View>

              {/* Tier progress */}
              <View style={styles.tierProgressSection}>
                <View style={styles.tierProgressHeader}>
                  <Text style={styles.sectionLabel}>{t('rewards.tierProgress')}</Text>
                  <Text style={styles.tierNextText}>
                    {profile
                      ? profile.next_tier
                        ? t('rewards.nextTier', { tier: t(`rewards.${profile.next_tier}`) }) +
                          ' · ' +
                          t('rewards.pointsAway', { points: formatNumber(profile.points_to_next_tier) })
                        : t('rewards.maxTier')
                      : ''}
                  </Text>
                </View>
                <AnimatedProgressBar
                  progress={tierProgressPct}
                  gradientColors={TIER_COLORS[profile?.tier || 'bronze']}
                />

                {/* Tier ladder */}
                <Text style={styles.tierLadderHint}>{t('rewards.tierDiscountHint')}</Text>
                <View style={styles.tierLadder}>
                  {allTiers.map((ti) => {
                    const active = profile?.tier === ti.name;
                    const reached = (profile?.total_points || 0) >= ti.min_points;
                    return (
                      <View key={ti.name} style={styles.tierLadderItem}>
                        <TierBadge tier={ti.name} size="small" />
                        <Text
                          style={[
                            styles.tierLadderLabel,
                            active && { color: colors.accent.gold, fontWeight: '700' },
                            reached && !active && { color: colors.text.secondary },
                          ]}
                        >
                          {t(`rewards.${ti.name}`)}
                        </Text>
                        {ti.fee_discount_tenths > 0 && (
                          <Text style={styles.tierLadderDiscount}>
                            -{(ti.fee_discount_tenths * 0.001).toFixed(3)}%
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* ─── Trading Volume Progress ─── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{t('rewards.tradingVolumeProgress')}</Text>
                <Text style={styles.volumeValue}>
                  {formatTradingVolumeProgress(profile?.lifetime_volume_usd || 0)}
                </Text>
              </View>

              <AnimatedProgressBar
                progress={profile?.volume_progress_pct || 0}
                gradientColors={[colors.accent.gold, colors.accent.purple]}
                height={12}
              />

              {profile?.next_volume_milestone ? (
                <View style={styles.nextMilestoneRow}>
                  <Ionicons name="flag" size={14} color={colors.accent.gold} />
                  <Text style={styles.nextMilestoneText}>
                    {t('rewards.nextMilestone')}: {profile.next_volume_milestone.label}
                    {' (+'}
                    {profile.next_volume_milestone.points} {t('rewards.pts')})
                  </Text>
                </View>
              ) : profile && profile.lifetime_volume_usd > 0 ? (
                <Text style={styles.milestoneCompleteText}>{t('rewards.milestoneComplete')}</Text>
              ) : null}
              <Text style={styles.syncNote} numberOfLines={1}>{t('rewards.syncNote')}</Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('rewards.achievements')}</Text>
              <View style={styles.achievementsList}>
                {Object.entries(achievements)
                  .filter(([, def]) => (def.category || 'trading') === 'trading')
                  .map(([id, def]) => (
                    <AchievementCard
                      key={id}
                      id={id}
                      def={def}
                      unlocked={profile?.achievements?.includes(id) || false}
                    />
                  ))}
              </View>
            </View>

            {/* ─── Leaderboard ─── 
            {leaderboard.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{t('rewards.leaderboard')}</Text>
                {leaderboard.map((entry) => {
                  const isMe =
                    embeddedAddress &&
                    entry.wallet.toLowerCase().startsWith(embeddedAddress.slice(0, 6).toLowerCase());
                  return (
                    <View
                      key={entry.rank}
                      style={[styles.leaderRow, isMe && styles.leaderRowMe]}
                    >
                      <Text style={styles.leaderRank}>
                        {t('rewards.rank', { rank: entry.rank })}
                      </Text>
                      <TierBadge tier={entry.tier} size="small" />
                      <Text style={styles.leaderWallet} numberOfLines={1}>
                        {entry.wallet}
                        {isMe ? ` ${t('rewards.you')}` : ''}
                      </Text>
                      <Text style={styles.leaderPts}>
                        {formatNumber(entry.points)} {t('rewards.pts')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}*/}
          </>
        ) : (
          /* ═══════════════ REFERRALS TAB ═══════════════ */
          <>
            {/* Your Code */}
            <View style={styles.referralCodeCard}>
              <Text style={styles.referralCodeLabel}>{t('rewards.referralCode')}</Text>
              <TouchableOpacity onPress={handleCopyCode} style={styles.codeBox} activeOpacity={0.7}>
                <LinearGradient
                  colors={[colors.accent.gold, colors.accent.purple]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.codeGradient}
                >
                  <Text style={styles.codeText}>{profile?.referral_code || '------'}</Text>
                  <Ionicons
                    name={codeCopied ? 'checkmark-circle' : 'copy-outline'}
                    size={20}
                    color="#fff"
                  />
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.codeTapHint}>
                {codeCopied ? t('rewards.codeCopied') : t('rewards.tapToCopy')}
              </Text>

              {/* Stats row */}
              <View style={styles.refStatsRow}>
                <View style={styles.refStat}>
                  <Text style={styles.refStatValue}>{referrals.length}</Text>
                  <Text style={styles.refStatLabel}>{t('rewards.referredUsers')}</Text>
                </View>
                <View style={styles.refStatDivider} />
                <View style={styles.refStat}>
                  <Text style={styles.refStatValue}>
                    {referrals.filter((r) => r.status === 'qualified').length}
                  </Text>
                  <Text style={styles.refStatLabel}>{t('rewards.qualified')}</Text>
                </View>
              </View>
              <Text style={styles.qualifiedExplainer}>{t('rewards.qualifiedExplainer')}</Text>
              <Text style={styles.syncNote} numberOfLines={1}>{t('rewards.syncNote')}</Text>
            </View>

            {/* Share Invite — flex centering + bounded label width; auto-shrink avoids ellipsis (large a11y text / long i18n) */}
            <TouchableOpacity onPress={handleShareCode} activeOpacity={0.8} style={styles.shareButtonWrap}>
              <View style={styles.shareButtonSpacer} />
              <View style={styles.shareButtonCenter}>
                <Ionicons name="share-social" size={19} color={colors.accent.gold} style={styles.shareButtonIcon} />
                <View style={styles.shareButtonTextWrap}>
                  <Text
                    style={styles.shareButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.52}
                  >
                    {t('rewards.shareInvite')}
                  </Text>
                </View>
              </View>
              <View style={styles.shareButtonSpacer} />
            </TouchableOpacity>

            {/* Enter Code */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('rewards.haveCode')}</Text>
              <View style={styles.applyRow}>
                <TextInput
                  style={styles.codeInput}
                  value={referralInput}
                  onChangeText={(v) => {
                    setReferralInput(v.toUpperCase());
                    setApplyError(null);
                    setApplySuccess(false);
                  }}
                  placeholder={t('rewards.referralPlaceholder', { defaultValue: 'OC-XXXXXX' })}
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="characters"
                  maxLength={10}
                />
                <TouchableOpacity
                  style={[styles.applyButton, (!referralInput.trim() || applyingCode) && styles.applyButtonDisabled]}
                  onPress={handleApplyCode}
                  disabled={!referralInput.trim() || applyingCode}
                >
                  <Text style={styles.applyButtonText}>
                    {applyingCode ? '...' : t('rewards.applyCode')}
                  </Text>
                </TouchableOpacity>
              </View>
              {applyError && <Text style={styles.applyErrorText}>{applyError}</Text>}
              {applySuccess && (
                <Text style={styles.applySuccessText}>{t('rewards.referralApplied')}</Text>
              )}
            </View>

            {/* Referred Users List */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('rewards.referredUsers')}</Text>
              {referrals.length === 0 ? (
                <Text style={styles.noReferrals}>{t('rewards.noReferrals')}</Text>
              ) : (
                referrals.map((ref, idx) => (
                  <View key={idx} style={styles.referralRow}>
                    <View style={styles.referralInfo}>
                      <Ionicons name="person-circle-outline" size={24} color={colors.text.secondary} />
                      <Text style={styles.referralWallet}>{ref.referee}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        ref.status === 'qualified'
                          ? styles.statusQualified
                          : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          ref.status === 'qualified'
                            ? { color: colors.status.success }
                            : { color: colors.status.warning },
                        ]}
                      >
                        {ref.status === 'qualified'
                          ? t('rewards.qualified')
                          : t('rewards.pending')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────────────── //
// Styles
// ──────────────────────────────────────────────────────────────────────────── //

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerTitleGradient: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.background.tertiary,
  },
  tabButtonActive: {
    backgroundColor: `${colors.accent.gold}15`,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}40`,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  tabTextActive: {
    color: colors.accent.gold,
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    color: colors.text.tertiary,
    fontSize: 14,
  },
  // Tier card
  tierCard: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  tierCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    textTransform: 'capitalize',
  },
  tierSeasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  tierSavings: {
    fontSize: 12,
    color: colors.accent.gold,
    marginTop: 2,
  },
  pointsBadge: {
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  pointsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent.gold,
  },
  pointsLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Tier progress
  tierProgressSection: {
    gap: 8,
  },
  tierProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tierNextText: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  tierLadder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  tierLadderItem: {
    alignItems: 'center',
    gap: 4,
  },
  tierLadderLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tierLadderDiscount: {
    fontSize: 9,
    color: colors.text.tertiary,
  },
  tierLadderHint: {
    fontSize: 10,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 6,
  },
  syncNote: {
    fontSize: 10,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 6,
    opacity: 0.75,
  },
  // Section card
  sectionCard: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.accent.gold,
  },
  // Progress bar
  progressTrack: {
    width: '100%',
    backgroundColor: colors.background.elevated,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFillContainer: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    borderRadius: 6,
  },
  milestoneMarker: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneMarkerReached: {},
  milestoneMarkerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.muted,
  },
  milestoneLabels: {
    position: 'relative',
    height: 16,
    marginTop: 4,
  },
  milestoneLabel: {
    position: 'absolute',
    fontSize: 8,
    color: colors.text.muted,
    fontWeight: '600',
    transform: [{ translateX: -12 }],
  },
  nextMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  nextMilestoneText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  milestoneCompleteText: {
    fontSize: 12,
    color: colors.status.success,
    fontWeight: '600',
    marginTop: 4,
  },
  // Achievements
  achSubTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  achSubTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  achSubTabActive: {
    backgroundColor: `${colors.accent.gold}15`,
    borderColor: `${colors.accent.gold}40`,
  },
  achSubTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  achSubTabTextActive: {
    color: colors.accent.gold,
  },
  achievementsList: {
    gap: 8,
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.background.elevated,
    gap: 10,
    opacity: 0.6,
  },
  achievementCardUnlocked: {
    opacity: 1,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}30`,
  },
  achievementIconWrap: {},
  achievementIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementIconBgLocked: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementText: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  achievementDesc: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 1,
  },
  achievementPts: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.muted,
  },
  // Leaderboard
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  leaderRowMe: {
    backgroundColor: `${colors.accent.gold}08`,
    borderRadius: 8,
    borderBottomWidth: 0,
  },
  leaderRank: {
    width: 28,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  leaderWallet: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  leaderPts: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.gold,
  },
  // Referral code card
  referralCodeCard: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
    alignItems: 'center',
    gap: 12,
  },
  referralCodeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeBox: {
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  codeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  codeTapHint: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  shareButtonWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${colors.accent.gold}35`,
    backgroundColor: `${colors.accent.gold}14`,
  },
  shareButtonSpacer: {
    flex: 1,
    minWidth: 0,
  },
  shareButtonCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  shareButtonIcon: {
    flexShrink: 0,
  },
  shareButtonTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  shareButtonText: {
    width: '100%',
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent.gold,
    textAlign: 'center',
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  refStatsRow: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border.primary,
  },
  refStat: {
    alignItems: 'center',
    gap: 2,
  },
  qualifiedExplainer: {
    fontSize: 10,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: -4,
  },
  refStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
  },
  refStatLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  // Apply referral
  applyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  codeInput: {
    flex: 1,
    height: 44,
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  applyButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.accent.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.4,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background.primary,
  },
  applyErrorText: {
    fontSize: 12,
    color: colors.status.error,
    marginTop: -4,
  },
  applySuccessText: {
    fontSize: 12,
    color: colors.status.success,
    fontWeight: '600',
    marginTop: -4,
  },
  // Referral list
  noReferrals: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  referralInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  referralWallet: {
    fontSize: 13,
    color: colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: `${colors.status.warning}15`,
  },
  statusQualified: {
    backgroundColor: `${colors.status.success}15`,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 15,
    color: colors.text.tertiary,
  },
  loginButton: {
    backgroundColor: colors.accent.gold,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  loginButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.background.primary,
  },
  tierBadge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
