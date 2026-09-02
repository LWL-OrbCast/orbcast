/**
 * WalletConnect / AppKit returns to the app via the native scheme
 * (`hip4sports://` or `hip4sports://wc`). Expo Router would otherwise treat
 * that as a real route (`/wc`) and show Unmatched Route — there is no screen
 * for it. Privy OAuth still receives the URL via Linking.
 *
 * App already open (`initial: false`): return `null` so we stay on the current
 * screen (e.g. seamless setup / AI agents) instead of jumping to Home.
 *
 * Cold start / Metro reload (`initial: true`): rewrite to `/`. Reloads re-read
 * `Linking.getInitialURL()`, which on Android is often the last MetaMask
 * bounce-back, so without this every Fast Refresh lands on Unmatched Route.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    if (isWalletConnectBounceBack(path)) {
      return initial ? '/' : null;
    }
    return path;
  } catch {
    return path;
  }
}

function isWalletConnectBounceBack(path: string): boolean {
  const raw = (path ?? '').trim();
  if (!raw) return true;

  let pathname = raw;
  let host = '';
  let search = '';
  try {
    const url = raw.includes('://')
      ? new URL(raw)
      : new URL(raw.startsWith('/') ? `hip4sports://${raw}` : `hip4sports:///${raw}`);
    pathname = url.pathname || '/';
    host = (url.hostname || url.host || '').toLowerCase();
    search = url.search || '';
  } catch {
    const q = raw.indexOf('?');
    pathname = (q >= 0 ? raw.slice(0, q) : raw) || '/';
    search = q >= 0 ? raw.slice(q) : '';
  }

  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/wc' || host === 'wc') return true;
  if (/(?:[?&])(?:requestId|sessionTopic|wc_ev|symKey)=/i.test(search)) return true;
  // Scheme-only return: hip4sports:// / hip4sports:///
  return p === '/' && !host;
}
