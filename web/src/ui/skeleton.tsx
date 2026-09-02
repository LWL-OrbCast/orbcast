import type { ReactNode } from 'react';
import { useWebAuth } from '../lib/auth';

export function Skel({ className = '' }: { className?: string }) {
  return <div className={`skel ${className}`} />;
}

export function WalletSkeleton() {
  return (
    <div className="grid w-full min-w-0 gap-4" aria-busy="true" aria-live="polite">
      <Skel className="h-8 w-28" />
      <div className="grid w-full min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">
        <div className="grid min-w-0 gap-4">
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
            <div className="flex flex-col sm:flex-row">
              <div className="flex shrink-0 flex-col items-center justify-center gap-2 bg-[var(--bg-2)] px-5 py-5 sm:w-[168px]">
                <Skel className="h-[132px] w-[132px] rounded-xl" />
                <Skel className="h-3 w-16" />
              </div>
              <div className="min-w-0 flex-1 p-5">
                <Skel className="h-5 w-36" />
                <Skel className="mt-2 h-3 w-full max-w-sm" />
                <Skel className="mt-4 h-10 w-full rounded-xl" />
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4">
                  <div>
                    <Skel className="h-3 w-16" />
                    <Skel className="mt-2 h-7 w-24" />
                  </div>
                  <div>
                    <Skel className="h-3 w-16" />
                    <Skel className="mt-2 h-7 w-24" />
                  </div>
                </div>
              </div>
            </div>
          </section>
          <Skel className="h-12 w-full rounded-2xl" />
        </div>
        <div className="grid min-w-0 content-start gap-4 lg:sticky lg:top-20">
          <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
            <Skel className="h-5 w-48" />
            <Skel className="mt-2 h-3 w-40" />
            <Skel className="mt-4 h-10 w-full rounded-xl" />
            <Skel className="mt-3 h-10 w-full rounded-xl" />
          </section>
          <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
            <Skel className="h-5 w-48" />
            <Skel className="mt-4 h-10 w-full rounded-xl" />
            <Skel className="mt-3 h-10 w-full rounded-xl" />
          </section>
        </div>
      </div>
    </div>
  );
}

export function HistoryListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4"
        >
          <Skel className="h-6 w-10 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skel className="h-3.5 w-4/5" />
            <Skel className="mt-2 h-3 w-2/5" />
          </div>
          <Skel className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function PositionsSkeleton() {
  return (
    <div aria-busy="true">
      <Skel className="h-8 w-36" />
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skel className="h-3 w-14" />
            <Skel className="mt-2 h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex rounded-xl bg-[var(--bg-2)] p-1">
        <Skel className="h-9 flex-1 rounded-lg" />
        <Skel className="h-9 flex-1 rounded-lg" />
        <Skel className="h-9 flex-1 rounded-lg" />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
            <Skel className="h-6 w-10 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skel className="h-3.5 w-4/5" />
              <Skel className="mt-2 h-3 w-2/5" />
            </div>
            <Skel className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RewardsSkeleton() {
  return (
    <div className="max-w-3xl" aria-busy="true">
      <Skel className="h-8 w-32" />
      <Skel className="mt-2 h-3 w-24" />
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Skel className="h-24 rounded-2xl" />
        <Skel className="h-24 rounded-2xl" />
      </div>
      <Skel className="mt-6 h-40 w-full rounded-2xl" />
    </div>
  );
}

export function AuthGate({
  skeleton,
  title,
  body,
  cta,
  children,
}: {
  skeleton: ReactNode;
  title: string;
  body: string;
  cta: string;
  children: (address: `0x${string}`) => ReactNode;
}) {
  const { hydrating, authenticated, address, login } = useWebAuth();
  if (hydrating) return skeleton;
  if (!authenticated || !address) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center">
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">{body}</p>
        <button
          type="button"
          onClick={() => login()}
          className="btn-stamp btn-primary mt-4 px-4 py-2 text-sm"
        >
          {cta}
        </button>
      </div>
    );
  }
  return <>{children(address)}</>;
}

export function FeaturedEventSkeleton() {
  return (
    <article
      className="card-shadow w-full min-w-0 overflow-hidden rounded-3xl border border-[var(--border)] bg-white"
      aria-busy="true"
    >
      <div className="p-4 sm:p-6">
        <Skel className="mb-3 h-6 w-24 rounded-full" />
        <Skel className="h-7 w-28" />
        <Skel className="mt-3 h-8 w-4/5 max-w-md" />
        <Skel className="mt-4 h-[168px] w-full rounded-2xl" />
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Skel className="h-12 rounded-xl" />
          <Skel className="h-12 rounded-xl" />
          <Skel className="h-12 rounded-xl" />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-4 sm:px-6">
        <Skel className="h-3 w-28" />
        <div className="flex gap-1.5">
          <Skel className="h-2 w-5 rounded-full" />
          <Skel className="h-2 w-2 rounded-full" />
          <Skel className="h-2 w-2 rounded-full" />
        </div>
      </div>
    </article>
  );
}

export function SidebarListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <section
      className="card-shadow min-w-0 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-white"
      aria-busy="true"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <Skel className="h-4 w-28" />
        <Skel className="h-3.5 w-3.5 rounded-full" />
      </div>
      <ul>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Skel className="h-4 w-4 shrink-0" />
            <Skel className="h-3.5 min-w-0 flex-1" />
            <Skel className="h-3 w-10 shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MarketRowSkeleton() {
  return (
    <div className="card-shadow flex min-w-0 items-center gap-3.5 rounded-[18px] border border-[var(--border)] bg-white p-3.5">
      <Skel className="h-11 w-11 shrink-0 rounded-[14px]" />
      <div className="min-w-0 flex-1">
        <Skel className="h-3 w-24" />
        <Skel className="mt-2 h-4 w-4/5" />
        <Skel className="mt-1.5 h-3 w-2/5" />
      </div>
      <div className="w-[72px] shrink-0">
        <Skel className="ml-auto h-6 w-12" />
        <Skel className="mt-1.5 ml-auto h-2.5 w-10" />
        <Skel className="mt-2 h-1 w-full rounded-full" />
      </div>
    </div>
  );
}

export function MarketGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <MarketRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function HomeLiveSkeleton() {
  return (
    <section className="mt-8" aria-busy="true">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skel className="h-7 w-40" />
        <div className="flex items-center gap-2">
          <Skel className="h-9 w-9 rounded-full" />
          <Skel className="h-9 w-9 rounded-full" />
          <Skel className="h-4 w-14" />
        </div>
      </div>
      <MarketGridSkeleton count={6} />
    </section>
  );
}

export function AuthButtonSkeleton() {
  return (
    <div className="flex shrink-0 items-center gap-2" aria-hidden>
      <div className="skel h-10 w-[4.5rem] rounded-xl sm:w-[5.25rem]" />
      <div className="skel h-10 w-[4.75rem] rounded-xl sm:w-[5.5rem]" />
    </div>
  );
}

export function MarketPageSkeleton() {
  return (
    <div
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      aria-busy="true"
      aria-live="polite"
    >
      <div>
        <Skel className="h-4 w-24" />
        <div className="mt-3 flex items-center gap-2">
          <Skel className="h-3 w-12" />
          <Skel className="h-3 w-28" />
        </div>
        <Skel className="mt-3 h-8 w-4/5 max-w-lg" />
        <Skel className="mt-2 h-4 w-2/5 max-w-xs" />
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <Skel className="h-3.5 w-28" />
            <div className="flex gap-1.5">
              <Skel className="h-7 w-10 rounded-full" />
              <Skel className="h-7 w-10 rounded-full" />
              <Skel className="h-7 w-10 rounded-full" />
            </div>
          </div>
          <Skel className="h-[220px] w-full rounded-xl" />
        </div>
        <div className="mt-3 flex gap-4">
          <Skel className="h-3.5 w-24" />
          <Skel className="h-3.5 w-32" />
        </div>
      </div>

      <aside className="h-fit rounded-2xl border border-[var(--border)] bg-white p-5 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20">
        <div className="grid grid-cols-2 gap-3">
          <Skel className="h-12 rounded-xl" />
          <Skel className="h-12 rounded-xl" />
        </div>
        <div className="mt-4 flex gap-2">
          <Skel className="h-9 flex-1 rounded-xl" />
          <Skel className="h-9 flex-1 rounded-xl" />
        </div>
        <Skel className="mt-4 h-3 w-28" />
        <Skel className="mt-2 h-10 w-full rounded-xl" />
        <div className="mt-2 flex gap-1.5">
          <Skel className="h-8 flex-1 rounded-lg" />
          <Skel className="h-8 flex-1 rounded-lg" />
          <Skel className="h-8 flex-1 rounded-lg" />
          <Skel className="h-8 flex-1 rounded-lg" />
        </div>
        <Skel className="mt-4 h-4 w-36" />
        <Skel className="mt-4 h-12 w-full rounded-xl" />
      </aside>

      <div className="lg:col-start-1">
        <div className="mb-3 flex gap-1 rounded-xl bg-[var(--bg-2)] p-1">
          <Skel className="h-8 flex-1 rounded-lg" />
          <Skel className="h-8 flex-1 rounded-lg" />
          <Skel className="h-8 flex-1 rounded-lg" />
          <Skel className="h-8 flex-1 rounded-lg" />
        </div>
        <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-white p-4">
          <Skel className="h-4 w-full" />
          <Skel className="h-4 w-5/6" />
          <Skel className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function PageEnter({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
