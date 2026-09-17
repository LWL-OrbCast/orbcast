import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  overlayListedVolumes,
  subscribeOutcomeVolumes,
  type ListedMarket,
} from './hip4';

/**
 * Patches every `['hip4', 'outcomes', …]` catalog query when tape volume
 * arrives so first paint does not wait on recentTrades.
 */
export function OutcomeVolumeSync() {
  const qc = useQueryClient();
  useLayoutEffect(() => {
    return subscribeOutcomeVolumes((byCoin) => {
      qc.setQueriesData<ListedMarket[]>(
        { queryKey: ['hip4', 'outcomes'] },
        (cur) =>
          Array.isArray(cur) && cur.length ? overlayListedVolumes(cur, byCoin) : cur,
      );
    });
  }, [qc]);
  return null;
}
