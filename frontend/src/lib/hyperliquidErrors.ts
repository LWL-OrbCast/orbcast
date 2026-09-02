import i18n from '../i18n';
import { humanizeHyperliquidErrorWith } from './hyperliquidErrorMatch';

/**
 * Map raw Hyperliquid / transport errors to user-facing copy.
 * Uses the global i18n instance so strings follow the user's language outside React.
 */
export function humanizeHyperliquidError(raw: string): { title: string; message: string } {
  const nice = humanizeHyperliquidErrorWith(raw, (key) => String(i18n.t(key)));
  return { title: nice.title, message: nice.message };
}

export {
  extractHyperliquidErrorText,
  sanitizeHyperliquidError,
  humanizeHyperliquidErrorWith,
} from './hyperliquidErrorMatch';
