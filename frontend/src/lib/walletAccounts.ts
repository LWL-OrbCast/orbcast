import type { LinkedAccount } from '@privy-io/api-types';

/** Privy linked-account shape for an external (non-embedded) EVM wallet. */
export type ExternalEthereumLinkedAccount = LinkedAccount & {
  type: 'wallet';
  chain_type: 'ethereum';
  address: string;
  connector_type?: string;
  wallet_client_type?: string;
};

export type PrimaryWalletKind = 'embedded' | 'external';

export interface PrimaryEthereumWallet {
  kind: PrimaryWalletKind;
  address: string;
}

function isEthereumWalletAccount(
  account: LinkedAccount,
): account is LinkedAccount & { type: 'wallet'; chain_type: 'ethereum'; address: string } {
  return (
    account.type === 'wallet'
    && (account as { chain_type?: string }).chain_type === 'ethereum'
    && typeof (account as { address?: string }).address === 'string'
    && (account as { address: string }).address.startsWith('0x')
  );
}

/** True when the linked account is a Privy embedded EOA (`connector_type: embedded`). */
export function isEmbeddedEthereumLinkedAccount(
  account: LinkedAccount,
): account is LinkedAccount & { type: 'wallet'; chain_type: 'ethereum'; address: string } {
  if (!isEthereumWalletAccount(account)) return false;
  return (account as { connector_type?: string }).connector_type === 'embedded';
}

/** True when the linked account is an external EOA brought via SIWE / WalletConnect. */
export function isExternalEthereumLinkedAccount(
  account: LinkedAccount,
): account is ExternalEthereumLinkedAccount {
  if (!isEthereumWalletAccount(account)) return false;
  return (account as { connector_type?: string }).connector_type !== 'embedded';
}

export function findEmbeddedEthereumLinkedAccount(
  linkedAccounts: LinkedAccount[] | undefined,
): (LinkedAccount & { type: 'wallet'; chain_type: 'ethereum'; address: string }) | null {
  if (!linkedAccounts?.length) return null;
  return linkedAccounts.find(isEmbeddedEthereumLinkedAccount) ?? null;
}

export function findExternalEthereumLinkedAccount(
  linkedAccounts: LinkedAccount[] | undefined,
): ExternalEthereumLinkedAccount | null {
  if (!linkedAccounts?.length) return null;
  return linkedAccounts.find(isExternalEthereumLinkedAccount) ?? null;
}

/**
 * Whether this Privy user authenticated with an external wallet only (no embedded EOA).
 * Used to skip auto-creating an embedded wallet on login — see Privy dashboard:
 * "Create embedded wallets for all users…" should stay OFF for wallet logins.
 */
export function userHasExternalWalletOnlyLogin(
  linkedAccounts: LinkedAccount[] | undefined,
): boolean {
  if (!linkedAccounts?.length) return false;
  const hasEmbedded = linkedAccounts.some(isEmbeddedEthereumLinkedAccount);
  if (hasEmbedded) return false;
  return linkedAccounts.some(isExternalEthereumLinkedAccount);
}

/**
 * Resolve the trading wallet for the session.
 *
 * Email/social users: embedded EOA from `useEmbeddedEthereumWallet` (unchanged).
 * Wallet-login users: external linked account when no embedded wallet exists.
 */
export function resolvePrimaryEthereumWallet(args: {
  embeddedAddress: string | null | undefined;
  linkedAccounts: LinkedAccount[] | undefined;
}): PrimaryEthereumWallet | null {
  const embedded = args.embeddedAddress?.trim();
  if (embedded && embedded.startsWith('0x')) {
    return { kind: 'embedded', address: embedded };
  }
  const external = findExternalEthereumLinkedAccount(args.linkedAccounts);
  if (external?.address) {
    return { kind: 'external', address: external.address };
  }
  return null;
}
