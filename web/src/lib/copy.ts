import { useSyncExternalStore } from 'react';
import i18n, { currentBundle, type LocaleBundle } from './i18n';

export type { LocaleBundle };

function subscribe(onStoreChange: () => void) {
  i18n.on('languageChanged', onStoreChange);
  return () => {
    i18n.off('languageChanged', onStoreChange);
  };
}

/** Current locale JSON. Re-renders when the language switcher changes. */
export function useCopy(): LocaleBundle {
  return useSyncExternalStore(subscribe, currentBundle, currentBundle);
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** Walk locale JSON with dotted keys (`hip4.rules.multi`) for shared HIP-4 helpers. */
export function tHip4(key: string, vars?: Record<string, unknown>): string {
  const v = i18n.t(key, vars);
  return typeof v === 'string' ? v : key;
}
