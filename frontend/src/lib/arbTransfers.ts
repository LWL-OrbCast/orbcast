/**
 * Arbitrum USDC Transfer History
 * Fetches ERC20 Transfer events for USDC on Arbitrum using eth_getLogs
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

type Hex = `0x${string}`;

const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
// ERC20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Pending transactions storage key
const PENDING_TX_KEY = 'pending_usdc_transfers_v1';

export type PendingTransaction = {
  hash: string;
  type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out';
  amount: string; // USD amount as string
  timestamp: number; // When initiated
  from?: string;
  to?: string;
  description?: string;
};

export type ArbitrumTransfer = {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  amount: string; // Formatted USDC amount
  type: 'in' | 'out';
};

/**
 * Get Arbitrum RPC URL from environment
 */
function getArbitrumRpcUrl(): string {
  // Check for environment variables (Expo public or regular)
  const rpcUrl = process.env.EXPO_PUBLIC_ARBITRUM_RPC_URL || 
                 process.env.ARBITRUM_RPC_URL ||
                 'https://arb1.arbitrum.io/rpc'; // Public fallback
  return rpcUrl;
}

/**
 * Fetch USDC transfers for an address from Arbitrum
 * Uses eth_getLogs to query Transfer events
 */
export async function fetchArbitrumUsdcTransfers(
  userAddress: Hex,
  fromBlock: string = '0x0', // Can be 'latest' minus some blocks
  toBlock: string = 'latest'
): Promise<ArbitrumTransfer[]> {
  const rpcUrl = getArbitrumRpcUrl();
  const userAddressPadded = '0x' + userAddress.slice(2).toLowerCase().padStart(64, '0');

  // Calculate a reasonable fromBlock (last ~7 days on Arbitrum, ~2M blocks)
  // For simplicity, we'll fetch recent blocks. In production, use a proper indexer.
  let actualFromBlock = fromBlock;
  if (fromBlock === '0x0') {
    try {
      const latestBlockRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
      });
      const latestData = await latestBlockRes.json();
      const latestBlock = parseInt(latestData.result, 16);
      // Go back ~7 days (Arbitrum ~250ms blocks = ~2.4M blocks/week, but we limit for performance)
      const lookbackBlocks = 500000; // ~1.5 days
      actualFromBlock = '0x' + Math.max(0, latestBlock - lookbackBlocks).toString(16);
    } catch (e) {
      console.error('Failed to get latest block:', e);
      actualFromBlock = 'latest';
    }
  }

  const transfers: ArbitrumTransfer[] = [];

  try {
    // Fetch incoming transfers (to = userAddress)
    const incomingRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getLogs',
        params: [{
          address: ARBITRUM_USDC,
          topics: [TRANSFER_EVENT_TOPIC, null, userAddressPadded],
          fromBlock: actualFromBlock,
          toBlock,
        }],
      }),
    });
    const incomingData = await incomingRes.json();
    
    if (incomingData.result && Array.isArray(incomingData.result)) {
      for (const log of incomingData.result) {
        try {
          const from = ('0x' + log.topics[1].slice(26)).toLowerCase();
          const to = ('0x' + log.topics[2].slice(26)).toLowerCase();
          // Handle empty or invalid data gracefully
          const dataStr = log.data || '0x0';
          const amountRaw = BigInt(dataStr);
          const amountNum = Number(amountRaw) / 1e6;
          // Skip 0-value transfers
          if (amountNum <= 0) continue;
          const amount = amountNum.toFixed(2);
          
          transfers.push({
            hash: log.transactionHash,
            blockNumber: parseInt(log.blockNumber, 16),
            timestamp: 0, // Will be populated later if needed
            from,
            to,
            amount,
            type: 'in',
          });
        } catch (e) {
          // Skip malformed log entries
          continue;
        }
      }
    }

    // Fetch outgoing transfers (from = userAddress)
    const outgoingRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getLogs',
        params: [{
          address: ARBITRUM_USDC,
          topics: [TRANSFER_EVENT_TOPIC, userAddressPadded, null],
          fromBlock: actualFromBlock,
          toBlock,
        }],
      }),
    });
    const outgoingData = await outgoingRes.json();
    
    if (outgoingData.result && Array.isArray(outgoingData.result)) {
      for (const log of outgoingData.result) {
        try {
          const from = ('0x' + log.topics[1].slice(26)).toLowerCase();
          const to = ('0x' + log.topics[2].slice(26)).toLowerCase();
          // Handle empty or invalid data gracefully
          const dataStr = log.data || '0x0';
          const amountRaw = BigInt(dataStr);
          const amountNum = Number(amountRaw) / 1e6;
          // Skip 0-value transfers
          if (amountNum <= 0) continue;
          const amount = amountNum.toFixed(2);
          
          transfers.push({
            hash: log.transactionHash,
            blockNumber: parseInt(log.blockNumber, 16),
            timestamp: 0,
            from,
            to,
            amount,
            type: 'out',
          });
        } catch (e) {
          // Skip malformed log entries
          continue;
        }
      }
    }

    // Fetch block timestamps for each unique block
    const uniqueBlocks = [...new Set(transfers.map(t => t.blockNumber))];
    const blockTimestamps: Record<number, number> = {};
    
    // Batch fetch block timestamps (limit to avoid rate limiting)
    const blocksToFetch = uniqueBlocks.slice(0, 50);
    await Promise.all(blocksToFetch.map(async (blockNum) => {
      try {
        const blockRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: blockNum,
            method: 'eth_getBlockByNumber',
            params: ['0x' + blockNum.toString(16), false],
          }),
        });
        const blockData = await blockRes.json();
        if (blockData.result?.timestamp) {
          blockTimestamps[blockNum] = parseInt(blockData.result.timestamp, 16) * 1000;
        }
      } catch (e) {
        // Ignore individual block fetch errors
      }
    }));

    // Apply timestamps
    for (const transfer of transfers) {
      transfer.timestamp = blockTimestamps[transfer.blockNumber] || Date.now();
    }

    // Sort by block number descending (most recent first)
    transfers.sort((a, b) => b.blockNumber - a.blockNumber);

    return transfers;
  } catch (e) {
    console.error('Error fetching Arbitrum USDC transfers:', e);
    return [];
  }
}

/**
 * Save a pending transaction to local storage
 */
export async function savePendingTransaction(tx: PendingTransaction): Promise<void> {
  try {
    const existing = await getPendingTransactions();
    // Add new transaction, avoiding duplicates
    const filtered = existing.filter(t => t.hash !== tx.hash);
    filtered.unshift(tx);
    // Keep only last 50 pending transactions
    const toSave = filtered.slice(0, 50);
    await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('Error saving pending transaction:', e);
  }
}

/**
 * Get all pending transactions from local storage
 */
export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  try {
    const data = await AsyncStorage.getItem(PENDING_TX_KEY);
    if (!data) return [];
    return JSON.parse(data) as PendingTransaction[];
  } catch (e) {
    console.error('Error getting pending transactions:', e);
    return [];
  }
}

/**
 * Remove a pending transaction (after it's confirmed)
 */
export async function removePendingTransaction(hash: string): Promise<void> {
  try {
    const existing = await getPendingTransactions();
    const filtered = existing.filter(t => t.hash.toLowerCase() !== hash.toLowerCase());
    await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Error removing pending transaction:', e);
  }
}

/**
 * Clear old pending transactions (older than 1 hour)
 */
export async function cleanupOldPendingTransactions(): Promise<void> {
  try {
    const existing = await getPendingTransactions();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const filtered = existing.filter(t => t.timestamp > oneHourAgo);
    await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Error cleaning up pending transactions:', e);
  }
}

/**
 * Check if a transaction hash exists in the confirmed transfers
 */
export function isTransactionConfirmed(hash: string, confirmedHashes: string[]): boolean {
  const normalizedHash = hash.toLowerCase();
  return confirmedHashes.some(h => h.toLowerCase() === normalizedHash);
}
