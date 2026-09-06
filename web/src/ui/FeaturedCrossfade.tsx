import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FEATURED_CROSSFADE_MS } from '@hip4/autoplay';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Crossfade when the featured hero identity changes (live pin, pager, chrome upgrade). */
export function FeaturedCrossfade({ id, children }: { id: string; children: ReactNode }) {
  const frontRef = useRef({ id, node: children });
  const [front, setFront] = useState({ id, node: children });
  const [leaving, setLeaving] = useState<{ id: string; node: ReactNode } | null>(null);

  useLayoutEffect(() => {
    const cur = frontRef.current;
    if (id === cur.id) {
      if (cur.node !== children) {
        const next = { id, node: children };
        frontRef.current = next;
        setFront(next);
      }
      return;
    }
    if (prefersReducedMotion()) {
      const next = { id, node: children };
      frontRef.current = next;
      setFront(next);
      setLeaving(null);
      return;
    }
    setLeaving(cur);
    const next = { id, node: children };
    frontRef.current = next;
    setFront(next);
    const t = window.setTimeout(() => setLeaving(null), FEATURED_CROSSFADE_MS);
    return () => window.clearTimeout(t);
  }, [id, children]);

  return (
    <div className="featured-stage">
      {leaving ? (
        <div key={leaving.id} className="featured-stage-out" aria-hidden>
          {leaving.node}
        </div>
      ) : null}
      <div key={front.id} className={leaving ? 'featured-stage-in' : undefined}>
        {front.node}
      </div>
    </div>
  );
}
