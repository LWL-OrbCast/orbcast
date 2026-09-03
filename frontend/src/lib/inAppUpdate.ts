/**
 * Soft update banner: open the store listing only.
 *
 * Never use Google's in-app update API here — flexible/immediate can stall on
 * "Installing" (especially after backgrounding), and a half-finished session
 * makes the next native call a no-op until the user finds the store fallback.
 *
 * Soft banner → https Play Store / App Store URL (Android often shows a small
 * app chooser: Play Store vs browser — that path is reliable). `market://` is
 * a fallback if https fails.
 *
 * `expo-in-app-updates` remains available for a future force-update screen only.
 */
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

const ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package || 'com.orbcast.hip4sports';
const DEFAULT_PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

async function openPlayStore(storeUrl: string | null | undefined): Promise<void> {
  const webUrl = storeUrl?.trim() || DEFAULT_PLAY_URL;
  const marketUrl = `market://details?id=${ANDROID_PACKAGE}`;

  // Prefer https so Android can offer Play Store (the path that actually
  // completes updates). market:// first used to skip that chooser and users
  // hit a dead "Installing" state from an older in-app flow / Play UI.
  try {
    await Linking.openURL(webUrl);
    return;
  } catch {
    /* fall through */
  }

  try {
    await Linking.openURL(marketUrl);
  } catch {
    /* nothing else we can do */
  }
}

/**
 * Soft-banner update action: open the store listing. Never throws.
 * Does not call expo-in-app-updates.
 */
export async function launchAppUpdate(storeUrl: string | null | undefined): Promise<void> {
  // TODO(ios): Before shipping iOS, set the real App Store link in
  // `app_version_policy.ios` and add `AppStoreID` under ios.infoPlist in
  // app.json if you want a native App Store modal on force-update.
  if (Platform.OS === 'ios') {
    const url = storeUrl?.trim();
    if (url) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        /* fall through */
      }
    }
  }
  await openPlayStore(storeUrl);
}

/**
 * Reserved for a future blocking force-update screen. Soft banner must not
 * call this — it still may try Play immediate in-app update when allowed.
 */
export async function launchForceAppUpdate(storeUrl: string | null | undefined): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('expo-in-app-updates');
      const InApp = mod?.default ?? mod;
      if (InApp?.checkForUpdate && InApp?.startUpdate) {
        const info = await InApp.checkForUpdate();
        if (info?.updateAvailable && info.immediateAllowed && !info.updateInProgress) {
          const started = await InApp.startUpdate(true);
          if (started) return;
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (Platform.OS === 'ios') {
    try {
      const mod = require('expo-in-app-updates');
      const InApp = mod?.default ?? mod;
      if (InApp?.checkForUpdate && InApp?.startUpdate) {
        const info = await InApp.checkForUpdate();
        if (info?.updateAvailable) {
          const started = await InApp.startUpdate();
          if (started) return;
        }
      }
    } catch {
      /* fall through */
    }
  }

  await openPlayStore(storeUrl);
}
