/**
 * Drives the in-app update banner.
 *
 * Fetches policy on mount + foreground (throttled); dismiss hides until a newer
 * version ships. TODO(app-release): see `src/lib/appVersion.ts` — Supabase
 * `latest_version` tracks the store, not the ahead-of-time `app.json` version.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAppUpdatePolicy, type AppUpdatePolicy } from '../lib/appVersion';
import { launchAppUpdate } from '../lib/inAppUpdate';

const DISMISS_KEY = 'app_update_dismissed_version';
/** Min gap between foreground re-checks so rapid app switching doesn't spam. */
const RECHECK_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h

export type UseAppUpdateCheck = {
  /** True when a dismissible soft-update banner should be shown. */
  visible: boolean;
  latestVersion: string | null;
  storeUrl: string | null;
  message: string | null;
  forceUpdate: boolean;
  /** Open the store listing (Play Store / App Store). Soft banner never uses native in-app install. */
  openUpdate: () => Promise<void>;
  /** Hide the banner until a newer version is published. */
  dismiss: () => void;
  /** True while the update action is in flight (disables the button). */
  isUpdating: boolean;
};

export function useAppUpdateCheck(): UseAppUpdateCheck {
  const [policy, setPolicy] = useState<AppUpdatePolicy | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [manuallyHidden, setManuallyHidden] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const lastCheckRef = useRef(0);

  const runCheck = useCallback(async () => {
    lastCheckRef.current = Date.now();
    const result = await fetchAppUpdatePolicy();
    setPolicy(result);
  }, []);

  // Load the dismissed marker once, then do the first check.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(DISMISS_KEY);
        if (!cancelled) setDismissedVersion(stored);
      } catch {
        /* ignore */
      }
      if (!cancelled) void runCheck();
    })();
    return () => {
      cancelled = true;
    };
  }, [runCheck]);

  // Re-check when returning to the foreground (throttled).
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (Date.now() - lastCheckRef.current < RECHECK_THROTTLE_MS) return;
      void runCheck();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [runCheck]);

  const dismiss = useCallback(() => {
    setManuallyHidden(true);
    const v = policy?.latestVersion;
    if (v) {
      setDismissedVersion(v);
      void AsyncStorage.setItem(DISMISS_KEY, v).catch(() => {});
    }
  }, [policy?.latestVersion]);

  const openUpdate = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await launchAppUpdate(policy?.storeUrl ?? null);
    } finally {
      setIsUpdating(false);
    }
  }, [isUpdating, policy?.storeUrl]);

  const isSoftUpdate =
    !!policy &&
    policy.enabled &&
    policy.updateAvailable &&
    !policy.forceUpdate;

  // Hidden if the user dismissed *this* latest version already.
  const dismissedThis =
    !!policy?.latestVersion && dismissedVersion === policy.latestVersion;

  const visible = isSoftUpdate && !manuallyHidden && !dismissedThis;

  return {
    visible,
    latestVersion: policy?.latestVersion ?? null,
    storeUrl: policy?.storeUrl ?? null,
    message: policy?.message ?? null,
    forceUpdate: !!policy?.forceUpdate,
    openUpdate,
    dismiss,
    isUpdating,
  };
}
