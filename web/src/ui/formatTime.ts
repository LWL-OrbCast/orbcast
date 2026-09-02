export function formatHms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

export function formatEndDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function remainLabel(expiresAt: number | null | undefined): string | null {
  if (!expiresAt || expiresAt <= Date.now()) return null;
  return formatHms((expiresAt - Date.now()) / 1000);
}

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

/** Kickoff/expiry copy that already lives in the title, countdown, or volume row. */
export function looksLikeScheduleSubtitle(s: string, expiresAt?: number | null): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(t) && new RegExp(MONTH, 'i').test(t)) return true;
  // "Sep 16", "Sep 16, 2026", "16 Sept 2026"
  if (new RegExp(`^${MONTH}\\.?\\s+\\d{1,2}(,?\\s+\\d{4})?$`, 'i').test(t)) return true;
  if (new RegExp(`^\\d{1,2}(st|nd|rd|th)?\\s+${MONTH}\\.?(,?\\s+\\d{4})?$`, 'i').test(t)) return true;
  // FOMC decisionLabel is often month + year only: "September 2026"
  if (new RegExp(`^${MONTH}\\.?\\s+\\d{4}$`, 'i').test(t)) return true;
  if (expiresAt) {
    const d = new Date(expiresAt);
    const variants = [
      d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
      d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).replace(/,/g, ''),
    ];
    const compact = t.replace(/,/g, '');
    if (variants.some((v) => v === t || v.replace(/,/g, '') === compact)) return true;
  }
  return false;
}
