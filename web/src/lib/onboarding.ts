import { API_BASE } from './config';

export const ONBOARDING_ACCOUNT_INFO_QUERY_KEY = 'onboarding-account-info' as const;

export const ACCOUNT_INFO_QUERY_KEY = [ONBOARDING_ACCOUNT_INFO_QUERY_KEY] as const;

export function accountInfoQueryKey(userId: string | null | undefined) {
  return [ONBOARDING_ACCOUNT_INFO_QUERY_KEY, userId ?? ''] as const;
}

const loadedAvatarSrc = new Set<string>();

export function avatarImgReady(src: string): boolean {
  return loadedAvatarSrc.has(src);
}

export function markAvatarImgReady(src: string): void {
  loadedAvatarSrc.add(src);
}

const AVATAR_HINT_KEY = 'orbcast:avatar-hint';

function avatarHintKey(userId: string): string {
  return `${AVATAR_HINT_KEY}:${userId}`;
}

/**
 * Last-known avatar URL for this Privy user. Per-user so a logout or a second
 * account cannot wipe someone else's photo hint.
 * Returns the URL, `''` when we know there is no avatar, or `null` when unknown.
 */
export function readAvatarHint(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(avatarHintKey(userId));
  } catch {
    return null;
  }
}

export function writeAvatarHint(userId: string | null | undefined, url: string | null): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(avatarHintKey(userId), url ?? '');
  } catch {
    // Storage unavailable (private mode) — hint is best-effort only.
  }
}

export function clearAvatarHint(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    window.localStorage.removeItem(avatarHintKey(userId));
  } catch {
    /* ignore */
  }
}

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

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function parseAccountInfo(data: unknown): OnboardingAccountInfo {
  if (!data || typeof data !== 'object') return EMPTY_ACCOUNT_INFO;
  const row = data as Record<string, unknown>;
  return {
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    has_avatar: row.has_avatar === true,
  };
}

async function readDetail(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    return typeof data?.detail === 'string' ? data.detail : null;
  } catch {
    return null;
  }
}

export async function fetchOnboardingAccountInfo(
  accessToken: string,
): Promise<OnboardingAccountInfo> {
  const res = await fetch(`${API_BASE}/onboarding/account-info`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`account-info ${res.status}`);
  return parseAccountInfo(await res.json());
}

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
  const res = await fetch(`${API_BASE}/onboarding/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_base64 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof (data as { detail?: unknown })?.detail === 'string'
      ? (data as { detail: string }).detail
      : 'Could not save avatar.';
    throw new Error(detail);
  }
  return parseAccountInfo(data);
}

export async function deleteOnboardingAvatar(accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/onboarding/avatar`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error((await readDetail(res)) ?? 'Could not remove avatar.');
  }
}

export function fileToAvatarBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo. Try another PNG, JPG, or WebP.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}
