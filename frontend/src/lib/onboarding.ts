import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './api';

const ONBOARDING_CACHE_KEY = 'orbcast_onboarding_completed';

export const ONBOARDING_ACCOUNT_INFO_QUERY_KEY = 'onboarding-account-info' as const;

export type OnboardingAccountInfo = {
  created_at: string | null;
  avatar_url: string | null;
  has_avatar: boolean;
};

const EMPTY_ACCOUNT_INFO: OnboardingAccountInfo = {
  created_at: null,
  avatar_url: null,
  has_avatar: false,
};

function avatarCacheKey(userId: string): string {
  return `orbcast_avatar_url_${userId}`;
}

export async function readCachedAvatarUrl(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(avatarCacheKey(userId));
    return raw && raw.startsWith('http') ? raw : null;
  } catch {
    return null;
  }
}

export async function writeCachedAvatarUrl(userId: string, url: string | null): Promise<void> {
  if (!userId) return;
  try {
    if (url && url.startsWith('http')) {
      await AsyncStorage.setItem(avatarCacheKey(userId), url);
    } else {
      await AsyncStorage.removeItem(avatarCacheKey(userId));
    }
  } catch {
    /* ignore */
  }
}

function parseAccountInfo(data: unknown): OnboardingAccountInfo {
  if (!data || typeof data !== 'object') return EMPTY_ACCOUNT_INFO;
  const row = data as Record<string, unknown>;
  return {
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    has_avatar: row.has_avatar === true,
  };
}

export async function fetchOnboardingAccountInfo(
  accessToken: string,
): Promise<OnboardingAccountInfo> {
  const res = await fetch(`${API_BASE_URL}/onboarding/account-info`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (__DEV__) {
      console.warn('[Onboarding] account-info failed', res.status);
    }
    throw new Error(`account-info ${res.status}`);
  }
  return parseAccountInfo(await res.json());
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function isAllowedAvatarFile(opts: { mimeType?: string | null; fileSize?: number | null }): string | null {
  const mime = (opts.mimeType || '').toLowerCase().trim();
  if (mime && !AVATAR_MIME.has(mime)) {
    return 'Use a PNG, JPG, or WebP image (2 MB max).';
  }
  if (typeof opts.fileSize === 'number' && opts.fileSize > AVATAR_MAX_BYTES) {
    return 'Image must be 2 MB or smaller.';
  }
  return null;
}

export async function uploadOnboardingAvatar(
  accessToken: string,
  imageBase64: string,
): Promise<OnboardingAccountInfo> {
  const image_base64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!image_base64) {
    throw new Error('Could not read that photo. Try another PNG, JPG, or WebP.');
  }
  const res = await fetch(`${API_BASE_URL}/onboarding/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_base64 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : 'Could not save avatar.';
    throw new Error(detail);
  }
  return parseAccountInfo(data);
}

export async function deleteOnboardingAvatar(accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/onboarding/avatar`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data?.detail === 'string' ? data.detail : 'Could not remove avatar.';
    throw new Error(detail);
  }
}

export async function fetchOnboardingStatus(accessToken: string): Promise<boolean> {
  try {
    const cached = await AsyncStorage.getItem(ONBOARDING_CACHE_KEY);
    if (cached === '1') return true;

    const res = await fetch(`${API_BASE_URL}/onboarding/status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return false;

    const data = await res.json();
    const completed = data.guide_completed === true;

    if (completed) {
      await AsyncStorage.setItem(ONBOARDING_CACHE_KEY, '1');
    }

    return completed;
  } catch {
    return false;
  }
}

export async function completeOnboarding(accessToken: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_CACHE_KEY, '1');

    await fetch(`${API_BASE_URL}/onboarding/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Local cache is already set — backend will be retried implicitly on next app open
  }
}

export async function resetOnboardingCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_CACHE_KEY);
  } catch { /* noop */ }
}

export async function isOnboardingCachedComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_CACHE_KEY)) === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Profile funds tour (/profile) — wallet deposit → trade
// ---------------------------------------------------------------------------

export const PROFILE_GUIDE_STEP_COUNT = 3 as const;

export type ProfileGuideStep = 0 | 1 | 2 | 3;

export type ProfileGuideStepContent = {
  titleKey:
    | 'onboarding.depositStep'
    | 'onboarding.tradeStep'
    | 'onboarding.bankStep';
  descKey:
    | 'onboarding.depositDesc'
    | 'onboarding.tradeDesc'
    | 'onboarding.bankDesc';
};

export const PROFILE_GUIDE_STEPS: Record<1 | 2 | 3, ProfileGuideStepContent> = {
  1: { titleKey: 'onboarding.depositStep', descKey: 'onboarding.depositDesc' },
  2: { titleKey: 'onboarding.tradeStep', descKey: 'onboarding.tradeDesc' },
  3: { titleKey: 'onboarding.bankStep', descKey: 'onboarding.bankDesc' },
};

/** Always wallet + trade. */
export function getProfileGuideStepCount(): 2 {
  return 2;
}

export function isProfileGuideActive(
  step: ProfileGuideStep,
  maxStep: number = PROFILE_GUIDE_STEP_COUNT,
): step is 1 | 2 | 3 {
  return step >= 1 && step <= maxStep;
}

export function getProfileGuideStepContent(
  step: ProfileGuideStep,
  maxStep: number = PROFILE_GUIDE_STEP_COUNT,
): ProfileGuideStepContent | null {
  if (!isProfileGuideActive(step, maxStep)) return null;
  return PROFILE_GUIDE_STEPS[step];
}

// ---------------------------------------------------------------------------
// Asset page onboarding (independent from profile onboarding)
// ---------------------------------------------------------------------------

const ASSET_ONBOARDING_CACHE_KEY = 'orbcast_asset_onboarding_completed';

export async function fetchAssetOnboardingStatus(accessToken: string): Promise<boolean> {
  try {
    const cached = await AsyncStorage.getItem(ASSET_ONBOARDING_CACHE_KEY);
    if (cached === '1') return true;

    const res = await fetch(`${API_BASE_URL}/onboarding/asset-status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return false;

    const data = await res.json();
    const completed = data.asset_guide_completed === true;

    if (completed) {
      await AsyncStorage.setItem(ASSET_ONBOARDING_CACHE_KEY, '1');
    }

    return completed;
  } catch {
    return false;
  }
}

export async function completeAssetOnboarding(accessToken: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ASSET_ONBOARDING_CACHE_KEY, '1');

    await fetch(`${API_BASE_URL}/onboarding/complete-asset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Local cache is already set
  }
}

export async function resetAssetOnboardingCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ASSET_ONBOARDING_CACHE_KEY);
  } catch { /* noop */ }
}

export async function isAssetOnboardingCachedComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ASSET_ONBOARDING_CACHE_KEY)) === '1';
  } catch {
    return false;
  }
}
