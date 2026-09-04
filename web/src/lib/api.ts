import { API_BASE } from './config';
import { isTimestampOnLocalDay } from '@hip4/catalog';

export type BuilderConfig = {
  address: string;
  fee: number;
  base_fee?: number;
  discount?: number;
};

async function api<T>(
  path: string,
  opts?: RequestInit & { token?: string | null; query?: Record<string, string> },
): Promise<T> {
  const joined = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const url = joined.startsWith('http')
    ? new URL(joined)
    : new URL(joined, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  const headers = new Headers(opts?.headers);
  if (!headers.has('Content-Type') && opts?.body) headers.set('Content-Type', 'application/json');
  if (opts?.token) headers.set('Authorization', `Bearer ${opts.token}`);
  const res = await fetch(url.toString(), { ...opts, headers });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = String(body?.detail ?? body?.error ?? detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function fetchHealth() {
  return api<{ status?: string }>('/health');
}

export type EplBoard = {
  configured: boolean;
  season: number;
  league: { id: number; name: string; logo: string };
  featured: EplFixture | null;
  upcoming: EplFixture[];
};

export type EplFixture = {
  fixtureId: number;
  kickoffAt: number | null;
  status: string;
  statusLong: string;
  elapsed: number | null;
  live: boolean;
  finished: boolean;
  home: { id: number | null; name: string; logo: string };
  away: { id: number | null; name: string; logo: string };
  goals: { home: number | null; away: number | null };
  league: { id: number; name: string; logo: string; round: string };
  venue: string;
  events?: Array<{
    elapsed: number | null;
    extra: number | null;
    type: string;
    detail: string;
    team: string;
    player: string;
  }>;
};

export function fetchEplBoard() {
  return api<EplBoard>('/sports/football/epl');
}

export function isTodaysEplFixture(fixture: EplFixture, now = Date.now()): boolean {
  if (fixture.finished) return false;
  if (fixture.live) return true;
  return isTimestampOnLocalDay(fixture.kickoffAt, now);
}

export function fetchBuilderConfig(walletAddress?: string) {
  return api<BuilderConfig>('/builder-config', {
    query: walletAddress ? { wallet_address: walletAddress } : undefined,
  });
}

export function fetchRewardsProfile(
  walletAddress: string,
  token: string,
  signal?: AbortSignal,
) {
  return api<RewardsProfile>('/rewards/profile', {
    token,
    query: { wallet_address: walletAddress },
    signal,
  });
}

export function fetchLeaderboard(token: string, limit = 20) {
  return api<{
    leaderboard: Array<{
      rank: number;
      wallet: string;
      points: number;
      tier: string;
      referrals: number;
      volume: number;
    }>;
  }>('/rewards/leaderboard', { token, query: { limit: String(limit) } });
}

export function applyReferralCode(walletAddress: string, referralCode: string, token: string) {
  return api<{ success: boolean; error?: string }>('/rewards/apply-referral', {
    method: 'POST',
    token,
    body: JSON.stringify({ wallet_address: walletAddress, referral_code: referralCode }),
  });
}

export function reportTrade(walletAddress: string, token: string) {
  return api<{
    volume_updated?: number;
    new_achievements?: string[];
    points_earned: number;
  }>('/rewards/report-trade', {
    method: 'POST',
    token,
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
}

export type TierInfo = {
  name: string;
  min_points: number;
  fee_discount_tenths: number;
};

export type VolumeMilestone = {
  threshold: number;
  points: number;
  label: string;
};

export type AchievementDef = {
  id: string;
  points: number;
  title: string;
  desc: string;
  category?: 'trading' | 'cash';
};

export type RewardsProfile = {
  wallet_address: string;
  referral_code: string;
  total_points: number;
  tier: string;
  fee_discount_tenths: number;
  lifetime_volume_usd: number;
  lifetime_cash_volume_usd?: number;
  referral_count: number;
  achievements?: string[];
  next_tier: string | null;
  points_to_next_tier: number;
  next_volume_milestone?: VolumeMilestone | null;
  volume_progress_pct?: number;
  next_cash_volume_milestone?: VolumeMilestone | null;
  cash_volume_progress_pct?: number;
  tier_list?: TierInfo[];
};

export function fetchRewardsAchievements() {
  return api<{
    achievements: Record<string, AchievementDef>;
    volume_milestones: VolumeMilestone[];
    cash_volume_milestones: VolumeMilestone[];
    tiers: TierInfo[];
  }>('/rewards/achievements');
}

export function fetchReferrals(walletAddress: string, token: string) {
  return api<{
    referrals: Array<{
      referee: string;
      status: string;
      created_at: string;
      qualified_at: string | null;
    }>;
  }>('/rewards/referrals', { token, query: { wallet_address: walletAddress } });
}

export function fetchRelayerAddress(user: string) {
  return api<{ relayer: string }>('/wallet/relayer-address', { query: { user } });
}

export function fetchTransferLimit(walletAddress: string, token: string) {
  return api<{
    max: number;
    used: number;
    remaining: number;
    resetInSeconds: number | null;
    windowHours: number;
  }>('/wallet/transfer-limit', {
    token,
    query: { wallet_address: walletAddress },
  });
}

export function transferWithPermit(
  req: {
    user: string;
    destination: string;
    usd: string;
    deadline: number;
    signature: string;
    intent_signature: string;
    signed_nonce?: number;
  },
  token: string,
) {
  return api<{ ok: boolean; txHash: string }>('/wallet/transfer-with-permit', {
    method: 'POST',
    token,
    body: JSON.stringify(req),
  });
}

export function depositWithPermit(
  req: { user: string; usd: string; deadline: number; signature: string },
  token: string,
) {
  return api<{ ok: boolean; txHash: string }>('/bridge2/deposit-with-permit', {
    method: 'POST',
    token,
    body: JSON.stringify(req),
  });
}
