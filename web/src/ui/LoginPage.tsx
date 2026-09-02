import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { takeLoginReturn, useWebAuth } from '../lib/auth';
import { fetchHealth } from '../lib/api';
import { useCopy } from '../lib/copy';
import { PRIVY_APP_ID } from '../lib/config';
import { Skel } from './skeleton';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#EA4335"
        d="M9 7.2v3.5h4.9c-.2 1.1-1.6 3.2-4.9 3.2-3 0-5.4-2.5-5.4-5.4S6 3.1 9 3.1c1.7 0 2.8.7 3.4 1.3l2.3-2.2C13.4.8 11.4 0 9 0 4 0 0 4 0 9s4 9 9 9c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H9z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { common: commonCopy, hip4, login: loginCopy } = useCopy();
  const {
    authenticated,
    login,
    loginWithGoogle,
    googleBusy,
    loginError,
    ready,
    hydrating,
    privyConfigured,
  } = useWebAuth();
  const navigate = useNavigate();
  const health = useQuery({ queryKey: ['api', 'health'], queryFn: fetchHealth, retry: 1 });

  useEffect(() => {
    if (authenticated) navigate(takeLoginReturn(), { replace: true });
  }, [authenticated, navigate]);

  if (hydrating || authenticated) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-white p-8">
        <Skel className="h-8 w-48" />
        <Skel className="mt-3 h-4 w-full" />
        <Skel className="mt-6 h-12 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-white p-8">
      <h1 className="text-2xl font-extrabold">{loginCopy.signInTitle}</h1>
      <p className="mt-2 text-sm text-[var(--text-2)]">{loginCopy.beginJourney}</p>
      {!privyConfigured || !PRIVY_APP_ID ? (
        <p className="mt-6 rounded-xl bg-[var(--bg-2)] p-3 text-sm text-[var(--text-2)]">
          Set <code>VITE_PRIVY_APP_ID</code> in <code>web/.env</code> and add{' '}
          <code>http://localhost:5173</code> to Privy allowed origins.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            disabled={!ready || googleBusy}
            onClick={() => login()}
            className="btn-stamp btn-ghost-stamp flex w-full items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
          >
            {loginCopy.continueEmail}
          </button>
          <p className="text-center text-[11px] font-bold uppercase tracking-wide text-[var(--text-3)]">
            {commonCopy.or}
          </p>
          <button
            type="button"
            disabled={!ready || googleBusy}
            onClick={() => {
              void loginWithGoogle().catch(() => undefined);
            }}
            className="btn-stamp btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
          >
            {googleBusy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <GoogleMark />
            )}
            {loginCopy.continueGoogle}
          </button>
          {loginError ? (
            <p className="rounded-xl bg-[#FFF1F2] px-3 py-2 text-xs leading-snug text-[var(--danger)]">
              {loginCopy.googleFailed}
            </p>
          ) : null}
        </div>
      )}
      <p className="mt-6 text-xs text-[var(--text-3)]">
        API {health.isSuccess ? 'ok' : health.isError ? 'unreachable' : '…'}
        {health.data?.status ? ` · ${health.data.status}` : ''}
      </p>
      <Link to="/markets" className="mt-6 inline-block text-sm font-bold text-[var(--accent-dark)]">
        {hip4.home.exploreAll}
      </Link>
    </div>
  );
}
