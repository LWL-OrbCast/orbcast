/**
 * Review a wallet / trade / external USDC move, then a receipt or reject.
 * Same confirm → receipt chrome as OrderTicketModal.
 */
import { useCallback, useEffect } from 'react';
import { useCopy } from '../lib/copy';
import { IconAlert, IconCheck, IconClose } from './icons';
import { YES_COLOR } from './outcomeColors';

export type TransferKind = 'toTrade' | 'toWallet' | 'external';
export type TransferTicketPhase = 'confirm' | 'receipt' | 'error';
export type TransferTicketError = { title: string; message: string };

export type TransferTicketPayload = {
  kind: TransferKind;
  amount: number;
  destination?: string;
};

type Props = {
  open: boolean;
  phase: TransferTicketPhase;
  payload: TransferTicketPayload | null;
  error?: TransferTicketError | null;
  busy?: boolean;
  busyHint?: string;
  onConfirm: () => void;
  onClose: () => void;
};

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[13px] font-medium text-[var(--text-3)]">{label}</span>
      <span
        className={`min-w-0 truncate text-right ${
          strong ? 'text-base font-extrabold' : 'text-[15px] font-semibold'
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function TransferTicketModal({
  open,
  phase,
  payload,
  error,
  busy,
  busyHint,
  onConfirm,
  onClose,
}: Props) {
  const { deposit: depositCopy, hip4, profile: profileCopy, withdraw: withdrawCopy } = useCopy();

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  if (!open || !payload) return null;

  const isReceipt = phase === 'receipt';
  const isError = phase === 'error';
  const isExternal = payload.kind === 'external';
  const isToTrade = payload.kind === 'toTrade';
  const actionColor = isToTrade ? YES_COLOR : 'var(--danger)';

  const headline = isError
    ? error?.title || (isExternal ? withdrawCopy.withdrawDidntGoThrough : depositCopy.transferDidntGoThrough)
    : isReceipt
      ? isExternal
        ? withdrawCopy.withdrawSent
        : depositCopy.transferComplete
      : isExternal
        ? withdrawCopy.reviewWithdraw
        : depositCopy.reviewTransfer;

  const subhead = isError
    ? error?.message || ''
    : busy && busyHint
      ? busyHint
      : isReceipt
        ? isExternal
          ? withdrawCopy.withdrawSentHint
          : isToTrade
            ? depositCopy.toTradeDoneHint
            : depositCopy.toWalletDoneHint
        : isExternal
          ? withdrawCopy.reviewWithdrawHint
          : isToTrade
            ? depositCopy.reviewHintToTrade
            : depositCopy.reviewHintToWallet;

  const route = isExternal
    ? withdrawCopy.routeExternal
    : isToTrade
      ? depositCopy.routeToTrade
      : depositCopy.routeToWallet;

  const fromLabel = isToTrade || isExternal ? depositCopy.walletShort : depositCopy.tradeShort;
  const toLabel = isToTrade ? depositCopy.tradeShort : depositCopy.walletShort;

  const handleConfirm = () => {
    if (isReceipt || isError) {
      onClose();
      return;
    }
    if (busy) return;
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-label={headline}
    >
      <button
        type="button"
        aria-label={hip4.order.close}
        onClick={handleClose}
        className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.45)]"
        tabIndex={-1}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.25)]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {isError ? (
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--danger)] text-white">
                <IconAlert size={13} />
              </span>
            ) : isReceipt ? (
              <span
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: actionColor }}
              >
                <IconCheck size={13} />
              </span>
            ) : (
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke={actionColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M8 7h11l-3-3M19 7l-3 3" />
                <path d="M16 17H5l3 3M5 17l3-3" />
              </svg>
            )}
            <span className="truncate text-base font-extrabold">{headline}</span>
          </span>
          <button
            type="button"
            onClick={handleClose}
            disabled={!!busy}
            aria-label={hip4.order.close}
            className="shrink-0 bg-transparent p-1 text-[var(--text-2)]"
          >
            <IconClose size={18} />
          </button>
        </div>

        <p className="text-[17px] font-bold leading-snug">{route}</p>
        <p
          className={
            isError
              ? 'mt-1.5 text-[14px] font-medium leading-snug text-[var(--text)]'
              : 'mt-1 text-[13px] font-medium text-[var(--text-3)]'
          }
        >
          {subhead}
        </p>

        <div className="my-3.5 border-t border-dashed border-[var(--border)]" />

        <Row label={depositCopy.amountLabel} value={formatUsd(payload.amount)} strong />
        <Row label={depositCopy.fromLabel} value={fromLabel} />
        {isExternal ? null : <Row label={depositCopy.toLabel} value={toLabel} />}
        <Row
          label={depositCopy.feeLabel}
          value={payload.kind === 'toWallet' ? depositCopy.feeOneUsdc : depositCopy.feeFree}
        />
        {isExternal ? <Row label={withdrawCopy.networkLabel} value={profileCopy.arbitrumNetwork} /> : null}
        {isExternal && payload.destination ? (
          <div className="mt-2 rounded-xl bg-[var(--bg-2)] px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-3)]">
              {withdrawCopy.destinationLabel}
            </p>
            <p className="mt-1 break-all font-mono text-[12px] font-semibold leading-4">
              {payload.destination}
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2.5">
          {!isReceipt && !isError ? (
            <button
              type="button"
              onClick={handleClose}
              disabled={!!busy}
              className="min-h-[48px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] text-[15px] font-bold text-[var(--text-2)]"
            >
              {hip4.order.cancel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!!busy}
            className={`flex min-h-[48px] items-center justify-center rounded-xl text-[15px] font-extrabold text-white ${
              isReceipt || isError ? 'flex-1' : 'flex-[1.2]'
            } ${busy ? 'opacity-85' : ''}`}
            style={{ background: isError ? 'var(--ink)' : isReceipt ? 'var(--ink)' : actionColor }}
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : isError ? (
              hip4.order.gotIt
            ) : isReceipt ? (
              hip4.order.done
            ) : (
              hip4.order.confirm
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
