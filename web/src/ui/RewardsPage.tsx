import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyReferralCode,
  fetchReferrals,
  fetchRewardsAchievements,
  fetchRewardsProfile,
  reportTrade,
  type AchievementDef,
  type RewardsProfile,
  type TierInfo,
} from '../lib/api';
import { useWebAuth } from '../lib/auth';
import { interpolate, useCopy } from '../lib/copy';
import {
  IconCheck,
  IconCopy,
  IconFlag,
  IconLock,
  IconPeople,
  IconTrophy,
  IconUser,
} from './icons';
import { AuthGate, RewardsSkeleton, Skel } from './skeleton';

const TIER_GRADIENT: Record<string, string> = {
  bronze: 'linear-gradient(135deg, #cd7f32, #a0522d)',
  silver: 'linear-gradient(135deg, #c0c0c0, #808080)',
  gold: 'linear-gradient(135deg, #ffd700, #daa520)',
  diamond: 'linear-gradient(135deg, #b9f2ff, #7df9ff)',
  legend: 'linear-gradient(135deg, #a78bfa, #1e1b2e)',
};

function formatVolume(v: number, extraAtMillion = false): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(extraAtMillion ? 2 : 1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function feeDiscountPct(tenths: number): string {
  return `${(tenths * 0.001).toFixed(3)}%`;
}

function rewardString(
  rewards: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = rewards[key];
  return typeof v === 'string' ? v : fallback;
}

function tierProgressPct(profile: RewardsProfile | undefined, tiers: TierInfo[]): number {
  if (!profile || !tiers.length) return 0;
  let currentMin = 0;
  let nextMin = tiers[tiers.length - 1]?.min_points ?? 0;
  for (let i = 0; i < tiers.length; i++) {
    if (profile.total_points >= tiers[i].min_points) {
      currentMin = tiers[i].min_points;
      if (i + 1 < tiers.length) nextMin = tiers[i + 1].min_points;
      else return 100;
    }
  }
  const span = nextMin - currentMin;
  if (span <= 0) return 100;
  return Math.min(((profile.total_points - currentMin) / span) * 100, 100);
}

function ProgressBar({ progress, gradient }: { progress: number; gradient: string }) {
  const width = `${Math.min(Math.max(progress, 0), 100)}%`;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width, background: gradient }}
      />
    </div>
  );
}

function TierBadge({ tier, size = 'lg' }: { tier: string; size?: 'lg' | 'sm' }) {
  const dim = size === 'lg' ? 'h-12 w-12' : 'h-6 w-6';
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${dim}`}
      style={{ background: TIER_GRADIENT[tier] ?? TIER_GRADIENT.bronze }}
      aria-hidden
    >
      <IconTrophy size={size === 'lg' ? 22 : 12} className="text-white" />
    </div>
  );
}

function AchievementRow({
  id,
  def,
  unlocked,
  rewards,
}: {
  id: string;
  def: AchievementDef;
  unlocked: boolean;
  rewards: Record<string, unknown>;
}) {
  const title = rewardString(rewards, `ach_${id}_title`, def.title);
  const desc = rewardString(rewards, `ach_${id}_desc`, def.desc);
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
        unlocked ? 'border-[var(--border)] bg-white' : 'border-transparent bg-[var(--bg-2)]'
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          unlocked ? 'bg-[linear-gradient(135deg,var(--accent),var(--purple))] text-white' : 'bg-white text-[var(--text-3)]'
        }`}
      >
        {unlocked ? <IconCheck size={14} /> : <IconLock size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-extrabold ${unlocked ? '' : 'text-[var(--text-3)]'}`}>
          {title}
        </div>
        <div className="line-clamp-2 text-xs text-[var(--text-3)]">{desc}</div>
      </div>
      <div className={`shrink-0 text-xs font-extrabold ${unlocked ? 'text-[var(--accent-dark)]' : 'text-[var(--text-3)]'}`}>
        +{def.points}
      </div>
    </div>
  );
}

function ReferralCodeButton({
  code,
  loading,
  error,
  onRetry,
}: {
  code?: string | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const { rewards: rewardsCopy } = useCopy();
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (loading && !code) {
    return <Skel className="mt-2 h-14 w-full rounded-xl" />;
  }
  if (error && !code) {
    return (
      <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text-2)]">Couldn’t load your referral code.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-sm font-extrabold text-[var(--accent-dark)]"
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void copyCode()}
        disabled={!code}
        className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl bg-[linear-gradient(90deg,var(--accent),var(--purple))] px-4 py-3 text-left text-white disabled:opacity-70"
      >
        <code className="text-lg font-extrabold tracking-wide">{code || '------'}</code>
        {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
      </button>
      <p className="mt-2 text-xs text-[var(--text-3)]">
        {copied ? rewardsCopy.codeCopied : rewardsCopy.tapToCopy}
      </p>
    </>
  );
}

function ReferralsPanel({
  profile,
  profileLoading,
  profileError,
  onRetryProfile,
}: {
  profile?: RewardsProfile;
  profileLoading: boolean;
  profileError: boolean;
  onRetryProfile: () => void;
}) {
  const { rewards: rewardsCopy } = useCopy();
  const { address, getAccessToken } = useWebAuth();
  const [code, setCode] = useState('');
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const qc = useQueryClient();

  const refsQ = useQuery({
    queryKey: ['rewards', 'referrals', address],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token || !address) throw new Error('auth');
      return fetchReferrals(address, token);
    },
    enabled: !!address,
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token || !address) throw new Error('auth');
      return applyReferralCode(address, code.trim(), token);
    },
    onSuccess: (res) => {
      if (res.success) {
        setFlash({ kind: 'ok', text: rewardsCopy.referralApplied });
        setCode('');
        void qc.invalidateQueries({ queryKey: ['rewards'] });
      } else {
        setFlash({ kind: 'err', text: res.error ?? rewardsCopy.referralError });
      }
    },
    onError: () => setFlash({ kind: 'err', text: rewardsCopy.referralError }),
  });

  const p = profile;
  const referrals = refsQ.data?.referrals ?? [];

  return (
    <div className="space-y-4">
      <h2 className="hidden items-center gap-2 text-lg font-extrabold lg:flex">
        <IconPeople size={18} className="text-[var(--accent-dark)]" />
        {rewardsCopy.referralsTab}
      </h2>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="text-xs font-bold uppercase text-[var(--text-3)]">
          {rewardsCopy.referralCode}
        </div>
        <ReferralCodeButton
          code={p?.referral_code}
          loading={profileLoading}
          error={profileError}
          onRetry={onRetryProfile}
        />
        <div className="mt-4 flex items-center justify-around rounded-xl bg-[var(--bg-2)] px-3 py-3">
          <div className="text-center">
            <div className="text-xl font-extrabold">{referrals.length}</div>
            <div className="text-[11px] font-bold text-[var(--text-3)]">{rewardsCopy.referredUsers}</div>
          </div>
          <div className="h-8 w-px bg-[var(--border)]" />
          <div className="text-center">
            <div className="text-xl font-extrabold">
              {referrals.filter((r) => r.status === 'qualified').length}
            </div>
            <div className="text-[11px] font-bold text-[var(--text-3)]">{rewardsCopy.qualified}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--text-3)]">{rewardsCopy.qualifiedExplainer}</p>
        <p className="mt-1 truncate text-[11px] text-[var(--text-3)]">{rewardsCopy.syncNote}</p>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h3 className="font-extrabold">{rewardsCopy.haveCode}</h3>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setFlash(null);
            }}
            maxLength={10}
            placeholder={rewardsCopy.referralPlaceholder}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm uppercase"
          />
          <button
            type="button"
            disabled={applyMut.isPending || !code.trim()}
            onClick={() => applyMut.mutate()}
            className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {applyMut.isPending ? '…' : rewardsCopy.applyCode}
          </button>
        </div>
        {flash ? (
          <p
            className={`mt-2 text-sm font-semibold ${
              flash.kind === 'ok' ? 'text-[var(--accent-dark)]' : 'text-[var(--danger)]'
            }`}
          >
            {flash.text}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h3 className="font-extrabold">{rewardsCopy.referredUsers}</h3>
        {refsQ.isPending && !refsQ.data ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skel key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ) : referrals.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-3)]">{rewardsCopy.noReferrals}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {referrals.map((r) => (
              <li
                key={r.referee}
                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-2)] px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 font-mono text-xs">
                  <IconUser size={18} className="text-[var(--text-3)]" />
                  <span className="truncate">
                    {r.referee.slice(0, 6)}…{r.referee.slice(-4)}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                    r.status === 'qualified'
                      ? 'bg-[#dcfce7] text-[var(--accent-dark)]'
                      : 'bg-[#fef3c7] text-[#b45309]'
                  }`}
                >
                  {r.status === 'qualified' ? rewardsCopy.qualified : rewardsCopy.pending}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function RewardsPage() {
  const { rewards: rewardsCopy } = useCopy();
  const rewards = rewardsCopy as unknown as Record<string, unknown>;
  const { authenticated, address, getAccessToken } = useWebAuth();
  const [tab, setTab] = useState<'rewards' | 'referrals'>('rewards');

  const catalogQ = useQuery({
    queryKey: ['rewards', 'achievements'],
    queryFn: fetchRewardsAchievements,
  });

  const profileQ = useQuery({
    queryKey: ['rewards', 'profile', address],
    queryFn: async ({ signal }) => {
      const token = await getAccessToken();
      if (!token || !address) throw new Error('auth');
      // Queue HL volume sync in the background. Do not block first paint —
      // production can sit on this POST while the profile itself is instant.
      void reportTrade(address, token).catch(() => undefined);
      return fetchRewardsProfile(address, token, signal);
    },
    enabled: authenticated && !!address,
    retry: 2,
  });

  const p = profileQ.data;
  const tiers = catalogQ.data?.tiers ?? p?.tier_list ?? [];
  const achievements = catalogQ.data?.achievements ?? {};
  const progress = tierProgressPct(p, tiers);
  const volumePct = p?.volume_progress_pct ?? 0;

  const savingsText = useMemo(() => {
    if (!p || p.fee_discount_tenths <= 0) return null;
    return interpolate(rewardsCopy.savingsPerTrade, { savings: feeDiscountPct(p.fee_discount_tenths) });
  }, [p, rewardsCopy.savingsPerTrade]);

  return (
    <AuthGate
      skeleton={<RewardsSkeleton />}
      title={rewardsCopy.title}
      body={rewardsCopy.loginRequired}
      cta={rewardsCopy.loginButton}
    >
      {() => (
        <div>
          <h1 className="bg-[linear-gradient(90deg,var(--accent),var(--purple))] bg-clip-text text-2xl font-extrabold tracking-wide text-transparent">
            {rewardsCopy.title}
          </h1>

          <div className="mt-4 flex gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setTab('rewards')}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-extrabold ${
                tab === 'rewards'
                  ? 'bg-white text-[var(--accent-dark)] shadow-sm'
                  : 'bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
            >
              <IconTrophy size={14} />
              {rewardsCopy.rewardsTab}
            </button>
            <button
              type="button"
              onClick={() => setTab('referrals')}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-extrabold ${
                tab === 'referrals'
                  ? 'bg-white text-[var(--accent-dark)] shadow-sm'
                  : 'bg-[var(--bg-2)] text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
            >
              <IconPeople size={14} />
              {rewardsCopy.referralsTab}
            </button>
          </div>

          <div className="mt-4 grid items-start gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:gap-6">
              <div className={`space-y-4 ${tab !== 'rewards' ? 'hidden lg:block' : ''}`}>
              <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
                <div className="flex items-start gap-3">
                  <TierBadge tier={p?.tier ?? 'bronze'} />
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-extrabold capitalize">
                      {rewardString(rewards, p?.tier ?? 'bronze', p?.tier ?? 'bronze')}
                    </div>
                    <div className="text-xs font-bold uppercase text-[var(--text-3)]">
                      {rewardsCopy.seasonLabel}
                    </div>
                    {savingsText ? (
                      <div className="mt-1 text-xs font-semibold text-[var(--accent-dark)]">{savingsText}</div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-extrabold">{formatNumber(p?.total_points ?? 0)}</div>
                    <div className="text-[11px] font-bold uppercase text-[var(--text-3)]">{rewardsCopy.pts}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-[var(--text-3)]">{rewardsCopy.tierProgress}</span>
                    <span className="text-right text-[var(--text-2)]">
                      {p?.next_tier
                        ? `${interpolate(rewardsCopy.nextTier, {
                            tier: rewardString(rewards, p.next_tier, p.next_tier),
                          })} · ${interpolate(rewardsCopy.pointsAway, {
                            points: formatNumber(p.points_to_next_tier),
                          })}`
                        : rewardsCopy.maxTier}
                    </span>
                  </div>
                  <ProgressBar
                    progress={progress}
                    gradient={TIER_GRADIENT[p?.tier ?? 'bronze'] ?? TIER_GRADIENT.bronze}
                  />
                  <p className="mt-2 text-xs text-[var(--text-3)]">{rewardsCopy.tierDiscountHint}</p>
                  {tiers.length > 0 ? (
                    <div className="mt-4 flex w-full items-start justify-between gap-4">
                      {tiers.map((ti) => {
                        const active = p?.tier === ti.name;
                        const reached = (p?.total_points ?? 0) >= ti.min_points;
                        return (
                          <div key={ti.name} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
                            <TierBadge tier={ti.name} size="sm" />
                            <span
                              className={`text-[11px] font-bold capitalize ${
                                active
                                  ? 'text-[var(--accent-dark)]'
                                  : reached
                                    ? 'text-[var(--text-2)]'
                                    : 'text-[var(--text-3)]'
                              }`}
                            >
                              {rewardString(rewards, ti.name, ti.name)}
                            </span>
                            {ti.fee_discount_tenths > 0 ? (
                              <span className="text-[10px] text-[var(--text-3)]">
                                -{feeDiscountPct(ti.fee_discount_tenths)}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-extrabold">{rewardsCopy.tradingVolumeProgress}</h2>
                  <span className="text-sm font-extrabold">
                    {formatVolume(p?.lifetime_volume_usd ?? 0, true)}
                  </span>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    progress={volumePct}
                    gradient="linear-gradient(90deg, var(--accent), var(--purple))"
                  />
                </div>
                {p?.next_volume_milestone ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-2)]">
                    <IconFlag size={13} className="text-[var(--accent-dark)]" />
                    {rewardsCopy.nextMilestone}: {p.next_volume_milestone.label} (+
                    {p.next_volume_milestone.points} {rewardsCopy.pts})
                  </p>
                ) : p && p.lifetime_volume_usd > 0 ? (
                  <p className="mt-2 text-xs text-[var(--accent-dark)]">{rewardsCopy.milestoneComplete}</p>
                ) : null}
                <p className="mt-1 truncate text-[11px] text-[var(--text-3)]">{rewardsCopy.syncNote}</p>
              </section>

              <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
                <h2 className="font-extrabold">{rewardsCopy.achievements}</h2>
                <div className="mt-3 space-y-2">
                  {Object.entries(achievements)
                    .filter(([, def]) => (def.category || 'trading') === 'trading')
                    .map(([id, def]) => (
                      <AchievementRow
                        key={id}
                        id={id}
                        def={def}
                        unlocked={p?.achievements?.includes(id) ?? false}
                        rewards={rewards}
                      />
                    ))}
                </div>
              </section>
              </div>

              <aside className={`min-w-0 ${tab !== 'referrals' ? 'hidden lg:block' : ''}`}>
                <div className="lg:sticky lg:top-20">
                  <ReferralsPanel
                    profile={p}
                    profileLoading={profileQ.isLoading}
                    profileError={profileQ.isError}
                    onRetryProfile={() => void profileQ.refetch()}
                  />
                </div>
              </aside>
            </div>
        </div>
      )}
    </AuthGate>
  );
}
