import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { hlExchangeUrl, hlInfoUrl, hlUserSignedChainId, hlWsUrl } from '@hip4/endpoints';
import { registerHip4Runtime } from '@hip4/runtime';
import {
  ARBITRUM_CHAIN_ID,
  BUILDER_ADDRESS,
  BUILDER_FEE_TENTHS,
  BUILDER_MAX_FEE_RATE,
  IS_TESTNET,
} from './config';
import { HL_AGENT_NAME } from '../../../frontend/src/lib/brand';
import {
  extractHyperliquidErrorText,
  humanizeHyperliquidErrorWith,
  sanitizeHyperliquidError,
} from '../../../frontend/src/lib/hyperliquidErrorMatch';
import i18n from './i18n';
import { clearAgent, loadAgent, saveAgent } from './agentStore';

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

/** EIP-712 payload in the exact shape Privy's `useSignTypedData` accepts. */
export type WebTypedDataPayload = {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type PrivySignTypedDataFn = (data: WebTypedDataPayload) => Promise<`0x${string}`>;

const network: 'mainnet' | 'testnet' = IS_TESTNET ? 'testnet' : 'mainnet';
const SETUP_CACHE_PREFIX = `orbcast-hl-setup-${network}-`;

export type WebSetupStatus = {
  agent: boolean;
  builderFee: boolean;
  /** HL `unifiedAccount` / `portfolioMargin` — same as Expo seamless setup. */
  unified: boolean;
  allComplete: boolean;
};

function setupCacheKey(userAddress: string): string {
  return `${SETUP_CACHE_PREFIX}${userAddress.toLowerCase()}`;
}

export function readCachedWebSetup(userAddress: string): WebSetupStatus | undefined {
  try {
    const raw = localStorage.getItem(setupCacheKey(userAddress));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<WebSetupStatus>;
    if (typeof parsed.allComplete !== 'boolean' || typeof parsed.agent !== 'boolean') return undefined;
    return {
      agent: !!parsed.agent,
      builderFee: !!parsed.builderFee,
      unified: !!parsed.unified,
      allComplete: !!parsed.allComplete,
    };
  } catch {
    return undefined;
  }
}

function writeCachedWebSetup(userAddress: string, status: WebSetupStatus): void {
  try {
    // Only persist a completed setup. A single incomplete inspect (IndexedDB
    // agent not ready yet) must not wipe the last known-complete snapshot —
    // that is what made Enable trading flash on refresh.
    if (status.allComplete) {
      localStorage.setItem(setupCacheKey(userAddress), JSON.stringify(status));
    }
  } catch {
    /* private mode */
  }
}

let cachedFeeTenths = BUILDER_FEE_TENTHS;
let chainSwitchFn: ((chainId: number) => Promise<void>) | null = null;
let privySignTypedData: PrivySignTypedDataFn | null = null;

const EIP712_DOMAIN = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

/** Server config may only *lower* the fee — never raise it above the shipped default. */
export function setWebBuilderFeeTenths(n: number) {
  if (Number.isFinite(n) && n >= 0) {
    cachedFeeTenths = Math.min(Math.floor(n), BUILDER_FEE_TENTHS);
  }
}

let activeAgentOwner: `0x${string}` | null = null;

/** Auth layer registers the logged-in master wallet; agent records are scoped to it. */
export function registerWebAgentOwner(address: `0x${string}` | null) {
  activeAgentOwner = address;
}

export function registerWebChainSwitch(fn: ((chainId: number) => Promise<void>) | null) {
  chainSwitchFn = fn;
}

/**
 * Privy React embedded wallets sign typed data through `useSignTypedData`
 * (their documented web path — it routes embedded wallets directly to the
 * signer instead of through the EIP-1193 request normalizer).
 */
export function registerWebPrivySignTypedData(fn: PrivySignTypedDataFn | null) {
  privySignTypedData = fn;
}

function transport() {
  return new HttpTransport({ isTestnet: IS_TESTNET });
}

export async function ensureWebAgent(
  owner?: `0x${string}`,
): Promise<{ privateKey: `0x${string}`; address: `0x${string}` }> {
  const master = owner ?? activeAgentOwner;
  if (!master) throw new Error('Log in before trading.');
  const existing = await loadAgent(network, master);
  if (existing) return existing;
  const pk = generatePrivateKey();
  const acct = privateKeyToAccount(pk);
  const agent = { privateKey: pk, address: acct.address };
  await saveAgent(network, master, agent);
  return agent;
}

/** Logout hygiene: wipe this wallet's agent key and cached setup snapshot. */
export async function clearWebAgent(owner: `0x${string}`): Promise<void> {
  try {
    localStorage.removeItem(setupCacheKey(owner));
  } catch {
    /* private mode */
  }
  await clearAgent(network, owner);
}

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

function isUserRejected(err: unknown): boolean {
  const e = err as { code?: number | string } | null;
  if (e?.code === 4001 || e?.code === 'ACTION_REJECTED' || e?.code === 'USER_REJECTED') return true;
  return /user rejected|user denied|rejected the request|denied request|request rejected|user cancel/.test(
    collectErrorText(err).toLowerCase(),
  );
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

function parseTypedDataChainMismatch(
  err: unknown,
): { active: `0x${string}`; received: `0x${string}` } | null {
  const match = CHAIN_MISMATCH_RE.exec(collectErrorText(err));
  if (!match) return null;
  const active = normalizeHexChainId(match[1]);
  const received = normalizeHexChainId(match[2]);
  if (!active || !received) return null;
  return { active, received };
}

const GENERIC_ERR =
  /an error has occurred|please try again|failed to sign typed data with|abstractwalleterror/i;

export function formatWebWalletError(err: unknown): string {
  if (isUserRejected(err)) return 'Confirmation was cancelled.';
  const text = collectErrorText(err);
  // HL rejects user-signed actions from never-funded accounts.
  if (/must deposit before performing actions|does not exist/i.test(text)) {
    return 'Deposit USDC to your wallet first, then enable trading.';
  }
  if (/insufficient\s+spot\s+balance(\s+asset=)?/i.test(text)) {
    return 'Some of these shares are already on an open sell. Cancel that order, or tap Close all.';
  }
  const hl = humanizeHyperliquidErrorWith(extractHyperliquidErrorText(err) || text, (k) =>
    String(i18n.t(k)),
  );
  if (hl.matched) return hl.message;
  const code = (err as { code?: string } | null)?.code;
  const chunks = collectErrorText(err)
    .split(/[\n|]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 6 && s.length < 220 && !GENERIC_ERR.test(s));
  const detail = chunks[0];
  const clean = detail ? sanitizeHyperliquidError(detail) : '';
  if (clean && code && !clean.includes(String(code))) return `${clean} (${code})`;
  if (clean) return clean;
  if (code) return `Signing failed (${code}).`;
  return 'Couldn’t enable trading. Try again.';
}

/**
 * Viem JSON-RPC shape (1-arg signTypedData) so nktkas hands us the full
 * EIP-712 payload. Signing goes through Privy's `useSignTypedData` hook when
 * registered (embedded wallets); raw `eth_signTypedData_v4` is the fallback.
 */
function createWebUserWallet(provider: Eip1193Provider, address: `0x${string}`) {
  return {
    async getAddresses() {
      return [address];
    },
    async getChainId() {
      const hex = (await provider.request({ method: 'eth_chainId' })) as string;
      return parseInt(hex, 16);
    },
    async signTypedData(params: {
      domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, unknown>;
    }) {
      const typedData: WebTypedDataPayload = {
        domain: params.domain,
        types: {
          EIP712Domain: EIP712_DOMAIN,
          ...params.types,
        },
        primaryType: params.primaryType,
        message: params.message,
      };
      if (privySignTypedData) {
        return privySignTypedData(typedData);
      }
      return (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      })) as `0x${string}`;
    },
  };
}

async function readWalletSignatureChainId(provider: Eip1193Provider): Promise<`0x${string}`> {
  try {
    const hex = await provider.request({ method: 'eth_chainId' });
    if (typeof hex === 'string') {
      const normalized = normalizeHexChainId(hex);
      if (normalized) return normalized;
    }
  } catch {
    /* wallet may not answer */
  }
  return hlUserSignedChainId(IS_TESTNET);
}

export async function ensureWebSigningChain(provider: Eip1193Provider) {
  if (chainSwitchFn) {
    await chainSwitchFn(ARBITRUM_CHAIN_ID);
    return;
  }
  const hex = (await provider.request({ method: 'eth_chainId' })) as string;
  if (parseInt(hex, 16) === ARBITRUM_CHAIN_ID) return;
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}` }],
  });
}

function createUserExchange(
  provider: Eip1193Provider,
  address: `0x${string}`,
  chainIdOverride?: `0x${string}`,
) {
  return new ExchangeClient({
    transport: transport(),
    wallet: createWebUserWallet(provider, address),
    signatureChainId: chainIdOverride ?? (() => readWalletSignatureChainId(provider)),
  });
}

async function withUserSignedExchange<T>(
  provider: Eip1193Provider,
  address: `0x${string}`,
  fn: (exchange: ExchangeClient) => Promise<T>,
): Promise<T> {
  const run = (chain?: `0x${string}`) => fn(createUserExchange(provider, address, chain));
  try {
    return await run();
  } catch (err) {
    const mismatch = parseTypedDataChainMismatch(err);
    if (!mismatch?.active) throw err;
    return await run(mismatch.active);
  }
}

export type WebSetupStep = 'agent' | 'builderFee' | 'unified';
export type WebSetupPhase = 'signing' | 'done';

const DEFAULT_SETUP_NEEDS: WebSetupStep[] = ['agent', 'builderFee', 'unified'];

export type WebSetupOptions = {
  silent?: boolean;
  confirmTimeoutMs?: number;
  /** Only these steps. Default is agent + builder fee + unified (Expo parity). */
  needs?: WebSetupStep[];
  onStep?: (step: WebSetupStep, phase: WebSetupPhase) => void;
};

function isPooledAbstraction(mode: string | null | undefined): boolean {
  return mode === 'unifiedAccount' || mode === 'portfolioMargin';
}

function isUnifiedAccountActionDisabled(err: unknown): boolean {
  return /unified account is active|disabled when unified/i.test(collectErrorText(err));
}

function asUsd(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function spotRows(raw: unknown): Array<Record<string, unknown>> {
  const rec = raw && typeof raw === 'object' ? (raw as { balances?: unknown }) : {};
  return Array.isArray(rec.balances)
    ? rec.balances.filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    : [];
}

/** Free USDC / USDC including holds / other spot at entryNtl (Expo no-meta path). */
export function readSpotLedger(rows: Array<Record<string, unknown>>): {
  freeUsdc: number;
  usdcTotal: number;
  otherUsd: number;
} {
  let freeUsdc = 0;
  let usdcTotal = 0;
  let otherUsd = 0;
  for (const row of rows) {
    const coin = String(row.coin ?? '').toUpperCase();
    const tokenIdx = Number(row.token);
    const total = asUsd(row.total);
    const hold = asUsd(row.hold);
    const isUsdc = coin === 'USDC' || tokenIdx === 0;
    if (isUsdc) {
      usdcTotal += total;
      const free = total - hold;
      if (free > 0) freeUsdc += free;
      continue;
    }
    otherUsd += asUsd(row.entryNtl);
  }
  return { freeUsdc, usdcTotal, otherUsd };
}

function readPerpLedger(raw: unknown): { account: number; withdrawable: number } {
  if (!raw || typeof raw !== 'object') return { account: 0, withdrawable: 0 };
  const rec = raw as {
    withdrawable?: unknown;
    marginSummary?: { accountValue?: unknown };
  };
  return {
    account: asUsd(rec.marginSummary?.accountValue),
    withdrawable: asUsd(rec.withdrawable) || asUsd(rec.marginSummary?.accountValue),
  };
}

function composeHlUsd(args: {
  rows: Array<Record<string, unknown>>;
  perp: { account: number; withdrawable: number };
  unified: boolean;
}): HlUsdBalances {
  const spot = readSpotLedger(args.rows);
  const perpWd = args.unified ? 0 : args.perp.withdrawable;
  const spendable = spot.freeUsdc;
  const trade = spot.usdcTotal + spot.otherUsd + (args.unified ? 0 : args.perp.account);
  const transferable = args.unified ? spendable : spendable + perpWd;
  return {
    unified: args.unified,
    trade,
    transferable,
    spendable,
    spot: spendable,
    perp: perpWd,
    total: spendable + args.perp.withdrawable,
    balances: args.rows,
  };
}

export type HlUsdBalances = {
  unified: boolean;
  /** Expo Trade Balance (`accountValueUsd`). */
  trade: number;
  /** Expo Trade → Wallet max (`withdrawableUsd`). */
  transferable: number;
  /** Expo ticket buy max (free spot USDC). */
  spendable: number;
  /** Free spot USDC (class-transfer source). */
  spot: number;
  /** Perp USDC; 0 when unified so we do not double-count. */
  perp: number;
  /** Raw USDC piles — Bridge2 credit detection. */
  total: number;
  balances: Array<Record<string, unknown>>;
};

export function hlUsdFromSpotRows(
  rows: Array<Record<string, unknown>>,
  perpWithdrawable: number,
  unified: boolean,
): HlUsdBalances {
  return composeHlUsd({
    rows,
    perp: { account: perpWithdrawable, withdrawable: perpWithdrawable },
    unified,
  });
}

export async function fetchHlUsdBalances(userAddress: `0x${string}`): Promise<HlUsdBalances> {
  const url = hlInfoUrl(IS_TESTNET);
  const headers = { 'Content-Type': 'application/json' };
  const [spotRes, perpRes, abstraction] = await Promise.all([
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'spotClearinghouseState', user: userAddress }),
    }),
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'clearinghouseState', user: userAddress }),
    }),
    fetchUserAbstractionMode(userAddress),
  ]);
  return composeHlUsd({
    rows: spotRows(await spotRes.json()),
    perp: readPerpLedger(await perpRes.json()),
    unified: isPooledAbstraction(abstraction),
  });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Bridge2 credits HL **perp** USDC on a new account. Outcome buys spend **spot**.
 * Poll both so the wallet does not sit on “waiting” after Arbitrum confirms.
 */
export async function waitForHlSpotCredit(
  userAddress: `0x${string}`,
  minUsd = 0.01,
  timeoutMs = 180_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { total, trade, spendable } = await fetchHlUsdBalances(userAddress);
      if (total >= minUsd || trade >= minUsd || spendable >= minUsd) return true;
    } catch {
      /* retry */
    }
    await sleep(2000);
  }
  return false;
}

/** Move perp USDC onto spot so HIP-4 orders can spend it. No-op if already on spot. */
export async function ensureSpotUsdc(
  provider: Eip1193Provider,
  userAddress: `0x${string}`,
): Promise<void> {
  const before = await fetchHlUsdBalances(userAddress);
  if (before.spot >= 0.01 || before.perp < 0.05) return;
  const amt = (Math.floor((before.perp + 1e-12) * 100) / 100).toFixed(2);
  if (Number(amt) < 0.01) return;
  await withUserSignedExchange(provider, userAddress, (exchange) =>
    exchange.usdClassTransfer({ amount: amt, toPerp: false }),
  );
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const next = await fetchHlUsdBalances(userAddress).catch(() => null);
    if (next && next.spot >= 0.01) return;
    await sleep(1500);
  }
}

function needsSatisfied(status: WebSetupStatus, needs: WebSetupStep[]): boolean {
  return needs.every((n) => status[n]);
}

export async function setupWebTrading(
  provider: Eip1193Provider,
  userAddress: `0x${string}`,
  opts?: WebSetupOptions,
) {
  const needs = opts?.needs ?? DEFAULT_SETUP_NEEDS;
  const agent = await ensureWebAgent(userAddress);
  try {
    await ensureWebSigningChain(provider);
  } catch (err) {
    console.warn('[orbcast-hl] switch to Arbitrum failed; signing on wallet chain', err);
  }
  let status = await inspectWebSetup(userAddress);
  if (needs.includes('agent') && !status.agent) {
    opts?.onStep?.('agent', 'signing');
    const res = await withUserSignedExchange(provider, userAddress, (exchange) =>
      exchange.approveAgent({ agentAddress: agent.address, agentName: HL_AGENT_NAME }),
    );
    if (import.meta.env.DEV) console.log('[orbcast-hl] approveAgent accepted', res);
    opts?.onStep?.('agent', 'done');
    status = await inspectWebSetup(userAddress);
  }
  if (needs.includes('builderFee') && !status.builderFee) {
    opts?.onStep?.('builderFee', 'signing');
    const res = await withUserSignedExchange(provider, userAddress, (exchange) =>
      exchange.approveBuilderFee({
        builder: BUILDER_ADDRESS,
        maxFeeRate: BUILDER_MAX_FEE_RATE,
      }),
    );
    if (import.meta.env.DEV) console.log('[orbcast-hl] approveBuilderFee accepted', res);
    opts?.onStep?.('builderFee', 'done');
    status = await inspectWebSetup(userAddress);
  }
  if (needs.includes('unified') && !status.unified) {
    opts?.onStep?.('unified', 'signing');
    try {
      const res = await withUserSignedExchange(provider, userAddress, (exchange) =>
        exchange.userSetAbstraction({
          user: userAddress,
          abstraction: 'unifiedAccount',
        }),
      );
      if (import.meta.env.DEV) console.log('[orbcast-hl] userSetAbstraction unified accepted', res);
      opts?.onStep?.('unified', 'done');
    } catch (err) {
      // Web Privy shows a confirm per signature. Dismissing unified must not
      // fail Wallet → Trade after the deposit already landed — Expo auto-signs
      // this step. Split-account class transfer remains the fallback.
      if (!isUserRejected(err)) throw err;
      console.warn('[orbcast-hl] unified skipped (confirmation cancelled)');
    }
  }
}

export async function runWebTradingSetup(
  provider: Eip1193Provider,
  userAddress: `0x${string}`,
  opts?: WebSetupOptions,
): Promise<boolean> {
  const needs = opts?.needs ?? DEFAULT_SETUP_NEEDS;
  let unifiedSigned = false;
  try {
    await setupWebTrading(provider, userAddress, {
      ...opts,
      onStep: (step, phase) => {
        if (step === 'unified' && phase === 'done') unifiedSigned = true;
        opts?.onStep?.(step, phase);
      },
    });
  } catch (err) {
    console.error('[orbcast-hl] setup failed', err);
    throw new Error(formatWebWalletError(err));
  }
  const confirmNeeds = needs.filter((n) => n !== 'unified' || unifiedSigned);
  const deadline = Date.now() + (opts?.confirmTimeoutMs ?? 12_000);
  let last = await inspectWebSetup(userAddress).catch(() => null);
  while (last && !needsSatisfied(last, confirmNeeds) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    last = await inspectWebSetup(userAddress).catch(() => last);
  }
  return !!last && needsSatisfied(last, confirmNeeds);
}

/**
 * Agent + builder fee + unified account (if missing).
 * Split accounts still get a perp→spot class transfer; unified accounts skip it
 * (`usdClassTransfer` is disabled in that mode — same as Expo).
 *
 * Each missing step is its own Privy confirm on web. Already-done steps are skipped.
 */
export async function prepareWebAccount(
  provider: Eip1193Provider,
  userAddress: `0x${string}`,
  _status?: WebSetupStatus | null,
): Promise<WebSetupStatus> {
  const current = await inspectWebSetup(userAddress);
  const needs: WebSetupStep[] = [];
  if (!current.agent) needs.push('agent');
  if (!current.builderFee) needs.push('builderFee');
  if (!current.unified) needs.push('unified');
  if (needs.length) {
    await runWebTradingSetup(provider, userAddress, { needs });
  }
  const after = await inspectWebSetup(userAddress);
  if (!after.unified) {
    try {
      await ensureSpotUsdc(provider, userAddress);
    } catch (err) {
      if (!isUnifiedAccountActionDisabled(err)) throw err;
    }
  }
  return inspectWebSetup(userAddress);
}

async function fetchUserAbstractionMode(userAddress: `0x${string}`): Promise<string | null> {
  try {
    const res = await fetch(hlInfoUrl(IS_TESTNET), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userAbstraction', user: userAddress }),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

export async function inspectWebSetup(userAddress: `0x${string}`): Promise<WebSetupStatus> {
  let agent = await loadAgent(network, userAddress);
  if (!agent) {
    await new Promise((r) => setTimeout(r, 75));
    agent = await loadAgent(network, userAddress);
  }
  if (!agent) {
    const cached = readCachedWebSetup(userAddress);
    if (cached?.allComplete) return cached;
  }
  let agentOk = false;
  if (agent) {
    const res = await fetch(hlInfoUrl(IS_TESTNET), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'extraAgents', user: userAddress }),
    });
    const extras = (await res.json()) as Array<{ address?: string; validUntil?: number }>;
    const now = Date.now();
    agentOk = Array.isArray(extras)
      ? extras.some((a) => {
          if (a.address?.toLowerCase() !== agent.address.toLowerCase()) return false;
          const until = Number(a.validUntil ?? 0);
          const untilMs = until > 0 && until < 1e12 ? until * 1000 : until;
          return !untilMs || untilMs > now;
        })
      : false;
  }
  const [feeRes, abstraction] = await Promise.all([
    fetch(hlInfoUrl(IS_TESTNET), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'maxBuilderFee', user: userAddress, builder: BUILDER_ADDRESS }),
    }),
    fetchUserAbstractionMode(userAddress),
  ]);
  const approved = Number(await feeRes.json());
  const builderFee = Number.isFinite(approved) && approved >= cachedFeeTenths;
  const unified = isPooledAbstraction(abstraction);
  const status: WebSetupStatus = {
    agent: agentOk,
    builderFee,
    unified,
    allComplete: agentOk && builderFee && unified,
  };
  writeCachedWebSetup(userAddress, status);
  return status;
}

/** Move spot USDC onto perp so withdraw3 can send it out. No-op if perp already covers amount. */
export async function ensurePerpUsdc(
  provider: Eip1193Provider,
  userAddress: `0x${string}`,
  amountUsd: number,
): Promise<void> {
  const before = await fetchHlUsdBalances(userAddress);
  if (before.perp + 0.01 >= amountUsd) return;
  const need = Math.max(0, amountUsd - before.perp);
  const fromSpot = Math.min(before.spot, need);
  const amt = (Math.floor((fromSpot + 1e-12) * 100) / 100).toFixed(2);
  if (Number(amt) < 0.01) return;
  await withUserSignedExchange(provider, userAddress, (exchange) =>
    exchange.usdClassTransfer({ amount: amt, toPerp: true }),
  );
}

export async function withdrawUsdc(
  provider: Eip1193Provider,
  userAddress: `0x${string}`,
  destination: `0x${string}`,
  amountUsd: string,
) {
  try {
    await ensureWebSigningChain(provider);
  } catch {
    /* continue; mismatch retry covers the rest */
  }
  const amt = Number(amountUsd);
  if (Number.isFinite(amt) && amt > 0) {
    const unified = (await inspectWebSetup(userAddress).catch(() => null))?.unified;
    if (!unified) {
      try {
        await ensurePerpUsdc(provider, userAddress, amt);
      } catch (err) {
        if (!isUnifiedAccountActionDisabled(err)) throw err;
      }
    }
  }
  await withUserSignedExchange(provider, userAddress, (exchange) =>
    exchange.withdraw3({ destination, amount: amountUsd }),
  );
}

export function registerWebHip4Runtime() {
  registerHip4Runtime({
    infoUrl: () => hlInfoUrl(IS_TESTNET),
    exchangeUrl: () => hlExchangeUrl(IS_TESTNET),
    wsUrl: () => hlWsUrl(IS_TESTNET),
    isTestnet: () => IS_TESTNET,
    agentExchange: async () => {
      const agent = await ensureWebAgent();
      return new ExchangeClient({
        transport: transport(),
        wallet: privateKeyToAccount(agent.privateKey),
      });
    },
    getBuilderAddress: () => BUILDER_ADDRESS,
    getBuilderFeeTenthsBps: () => cachedFeeTenths,
  });
}
