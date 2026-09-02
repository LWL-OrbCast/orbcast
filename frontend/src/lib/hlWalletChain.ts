/**
 * Wallet error classifiers for Hyperliquid EIP-712 prompts.
 *
 * User-signed HL actions must use the wallet's *active* chain as
 * `signatureChainId`. Hyperliquid accepts any id; MetaMask / WalletConnect
 * reject when the EIP-712 domain does not match the selected network.
 * AppKit's default network (Arbitrum) often disagrees with MetaMask (Ethereum).
 */

function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as {
      message?: string;
      shortMessage?: string;
      details?: string;
      cause?: unknown;
      data?: { message?: string };
    };
    parts.push(e.message ?? '', e.shortMessage ?? '', e.details ?? '', e.data?.message ?? '');
    cur = e.cause;
  }
  parts.push(String(err ?? ''));
  return parts.join(' ');
}

const CHAIN_MISMATCH_RE =
  /active chainid is\s+(0x[0-9a-f]+)\s+but received\s+(0x[0-9a-f]+)/i;

function normalizeHexChainId(raw: string): `0x${string}` | null {
  if (!/^0x[0-9a-f]+$/i.test(raw)) return null;
  try {
    return `0x${BigInt(raw).toString(16)}` as `0x${string}`;
  } catch {
    return null;
  }
}

/** Parse MetaMask/WC "active chainId is 0x1 but received 0xa4b1" (walks `.cause`). */
export function parseTypedDataChainMismatch(
  err: unknown,
): { active: `0x${string}`; received: `0x${string}` } | null {
  const msg = collectErrorText(err);
  const match = CHAIN_MISMATCH_RE.exec(msg);
  if (!match) return null;
  const active = normalizeHexChainId(match[1]);
  const received = normalizeHexChainId(match[2]);
  if (!active || !received) return null;
  return { active, received };
}

export function isTypedDataChainMismatchError(err: unknown): boolean {
  if (parseTypedDataChainMismatch(err)) return true;
  return /chain.?id.*mismatch|does not match the (active|connected) chain/i.test(
    collectErrorText(err),
  );
}

export function isHlSigningChainError(err: unknown): boolean {
  return isTypedDataChainMismatchError(err);
}

export function isWalletUserRejectedRequest(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string; shortMessage?: string } | null;
  const code = e?.code;
  if (code === 4001 || code === 'ACTION_REJECTED' || code === 'USER_REJECTED') return true;
  const msg = `${e?.message ?? ''} ${e?.shortMessage ?? ''} ${collectErrorText(err)}`.toLowerCase();
  return /user rejected|user denied|rejected the request|denied request|request rejected|user cancel/.test(
    msg,
  );
}
