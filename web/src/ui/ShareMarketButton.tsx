import { useState } from 'react';
import { useCopy } from '../lib/copy';
import { marketShareUrl, shareMarket } from '../lib/shareMarket';
import { IconCheck, IconShare } from './icons';

export function ShareMarketButton({
  marketId,
  title,
  className = '',
}: {
  marketId: string;
  title: string;
  className?: string;
}) {
  const { hip4 } = useCopy();
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const result = await shareMarket({ title, url: marketShareUrl(marketId) });
    if (result !== 'copied') return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={() => void onShare()}
      aria-label={copied ? hip4.linkCopied : hip4.share}
      title={copied ? hip4.linkCopied : hip4.share}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent-dark)] ${className}`}
    >
      {copied ? <IconCheck size={16} className="text-[var(--accent-dark)]" /> : <IconShare size={16} />}
    </button>
  );
}
