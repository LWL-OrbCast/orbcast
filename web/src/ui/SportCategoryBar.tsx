import { useCallback, useEffect, useRef, useState } from 'react';
import type { ListedMarket } from '@hip4';
import { CATALOG_CHIPS, catalogChipForMarket, type SportChipId } from '@hip4/catalog';
import { useCopy } from '../lib/copy';
import { useCatalogUi } from './catalogUi';
import { IconChevron, SportIcon } from './icons';

export const SPORT_CHIPS = CATALOG_CHIPS;

export function sportIdForListed(m: ListedMarket): SportChipId {
  return catalogChipForMarket(m);
}

const EDGE_PX = 8;

const arrowBtn =
  'absolute top-1/2 z-[2] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-[var(--ink)]/22 text-white/90 shadow-sm backdrop-blur-[2px] transition-[background-color,box-shadow,filter] duration-150 hover:bg-[var(--ink)]/38 hover:text-white hover:brightness-110 hover:shadow-md active:bg-[var(--ink)]/48 sm:flex';

export function SportCategoryBar() {
  const { hip4 } = useCopy();
  const { sport, setSport } = useCatalogUi();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const syncEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > EDGE_PX);
    setCanRight(el.scrollWidth - el.clientWidth - el.scrollLeft > EDGE_PX);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncEdges();
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    window.addEventListener('resize', syncEdges);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncEdges);
    };
  }, [syncEdges]);

  const pageScroll = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.72), behavior: 'smooth' });
  };

  return (
    <div className="border-b border-[var(--border)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-2.5 sm:px-6">
        <div className="relative overflow-hidden rounded-[18px] border-[1.5px] border-[var(--border)] bg-white">
          <div
            ref={scrollerRef}
            onScroll={syncEdges}
            className="no-scrollbar overflow-x-auto overscroll-x-contain touch-pan-x"
          >
            <div className="flex w-max min-w-full items-center justify-start gap-1 px-2.5 py-2 sm:gap-2">
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
          {canLeft ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-14 bg-gradient-to-r from-white via-white/85 to-transparent sm:block" />
              <button
                type="button"
                aria-label="Previous categories"
                onClick={() => pageScroll(-1)}
                className={`${arrowBtn} left-1.5`}
              >
                <IconChevron size={16} className="rotate-180" />
              </button>
            </>
          ) : null}
          {canRight ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] hidden w-14 bg-gradient-to-l from-white via-white/85 to-transparent sm:block" />
              <button
                type="button"
                aria-label="More categories"
                onClick={() => pageScroll(1)}
                className={`${arrowBtn} right-1.5`}
              >
                <IconChevron size={16} />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
