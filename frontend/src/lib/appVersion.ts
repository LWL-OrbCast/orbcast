/**
 * App update policy client.
 *
 * Talks to `GET /api/app-version`, which resolves the update decision from the
 * backend `app_version_policy` table (editable live). The client stays dumb: it
 * just reports the installed version + platform and renders whatever the backend
 * decides. Everything fails open — a network/parse error yields "no update" so a
 * backend hiccup can never surface a spurious banner or block the app.
 *
 * TODO(app-release): Two version numbers — do not confuse them.
 *
 *   1. `app.json` → `expo.version` (e.g. 1.9.3)
 *      The *next* native build you are preparing. OK to bump right after you ship
 *      so you do not forget the next release — it is NOT what drives the banner.
 *
 *   2. Supabase `app_version_policy.latest_version` (e.g. 1.9.2)
 *      The version *actually live on the Play Store / App Store*. This is what
 *      users are compared against. Update ONLY after the new build is published
 *      and live — never to your ahead-of-time app.json value.
 *
 *   Banner shows when: installed native version < `latest_version` in the DB.
 *   Your own phone on the store latest will never see the banner (expected).
 *
 *   After each store release:
 *     UPDATE app_version_policy
 *     SET latest_version = '<published>', updated_at = now()
 *     WHERE platform IN ('android','ios');
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { api } from './api';

export type AppUpdatePolicy = {
  enabled: boolean;
  updateAvailable: boolean;
  forceUpdate: boolean;
  latestVersion: string | null;
  minVersion: string | null;
  storeUrl: string | null;
  message: string | null;
};

const NO_UPDATE: AppUpdatePolicy = {
  enabled: false,
  updateAvailable: false,
  forceUpdate: false,
  latestVersion: null,
  minVersion: null,
  storeUrl: null,
  message: null,
};

/** Installed app version string, e.g. "1.9.1" (from the native binary). */
export function getInstalledVersion(): string {
  return Application.nativeApplicationVersion || '0.0.0';
}

/** Platform key the backend expects. */
export function getPlatformKey(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * Fetch the update policy for the installed build. Never throws.
 */
export async function fetchAppUpdatePolicy(): Promise<AppUpdatePolicy> {
  // Only meaningful on native store builds.
  if (Platform.OS === 'web') return NO_UPDATE;

  try {
    const { data } = await api.get<AppUpdatePolicy>('/app-version', {
      params: {
        platform: getPlatformKey(),
        version: getInstalledVersion(),
      },
      timeout: 8000,
    });
    if (!data || typeof data !== 'object') return NO_UPDATE;
    return {
      enabled: !!data.enabled,
      updateAvailable: !!data.updateAvailable,
      forceUpdate: !!data.forceUpdate,
      latestVersion: data.latestVersion ?? null,
      minVersion: data.minVersion ?? null,
      storeUrl: data.storeUrl ?? null,
      message: data.message ?? null,
    };
  } catch {
    return NO_UPDATE;
  }
}
