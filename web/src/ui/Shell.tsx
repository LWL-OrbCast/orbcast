import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useWebAuth } from '../lib/auth';
import { useCopy } from '../lib/copy';
import { PRIVY_APP_ID } from '../lib/config';
import { ONBOARDING_ACCOUNT_INFO_QUERY_KEY } from '../lib/onboarding';
import { usePositionActivity } from '../lib/usePositionActivity';
import { CatalogUiProvider, useCatalogUi } from './catalogUi';
import { Footer } from './Footer';
import { LanguagePicker } from './LanguagePicker';
import { ProfileAvatar } from './ProfileAvatar';
import { AuthButtonSkeleton, PageEnter } from './skeleton';
import {
  IconCheck,
  IconCopy,
  IconLogout,
  IconMenu,
  IconPercent,
  IconPositions,
  IconSearch,
  IconTrophy,
  IconWallet,
} from './icons';
import { SearchModal } from './SearchModal';
import { SportCategoryBar } from './SportCategoryBar';
import { IncomingFundsBanner } from './IncomingFundsBanner';
import orbcastLogo from '../assets/orbcast-logo.webp';
import arbIcon from '../../../frontend/assets/images/symbols/arb-icon.webp';

export function Shell() {
  return (
    <CatalogUiProvider>
      <ShellFrame />
    </CatalogUiProvider>
  );
}

function prettyAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function ShellFrame() {
  const { hip4, common: commonCopy, profile: profileCopy } = useCopy();
  const { authenticated, logout, ready, hydrating, address, email, privyConfigured, login } =
    useWebAuth();
  const activity = usePositionActivity();
  const qc = useQueryClient();
  const { search, setSearch } = useCatalogUi();
  const location = useLocation();
  const [acctOpen, setAcctOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const showSports = location.pathname === '/' || location.pathname === '/markets';
  const showHamburger = !(hydrating || authenticated);
  const links = [
    { to: '/', label: hip4.nav.home, end: true },
    { to: '/markets', label: hip4.nav.markets, end: false },
    { to: '/positions', label: hip4.nav.positions, end: false },
    { to: '/rewards', label: hip4.nav.rewards, end: false },
    { to: '/wallet', label: hip4.nav.wallet, end: false },
    { to: '/fees', label: profileCopy.fees, end: false },
  ];
  const accountLinks = [
    { to: '/wallet', label: hip4.nav.wallet, icon: IconWallet },
    { to: '/positions', label: hip4.nav.positions, icon: IconPositions },
    { to: '/rewards', label: hip4.nav.rewards, icon: IconTrophy },
    { to: '/fees', label: profileCopy.fees, icon: IconPercent },
  ];

  useEffect(() => {
    setNavOpen(false);
    setAcctOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (!acctOpen) setCopied(false);
  }, [acctOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!acctRef.current?.contains(t)) setAcctOpen(false);
      if (!navRef.current?.contains(t)) setNavOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearchOpen(true);
  };

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-[var(--bg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img
              src={orbcastLogo}
              alt="OrbCast"
              className="h-8 w-auto max-w-[148px] object-contain object-left sm:h-9 sm:max-w-[176px]"
            />
          </Link>

          <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            />
            <input
              readOnly
              value={searchOpen ? '' : search}
              onFocus={() => setSearchOpen(true)}
              onClick={() => setSearchOpen(true)}
              placeholder={hip4.markets.searchPlaceholder}
              className="w-full cursor-text rounded-full border border-[var(--border)] bg-[var(--bg-2)] py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--accent)] focus:bg-white"
            />
          </form>

          <div className="flex shrink-0 items-center gap-2">
            <LanguagePicker />
            {hydrating ? (
              <AuthButtonSkeleton />
            ) : ready && authenticated ? (
              <div className="flex items-center gap-1.5">
                <Link
                    to="/positions"
                    aria-label={`${hip4.nav.positions}${activity.badge > 0 ? ` (${activity.badge})` : ''}`}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent-dark)]"
                  >
                    <IconPositions size={18} />
                    {activity.badge > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--live)] px-1 text-[10px] font-extrabold leading-none tabular-nums text-white">
                        {activity.badge > 99 ? '99+' : activity.badge}
                      </span>
                    ) : null}
                  </Link>
                <div className="relative" ref={acctRef}>
                <button
                  type="button"
                  onClick={() => {
                    setAcctOpen((v) => !v);
                    setNavOpen(false);
                  }}
                  aria-label={hip4.header.wallet}
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                >
                  <ProfileAvatar size={40} />
                </button>
                {acctOpen ? (
                  <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-white py-1 shadow-lg">
                    <div className="px-2.5 pb-1.5 pt-2.5">
                      {address ? (
                        <button
                          type="button"
                          onClick={() => void copyAddress()}
                          aria-label={commonCopy.copyAddress}
                          className="flex w-full items-center gap-2 rounded-xl bg-[#22C55E15] px-2.5 py-2 text-left transition hover:bg-[#22C55E22]"
                        >
                          <img
                            src={arbIcon}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0 rounded-[3px] object-contain"
                          />
                          <span className="min-w-0 flex-1 font-mono text-[12px] font-semibold tracking-tight text-[var(--accent-dark)]">
                            {prettyAddress(address)}
                          </span>
                          {copied ? (
                            <IconCheck size={14} className="shrink-0 text-[var(--accent-dark)]" />
                          ) : (
                            <IconCopy size={14} className="shrink-0 text-[var(--accent-dark)]" />
                          )}
                        </button>
                      ) : null}
                      {email ? (
                        <p
                          className="mt-1.5 truncate px-1 text-[12px] font-medium text-[var(--text-2)]"
                          title={email}
                        >
                          {email}
                        </p>
                      ) : null}
                    </div>
                    <div className="my-1 h-px bg-[var(--border)]" />
                    {accountLinks.map((l) => {
                      const Icon = l.icon;
                      return (
                        <AccountMenuLink
                          key={l.to}
                          to={l.to}
                          label={l.label}
                          icon={<Icon size={16} />}
                          onClick={() => setAcctOpen(false)}
                        />
                      );
                    })}
                    <div className="my-1 h-px bg-[var(--border)]" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                      onClick={() => {
                        setAcctOpen(false);
                        qc.removeQueries({ queryKey: [ONBOARDING_ACCOUNT_INFO_QUERY_KEY] });
                        void logout();
                      }}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-2)] text-[var(--text-2)]">
                        <IconLogout size={16} />
                      </span>
                      {profileCopy.signOut}
                    </button>
                  </div>
                ) : null}
              </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!ready && privyConfigured}
                  onClick={() => login()}
                  className="btn-stamp btn-ghost-stamp inline-flex items-center px-3 py-2 text-sm sm:px-3.5"
                >
                  {hip4.header.logIn}
                </button>
                <button
                  type="button"
                  disabled={!ready && privyConfigured}
                  onClick={() => login()}
                  className="btn-stamp btn-primary inline-flex items-center px-3 py-2 text-sm sm:px-3.5"
                >
                  {hip4.header.signUp}
                </button>
              </>
            )}

            {showHamburger ? (
              <div className="relative" ref={navRef}>
                <button
                  type="button"
                  aria-label="Menu"
                  aria-expanded={navOpen}
                  onClick={() => {
                    setNavOpen((v) => !v);
                    setAcctOpen(false);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text)]"
                >
                  <IconMenu size={20} />
                </button>
                {navOpen ? (
                  <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-[var(--border)] bg-white py-1 shadow-lg">
                    {links.map((l) => (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        end={l.end}
                        onClick={() => setNavOpen(false)}
                        className={({ isActive }) =>
                          `block px-3 py-2.5 text-sm font-semibold ${
                            isActive
                              ? 'bg-[#ECFDF3] text-[var(--accent-dark)]'
                              : 'text-[var(--text)] hover:bg-[var(--bg-2)]'
                          }`
                        }
                      >
                        {l.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <IncomingFundsBanner />

      {searchOpen ? (
        <SearchModal query={search} onQuery={setSearch} onClose={() => setSearchOpen(false)} />
      ) : null}

      {showSports ? <SportCategoryBar /> : null}

      <main className="mx-auto min-w-0 w-full max-w-[1280px] flex-1 overflow-x-clip px-4 py-6 sm:px-6">
        {!privyConfigured || !PRIVY_APP_ID ? (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Guest mode — set VITE_PRIVY_APP_ID to enable login.
          </p>
        ) : null}
        <PageEnter key={location.pathname}>
          <Outlet />
        </PageEnter>
      </main>

      <Footer />
    </div>
  );
}

function AccountMenuLink({
  to,
  label,
  icon,
  onClick,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold ${
          isActive
            ? 'bg-[#ECFDF3] text-[var(--accent-dark)]'
            : 'text-[var(--text)] hover:bg-[var(--bg-2)]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              isActive ? 'bg-white text-[var(--accent-dark)]' : 'bg-[var(--bg-2)] text-[var(--text-2)]'
            }`}
          >
            {icon}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
