import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applyReferralCode, fetchLeaderboard, fetchReferrals, fetchRewardsProfile } from '../lib/api';
import { useWebAuth } from '../lib/auth';
import { interpolate, useCopy } from '../lib/copy';
import { AuthGate, RewardsSkeleton, Skel } from './skeleton';

export function RewardsPage() {
  const { rewards: rewardsCopy } = useCopy();
  const { authenticated, address, getAccessToken } = useWebAuth();
  const [code, setCode] = useState('');
  const [tab, setTab] = useState<'rewards' | 'referrals'>('rewards');
  const [flash, setFlash] = useState<string | null>(null);
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ['rewards', 'profile', address],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token || !address) throw new Error('auth');
      return fetchRewardsProfile(address, token);
    },
    enabled: authenticated && !!address,
  });

  const boardQ = useQuery({
    queryKey: ['rewards', 'leaderboard'],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error('auth');
      return fetchLeaderboard(token);
    },
    enabled: authenticated,
  });

  const refsQ = useQuery({
    queryKey: ['rewards', 'referrals', address],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token || !address) throw new Error('auth');
      return fetchReferrals(address, token);
    },
    enabled: authenticated && !!address,
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token || !address) throw new Error('auth');
      return applyReferralCode(address, code.trim(), token);
    },
    onSuccess: (res) => {
      setFlash(res.success ? rewardsCopy.referralApplied : (res.error ?? rewardsCopy.referralError));
      void qc.invalidateQueries({ queryKey: ['rewards'] });
    },
    onError: () => setFlash(rewardsCopy.referralError),
  });

  const p = profileQ.data;

  return (
    <AuthGate
      skeleton={<RewardsSkeleton />}
      title={rewardsCopy.title}
      body={rewardsCopy.loginRequired}
      cta={rewardsCopy.loginButton}
    >
      {(signed) => (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold">{rewardsCopy.title}</h1>
      <p className="mt-1 text-xs font-bold uppercase text-[var(--text-3)]">{rewardsCopy.seasonLabel}</p>

      <div className="mt-4 flex rounded-xl bg-[var(--bg-2)] p-1">
        <button
          type="button"
          onClick={() => setTab('rewards')}
          className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-xs font-extrabold ${
            tab === 'rewards'
              ? 'bg-white text-[var(--accent-dark)] shadow-sm'
              : 'text-[var(--text-2)] hover:text-[var(--text)]'
          }`}
        >
          {rewardsCopy.rewardsTab}
        </button>
        <button
          type="button"
          onClick={() => setTab('referrals')}
          className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-xs font-extrabold ${
            tab === 'referrals'
              ? 'bg-white text-[var(--accent-dark)] shadow-sm'
              : 'text-[var(--text-2)] hover:text-[var(--text)]'
          }`}
        >
          {rewardsCopy.referralsTab}
        </button>
      </div>

      {tab === 'rewards' ? (
        <div key="rewards" className="page-enter">
          <section className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-5">
            {profileQ.isPending && !p ? (
              <>
                <Skel className="h-9 w-36" />
                <Skel className="mt-2 h-4 w-20" />
                <Skel className="mt-3 h-3 w-full max-w-sm" />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <Skel className="h-3 w-24" />
                    <Skel className="mt-2 h-5 w-16" />
                  </div>
                  <div>
                    <Skel className="h-3 w-24" />
                    <Skel className="mt-2 h-5 w-10" />
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="text-3xl font-extrabold">{(p?.total_points ?? 0).toLocaleString()} pts</div>
            <div className="mt-1 text-sm font-bold capitalize">{p?.tier ?? '—'}</div>
            <p className="mt-2 text-xs text-[var(--text-3)]">{rewardsCopy.tierDiscountHint}</p>
            {p?.next_tier ? (
              <p className="mt-2 text-sm">
                {interpolate(rewardsCopy.nextTier, { tier: p.next_tier })} ·{' '}
                {interpolate(rewardsCopy.pointsAway, { points: p.points_to_next_tier })}
              </p>
            ) : (
              <p className="mt-2 text-sm">{rewardsCopy.maxTier}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-[var(--text-3)]">{rewardsCopy.tradingVolumeProgress}</div>
                <div className="font-bold">${(p?.lifetime_volume_usd ?? 0).toFixed(0)}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-3)]">{rewardsCopy.referredUsers}</div>
                <div className="font-bold">{p?.referral_count ?? 0}</div>
              </div>
            </div>
              </>
            )}
          </section>

          <section className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-extrabold">{rewardsCopy.leaderboard}</h2>
            {boardQ.isPending && !boardQ.data ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skel className="h-4 w-40" />
                    <Skel className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {(boardQ.data?.leaderboard ?? []).slice(0, 20).map((row) => (
                  <li key={row.wallet} className="flex justify-between">
                    <span>
                      {interpolate(rewardsCopy.rank, { rank: row.rank })}{' '}
                      {row.wallet.slice(0, 6)}…{row.wallet.slice(-4)}
                      {row.wallet.toLowerCase() === signed.toLowerCase() ? ` ${rewardsCopy.you}` : ''}
                    </span>
                    <span className="font-bold">
                      {row.points} {rewardsCopy.pts}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div key="referrals" className="page-enter">
        <section className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-5">
          {profileQ.isPending && !p ? (
            <>
              <Skel className="h-3 w-24" />
              <Skel className="mt-2 h-10 w-28" />
              <Skel className="mt-3 h-3 w-48" />
            </>
          ) : (
            <>
          <div className="text-xs font-bold uppercase text-[var(--text-3)]">{rewardsCopy.referralCode}</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded-lg bg-[var(--bg-2)] px-3 py-2 text-lg font-extrabold">
              {p?.referral_code ?? '—'}
            </code>
            <button
              type="button"
              className="text-xs font-bold text-[var(--accent-dark)]"
              onClick={() => {
                if (p?.referral_code) {
                  void navigator.clipboard.writeText(p.referral_code);
                  setFlash(rewardsCopy.codeCopied);
                }
              }}
            >
              {rewardsCopy.tapToCopy}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-3)]">{rewardsCopy.shareInvite}</p>
          <div className="mt-4">
            <div className="text-xs font-bold">{rewardsCopy.haveCode}</div>
            <div className="mt-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={applyMut.isPending || !code.trim()}
                onClick={() => applyMut.mutate()}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
              >
                {rewardsCopy.applyCode}
              </button>
            </div>
          </div>
            </>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {refsQ.isPending && !refsQ.data ? (
              Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="flex justify-between">
                  <Skel className="h-4 w-28" />
                  <Skel className="h-4 w-16" />
                </li>
              ))
            ) : (refsQ.data?.referrals ?? []).length === 0 ? (
              <li className="text-[var(--text-3)]">{rewardsCopy.noReferrals}</li>
            ) : (
              (refsQ.data?.referrals ?? []).map((r) => (
                <li key={r.referee} className="flex justify-between">
                  <span className="font-mono text-xs">
                    {r.referee.slice(0, 6)}…{r.referee.slice(-4)}
                  </span>
                  <span>{r.status === 'qualified' ? rewardsCopy.qualified : rewardsCopy.pending}</span>
                </li>
              ))
            )}
          </ul>
        </section>
        </div>
      )}
      {flash ? <p className="mt-3 text-sm font-semibold">{flash}</p> : null}
      <Link to="/fees" className="mt-6 inline-block text-sm font-bold text-[var(--accent-dark)]">
        Fee schedule
      </Link>
    </div>
      )}
    </AuthGate>
  );
}
