/**
 * AppsFlyer in-app event helpers.
 *
 * SDK init lives in `app/_layout.tsx`. These helpers are safe no-ops when the
 * dev key is missing (local dev without env).
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appsFlyer from 'react-native-appsflyer';

const extra =
  (Constants.expoConfig?.extra as Record<string, string | undefined> | undefined) ??
  ((Constants as unknown as { manifest2?: { extra?: Record<string, string | undefined> } })
    .manifest2?.extra) ??
  ((Constants as unknown as { manifest?: { extra?: Record<string, string | undefined> } }).manifest
    ?.extra);

const DEV_KEY =
  process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY || extra?.EXPO_PUBLIC_APPSFLYER_DEV_KEY;

const REGISTRATION_STORAGE_KEY = 'orbcast_af_registered_users_v1';
const KYC_COMPLETED_STORAGE_KEY = 'orbcast_af_kyc_completed_v1';

export type AuthMethod = 'email' | 'google' | 'apple' | 'passkey' | 'telegram' | 'twitter';
export type KycStartSource = 'cash_tab' | 'card_tab' | 'bank_guest' | 'unknown';

function logAfEvent(
  eventName: string,
  values: Record<string, string | number> = {},
): Promise<void> {
  if (!DEV_KEY) return Promise.resolve();
  return new Promise((resolve) => {
    appsFlyer.logEvent(
      eventName,
      values,
      () => resolve(),
      () => resolve(),
    );
  });
}

async function readIdSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

async function markIdInSet(key: string, id: string): Promise<boolean> {
  const set = await readIdSet(key);
  if (set.has(id)) return false;
  set.add(id);
  await AsyncStorage.setItem(key, JSON.stringify([...set]));
  return true;
}

/** Call once after `appsFlyer.initSdk` (see `_layout.tsx`). */
export function initAppsFlyerSdk(): void {
  if (!DEV_KEY) return;

  const iosAppId =
    process.env.EXPO_PUBLIC_APPSFLYER_IOS_APP_ID || extra?.EXPO_PUBLIC_APPSFLYER_IOS_APP_ID;

  appsFlyer.initSdk(
    {
      devKey: DEV_KEY,
      isDebug: __DEV__,
      ...(Platform.OS === 'ios' && iosAppId ? { appId: iosAppId } : {}),
      onInstallConversionDataListener: true,
    },
    () => {},
    () => {},
  );
}

export function setAppsFlyerCustomerUserId(userId: string | null): void {
  if (!DEV_KEY || !userId) return;
  appsFlyer.setCustomerUserId(userId, () => {});
}

export const AppsFlyerAnalytics = {
  /** First-time account creation on this device (per Privy user id). */
  async logRegistrationOnce(userId: string, method: AuthMethod): Promise<boolean> {
    const isFirst = await markIdInSet(REGISTRATION_STORAGE_KEY, userId);
    if (!isFirst) return false;
    await logAfEvent('af_complete_registration', { af_registration_method: method });
    return true;
  },

  /** Returning session — once per app session per user. */
  logLogin(method: AuthMethod): Promise<void> {
    return logAfEvent('af_login', { af_login_method: method });
  },

  logKycStarted(source: KycStartSource = 'unknown'): Promise<void> {
    return logAfEvent('kyc_started', { source });
  },

  logKycSubmitted(): Promise<void> {
    return logAfEvent('kyc_submitted', {});
  },

  /** UR chainStatus reached Live (5) — once per Privy user id. */
  async logKycCompletedOnce(userId: string): Promise<boolean> {
    const isFirst = await markIdInSet(KYC_COMPLETED_STORAGE_KEY, userId);
    if (!isFirst) return false;
    await logAfEvent('kyc_completed', {});
    return true;
  },

  setCustomerUserId(userId: string | null): void {
    setAppsFlyerCustomerUserId(userId);
  },
};
