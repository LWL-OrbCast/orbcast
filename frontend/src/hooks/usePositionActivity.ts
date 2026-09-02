import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import {
  fetchOutcomeOpenOrders,
  fetchSpotClearinghouse,
  HIP4_CATALOG_STALE_MS,
  listOutcomes,
  positionsFromSpotBalances,
  type Hex,
} from '../lib/hip4';
import { useAppStore } from '../store/appStore';

/** Live HIP-4 positions + resting limits for the signed-in wallet. */
export function usePositionActivity() {
  const focused = useIsFocused();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const address = useAppStore((s) => (s.user?.wallet?.address ?? null) as Hex | null);
  const enabled = isAuthenticated && !!address;

  const catalog = useQuery({
    queryKey: ['hip4', 'outcomes', 'all'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    enabled,
  });

  const spot = useQuery({
    queryKey: ['hip4', 'spot', address],
    queryFn: () => fetchSpotClearinghouse(address as Hex),
    enabled,
    staleTime: 6_000,
    refetchInterval: focused ? 12_000 : false,
  });

  const orders = useQuery({
    queryKey: ['hip4', 'open-orders', address],
    queryFn: () => fetchOutcomeOpenOrders(address as Hex),
    enabled,
    staleTime: 4_000,
    refetchInterval: focused ? 8_000 : false,
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
