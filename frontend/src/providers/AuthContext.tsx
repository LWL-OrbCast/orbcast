import { createContext, useContext } from 'react';
import Constants from 'expo-constants';

const expoExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

/** Required — set EXPO_PUBLIC_PRIVY_APP_ID in frontend/.env (or EAS secrets). */
// Expo only inlines *literal* process.env.EXPO_PUBLIC_* keys at build time.
export const PRIVY_APP_ID = (
  process.env.EXPO_PUBLIC_PRIVY_APP_ID?.trim()
  || expoExtra.EXPO_PUBLIC_PRIVY_APP_ID?.trim()
  || ''
);

/** Required — set EXPO_PUBLIC_PRIVY_CLIENT_ID in frontend/.env (or EAS secrets). */
export const PRIVY_CLIENT_ID = (
  process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID?.trim()
  || expoExtra.EXPO_PUBLIC_PRIVY_CLIENT_ID?.trim()
  || ''
);

/** Temporary UR test-wallet import (server uses UR_API_SIGNER_PRIVKEY_*). Remove when done. */
export const UR_TEST_WALLET_IMPORT_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_UR_TEST_WALLET_IMPORT === '1';

/**
 * Configured dev/QA test identities. Each entry is a (Privy DID ↔ URID) pair
 * that gets UR test-wallet import, auto-link to its URID, and the bank-
 * dashboard KYC bypass. Everything else stays on the normal KYC flow.
 *
 * Values come only from env (no committed defaults). Expo only inlines LITERAL
 * `process.env.EXPO_PUBLIC_*` references at build time, so each slot names its
 * env var explicitly.
 */
export interface UrTestIdentity {
  privyUserId: string;
  urid: number;
}

function urTestSlot(
  privyUserId: string | undefined,
  uridRaw: string | undefined,
): UrTestIdentity | null {
  const id = (privyUserId ?? '').trim();
  const urid = Number(uridRaw);
  if (!id || !Number.isFinite(urid) || urid <= 0) return null;
  return { privyUserId: id, urid };
}

export const UR_TEST_IDENTITIES: UrTestIdentity[] = [
  urTestSlot(
    process.env.EXPO_PUBLIC_UR_TEST_PRIVY_USER_ID,
    process.env.EXPO_PUBLIC_UR_TEST_URID,
  ),
  urTestSlot(
    process.env.EXPO_PUBLIC_UR_TEST_PRIVY_USER_ID_2,
    process.env.EXPO_PUBLIC_UR_TEST_URID_2,
  ),
].filter((x): x is UrTestIdentity => x != null);

/** Back-compat single-value exports (slot 1 = first configured QA identity). */
export const UR_TEST_PRIVY_USER_ID = UR_TEST_IDENTITIES[0]?.privyUserId ?? '';
export const UR_TEST_URID = UR_TEST_IDENTITIES[0]?.urid ?? 0;

export function isUrTestPrivyUser(userId: string | null | undefined): boolean {
  return !!userId && UR_TEST_IDENTITIES.some((i) => i.privyUserId === userId);
}

/**
 * Bank dashboard KYC gate bypass — only for a configured test Privy user
 * paired with THAT identity's test URID (each test URID stays `Tourist` on
 * testnet). Real users are never these URIDs, so they always go through KYC —
 * even in `__DEV__`. Remove together with the test-wallet import.
 */
export function isUrTestKycBypass(
  urId: number | null | undefined,
  privyUserId: string | null | undefined,
): boolean {
  if (!UR_TEST_WALLET_IMPORT_ENABLED || !privyUserId || urId == null) {
    return false;
  }
  return UR_TEST_IDENTITIES.some(
    (i) => i.privyUserId === privyUserId && i.urid === urId,
  );
}

export interface User {
  id: string;
  email?: string;
  phone?: string;
  wallet?: {
    address: string;
    chainType: string;
  };
  createdAt: Date;
}

export type OAuthProviderName = 'google' | 'apple' | 'telegram' | 'twitter';

export interface AuthContextType {
  isReady: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True while waiting for OAuth redirect to complete and user state to settle */
  isPendingOAuth: boolean;
  /** True while WalletConnect + SIWE login is in flight (survives app backgrounding). */
  isPendingWalletLogin: boolean;
  /** Provider for the in-flight OAuth session (if any). */
  pendingOAuthProvider: OAuthProviderName | null;
  /**
   * True when a prior OAuth round-trip likely failed (e.g. Android cold start).
   * Login UI should offer a retry.
   */
  needsOAuthRetry: boolean;
  clearOAuthRetryHint: () => void;
  /** Re-run the last OAuth provider after an incomplete session. */
  retryPendingOAuth: () => Promise<void>;
  user: User | null;
  walletAddress: string | null;
  /** ERC-4337 Smart Account address (Privy Smart Wallet) */
  smartWalletAddress: string | null;
  // Email auth
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;
  clearPendingEmailVerification: () => void;
  /** Link an email to the signed-in account (OTP flow, same as login). */
  sendLinkEmailCode: (email: string) => Promise<void>;
  verifyLinkEmailCode: (code: string) => Promise<string>;
  clearPendingLinkEmailVerification: () => void;
  pendingLinkEmail: string | null;
  isLinkingEmail: boolean;
  // OAuth
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  loginWithTelegram: () => Promise<void>;
  loginWithTwitter: () => Promise<void>;
  /** SIWE login via WalletConnect (detects installed wallets on device). */
  loginWithWallet: () => Promise<void>;
  /** True when the active session uses an external EOA (not Privy embedded). */
  isExternalWalletUser: boolean;
  // Wallet
  createWallet: () => Promise<string | null>;
  /** Dev-only: import UR whitelisted test wallet from backend env into this Privy user */
  importUrTestWallet?: () => Promise<string>;
  /** Expected address when UR test-wallet import is active (from backend) */
  urTestWalletAddress?: string | null;
  isUrTestWalletImportEnabled?: boolean;
  // Logout
  logout: () => Promise<void>;
  // Email state
  pendingEmail: string | null;
  // Access token for authenticated API calls
  getAccessToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
