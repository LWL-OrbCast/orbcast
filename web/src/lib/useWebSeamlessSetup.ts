import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebAuth } from './auth';
import { inspectWebSetup, runWebTradingSetup } from './webKernel';

const MAX_ATTEMPTS = 3;
const RETRY_MS = 8_000;

/** Silent first-run setup for Privy embedded wallets — same idea as the Expo hook.
 * Not mounted: web Privy shows a confirm per signature, so this must not run on load.
 */
export function useWebSeamlessSetup() {
  const { authenticated, address, getProvider, signingReady } = useWebAuth();
  const qc = useQueryClient();
  const triedFor = useRef<string | null>(null);

  const setupQ = useQuery({
    queryKey: ['hip4', 'setup', address],
    queryFn: () => inspectWebSetup(address!),
    enabled: !!address && authenticated,
  });

  useEffect(() => {
    if (!authenticated || !address || !signingReady) return;
    if (setupQ.isPending) return;
    if (setupQ.data?.allComplete) {
      triedFor.current = address;
      return;
    }
    if (triedFor.current === address) return;
    triedFor.current = address;

    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < MAX_ATTEMPTS && !cancelled; i++) {
        try {
          const provider = await getProvider();
          if (!provider) throw new Error('Wallet not ready');
          const ok = await runWebTradingSetup(provider, address, { silent: true });
          await qc.invalidateQueries({ queryKey: ['hip4', 'setup'] });
          if (ok) return;
        } catch {
          /* quiet retry — wallet page keeps a manual fallback */
        }
        if (i < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_MS));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    authenticated,
    address,
    signingReady,
    setupQ.isPending,
    setupQ.data?.allComplete,
    getProvider,
    qc,
  ]);
}

export function WebSeamlessSetup() {
  useWebSeamlessSetup();
  return null;
}
