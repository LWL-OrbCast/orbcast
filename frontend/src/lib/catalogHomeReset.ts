type ResetFn = () => void;

const listeners = new Set<ResetFn>();

/** Home keeps its own chip; logo taps notify it so All is selected even if Home stayed mounted. */
export function registerHomeCatalogReset(fn: ResetFn): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function resetHomeCatalogToAll(): void {
  for (const fn of listeners) fn();
}
