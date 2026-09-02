/**
 * Unified active EVM wallet for Hyperliquid trading + Bridge2 flows.
 *
 * - Email/social users → Privy embedded EOA via `useEmbeddedEthereumWallet` (unchanged).
 * - External wallet users → linked account + WalletConnect session for signing.
 *
 * @see https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet
 */
import { useCallback, useMemo } from 'react';
import { useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';
import {
  resolvePrimaryEthereumWallet,
  type PrimaryWalletKind,
} from '../lib/walletAccounts';
import {
  getExternalWalletConnectAddress,
  getExternalWalletProvider,
  isExternalWalletConnected,
} from '../lib/externalWalletConnect';
import type { Eip1193Provider } from '../lib/hyperliquid';

export interface ActiveEthereumWallet {
  address: string;
  kind: PrimaryWalletKind;
  isEmbedded: boolean;
  isExternal: boolean;
  getProvider: () => Promise<Eip1193Provider>;
}

export interface UseActiveEthereumWalletResult {
  wallet: ActiveEthereumWallet | undefined;
  address: string | null;
  kind: PrimaryWalletKind | null;
  isEmbedded: boolean;
  isExternal: boolean;
  /** False while Privy hydrates embedded wallet state. */
  isReady: boolean;
}

export function useActiveEthereumWallet(): UseActiveEthereumWalletResult {
  const { user, isReady: privyReady } = usePrivy();
  const { wallets: embeddedWallets } = useEmbeddedEthereumWallet();

  const embeddedAddress = embeddedWallets?.[0]?.address ?? null;
  const embeddedWallet = embeddedWallets?.[0];

  const primary = useMemo(
    () =>
      resolvePrimaryEthereumWallet({
        embeddedAddress,
        linkedAccounts: user?.linked_accounts,
      }),
    [embeddedAddress, user?.linked_accounts],
  );

  const getProvider = useCallback(async (): Promise<Eip1193Provider> => {
    if (!primary) {
      throw new Error('No active Ethereum wallet');
    }
    if (primary.kind === 'embedded') {
      if (!embeddedWallet) throw new Error('Embedded wallet not ready');
      return (await embeddedWallet.getProvider()) as unknown as Eip1193Provider;
    }
    const wc = await getExternalWalletProvider();
    if (wc) return wc;
    throw new Error(
      'External wallet session expired. Sign out and connect your wallet again.',
    );
  }, [primary, embeddedWallet]);

  const wallet = useMemo((): ActiveEthereumWallet | undefined => {
    if (!primary) return undefined;
    return {
      address: primary.address,
      kind: primary.kind,
      isEmbedded: primary.kind === 'embedded',
      isExternal: primary.kind === 'external',
      getProvider,
    };
  }, [primary, getProvider]);

  const embeddedReady =
    !primary || primary.kind !== 'embedded' || !!embeddedWallet;

  const externalReady =
    !primary || primary.kind !== 'external'
    || isExternalWalletConnected()
    || getExternalWalletConnectAddress()?.toLowerCase() === primary.address.toLowerCase();

  const isReady = privyReady && embeddedReady && externalReady;

  return {
    wallet,
    address: primary?.address ?? null,
    kind: primary?.kind ?? null,
    isEmbedded: primary?.kind === 'embedded',
    isExternal: primary?.kind === 'external',
    isReady,
  };
}
