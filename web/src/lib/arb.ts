import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { ARBITRUM_RPC, ARBITRUM_USDC } from './config';

export const USDC_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

export const arbPublic = createPublicClient({
  chain: arbitrum,
  transport: http(ARBITRUM_RPC),
});

export async function fetchArbUsdc(address: `0x${string}`): Promise<number> {
  const raw = await arbPublic.readContract({
    address: ARBITRUM_USDC,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return Number(raw) / 1e6;
}

export async function fetchUsdcNonce(address: `0x${string}`): Promise<bigint> {
  return arbPublic.readContract({
    address: ARBITRUM_USDC,
    abi: USDC_ABI,
    functionName: 'nonces',
    args: [address],
  });
}
