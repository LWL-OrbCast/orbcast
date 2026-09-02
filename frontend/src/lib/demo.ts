/**
 * Demo trading mode helpers.
 *
 * Wraps the backend `/demo/status` and `/demo/claim-funds` endpoints, mirrors
 * the result in AsyncStorage so the Profile row renders the right state
 * instantly on cold start, and exposes a tiny store-like API for components.
 *
 * Backed end-to-end by the backend logic in server.py:
 *   - GET  /demo/status        → {claimed, status, ...}
 *   - POST /demo/claim-funds   → {ok, outcome, ...}
 *
 * The actual HL testnet usdSend that grants $100 to the user's wallet is
 * signed server-side by a master agent — the client never touches the
 * master key.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './api';
import { getNotificationDeviceId } from './notifications';

const DEMO_STATUS_CACHE_KEY = 'orbcast_demo_status_v1';

export type DemoStatus = {
  claimed: boolean;
  status: 'pending' | 'sent' | 'failed' | null;
  claimed_at: string | null;
  sent_at: string | null;
  tx_hash: string | null;
  amount_usdc: number | null;
  grant_amount_usdc: number;
};

export type ClaimOutcome =
  | 'granted'           // First-time success, USDC sent
  | 'already_claimed'   // Idempotent: row exists with status='sent'
  | 'pending_in_flight' // Another replica is mid-claim, retry shortly
  | 'device_taken'      // Different Privy identity already claimed on this device
  | 'failed';           // Backend usdSend or DB error — user can retry

export type ClaimResult = {
  ok: boolean;
  outcome: ClaimOutcome;
  status: DemoStatus | null;
  /** Human-readable error message if ok=false and outcome='failed'. */
  error?: string;
};

const DEFAULT_GRANT = 100;

function getDemoStatusCacheKey(ownerId?: string | null): string {
  const owner = String(ownerId || '').trim();
  return owner ? `${DEMO_STATUS_CACHE_KEY}:${owner}` : DEMO_STATUS_CACHE_KEY;
}

function emptyStatus(): DemoStatus {
  return {
    claimed: false,
    status: null,
    claimed_at: null,
    sent_at: null,
    tx_hash: null,
    amount_usdc: null,
    grant_amount_usdc: DEFAULT_GRANT,
  };
}

/**
 * Read the cached status. Returns null if no cache exists (force fetch from
 * network). Used to render the Profile row instantly on cold start before
 * the network round-trip resolves.
 */
export async function getCachedDemoStatus(ownerId?: string | null): Promise<DemoStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(getDemoStatusCacheKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoStatus>;
    if (typeof parsed?.claimed !== 'boolean') return null;
    return { ...emptyStatus(), ...parsed };
  } catch {
    return null;
  }
}

async function setCachedDemoStatus(status: DemoStatus | null, ownerId?: string | null): Promise<void> {
  try {
    const cacheKey = getDemoStatusCacheKey(ownerId);
    if (status === null) {
      await AsyncStorage.removeItem(cacheKey);
    } else {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(status));
    }
  } catch {
    // Cache is best-effort. Network is the source of truth.
  }
}

export async function clearDemoStatusCache(ownerId?: string | null): Promise<void> {
  await setCachedDemoStatus(null, ownerId);
  if (ownerId) {
    // Remove the pre-scoped legacy cache too so a later network error cannot
    // paint the previous user's demo claim state into the Profile row.
    await setCachedDemoStatus(null);
  }
}

/**
 * Fetch the authoritative demo status from the backend and update the cache.
 * Pass an access token (from useAuth().getAccessToken()).
 *
 * On network error: returns the cached value if any, else a fresh empty
 * status. We never throw — the UI should always render something.
 */
export async function fetchDemoStatus(accessToken: string, ownerId?: string | null): Promise<DemoStatus> {
  try {
    const res = await fetch(`${API_BASE_URL}/demo/status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 503) {
      // Demo mode not configured on the backend (missing env vars). Show
      // the row as "unavailable" by reporting an empty unclaimed state —
      // the modal CTA will fail loudly if tapped, which is the right UX.
      return emptyStatus();
    }

    if (!res.ok) {
      const cached = await getCachedDemoStatus(ownerId);
      return cached ?? emptyStatus();
    }

    const data = (await res.json()) as DemoStatus;
    const normalized: DemoStatus = {
      ...emptyStatus(),
      ...data,
      grant_amount_usdc: Number(data?.grant_amount_usdc ?? DEFAULT_GRANT),
    };
    await setCachedDemoStatus(normalized, ownerId);
    return normalized;
  } catch {
    const cached = await getCachedDemoStatus(ownerId);
    return cached ?? emptyStatus();
  }
}

/**
 * Submit the one-shot $100 claim. The user's privy id is read server-side
 * from the auth token; we only send the wallet (where the testnet USDC is
 * delivered) and a soft device fingerprint for sybil defense.
 *
 * Returns a structured result so the UI can branch:
 *   - granted / already_claimed → success toast, refresh row state
 *   - pending_in_flight         → "still processing, retry in a moment"
 *   - device_taken              → "this device already claimed"
 *   - failed                    → show error, leave row in not-claimed state
 */
export async function claimDemoFunds(
  accessToken: string,
  walletAddress: string,
  ownerId?: string | null,
): Promise<ClaimResult> {
  if (!walletAddress) {
    return { ok: false, outcome: 'failed', status: null, error: 'No wallet address' };
  }

  let deviceId: string | null = null;
  try {
    deviceId = await getNotificationDeviceId();
  } catch {
    // Device id is a best-effort sybil signal — proceed without it.
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/demo/claim-funds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        device_id: deviceId,
      }),
    });
  } catch (e: any) {
    return {
      ok: false,
      outcome: 'failed',
      status: null,
      error: e?.message ?? 'Network error',
    };
  }

  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }

  // 409 → device_taken. 202 → pending_in_flight. 503 → demo mode not configured.
  if (res.status === 409) {
    return {
      ok: false,
      outcome: 'device_taken',
      status: null,
      error: body?.detail ?? 'This device has already claimed demo funds.',
    };
  }
  if (res.status === 202) {
    const status = body?.status === undefined ? null : (body as DemoStatus);
    return {
      ok: false,
      outcome: 'pending_in_flight',
      status,
      error: 'Still processing — please try again in a moment.',
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      outcome: 'failed',
      status: null,
      error:
        body?.detail ??
        body?.error ??
        `Server error (${res.status}). Please try again.`,
    };
  }

  // 200 OK — body shape: {ok: true, outcome, ...status_fields}
  const outcome = (body?.outcome as ClaimOutcome) ?? 'granted';
  const status: DemoStatus = {
    ...emptyStatus(),
    ...(body ?? {}),
    grant_amount_usdc: Number(body?.grant_amount_usdc ?? DEFAULT_GRANT),
  };
  await setCachedDemoStatus(status, ownerId);
  return { ok: true, outcome, status };
}

/** HL testnet spot has no meaningful liquidity; demo UX is perps-only (BTC/ETH). */
export function demoAllowsSpot(tradingEnv: 'mainnet' | 'demo'): boolean {
  return tradingEnv !== 'demo';
}
