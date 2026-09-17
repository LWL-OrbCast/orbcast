import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  overlayListedVolumes,
  subscribeOutcomeVolumes,
  type ListedMarket,
} from '@hip4';

/**
 * Patches `['hip4', 'outcomes']` when tape volume arrives so first paint
 * does not wait on recentTrades. Lives in web/ so Vercel tsc can resolve
 * react-query (frontend/src/lib is shared without web node_modules).
 */
export function OutcomeVolumeSync() {
  const qc = useQueryClient();
  useLayoutEffect(() => {
    return subscribeOutcomeVolumes((byCoin) => {
      qc.setQueriesData<ListedMarket[]>(
        { queryKey: ['hip4', 'outcomes'] },
        (cur: ListedMarket[] | undefined) =>
          Array.isArray(cur) && cur.length ? overlayListedVolumes(cur, byCoin) : cur,
      );
    });
  }, [qc]);
  return null;
}
