import Constants from 'expo-constants';
import { BRAND_DOMAIN, BRAND_SITE_URL } from './brand';

function getExpoExtra(): Record<string, string | undefined> | undefined {
  return (
    (Constants.expoConfig?.extra as Record<string, string | undefined> | undefined) ??
    ((Constants as unknown as { manifest2?: { extra?: Record<string, string | undefined> } })
      .manifest2?.extra) ??
    ((Constants as unknown as { manifest?: { extra?: Record<string, string | undefined> } })
      .manifest?.extra)
  );
}

const expoExtra = getExpoExtra();

/**
 * SIWE origin fields for Privy `generateSiweMessage`.
 *
 * Per Privy docs the `from.domain` must be allowlisted in the Privy Dashboard
 * (Settings → Domains). Defaults to `orbcast.xyz`.
 *
 * @see https://docs.privy.io/authentication/user-authentication/login-methods/wallet
 */
export const SIWE_DOMAIN =
  process.env.EXPO_PUBLIC_SIWE_DOMAIN?.trim()
  || expoExtra?.EXPO_PUBLIC_SIWE_DOMAIN?.trim()
  || BRAND_DOMAIN;

// NOTE: keep the URI's host EXACTLY equal to SIWE_DOMAIN (no `www.` drift) and
// to the AppKit metadata url (appKitConfig.ts). Wallets enforce EIP-4361
// domain binding: MetaMask compares the SIWE message's domain against both the
// requesting origin (WC metadata) and the URI's subdomain, and flags a red
// "Deceptive site request" warning on any mismatch.
export const SIWE_URI =
  process.env.EXPO_PUBLIC_SIWE_URI?.trim()
  || expoExtra?.EXPO_PUBLIC_SIWE_URI?.trim()
  || BRAND_SITE_URL;

/** Arbitrum One — matches Bridge2 / deposit signing in the app. */
export const SIWE_CHAIN_ID_CAIP2 = 'eip155:42161' as const;
