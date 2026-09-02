import { getAddress, type Hex } from 'viem';
import { WALLET_TRANSFER_INTENT_NAME } from './brand';

/** Must stay in sync with backend `WALLET_TRANSFER_INTENT_*` constants. */
export const WALLET_TRANSFER_INTENT_DOMAIN = {
  name: WALLET_TRANSFER_INTENT_NAME,
  version: '1',
  verifyingContract: '0x0000000000000000000000000000000000000000' as const,
} as const;

export const WALLET_TRANSFER_INTENT_CHAIN_ID = 42161 as const;

/**
 * EIP-712 typed data for binding (owner, destination, amount, deadline, relayer).
 * Signed via eth_signTypedData_v4 before the USDC permit so a MITM cannot
 * redirect transferFrom to another address.
 */
export function buildWalletTransferIntentTypedData(params: {
  owner: Hex | string;
  destination: Hex | string;
  /** USDC base units (6 decimals), decimal string */
  amount: string;
  deadline: number;
  relayer: Hex | string;
  chainId?: number;
}) {
  const chainId = params.chainId ?? WALLET_TRANSFER_INTENT_CHAIN_ID;
  const owner = getAddress(params.owner);
  const destination = getAddress(params.destination);
  const relayer = getAddress(params.relayer);

  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferIntent: [
        { name: 'owner', type: 'address' },
        { name: 'destination', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'relayer', type: 'address' },
      ],
    },
    primaryType: 'TransferIntent' as const,
    domain: {
      name: WALLET_TRANSFER_INTENT_DOMAIN.name,
      version: WALLET_TRANSFER_INTENT_DOMAIN.version,
      chainId,
      verifyingContract: WALLET_TRANSFER_INTENT_DOMAIN.verifyingContract,
    },
    message: {
      owner,
      destination,
      amount: params.amount,
      deadline: String(params.deadline),
      relayer,
    },
  };
}
