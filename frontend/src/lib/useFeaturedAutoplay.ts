import { useCallback, useEffect, useRef, useState } from 'react';

export const FEATURED_SLIDE_MS = 6500;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Auto-advance a featured pager. `progress` is 0–1 for the active pill fill. */
export function useFeaturedAutoplay(count: number) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const pausedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const heldRef = useRef(0);
  const indexRef = useRef(0);
  const countRef = useRef(count);
  indexRef.current = index;
  countRef.current = count;

  const go = useCallback((next: number) => {
    const n = countRef.current;
    if (n <= 0) return;
    const i = ((next % n) + n) % n;
    indexRef.current = i;
    setIndex(i);
    startedRef.current = Date.now();
    heldRef.current = 0;
    setProgress(0);
  }, []);

  const pause = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    heldRef.current = Date.now() - startedRef.current;
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    startedRef.current = Date.now() - heldRef.current;
  }, []);

  useEffect(() => {
    if (count <= 0) return;
    if (index >= count) go(0);
  }, [count, index, go]);

  useEffect(() => {
    if (count < 2 || prefersReducedMotion()) {
      setProgress(0);
      return;
    }
    let raf = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      if (!pausedRef.current) {
        const elapsed = now - startedRef.current;
        const p = Math.min(1, elapsed / FEATURED_SLIDE_MS);
        if (now - lastPaint > 50) {
          lastPaint = now;
          setProgress(p);
        }
        if (p >= 1) go(indexRef.current + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count, go]);

  return { index, progress, go, pause, resume };
}
