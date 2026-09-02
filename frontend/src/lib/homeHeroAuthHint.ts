import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'orbcast_home_hero_authed_v1';

/**
 * Last session's home-hero shape (logged-in AccountCard vs guest CTA).
 * Primed during splash so the first home paint can reserve the matching
 * height instead of flashing the guest card then shrinking into AccountCard.
 */
let cached: boolean | null = null;

export function getHomeHeroAuthedHint(): boolean | null {
  return cached;
}

export function setHomeHeroAuthedHint(authed: boolean): void {
  if (cached === authed) return;
  cached = authed;
  AsyncStorage.setItem(STORAGE_KEY, authed ? '1' : '0').catch(() => {});
}

export async function primeHomeHeroAuthedHint(): Promise<void> {
  if (cached !== null) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (cached !== null) return;
    if (raw === '1') cached = true;
    else if (raw === '0') cached = false;
  } catch {
    // Leave unknown — home falls back to the AccountCard-sized skeleton.
  }
}
