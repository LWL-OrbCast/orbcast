import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  overlayListedVolumes,
  subscribeOutcomeVolumes,
  type ListedMarket,
} from '../lib/hip4';

/**
 * Patches `['hip4', 'outcomes']` (including `…, 'all'`) when tape volume
 * arrives so first paint does not wait on recentTrades.
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
