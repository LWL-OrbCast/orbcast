import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PrivyProvider,
  useCreateWallet,
  useLogin,
  useLoginWithOAuth,
  usePrivy,
  useSignTypedData,
  useWallets,
  type SignTypedDataParams,
} from '@privy-io/react-auth';
import { arbitrum } from 'viem/chains';
import { ARBITRUM_CHAIN_ID, PRIVY_APP_ID } from './config';
import {
  clearWebAgent,
  registerWebAgentOwner,
  registerWebChainSwitch,
  registerWebPrivySignTypedData,
  type Eip1193Provider,
} from './webKernel';

function privyEmail(user: ReturnType<typeof usePrivy>['user']): string | null {
  if (!user) return null;
  const linked = user.email?.address?.trim();
  if (linked) return linked;
  const google = user.google?.email?.trim();
  if (google) return google;
  for (const account of user.linkedAccounts ?? []) {
    if (!account || typeof account !== 'object') continue;
    const row = account as { type?: string; address?: string; email?: string };
    if (row.type === 'email' && row.address?.includes('@')) return row.address.trim();
    if (typeof row.email === 'string' && row.email.includes('@')) return row.email.trim();
  }
  return null;
}

export type WebAuth = {
  ready: boolean;
  /** True until Privy finishes restore, or while a session exists but the wallet address is not in yet. */
  hydrating: boolean;
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  address: `0x${string}` | null;
  login: () => void;
  loginWithGoogle: () => Promise<void>;
  googleBusy: boolean;
  loginError: string | null;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getProvider: () => Promise<Eip1193Provider | null>;
  switchChain: (chainId?: number) => Promise<void>;
  signingReady: boolean;
  isEmbedded: boolean;
  privyConfigured: boolean;
};

const SESSION_KEY = 'orbcast-authed';
const LOGIN_NEXT_KEY = 'orbcast-login-next';

/** Privy OAuth redirect allowlist is exact — always return to `/login`. */
export function oauthReturnUrl(): string {
  if (typeof window === 'undefined') return '/login';
  return `${window.location.origin}/login`;
}

function stashLoginReturn(): void {
  if (typeof window === 'undefined') return;
  const path = `${window.location.pathname}${window.location.search}`;
  if (!path || path.startsWith('/login')) return;
  try {
    sessionStorage.setItem(LOGIN_NEXT_KEY, path);
  } catch {
    /* private mode */
  }
}

/** Safe in-app path to open after OAuth lands on `/login`. */
export function takeLoginReturn(): string {
  try {
    const raw = sessionStorage.getItem(LOGIN_NEXT_KEY);
    sessionStorage.removeItem(LOGIN_NEXT_KEY);
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  } catch {
    /* private mode */
  }
  return '/';
}

const GUEST: WebAuth = {
  ready: true,
  hydrating: false,
  authenticated: false,
  userId: null,
  email: null,
  address: null,
  login: () => undefined,
  loginWithGoogle: async () => undefined,
  googleBusy: false,
  loginError: null,
  logout: async () => undefined,
  getAccessToken: async () => null,
  getProvider: async () => null,
  switchChain: async () => undefined,
  signingReady: false,
  isEmbedded: false,
  privyConfigured: false,
};

const AuthContext = createContext<WebAuth>(GUEST);

export function useWebAuth(): WebAuth {
  return useContext(AuthContext);
}

function pickWallet(wallets: ReturnType<typeof useWallets>['wallets']) {
  return wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0] ?? null;
}

/** True if this Privy user already has (or just got) an embedded EOA. */
function hasEmbeddedWallet(
  user: ReturnType<typeof usePrivy>['user'],
  wallets: ReturnType<typeof useWallets>['wallets'],
): boolean {
  if (wallets.some((w) => w.walletClientType === 'privy')) return true;
  for (const account of user?.linkedAccounts ?? []) {
    if (!account || typeof account !== 'object') continue;
    const row = account as { type?: string; walletClientType?: string; connectorType?: string };
    if (row.type !== 'wallet') continue;
    if (row.walletClientType === 'privy' || row.connectorType === 'embedded') return true;
  }
  return false;
}

function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const walletsState = useWallets();
  const { signTypedData } = useSignTypedData();
  const [loginError, setLoginError] = useState<string | null>(null);
  const { login: openLoginModal } = useLogin({
    onError: (error) => setLoginError(String(error)),
  });
  const { initOAuth, loading: googleBusy } = useLoginWithOAuth({
    onError: (error) => setLoginError(String(error)),
  });
  const { createWallet } = useCreateWallet();
  const walletCreateStarted = useRef(false);
  const wallet = privy.ready ? pickWallet(walletsState.wallets) : null;
  const address = (wallet?.address as `0x${string}` | undefined) ?? null;
  const isEmbedded = wallet?.walletClientType === 'privy';
  const [signingReady, setSigningReady] = useState(false);
  const [hadSession, setHadSession] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!privy.ready) return;
    try {
      if (privy.authenticated) {
        sessionStorage.setItem(SESSION_KEY, '1');
        setHadSession(true);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        setHadSession(false);
        walletCreateStarted.current = false;
      }
    } catch {
      /* private mode */
    }
  }, [privy.ready, privy.authenticated]);

  // Google uses `initOAuth` (whitelabel). Privy only auto-creates wallets on
  // the modal login path, so we provision the embedded EOA here.
  useEffect(() => {
    if (!privy.ready || !privy.authenticated) return;
    if (hasEmbeddedWallet(privy.user, walletsState.wallets)) return;
    if (walletCreateStarted.current) return;
    walletCreateStarted.current = true;
    void createWallet().catch((err) => {
      const msg = String(err ?? '');
      if (/already has an? embedded wallet/i.test(msg)) return;
      walletCreateStarted.current = false;
      console.warn('[orbcast] embedded wallet create', err);
    });
  }, [privy.ready, privy.authenticated, privy.user, walletsState.wallets, createWallet]);

  // Scope the IndexedDB agent key to the logged-in master wallet.
  useLayoutEffect(() => {
    registerWebAgentOwner(address);
    return () => registerWebAgentOwner(null);
  }, [address]);

  useLayoutEffect(() => {
    registerWebPrivySignTypedData(async (data) => {
      const { signature } = await signTypedData(data as SignTypedDataParams, {
        address: address ?? undefined,
      });
      return signature as `0x${string}`;
    });
    registerWebChainSwitch(async (chainId) => {
      if (!wallet) throw new Error('Wallet not ready');
      await wallet.switchChain(chainId);
    });
    setSigningReady(!!wallet);
    return () => {
      registerWebPrivySignTypedData(null);
      registerWebChainSwitch(null);
      setSigningReady(false);
    };
  }, [signTypedData, address, wallet]);

  const hydrating =
    !privy.ready || (!address && (privy.authenticated || hadSession));

  const value = useMemo<WebAuth>(
    () => ({
      ready: privy.ready,
      hydrating,
      authenticated: privy.authenticated,
      userId: privy.user?.id ?? null,
      email: privyEmail(privy.user),
      address,
      login: () => {
        setLoginError(null);
        stashLoginReturn();
        openLoginModal();
      },
      loginWithGoogle: async () => {
        setLoginError(null);
        stashLoginReturn();
        await initOAuth({ provider: 'google' });
      },
      googleBusy,
      loginError,
      logout: async () => {
        // Capture before Privy clears the session; wipe the trade-capable
        // agent key so a shared browser does not keep it after logout.
        const owner = address;
        await privy.logout();
        if (owner) {
          await clearWebAgent(owner).catch(() => undefined);
        }
      },
      getAccessToken: () => privy.getAccessToken(),
      getProvider: async () => {
        if (!wallet) return null;
        const provider = await wallet.getEthereumProvider();
        return provider as Eip1193Provider;
      },
      switchChain: async (chainId = ARBITRUM_CHAIN_ID) => {
        if (!wallet) throw new Error('Wallet not ready');
        await wallet.switchChain(chainId);
      },
      signingReady,
      isEmbedded,
      privyConfigured: true,
    }),
    [address, privy, wallet, signingReady, isEmbedded, hydrating, openLoginModal, initOAuth, googleBusy, loginError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function WebAuthRoot({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <AuthContext.Provider value={GUEST}>{children}</AuthContext.Provider>;
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: { theme: 'light', accentColor: '#22c55e' },
        customOAuthRedirectUrl: oauthReturnUrl(),
        defaultChain: arbitrum,
        supportedChains: [arbitrum],
        embeddedWallets: {
          ethereum: {
            // Modal email login still auto-creates. Headless Google does not —
            // PrivyAuthBridge calls createWallet() after OAuth.
            createOnLogin: 'users-without-wallets',
          },
          solana: { createOnLogin: 'off' },
          showWalletUIs: false,
        },
      }}
    >
      <PrivyAuthBridge>{children}</PrivyAuthBridge>
    </PrivyProvider>
  );
}
