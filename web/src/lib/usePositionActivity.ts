import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchOutcomeOpenOrders,
  fetchSpotClearinghouse,
  HIP4_CATALOG_STALE_MS,
  listOutcomes,
  positionsFromSpotBalances,
} from '@hip4';
import { useWebAuth } from './auth';

/** Live HIP-4 positions + resting limits for the signed-in Privy wallet. */
export function usePositionActivity() {
  const { authenticated, address } = useWebAuth();
  const enabled = authenticated && !!address;

  const catalog = useQuery({
    queryKey: ['hip4', 'outcomes'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    enabled,
  });

  const spot = useQuery({
    queryKey: ['hip4', 'spot', address],
    queryFn: () => fetchSpotClearinghouse(address!),
    enabled,
    staleTime: 6_000,
    refetchInterval: 12_000,
  });

  const orders = useQuery({
    queryKey: ['hip4', 'open-orders', address],
    queryFn: () => fetchOutcomeOpenOrders(address!),
    enabled,
    staleTime: 4_000,
    refetchInterval: 8_000,
  });

  const liveCount = useMemo(
    () => positionsFromSpotBalances(spot.data?.balances ?? [], catalog.data ?? []).length,
    [spot.data?.balances, catalog.data],
  );
  const orderCount = orders.data?.length ?? 0;
  const known = (spot.isFetched || !!spot.data) && (orders.isFetched || !!orders.data);
  const show = enabled && known && (liveCount > 0 || orderCount > 0);
  const badge = liveCount > 0 ? liveCount : orderCount;

  return { liveCount, orderCount, badge, show };
}
