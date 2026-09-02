/**
 * Map Hyperliquid / HIP-4 reject strings to i18n keys.
 * No React or i18n import — web and Expo both call this with their own `t`.
 */

export type HumanizedHlError = {
  title: string;
  message: string;
  matched: boolean;
};

/** Pull a single string out of Error / Hip4Error without `Name: message` duplication. */
export function extractHyperliquidErrorText(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { raw?: unknown; message?: unknown; shortMessage?: unknown; cause?: unknown };
    if (typeof e.raw === 'string') parts.push(e.raw);
    if (typeof e.message === 'string') parts.push(e.message);
    if (typeof e.shortMessage === 'string') parts.push(e.shortMessage);
    cur = e.cause;
  }
  return sanitizeHyperliquidError(parts.join(' '));
}

/** Strip SDK wrappers, `Order 0:`, `asset=1000…`, and duplicated halves. */
export function sanitizeHyperliquidError(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/Hip4Error:\s*/gi, '')
    .replace(/Order\s+\d+:\s*/gi, '')
    .replace(/\s*asset=\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const sentences = cleaned.match(/[^.!?]+[.!?]?/g) ?? [cleaned];
  const uniq: string[] = [];
  for (const piece of sentences) {
    const s = piece.trim();
    if (!s) continue;
    if (!uniq.some((u) => u.toLowerCase() === s.toLowerCase())) uniq.push(s);
  }
  return uniq.join(' ').trim();
}

type Match = { titleKey: string; messageKey: string };

function matchHyperliquidError(raw: string): Match | null {
  const msg = String(raw ?? '');
  const lower = msg.toLowerCase();

  if (/(^|[^\d])429([^\d]|$)/.test(msg) || /rate.?limit/i.test(msg)) {
    return {
      titleKey: 'errors.hyperliquid.rateLimitedTitle',
      messageKey: 'errors.hyperliquid.rateLimitedMessage',
    };
  }

  if (/insufficient\s+spot\s+balance(\s+asset=)?/i.test(msg)) {
    return {
      titleKey: 'errors.hyperliquid.insufficientOutcomeSharesTitle',
      messageKey: 'errors.hyperliquid.insufficientOutcomeSharesMessage',
    };
  }

  if (
    /insufficient\s+balance\s+for\s+token\s+transfer/i.test(msg) ||
    /insufficientSpotBalance/i.test(msg) ||
    /insufficient_spot_balance/i.test(msg)
  ) {
    return {
      titleKey: 'errors.hyperliquid.insufficientSpotBalanceTitle',
      messageKey: 'errors.hyperliquid.insufficientSpotBalanceMessage',
    };
  }

  if (
    /openInterestCap/i.test(msg) ||
    /OpenInterestIncrease/i.test(msg) ||
    /open interest is capped/i.test(msg) ||
    /at open interest cap/i.test(msg) ||
    /increase open interest too quickly/i.test(msg)
  ) {
    return {
      titleKey: 'errors.hyperliquid.openInterestCapTitle',
      messageKey: 'errors.hyperliquid.openInterestCapMessage',
    };
  }

  // FrontendMarket / IOC / market — HL prose is "could not", not "couldn't".
  if (
    /couldn'?t immediately match against any resting/i.test(msg) ||
    /could not immediately match against any resting/i.test(msg) ||
    /could not immediately match/i.test(msg) ||
    /order could not immediately match/i.test(msg)
  ) {
    return {
      titleKey: 'errors.hyperliquid.noRestingMatchTitle',
      messageKey: 'errors.hyperliquid.noRestingMatchMessage',
    };
  }

  if (/price must be divisible by tick size/i.test(msg) || /tickRejected/i.test(msg)) {
    return {
      titleKey: 'errors.hyperliquid.tickRejectedTitle',
      messageKey: 'errors.hyperliquid.tickRejectedMessage',
    };
  }

  const map: Array<{ key: string; titleKey: string; messageKey: string }> = [
    { key: 'badTriggerPxRejected', titleKey: 'errors.hyperliquid.badTriggerPxRejectedTitle', messageKey: 'errors.hyperliquid.badTriggerPxRejectedMessage' },
    { key: 'badAloPxRejected', titleKey: 'errors.hyperliquid.badAloPxRejectedTitle', messageKey: 'errors.hyperliquid.badAloPxRejectedMessage' },
    { key: 'iocCancelRejected', titleKey: 'errors.hyperliquid.iocCancelRejectedTitle', messageKey: 'errors.hyperliquid.iocCancelRejectedMessage' },
    { key: 'marketOrderNoLiquidityRejected', titleKey: 'errors.hyperliquid.marketOrderNoLiquidityRejectedTitle', messageKey: 'errors.hyperliquid.marketOrderNoLiquidityRejectedMessage' },
    { key: 'perpMarginRejected', titleKey: 'errors.hyperliquid.perpMarginRejectedTitle', messageKey: 'errors.hyperliquid.perpMarginRejectedMessage' },
    { key: 'reduceOnlyRejected', titleKey: 'errors.hyperliquid.reduceOnlyRejectedTitle', messageKey: 'errors.hyperliquid.reduceOnlyRejectedMessage' },
    { key: 'minTradeNtlRejected', titleKey: 'errors.hyperliquid.minTradeNtlRejectedTitle', messageKey: 'errors.hyperliquid.minTradeNtlRejectedMessage' },
    { key: 'oracleRejected', titleKey: 'errors.hyperliquid.oracleRejectedTitle', messageKey: 'errors.hyperliquid.oracleRejectedMessage' },
  ];

  for (const m of map) {
    if (msg.includes(m.key)) return { titleKey: m.titleKey, messageKey: m.messageKey };
  }

  if (lower.includes('insufficient') && lower.includes('margin')) {
    return {
      titleKey: 'errors.hyperliquid.insufficientMarginTitle',
      messageKey: 'errors.hyperliquid.insufficientMarginMessage',
    };
  }

  return null;
}

export function humanizeHyperliquidErrorWith(
  raw: string,
  t: (key: string) => string,
): HumanizedHlError {
  const cleaned = sanitizeHyperliquidError(raw);
  const hit = matchHyperliquidError(cleaned) ?? matchHyperliquidError(raw);
  if (hit) {
    return { title: t(hit.titleKey), message: t(hit.messageKey), matched: true };
  }
  return {
    title: t('errors.hyperliquid.orderFailedTitle'),
    message: cleaned || t('errors.hyperliquid.unknownError'),
    matched: false,
  };
}
