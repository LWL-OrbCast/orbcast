import { useEffect } from 'react';
import { fetchBuilderConfig } from './api';
import { BUILDER_FEE_TENTHS } from './config';
import { setWebBuilderFeeTenths } from './webKernel';
import { useWebAuth } from './auth';

/** Trust API for a lower (rewards) fee only. Never take builder address from API. */
export function BuilderFeeSync() {
  const { address } = useWebAuth();
  useEffect(() => {
    let cancelled = false;
    void fetchBuilderConfig(address ?? undefined)
      .then((cfg) => {
        if (cancelled) return;
        const raw = cfg?.fee;
        const fee =
          typeof raw === 'number' && Number.isFinite(raw)
            ? Math.min(Math.max(0, Math.floor(raw)), BUILDER_FEE_TENTHS)
            : BUILDER_FEE_TENTHS;
        setWebBuilderFeeTenths(fee);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [address]);
  return null;
}

export function tenthsToRate(tenths: number): number {
  return tenths * 0.00001;
}

export function formatBuilderPercent(tenths: number, freeLabel: string, digits = 3): string {
  const rate = tenthsToRate(tenths);
  if (!Number.isFinite(rate) || rate <= 0) return freeLabel;
  return `${(rate * 100).toFixed(digits)}%`;
}
