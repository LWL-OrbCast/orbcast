import { useEffect, useRef, useState } from 'react';
import type { ListedMarket } from '@hip4';
import { CATALOG_CHIPS, catalogChipForMarket, type SportChipId } from '@hip4/catalog';
import { useCopy } from '../lib/copy';
import { useCatalogUi } from './catalogUi';
import { SportIcon } from './icons';

export const SPORT_CHIPS = CATALOG_CHIPS;

export function sportIdForListed(m: ListedMarket): SportChipId {
  return catalogChipForMarket(m);
}

export function SportCategoryBar() {
  const { hip4 } = useCopy();
  const { sport, setSport } = useCatalogUi();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showEndFade, setShowEndFade] = useState(false);

  const syncFade = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setShowEndFade(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncFade();
    const ro = new ResizeObserver(syncFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="border-b border-[var(--border)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-2.5 sm:px-6">
        <div className="relative overflow-hidden rounded-[18px] border-[1.5px] border-[var(--border)] bg-white">
          <div
            ref={scrollerRef}
            onScroll={syncFade}
            className="no-scrollbar overflow-x-auto overscroll-x-contain touch-pan-x"
          >
            <div className="flex w-max min-w-full items-center justify-center gap-1 px-2.5 py-2 pr-8 sm:gap-2">
              {SPORT_CHIPS.map((id) => {
                const on = sport === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSport(id)}
                    className="flex w-[64px] shrink-0 flex-col items-center gap-1 sm:w-[68px]"
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                        on
                          ? 'border-[var(--accent-dark)] bg-[var(--accent)] text-white'
                          : 'border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-2)]'
                      }`}
                    >
                      <SportIcon id={id} size={16} />
                    </span>
                    <span
                      className={`text-[10px] font-semibold ${
                        on ? 'font-bold text-[var(--accent-dark)]' : 'text-[var(--text-3)]'
                      }`}
                    >
                      {hip4.sport[id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {showEndFade ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
