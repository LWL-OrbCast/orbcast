/**
 * OAuth recovery helpers for Privy + expo-web-browser on native.
 *
 * Android may kill the app while the user is in Telegram/Google/Apple; the
 * in-memory openAuthSessionAsync promise is then lost on cold start. We persist
 * a lightweight "OAuth in flight" marker so the app can show retry UX and call
 * maybeCompleteAuthSession when a redirect deep-link arrives.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

export type OAuthProviderName = 'google' | 'apple' | 'telegram' | 'twitter';

const STORAGE_KEY = 'orbcast_oauth_pending_v1';

/** How long we wait for Privy to settle after a redirect before showing retry. */
export const OAUTH_SETTLE_MS = 4_000;

/** Drop stale pending markers and surface retry UX after this long. */
export const OAUTH_MAX_AGE_MS = 3 * 60 * 1000;

export interface PendingOAuthState {
  provider: OAuthProviderName;
  startedAt: number;
}

export function maybeCompleteAuthSession(): void {
  try {
    WebBrowser.maybeCompleteAuthSession();
  } catch {
    // noop — web / unsupported platforms
  }
}

/** Close any lingering auth browser tab before starting a new OAuth round-trip. */
export async function prepareOAuthBrowserSession(): Promise<void> {
  try {
    await WebBrowser.dismissBrowser();
  } catch {
    // noop — no browser open
  }
  maybeCompleteAuthSession();
}

export function isOAuthBrowserBusyError(error: unknown): boolean {
  const errorMessage = String(
    (error as { message?: string })?.message || error?.toString?.() || '',
  );
  return /another web browser is already open/i.test(errorMessage);
}

export async function markOAuthPending(provider: OAuthProviderName): Promise<void> {
  const payload: PendingOAuthState = { provider, startedAt: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function clearOAuthPending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function readOAuthPending(): Promise<PendingOAuthState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOAuthState>;
    if (
      !parsed
      || (parsed.provider !== 'google'
        && parsed.provider !== 'apple'
        && parsed.provider !== 'telegram'
        && parsed.provider !== 'twitter')
      || typeof parsed.startedAt !== 'number'
    ) {
      return null;
    }
    return { provider: parsed.provider, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

/** True when a deep link looks like an OAuth redirect back into the app. */
export function isOAuthReturnUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (!lower.startsWith('hip4sports://')) return false;
  const hasAuthParams =
    lower.includes('code=')
    || lower.includes('state=')
    || lower.includes('oauth')
    || lower.includes('privy')
    || lower.includes('error=')
    || lower.includes('token=');
  const isRootRedirect =
    /^hip4sports:\/\/?(\/)?(\?.*)?$/i.test(url);
  return hasAuthParams || isRootRedirect;
}

export function isOAuthCancelledError(error: unknown): boolean {
  const errorMessage = String(
    (error as { message?: string })?.message || error?.toString?.() || '',
  );
  return /cancel/i.test(errorMessage) || /oauth.*cancel/i.test(errorMessage);
}
