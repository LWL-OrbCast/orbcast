import axios from 'axios';
import Constants from 'expo-constants';

type ExpoExtra = Record<string, unknown> | undefined;

function getExtra(): ExpoExtra {
  // Expo runtime metadata differs between Expo Go / dev-client / production builds.
  // Try the common locations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Constants.expoConfig?.extra as any) ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((Constants as any).manifest2?.extra as any) ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((Constants as any).manifest?.extra as any);
}

const extra = getExtra();

// Prefer process.env so dev integrations can override without requiring a rebuild.
// No committed production URL — set EXPO_PUBLIC_BACKEND_URL in .env / EAS.
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (extra?.EXPO_PUBLIC_BACKEND_URL as string | undefined) ||
  '';

export const RESOLVED_BACKEND_URL = BACKEND_URL;
export const API_BASE_URL = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

if (!BACKEND_URL) {
  // eslint-disable-next-line no-console
  console.error(
    '[api] EXPO_PUBLIC_BACKEND_URL is not set. Copy frontend/.env.example → frontend/.env (or EAS secrets).',
  );
} else if (__DEV__) {
  // Helps confirm on-device which backend URL is being used.
  // eslint-disable-next-line no-console
  console.log('[api] RESOLVED_BACKEND_URL =', RESOLVED_BACKEND_URL);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

if (__DEV__) {
  api.interceptors.response.use(
    (r) => r,
    (error) => {
      // eslint-disable-next-line no-console
      console.log('[api] request failed', {
        baseURL: api.defaults.baseURL,
        url: error?.config?.url,
        method: error?.config?.method,
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });
      return Promise.reject(error);
    }
  );
}

export interface BuilderConfig {
  address: string;
  fee: number;
  base_fee?: number;
  discount?: number;
}

export async function fetchBuilderConfig(walletAddress?: string): Promise<BuilderConfig> {
  const params = walletAddress ? { wallet_address: walletAddress } : undefined;
  const response = await api.get('/builder-config', { params });
  return response.data;
}

// --------------------------------------------------------------------------- //
// Authenticated API calls (require Privy access token)
// --------------------------------------------------------------------------- //

/**
 * Creates an authenticated API request config with Privy access token.
 */
export function withAuth(accessToken: string) {
  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export interface UrTestWalletInfo {
  enabled: boolean;
  address: string | null;
  ur_env?: string;
}

export interface ImportUrTestWalletResponse {
  privy_user_id: string;
  address: string;
  already_imported?: boolean;
  wallet_id?: string;
}

/** Dev-only: check if backend will import UR_API_SIGNER_PRIVKEY_* for this user. */
export async function fetchUrTestWalletInfo(
  accessToken: string,
): Promise<UrTestWalletInfo> {
  const response = await api.get<UrTestWalletInfo>('/dev/ur-test-wallet', withAuth(accessToken));
  return response.data;
}

/** Dev-only: import UR test signer wallet into the authenticated Privy user. */
export async function importUrTestWalletApi(
  accessToken: string,
): Promise<ImportUrTestWalletResponse> {
  const response = await api.post<ImportUrTestWalletResponse>(
    '/dev/import-ur-test-wallet',
    {},
    withAuth(accessToken),
  );
  return response.data;
}

export interface Bridge2DepositRequest {
  user: string;
  usd: string;
  deadline: number;
  signature: string;
}

export interface WalletTransferRequest {
  user: string;
  destination: string;
  usd: string;
  deadline: number;
  signature: string;
  intent_signature: string;
  signed_nonce?: number;  // nonce used when signing (for server-side validation)
}

export interface PermitTxResponse {
  ok: boolean;
  txHash: string;
}

/**
 * Submit a gasless Bridge2 deposit with permit signature.
 * Requires Privy access token for authentication.
 */
export async function depositWithPermit(
  req: Bridge2DepositRequest,
  accessToken: string
): Promise<PermitTxResponse> {
  const response = await api.post('/bridge2/deposit-with-permit', req, withAuth(accessToken));
  return response.data;
}

/**
 * Submit a gasless wallet transfer with permit signature.
 * Requires Privy access token for authentication.
 */
export async function transferWithPermit(
  req: WalletTransferRequest,
  accessToken: string
): Promise<PermitTxResponse> {
  const response = await api.post('/wallet/transfer-with-permit', req, withAuth(accessToken));
  return response.data;
}

// --------------------------------------------------------------------------- //
// Rewards & Referral API
// --------------------------------------------------------------------------- //

export interface TierInfo {
  name: string;
  min_points: number;
  fee_discount_tenths: number;
}

export interface VolumeMilestone {
  threshold: number;
  points: number;
  label: string;
}

export interface AchievementDef {
  id: string;
  points: number;
  title: string;
  desc: string;
  category?: 'trading' | 'cash';
}

export interface RewardsProfile {
  wallet_address: string;
  referral_code: string;
  total_points: number;
  tier: string;
  fee_discount_tenths: number;
  lifetime_volume_usd: number;
  lifetime_cash_volume_usd: number;
  referral_count: number;
  achievements: string[];
  next_tier: string | null;
  points_to_next_tier: number;
  next_volume_milestone: VolumeMilestone | null;
  volume_progress_pct: number;
  next_cash_volume_milestone: VolumeMilestone | null;
  cash_volume_progress_pct: number;
  tier_list: TierInfo[];
}

export interface ReferralEntry {
  referee: string;
  status: string;
  created_at: string;
  qualified_at: string | null;
}

export async function fetchRewardsProfile(
  walletAddress: string,
  accessToken: string,
): Promise<RewardsProfile> {
  const res = await api.get('/rewards/profile', {
    params: { wallet_address: walletAddress },
    ...withAuth(accessToken),
  });
  return res.data;
}

export async function applyReferralCode(
  walletAddress: string,
  referralCode: string,
  accessToken: string,
): Promise<{ success: boolean; referrer?: string; error?: string }> {
  const res = await api.post(
    '/rewards/apply-referral',
    { wallet_address: walletAddress, referral_code: referralCode },
    withAuth(accessToken),
  );
  return res.data;
}

export async function fetchReferrals(
  walletAddress: string,
  accessToken: string,
): Promise<{ referrals: ReferralEntry[] }> {
  const res = await api.get('/rewards/referrals', {
    params: { wallet_address: walletAddress },
    ...withAuth(accessToken),
  });
  return res.data;
}

export async function fetchPointHistory(
  walletAddress: string,
  accessToken: string,
  limit: number = 50,
): Promise<{ history: Array<{ points: number; reason: string; metadata: any; created_at: string }> }> {
  const res = await api.get('/rewards/history', {
    params: { wallet_address: walletAddress, limit },
    ...withAuth(accessToken),
  });
  return res.data;
}

export async function fetchRewardsAchievements(): Promise<{
  achievements: Record<string, AchievementDef>;
  volume_milestones: VolumeMilestone[];
  cash_volume_milestones: VolumeMilestone[];
  tiers: TierInfo[];
}> {
  const res = await api.get('/rewards/achievements');
  return res.data;
}

export async function reportTrade(
  walletAddress: string,
  accessToken: string,
): Promise<{ volume_updated: number; new_achievements: string[]; points_earned: number }> {
  const res = await api.post(
    '/rewards/report-trade',
    { wallet_address: walletAddress },
    withAuth(accessToken),
  );
  return res.data;
}

export async function fetchLeaderboard(
  accessToken: string,
  limit: number = 20,
): Promise<{ leaderboard: Array<{ rank: number; wallet: string; points: number; tier: string; referrals: number; volume: number }> }> {
  const res = await api.get('/rewards/leaderboard', {
    params: { limit },
    ...withAuth(accessToken),
  });
  return res.data;
}

// Forex display-currency rates
export interface ForexRatesResponse {
  base: string;
  rates: Record<string, number>;
  updated_at: string;
}

export async function fetchForexRates(): Promise<ForexRatesResponse> {
  const res = await api.get('/forex/rates');
  return res.data;
}

// Geo-fence check (disabled for testing)
// export async function checkGeo(): Promise<{ allowed: boolean; country: string | null }> {
//   const res = await api.get('/geo-check');
//   return res.data;
// }
