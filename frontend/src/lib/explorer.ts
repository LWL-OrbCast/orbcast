/**
 * Block-explorer link helpers for UR on-chain events.
 *
 * UR settles fiat rails on Mantle (FX / card / cash-out) and bridges from
 * Arbitrum (Add Money), across both testnet and mainnet. We map the numeric
 * chainId to the right explorer and only return a URL when the chain is known,
 * so we never produce a wrong-network link for a hash we can't place.
 */
const TX_EXPLORERS: Record<number, string> = {
  42161: 'https://arbiscan.io/tx/',
  421614: 'https://sepolia.arbiscan.io/tx/',
  5000: 'https://mantlescan.xyz/tx/',
  5003: 'https://sepolia.mantlescan.xyz/tx/',
};

/** Mirrors backend `_LZ_TESTNET_CHAIN_IDS` for LayerZeroScan UI links. */
const LZ_TESTNET_CHAIN_IDS = new Set([
  421614, 11155111, 5003, 80002, 84532, 11155420,
]);

/** LayerZeroScan tx page for a bridged Add Money source tx. */
export function layerZeroScanUrl(
  txHash?: string | null,
  chainId?: number | string | null,
): string | null {
  const h = (txHash || '').trim().toLowerCase();
  if (!h.startsWith('0x') || h.length !== 66) return null;
  const id = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId ?? undefined;
  const isTestnet = id != null && LZ_TESTNET_CHAIN_IDS.has(id);
  const base = isTestnet
    ? 'https://testnet.layerzeroscan.com'
    : 'https://layerzeroscan.com';
  return `${base}/tx/${h}`;
}

/**
 * LayerZeroScan *address* page — lists every cross-chain message for an EOA.
 * Used when several Add Money deposits are in-flight at once so the single
 * "incoming" pill can link to all of them at a glance (per-tx pages only
 * show one hop).
 */
export function layerZeroScanAddressUrl(
  address?: string | null,
  chainId?: number | string | null,
): string | null {
  const a = (address || '').trim().toLowerCase();
  if (!a.startsWith('0x') || a.length !== 42) return null;
  const id = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId ?? undefined;
  const isTestnet = id != null && LZ_TESTNET_CHAIN_IDS.has(id);
  const base = isTestnet
    ? 'https://testnet.layerzeroscan.com'
    : 'https://layerzeroscan.com';
  return `${base}/address/${a}`;
}

/** Explorer tx URL for a hash on a given chain, or null if not linkable. */
export function txExplorerUrl(
  txHash?: string | null,
  chainId?: number | string | null,
): string | null {
  if (!txHash) return null;
  const id = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId ?? undefined;
  if (!id || !TX_EXPLORERS[id]) return null;
  return `${TX_EXPLORERS[id]}${txHash}`;
}

/** "0x1234…abcd" — compact hash for inline display. */
export function shortHash(hash?: string | null, lead = 6, tail = 4): string {
  if (!hash) return '';
  if (hash.length <= lead + tail + 1) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}
