import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SportChipId } from '@hip4/catalog';

export type CatalogUi = {
  sport: SportChipId;
  setSport: (id: SportChipId) => void;
  search: string;
  setSearch: (q: string) => void;
};

const CatalogUiContext = createContext<CatalogUi | null>(null);

export function CatalogUiProvider({ children }: { children: ReactNode }) {
  const [sport, setSport] = useState<SportChipId>('all');
  const [search, setSearch] = useState('');
  const value = useMemo(() => ({ sport, setSport, search, setSearch }), [sport, search]);
  return <CatalogUiContext.Provider value={value}>{children}</CatalogUiContext.Provider>;
}

export function useCatalogUi(): CatalogUi {
  const ctx = useContext(CatalogUiContext);
  if (!ctx) throw new Error('CatalogUiProvider missing');
  return ctx;
}
