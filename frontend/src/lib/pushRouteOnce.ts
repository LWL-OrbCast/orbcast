import type { Href } from 'expo-router';

const lastPushAt = new Map<string, number>();
const DEDUP_MS = 600;

function hrefToKey(href: Href): string {
  // Dedup by pathname only. Including params broke double-tap guards when the
  // same screen was opened with different param shapes in quick succession
  // (e.g. /profile vs /profile?onboarding=1 after clearing the home pulse).
  if (typeof href === 'string') {
    const q = href.indexOf('?');
    return q === -1 ? href : href.slice(0, q);
  }
  if (href != null && typeof href === 'object' && 'pathname' in href) {
    return String((href as { pathname?: string }).pathname ?? '');
  }
  return String(href);
}

function routeOnce(navigate: (href: Href) => void, href: Href): void {
  const key = hrefToKey(href);
  const now = Date.now();
  const last = lastPushAt.get(key) ?? 0;
  if (now - last < DEDUP_MS) return;
  lastPushAt.set(key, now);
  navigate(href);
}

/**
 * Ignores rapid repeat navigations to the same destination so stacked copies
 * of the same screen are not opened (e.g. fast double-taps on profile menu).
 */
export function pushRouteOnce(router: { push: (href: Href) => void }, href: Href): void {
  routeOnce((h) => router.push(h), href);
}

/**
 * Same dedup as `pushRouteOnce` but replaces the current screen. Use when
 * navigating OUT of a native-modal screen (profile, deposit) to a card screen:
 * pushing a card on top of a modal nests it inside the modal's presentation
 * context on iOS, which breaks bottom-sheet anchoring on the target screen.
 */
export function replaceRouteOnce(router: { replace: (href: Href) => void }, href: Href): void {
  routeOnce((h) => router.replace(h), href);
}

/**
 * Same dedup as `pushRouteOnce` but uses `navigate`, which pops back to an
 * existing instance of the target in the stack instead of pushing a duplicate.
 * Use for top-level bottom-nav tabs (`/`, `/markets`, `/portfolio`, `/rewards`, `/profile`) so that
 * alternating between sections does not stack multiple copies of heavy screens
 * (e.g. the markets homepage with its live-price WebSocket subscriptions).
 */
export function navigateRouteOnce(router: { navigate: (href: Href) => void }, href: Href): void {
  routeOnce((h) => router.navigate(h), href);
}
