import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAddress, isAddress, parseUnits } from 'viem';
import {
  depositWithPermit,
  fetchRelayerAddress,
  fetchTransferLimit,
  transferWithPermit,
} from '../lib/api';
import { fetchArbUsdc, fetchUsdcNonce } from '../lib/arb';
import { useWebAuth } from '../lib/auth';
import { ARBITRUM_CHAIN_ID, ARBITRUM_USDC, HL_BRIDGE2 } from '../lib/config';
import { interpolate, useCopy } from '../lib/copy';
import { setHlDeposit, setHlWithdraw } from '../lib/fundsPending';
import { useSpotAccount } from '../lib/useSpotAccount';
import { buildWalletTransferIntentTypedData } from '../../../frontend/src/lib/walletTransferIntent';
import {
  formatWebWalletError,
  inspectWebSetup,
  readCachedWebSetup,
  waitForHlSpotCredit,
  withdrawUsdc,
  prepareWebAccount,
} from '../lib/webKernel';
import { AddressQr } from './AddressQr';
import { IconAlert, IconCheck, IconChevron, IconCopy } from './icons';
import { ProfileAvatar } from './ProfileAvatar';
import { AuthGate, Skel, WalletSkeleton } from './skeleton';
import {
  TransferTicketModal,
  type TransferKind,
  type TransferTicketError,
  type TransferTicketPhase,
} from './TransferTicketModal';
import arbIcon from '../../../frontend/assets/images/symbols/arb-icon.webp';

const MIN_USDC = 5;
const MIN_WITHDRAW_USDC = 2;
const MIN_EXTERNAL_USDC = 5;

function floorUsd2(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return (Math.floor((n + 1e-12) * 100) / 100).toFixed(2);
}

function sanitizeUsd(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot < 0) return cleaned;
  const whole = cleaned.slice(0, dot);
  const frac = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return cleaned.endsWith('.') && frac.length === 0 ? `${whole}.` : `${whole}.${frac}`;
}

function parseUsd(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : NaN;
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UsdAmountField({
  value,
  onChange,
  disabled,
  suffix,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  suffix: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
      <input
        value={value}
        onChange={(e) => onChange(sanitizeUsd(e.target.value))}
        placeholder="0"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
      />
      <span className="shrink-0 text-xs font-bold text-[var(--text-3)]">{suffix}</span>
    </div>
  );
}

function QuickPctRow({
  available,
  disabled,
  onPick,
  maxLabel,
}: {
  available: number;
  disabled?: boolean;
  onPick: (amount: string) => void;
  maxLabel: string;
}) {
  const chips: Array<{ label: string; fraction: number }> = [
    { label: '25%', fraction: 0.25 },
    { label: '50%', fraction: 0.5 },
    { label: maxLabel, fraction: 1 },
  ];
  return (
    <div className="mt-2 flex gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          disabled={disabled || available <= 0}
          onClick={() => onPick(floorUsd2(available * chip.fraction))}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] py-1.5 text-xs font-bold text-[var(--text-2)] transition hover:border-[var(--accent)] hover:text-[var(--accent-dark)] disabled:opacity-40"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export function WalletPage() {
  const {
    common: commonCopy,
    deposit: depositCopy,
    hip4,
    profile: profileCopy,
    withdraw: withdrawCopy,
  } = useCopy();
  const { authenticated, address, email, getProvider, getAccessToken, switchChain, signingReady } = useWebAuth();
  const spot = useSpotAccount(address, authenticated);
  const qc = useQueryClient();
  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [extAmt, setExtAmt] = useState('');
  const [extDest, setExtDest] = useState('');
  const [extOpen, setExtOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{
    kind: TransferKind;
    phase: TransferTicketPhase;
    amount: number;
    destination?: string;
    error?: TransferTicketError | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{ title: string; body: string } | null>(null);
  const [transferPhase, setTransferPhase] = useState<'idle' | 'permit' | 'credit' | 'spot' | 'agent'>('idle');
  const [justEnabled, setJustEnabled] = useState(false);

  const arbUsdc = useQuery({
    queryKey: ['arb', 'usdc', address],
    queryFn: () => fetchArbUsdc(address!),
    enabled: !!address,
    refetchInterval: 15_000,
  });

  const cachedSetup = address ? readCachedWebSetup(address) : undefined;
  const setupQ = useQuery({
    queryKey: ['hip4', 'setup', address],
    queryFn: () => inspectWebSetup(address!),
    enabled: !!address && authenticated && signingReady,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous ?? cachedSetup,
  });

  const limitQ = useQuery({
    queryKey: ['wallet', 'transfer-limit', address],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { remaining: 10, resetInSeconds: null as number | null };
      return fetchTransferLimit(address!, token);
    },
    enabled: !!address && extOpen,
  });

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const depositMut = useMutation({
    mutationFn: async (amtStr: string) => {
      setMsg(null);
      setTransferPhase('permit');
      if (!address) throw new Error(depositCopy.noEmbeddedWallet);
      const amt = Number(amtStr);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error(depositCopy.invalidAmount);
      if (amt < MIN_USDC) throw new Error(interpolate(depositCopy.minimumUsdc, { min: MIN_USDC }));
      if (arbUsdc.data != null && amt > arbUsdc.data + 1e-9) throw new Error(depositCopy.insufficientUsdc);
      const provider = await getProvider();
      if (!provider) throw new Error(depositCopy.noEmbeddedWallet);
      await switchChain(ARBITRUM_CHAIN_ID);
      const amountBase = parseUnits(amt.toFixed(6), 6);
      const nonce = await fetchUsdcNonce(address);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: ARBITRUM_CHAIN_ID,
          verifyingContract: ARBITRUM_USDC,
        },
        message: {
          owner: address,
          spender: HL_BRIDGE2,
          value: amountBase.toString(),
          nonce: nonce.toString(),
          deadline: String(deadline),
        },
      };
      const signature = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      })) as string;
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in again to deposit.');
      await depositWithPermit(
        { user: address, usd: amountBase.toString(), deadline, signature },
        token,
      );
      return {
        amtStr,
        baselineTradeUsd: spot.usdc,
        provider,
      };
    },
    onMutate: (amtStr) => {
      setDepositAmt('');
      return { amtStr };
    },
    onSuccess: (result) => {
      setHlDeposit(
        {
          amount: result.amtStr,
          startedAt: Date.now(),
          baselineTradeUsd: result.baselineTradeUsd,
        },
        address,
      );
      setTicket((cur) => (cur?.kind === 'toTrade' ? { ...cur, phase: 'receipt' } : cur));
      void qc.invalidateQueries();
      void (async () => {
        if (!address) return;
        const landed = await waitForHlSpotCredit(address);
        if (!landed) return;
        try {
          const status = await prepareWebAccount(result.provider, address, setupQ.data);
          qc.setQueryData(['hip4', 'setup', address], status);
          if (status.allComplete) {
            setJustEnabled(true);
            window.setTimeout(() => setJustEnabled(false), 6000);
          }
        } catch {
          /* Enable trading card remains if setup still needs a tap */
        }
      })();
    },
    onError: (e: unknown, amtStr) => {
      setDepositAmt(amtStr);
      setTicket((cur) =>
        cur?.kind === 'toTrade'
          ? {
              ...cur,
              phase: 'error',
              error: {
                title: depositCopy.transferDidntGoThrough,
                message: formatWebWalletError(e),
              },
            }
          : cur,
      );
    },
    onSettled: () => setTransferPhase('idle'),
  });

  const enableMut = useMutation({
    mutationFn: async () => {
      setMsg(null);
      if (!address) throw new Error(depositCopy.noEmbeddedWallet);
      const provider = await getProvider();
      if (!provider) throw new Error(depositCopy.noEmbeddedWallet);
      await switchChain(ARBITRUM_CHAIN_ID);
      setTransferPhase('agent');
      const status = await prepareWebAccount(provider, address, setupQ.data);
      qc.setQueryData(['hip4', 'setup', address], status);
      if (!status.agent) throw new Error(hip4.wallet.confirmTradingAccess);
      return status;
    },
    onSuccess: (status) => {
      if (status.allComplete) {
        setJustEnabled(true);
        window.setTimeout(() => setJustEnabled(false), 6000);
      }
      void qc.invalidateQueries();
    },
    onError: (e: unknown) => setMsg(formatWebWalletError(e)),
    onSettled: () => setTransferPhase('idle'),
  });

  const withdrawMut = useMutation({
    mutationFn: async (amtStr: string) => {
      setMsg(null);
      if (!address) throw new Error(depositCopy.noEmbeddedWallet);
      const amt = Number(amtStr);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error(depositCopy.invalidAmount);
      if (amt < MIN_WITHDRAW_USDC) {
        throw new Error(interpolate(depositCopy.minimumUsdc, { min: MIN_WITHDRAW_USDC }));
      }
      if (amt > spot.transferable + 0.01) throw new Error(depositCopy.notEnoughTrade);
      const provider = await getProvider();
      if (!provider) throw new Error(depositCopy.noEmbeddedWallet);
      await switchChain(ARBITRUM_CHAIN_ID);
      await withdrawUsdc(provider, address, address, amt.toFixed(2));
      return { amtStr, baselineWalletRaw: arbUsdc.data ?? 0 };
    },
    onMutate: () => {
      setWithdrawAmt('');
    },
    onSuccess: (result) => {
      setHlWithdraw(
        {
          amount: result.amtStr,
          startedAt: Date.now(),
          baselineWalletRaw: result.baselineWalletRaw,
        },
        address,
      );
      setTicket((cur) => (cur?.kind === 'toWallet' ? { ...cur, phase: 'receipt' } : cur));
      void qc.invalidateQueries();
    },
    onError: (e: unknown, amtStr) => {
      setWithdrawAmt(amtStr);
      setTicket((cur) =>
        cur?.kind === 'toWallet'
          ? {
              ...cur,
              phase: 'error',
              error: {
                title: depositCopy.transferDidntGoThrough,
                message: formatWebWalletError(e),
              },
            }
          : cur,
      );
    },
  });

  const extMut = useMutation({
    mutationFn: async (args: { amount: string; dest: string }) => {
      setMsg(null);
      if (!address) throw new Error(depositCopy.noEmbeddedWallet);
      if (limitQ.data && limitQ.data.remaining === 0) {
        throw new Error(profileCopy.dailyLimitReached);
      }
      if (!isAddress(args.dest.trim())) {
        throw new Error(profileCopy.invalidDestinationAddress);
      }
      if (getAddress(args.dest.trim()) === getAddress(address)) {
        throw new Error(withdrawCopy.sameWallet);
      }
      const amt = Number(args.amount);
      if (!Number.isFinite(amt) || amt < MIN_EXTERNAL_USDC) {
        throw new Error(withdrawCopy.minTransfer);
      }
      if (arbUsdc.data == null || amt > arbUsdc.data + 1e-9) {
        throw new Error(withdrawCopy.exceedsBalance);
      }
      const provider = await getProvider();
      if (!provider) throw new Error(depositCopy.noEmbeddedWallet);
      await switchChain(ARBITRUM_CHAIN_ID);

      const from = getAddress(address);
      const destination = getAddress(args.dest.trim());
      const amountBase = parseUnits(amt.toFixed(6), 6);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const { relayer } = await fetchRelayerAddress(from);
      if (!relayer || !isAddress(relayer)) throw new Error('Relayer not available');
      const checksummedRelayer = getAddress(relayer);
      const nonce = await fetchUsdcNonce(from);
      const amountBaseStr = amountBase.toString();

      const intentTypedData = buildWalletTransferIntentTypedData({
        owner: from,
        destination,
        amount: amountBaseStr,
        deadline,
        relayer: checksummedRelayer,
      });
      const intentSignature = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [from, JSON.stringify(intentTypedData)],
      })) as string;

      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: ARBITRUM_CHAIN_ID,
          verifyingContract: ARBITRUM_USDC,
        },
        message: {
          owner: from,
          spender: checksummedRelayer,
          value: amountBaseStr,
          nonce: nonce.toString(),
          deadline: String(deadline),
        },
      };
      const signature = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [from, JSON.stringify(typedData)],
      })) as string;

      const token = await getAccessToken();
      if (!token) throw new Error('Sign in again to withdraw.');
      return transferWithPermit(
        {
          user: from,
          destination,
          usd: amountBaseStr,
          deadline,
          signature,
          intent_signature: intentSignature,
          signed_nonce: Number(nonce),
        },
        token,
      );
    },
    onMutate: (args) => {
      setExtAmt('');
      setExtDest('');
      return args;
    },
    onSuccess: () => {
      setTicket((cur) => (cur?.kind === 'external' ? { ...cur, phase: 'receipt' } : cur));
      void qc.invalidateQueries();
    },
    onError: (e: unknown, args) => {
      setExtAmt(args.amount);
      setExtDest(args.dest);
      setTicket((cur) =>
        cur?.kind === 'external'
          ? {
              ...cur,
              phase: 'error',
              error: {
                title: withdrawCopy.withdrawDidntGoThrough,
                message: formatWebWalletError(e),
              },
            }
          : cur,
      );
    },
  });

  const walletUsdc = arbUsdc.data ?? 0;
  const tradeUsdc = spot.usdc;
  const transferableUsdc = spot.transferable;
  const balancesPending = arbUsdc.isPending || !spot.hydrated;
  const canOpenAccount = walletUsdc + 1e-9 >= MIN_USDC;
  // Never treat "still loading / Privy not ready" as incomplete. That is what
  // flashed Enable trading on refresh for wallets that already finished setup.
  const setupConfirmed = signingReady && setupQ.isFetched && !setupQ.isPlaceholderData;
  const needsSetup = setupConfirmed && !!setupQ.data && !setupQ.data.allComplete;
  const transferAmt = parseUsd(depositAmt);
  const withdrawAmtNum = parseUsd(withdrawAmt);
  const extAmtNum = parseUsd(extAmt);
  const hasDepositAmt = depositAmt.trim().length > 0 && Number.isFinite(transferAmt) && transferAmt > 0;
  const hasWithdrawAmt = withdrawAmt.trim().length > 0 && Number.isFinite(withdrawAmtNum) && withdrawAmtNum > 0;
  const hasExtAmt = extAmt.trim().length > 0 && Number.isFinite(extAmtNum) && extAmtNum > 0;
  const belowMin = hasDepositAmt && transferAmt < MIN_USDC;
  const overWallet = hasDepositAmt && transferAmt > walletUsdc + 1e-9;
  const belowWithdrawMin = hasWithdrawAmt && withdrawAmtNum < MIN_WITHDRAW_USDC;
  const overTrade = hasWithdrawAmt && withdrawAmtNum > transferableUsdc + 0.01;
  const extDestOk = isAddress(extDest.trim());
  const extDestInvalid = extDest.trim().length > 0 && !extDestOk;
  const extDestOwn =
    extDestOk && address != null && extDest.trim().toLowerCase() === address.toLowerCase();
  const belowExtMin = hasExtAmt && extAmtNum < MIN_EXTERNAL_USDC;
  const overExtWallet = hasExtAmt && extAmtNum > walletUsdc + 1e-9;
  const extLimitHit = limitQ.data?.remaining === 0;
  const canSubmitDeposit =
    !balancesPending &&
    hasDepositAmt &&
    !belowMin &&
    !overWallet &&
    canOpenAccount;
  const canSubmitWithdraw =
    !balancesPending &&
    hasWithdrawAmt &&
    !belowWithdrawMin &&
    !overTrade;
  const canSubmitExt =
    !balancesPending &&
    hasExtAmt &&
    extDestOk &&
    !extDestOwn &&
    !belowExtMin &&
    !overExtWallet &&
    !extLimitHit &&
    !extMut.isPending;
  const showTradeToWalletHint = tradeUsdc > 0.01 && walletUsdc + 1e-9 < MIN_EXTERNAL_USDC;
  const transferBusyLabel =
    transferPhase === 'agent'
      ? hip4.wallet.confirmTradingAccess
      : transferPhase === 'spot'
        ? hip4.wallet.movingToSpot
        : transferPhase === 'credit'
          ? hip4.wallet.waitingForCredit
          : depositCopy.loading;
  const needsFinishSetup = needsSetup && tradeUsdc > 0.01;
  const ticketBusy =
    (ticket?.kind === 'toTrade' && depositMut.isPending) ||
    (ticket?.kind === 'toWallet' && withdrawMut.isPending) ||
    (ticket?.kind === 'external' && extMut.isPending);
  const ticketBusyHint =
    ticket?.kind === 'toTrade'
      ? transferBusyLabel
      : ticket?.kind === 'toWallet'
        ? depositCopy.loading
        : ticket?.kind === 'external'
          ? commonCopy.processing
          : undefined;

  const openTicket = (kind: TransferKind) => {
    setMsg(null);
    if (kind === 'toTrade') {
      setTicket({ kind, phase: 'confirm', amount: transferAmt });
      return;
    }
    if (kind === 'toWallet') {
      setTicket({ kind, phase: 'confirm', amount: withdrawAmtNum });
      return;
    }
    setTicket({
      kind,
      phase: 'confirm',
      amount: extAmtNum,
      destination: getAddress(extDest.trim()),
    });
  };

  const confirmTicket = () => {
    if (!ticket || ticket.phase !== 'confirm' || ticketBusy) return;
    if (ticket.kind === 'toTrade') {
      depositMut.mutate(ticket.amount.toFixed(2));
      return;
    }
    if (ticket.kind === 'toWallet') {
      withdrawMut.mutate(ticket.amount.toFixed(2));
      return;
    }
    if (!ticket.destination) return;
    extMut.mutate({ amount: ticket.amount.toFixed(2), dest: ticket.destination });
  };

  const closeTicket = () => {
    if (ticketBusy) return;
    setTicket(null);
  };

  return (
    <AuthGate
      skeleton={<WalletSkeleton />}
      title={hip4.nav.wallet}
      body={depositCopy.noEmbeddedWallet}
      cta={hip4.header.signIn}
    >
      {(signed) => (
        <div className="grid w-full min-w-0 gap-4">
          <div className="flex items-center gap-3">
            <ProfileAvatar size={48} editable />
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold leading-tight">{hip4.nav.wallet}</h1>
              {email ? (
                <p className="mt-0.5 truncate text-sm font-medium text-[var(--text-2)]" title={email}>
                  {email}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid w-full min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">
            <div className="grid min-w-0 gap-4">
              <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                <div className="flex flex-col sm:flex-row">
                  <div className="flex shrink-0 flex-col items-center justify-center gap-2 bg-[var(--bg-2)] px-5 py-5 sm:w-[168px] sm:px-4">
                    <div className="rounded-xl bg-white p-1.5 shadow-sm">
                      <AddressQr value={signed} size={120} />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--text)]">
                      <img
                        src={arbIcon}
                        alt=""
                        width={12}
                        height={12}
                        className="h-3 w-3 rounded-[2px] object-contain"
                      />
                      {profileCopy.arbitrumNetwork}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 p-5">
                    <h2 className="text-base font-extrabold">{depositCopy.depositUsdc}</h2>
                    <p className="mt-1 text-xs text-[var(--text-2)]">
                      {depositCopy.sendUsdcArbitrumPrefix}
                      <span className="font-bold text-[var(--accent-dark)]">
                        {depositCopy.sendUsdcArbitrumNetwork}
                      </span>
                      {depositCopy.sendUsdcArbitrumSuffix}
                    </p>
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#22C55E15] px-3 py-2">
                      <img
                        src={arbIcon}
                        alt=""
                        width={16}
                        height={16}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px] object-contain"
                      />
                      <span className="min-w-0 flex-1 break-all font-mono text-[11px] font-medium leading-4 text-[var(--accent-dark)]">
                        {signed}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyAddress()}
                        aria-label={commonCopy.copyAddress}
                        className="shrink-0 p-0.5 text-[var(--text-3)]"
                      >
                        {copied ? (
                          <IconCheck size={15} className="text-[var(--accent-dark)]" />
                        ) : (
                          <IconCopy size={15} />
                        )}
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start border-t border-[var(--border)] pt-4">
                      <div className="flex min-w-0 justify-end pr-8 sm:pr-10">
                        <div className="flex min-w-0 flex-col items-center text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setBalanceInfo({
                                title: depositCopy.walletBalance,
                                body: depositCopy.walletBalanceInfoNoBank,
                              })
                            }
                            className="inline-flex max-w-full items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)]"
                          >
                            <IconAlert size={13} className="shrink-0" />
                            <span className="truncate">{depositCopy.walletBalance}</span>
                          </button>
                          <div className="mt-0.5 text-lg font-extrabold">
                            {balancesPending ? (
                              <Skel className="h-7 w-24" />
                            ) : (
                              <>
                                ${(arbUsdc.data ?? 0).toFixed(2)}
                                <span className="ml-1 text-xs font-semibold text-[var(--text-3)]">USDC</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div
                        className="flex select-none items-center self-stretch px-3 text-xl font-light leading-none text-[var(--text-3)] sm:px-4"
                        aria-hidden
                      >
                        |
                      </div>
                      <div className="flex min-w-0 justify-start pl-8 sm:pl-10">
                        <div className="flex min-w-0 flex-col items-center text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setBalanceInfo({
                                title: depositCopy.tradeBalance,
                                body: depositCopy.tradeBalanceInfoNoBank,
                              })
                            }
                            className="inline-flex max-w-full items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)]"
                          >
                            <IconAlert size={13} className="shrink-0" />
                            <span className="truncate">{depositCopy.tradeBalance}</span>
                          </button>
                          <div className="mt-0.5 text-lg font-extrabold">
                            {balancesPending ? (
                              <Skel className="h-7 w-24" />
                            ) : (
                              <>
                                ${spot.usdc.toFixed(2)}
                                <span className="ml-1 text-xs font-semibold text-[var(--text-3)]">USDC</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                <button
                  type="button"
                  aria-expanded={extOpen}
                  onClick={() => setExtOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="text-sm font-extrabold">{profileCopy.withdrawExternal}</span>
                  <IconChevron
                    size={16}
                    className={`shrink-0 text-[var(--text-3)] transition-transform ${extOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {extOpen ? (
                  <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
                    <p className="text-xs text-[var(--text-2)]">{withdrawCopy.description}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      {withdrawCopy.arbitrumNetworkNote}
                    </p>
                    {showTradeToWalletHint ? (
                      <p className="mt-2 text-xs font-semibold text-[var(--text-2)]">
                        {withdrawCopy.tradeBalanceWalletFirstHint}
                      </p>
                    ) : null}
                    <p className="mt-2.5 text-xs text-[var(--text-2)]">
                      {withdrawCopy.walletBalance}{' '}
                      <span className="font-bold text-[var(--text)]">
                        {balancesPending ? '—' : `${floorUsd2(walletUsdc)} ${commonCopy.USDC}`}
                      </span>
                    </p>
                    <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-3)]">
                      {withdrawCopy.destinationAddress}
                    </label>
                    <input
                      value={extDest}
                      onChange={(e) => setExtDest(e.target.value)}
                      placeholder="0x…"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={extMut.isPending}
                      className={`mt-1.5 w-full rounded-xl border px-3 py-2 font-mono text-xs ${
                        extDestInvalid || extDestOwn
                          ? 'border-amber-400'
                          : 'border-[var(--border)]'
                      }`}
                    />
                    {extDestInvalid ? (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">
                        {withdrawCopy.invalidAddress}
                      </p>
                    ) : extDestOwn ? (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">
                        {withdrawCopy.sameWallet}
                      </p>
                    ) : null}
                    <UsdAmountField
                      value={extAmt}
                      onChange={setExtAmt}
                      disabled={extMut.isPending}
                      suffix={commonCopy.USDC}
                    />
                    <QuickPctRow
                      available={walletUsdc}
                      disabled={extMut.isPending || balancesPending}
                      onPick={setExtAmt}
                      maxLabel={hip4.ticket.max}
                    />
                    <button
                      type="button"
                      disabled={!canSubmitExt}
                      onClick={() => openTicket('external')}
                      className="btn-stamp btn-no mt-3 w-full py-2.5 text-sm"
                    >
                      {withdrawCopy.withdraw}
                    </button>
                    {extLimitHit ? (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">
                        {profileCopy.dailyLimitReached}
                        {limitQ.data?.resetInSeconds
                          ? ` ${interpolate(withdrawCopy.resetsIn, {
                              hours: Math.ceil(limitQ.data.resetInSeconds / 3600),
                            })}`
                          : ` ${withdrawCopy.tryAgainLater}`}
                      </p>
                    ) : overExtWallet ? (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">
                        {withdrawCopy.exceedsBalance}
                      </p>
                    ) : belowExtMin ? (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">
                        {withdrawCopy.minTransfer}
                      </p>
                    ) : hasExtAmt && !overExtWallet ? (
                      <p className="mt-1.5 text-xs text-[var(--text-3)]">
                        {interpolate(withdrawCopy.recipientReceives, { amount: extAmtNum.toFixed(2) })}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-[var(--text-3)]">{withdrawCopy.minUsdc}</p>
                    )}
                  </div>
                ) : null}
              </section>

              {justEnabled ? (
                <section className="flex items-center gap-3 rounded-2xl border border-[var(--accent)] bg-[#22C55E12] p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <IconCheck size={15} strokeWidth={2.5} />
                  </span>
                  <p className="text-sm font-bold text-[var(--accent-dark)]">
                    {hip4.wallet.tradingEnabled}
                  </p>
                </section>
              ) : needsFinishSetup ? (
                <section className="rounded-2xl border border-[var(--accent)] bg-[#22C55E12] p-4">
                  <p className="text-sm font-semibold text-[var(--accent-dark)]">{hip4.wallet.finishSetup}</p>
                  <button
                    type="button"
                    disabled={enableMut.isPending || depositMut.isPending}
                    onClick={() => enableMut.mutate()}
                    className="btn-stamp btn-yes mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-sm"
                  >
                    {enableMut.isPending ? (
                      <>
                        <Spinner />
                        {transferBusyLabel}
                      </>
                    ) : (
                      hip4.wallet.enableTrading
                    )}
                  </button>
                </section>
              ) : null}

              {msg ? <p className="text-sm font-semibold text-[var(--text-2)]">{msg}</p> : null}
            </div>

            <div className="grid min-w-0 content-start gap-4 lg:sticky lg:top-20">
              <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
                <h2 className="font-extrabold">{depositCopy.transferToTrade}</h2>
                <p className="mt-1 text-xs text-[var(--text-3)]">{depositCopy.approx1to2min}</p>
                <p className="mt-1.5 text-xs text-[var(--text-2)]">
                  {depositCopy.availableInWallet}{' '}
                  <span className="font-bold text-[var(--text)]">
                    {balancesPending ? '—' : `${floorUsd2(walletUsdc)} ${commonCopy.USDC}`}
                  </span>
                </p>
                {canOpenAccount && needsSetup ? (
                  <p className="mt-1.5 text-xs text-[var(--accent-dark)]">{hip4.wallet.firstTransferEnables}</p>
                ) : null}
                <UsdAmountField
                  value={depositAmt}
                  onChange={setDepositAmt}
                  disabled={depositMut.isPending}
                  suffix={commonCopy.USDC}
                />
                <QuickPctRow
                  available={walletUsdc}
                  disabled={depositMut.isPending || balancesPending}
                  onPick={setDepositAmt}
                  maxLabel={hip4.ticket.max}
                />
                <button
                  type="button"
                  disabled={depositMut.isPending || !canSubmitDeposit}
                  onClick={() => openTicket('toTrade')}
                  className="btn-stamp btn-yes mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-sm"
                >
                  {depositMut.isPending ? (
                    <>
                      <Spinner />
                      {transferBusyLabel}
                    </>
                  ) : (
                    depositCopy.transferWalletToTrade
                  )}
                </button>
                {overWallet ? (
                  <p className="mt-1.5 text-xs font-semibold text-amber-700">{depositCopy.notEnoughWallet}</p>
                ) : belowMin ? (
                  <p className="mt-1.5 text-xs font-semibold text-amber-700">
                    {interpolate(depositCopy.minimumUsdc, { min: MIN_USDC })}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-[var(--text-3)]">
                    {interpolate(depositCopy.freeNoFees, { min: MIN_USDC })}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
                <h2 className="font-extrabold">{depositCopy.transferToWallet}</h2>
                <p className="mt-1 text-xs text-[var(--text-3)]">{depositCopy.moveFundsBack}</p>
                <p className="mt-1.5 text-xs text-[var(--text-2)]">
                  {depositCopy.transferable}{' '}
                  <span className="font-bold text-[var(--text)]">
                    {balancesPending ? '—' : `$${floorUsd2(transferableUsdc)} ${commonCopy.USDC}`}
                  </span>
                </p>
                <UsdAmountField
                  value={withdrawAmt}
                  onChange={setWithdrawAmt}
                  disabled={withdrawMut.isPending}
                  suffix={commonCopy.USDC}
                />
                <QuickPctRow
                  available={transferableUsdc}
                  disabled={withdrawMut.isPending || balancesPending}
                  onPick={setWithdrawAmt}
                  maxLabel={hip4.ticket.max}
                />
                <button
                  type="button"
                  disabled={withdrawMut.isPending || !canSubmitWithdraw}
                  onClick={() => openTicket('toWallet')}
                  className="btn-stamp btn-no mt-3 flex w-full items-center justify-center py-2.5 text-sm"
                >
                  {withdrawMut.isPending ? depositCopy.loading : depositCopy.transferTradeToWallet}
                </button>
                {overTrade ? (
                  <p className="mt-1.5 text-xs font-semibold text-amber-700">{depositCopy.notEnoughTrade}</p>
                ) : belowWithdrawMin ? (
                  <p className="mt-1.5 text-xs font-semibold text-amber-700">
                    {interpolate(depositCopy.minimumUsdc, { min: MIN_WITHDRAW_USDC })}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-[var(--text-3)]">{depositCopy.withdrawalFee}</p>
                )}
              </section>
            </div>
          </div>
          {balanceInfo ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wallet-balance-info-title"
              onClick={() => setBalanceInfo(null)}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="wallet-balance-info-title" className="text-base font-extrabold">
                  {balanceInfo.title}
                </h3>
                <p className="mt-2 text-sm leading-5 text-[var(--text-2)]">{balanceInfo.body}</p>
                <button
                  type="button"
                  className="btn-stamp btn-primary mt-4 w-full py-2.5 text-sm"
                  onClick={() => setBalanceInfo(null)}
                >
                  {commonCopy.gotIt}
                </button>
              </div>
            </div>
          ) : null}
          <TransferTicketModal
            open={!!ticket}
            phase={ticket?.phase ?? 'confirm'}
            payload={
              ticket
                ? { kind: ticket.kind, amount: ticket.amount, destination: ticket.destination }
                : null
            }
            error={ticket?.error}
            busy={ticketBusy}
            busyHint={ticketBusyHint}
            onConfirm={confirmTicket}
            onClose={closeTicket}
          />
        </div>
      )}
    </AuthGate>
  );
}
