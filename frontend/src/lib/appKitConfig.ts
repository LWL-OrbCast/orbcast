/**
 * Reown AppKit (React Native) for external EVM wallet connect + SIWE login.
 *
 * @see https://docs.reown.com/appkit/react-native/core/installation
 */
import '@walletconnect/react-native-compat';
import Constants from 'expo-constants';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import { arbitrum, mainnet } from 'viem/chains';
import { appKitStorage } from './appKitStorage';
import { BRAND_NAME, BRAND_SITE_URL } from './brand';
import { SIWE_URI } from './siweConfig';

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

export function getWalletConnectProjectId(): string {
  const id = (
    process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    expoExtra?.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID
  )?.trim();
  if (!id) {
    throw new Error(
      'EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. Add it to app.json extra or .env.',
    );
  }
  return id;
}

const ethersAdapter = new EthersAdapter();

export type AppKitClient = ReturnType<typeof createAppKit>;

export const appKit: AppKitClient = createAppKit({
  projectId: getWalletConnectProjectId(),
  adapters: [ethersAdapter],
  networks: [arbitrum, mainnet],
  defaultNetwork: arbitrum,
  storage: appKitStorage,
  metadata: {
    name: BRAND_NAME,
    description: 'Sports predictions on Hyperliquid',
    // MUST match the SIWE `domain` (siweConfig.ts) EXACTLY, including subdomain.
    url: SIWE_URI,
    icons: [`${BRAND_SITE_URL}/favicon.ico`],
    redirect: {
      // Must match app.json expo.scheme.
      native: 'hip4sports://wc',
    },
  },
  // Wallet-only connect UI — email/social login stays on Privy.
  features: {
    onramp: false,
    swaps: false,
    socials: false,
    showWallets: true,
  },
  themeMode: 'dark',
  debug: __DEV__,
});

export function getAppKit(): AppKitClient {
  return appKit;
}
