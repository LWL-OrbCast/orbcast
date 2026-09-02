import { Linking } from 'react-native';

/**
 * Open only http(s) URLs in the system browser / handler.
 * Blocks javascript:, intent:, custom schemes, and malformed strings
 * from server/CMS-supplied links (whitepaper, news, explorer, etc.).
 *
 * Intentional non-https deep links (WalletConnect, app-store schemes)
 * should keep calling Linking.openURL directly.
 */
export function isHttpsUrl(url: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** @returns true if Linking.openURL was invoked */
export async function openHttpsUrl(url: string): Promise<boolean> {
  const trimmed = (url || '').trim();
  if (!isHttpsUrl(trimmed)) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[openHttpsUrl] blocked non-https URL', trimmed.slice(0, 120));
    }
    return false;
  }
  await Linking.openURL(trimmed);
  return true;
}
