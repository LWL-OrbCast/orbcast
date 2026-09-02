import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BRAND_NAME, BRAND_SUPPORT_EMAIL, BRAND_X_URL } from '../../../frontend/src/lib/brand';
import { useCopy } from '../lib/copy';
import orbcastLogo from '../assets/orbcast-logo.webp';
import robinhoodIcon from '../assets/robinhood-icon.webp';
import { IconCheck, IconCopy, IconTwitter } from './icons';

const LWL_CA = '0x7bb3E171EC502F65C08D38a61D51B9841524A72D';

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function FooterNavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="hover:text-[var(--accent-dark)]" onClick={scrollToTop}>
      {children}
    </Link>
  );
}

function LwlByline() {
  const [copied, setCopied] = useState(false);

  const copyCa = async () => {
    try {
      await navigator.clipboard.writeText(LWL_CA);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mt-3 flex max-w-xl items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-left">
      <img
        src={robinhoodIcon}
        alt="RobinhoodChain"
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-full object-contain"
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-extrabold text-[var(--text)]">By $LWL</span>
        <p className="mt-0.5 break-all font-mono text-[11px] leading-snug text-[var(--text-3)]">CA: {LWL_CA}</p>
      </div>
      <button
        type="button"
        onClick={() => void copyCa()}
        aria-label={copied ? 'Copied contract address' : 'Copy contract address'}
        title={copied ? 'Copied' : 'Copy contract address'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-3)] transition-colors hover:bg-white hover:text-[var(--text)]"
      >
        {copied ? <IconCheck size={14} className="text-[var(--accent-dark)]" /> : <IconCopy size={14} />}
      </button>
    </div>
  );
}

export function Footer() {
  const { hip4 } = useCopy();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-4 md:gap-10">
          <div className="min-w-0">
            <Link to="/" className="inline-block" onClick={scrollToTop}>
              <img
                src={orbcastLogo}
                alt={BRAND_NAME}
                className="h-7 w-auto max-w-[148px] object-contain sm:h-8 sm:max-w-[160px]"
              />
            </Link>
            <p className="mt-0.5 text-sm leading-snug text-[var(--text-2)]">
            Trade what happens next.
            </p>
            <LwlByline />
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-10 sm:grid-cols-3 md:col-span-3 md:grid-cols-3 md:gap-x-14">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-3)]">Explore</h3>
              <ul className="mt-4 space-y-3 text-sm font-semibold">
                <li>
                  <FooterNavLink to="/">{hip4.nav.home}</FooterNavLink>
                </li>
                <li>
                  <FooterNavLink to="/markets">{hip4.nav.markets}</FooterNavLink>
                </li>
                <li>
                  <FooterNavLink to="/positions">{hip4.nav.positions}</FooterNavLink>
                </li>
                <li>
                  <FooterNavLink to="/rewards">{hip4.nav.rewards}</FooterNavLink>
                </li>
                <li>
                  <FooterNavLink to="/wallet">{hip4.nav.wallet}</FooterNavLink>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-3)]">Legal</h3>
              <ul className="mt-4 space-y-3 text-sm font-semibold">
                <li>
                  <FooterNavLink to="/terms">Terms of Service</FooterNavLink>
                </li>
                <li>
                  <FooterNavLink to="/privacy">Privacy Policy</FooterNavLink>
                </li>
                <li>
                  <FooterNavLink to="/fees">Fees</FooterNavLink>
                </li>
              </ul>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-3)]">Contact</h3>
              <ul className="mt-4 space-y-3 text-sm font-semibold">
                <li>
                  <a href={`mailto:${BRAND_SUPPORT_EMAIL}`} className="break-all hover:text-[var(--accent-dark)]">
                    {BRAND_SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <a
                    href={BRAND_X_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="X"
                    className="inline-flex items-center hover:text-[var(--accent-dark)]"
                  >
                    <IconTwitter size={14} />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <p className="mx-auto max-w-[1280px] px-4 py-3 text-xs leading-relaxed text-[var(--text-3)] sm:px-6 sm:py-4">
          © {year} {BRAND_NAME}. LUNATIC WISDOM LABS LLC. Outcome trading involves risk. Not available in restricted
          jurisdictions.
        </p>
      </div>
    </footer>
  );
}
