/**
 * Review ticket before an order, then a fill/resting receipt or a reject.
 * Web port of frontend/src/components/sports/OrderTicketModal.tsx — same
 * `hip4.order.*` copy keys and the same confirm → receipt phases.
 */
import { useCallback, useEffect } from 'react';
import { interpolate, useCopy } from '../lib/copy';
import { IconAlert, IconCheck, IconClose } from './icons';
import { RollingNumber } from './RollingNumber';
import { YES_COLOR } from './outcomeColors';

export type OrderTicketPayload = {
  tradeSide: 'buy' | 'sell';
  sideName: string;
  heading: string;
  shares: number;
  usd: number;
  px: number | null;
  accent: string;
  closingAll: boolean;
  wait?: boolean;
  fillHint?: string;
};

export type OrderTicketStatus = 'filled' | 'resting' | 'unknown';
export type OrderTicketPhase = 'confirm' | 'receipt' | 'error';
export type OrderTicketError = { title: string; message: string };

type Props = {
  open: boolean;
  phase: OrderTicketPhase;
  payload: OrderTicketPayload | null;
  status?: OrderTicketStatus;
  error?: OrderTicketError | null;
  busy?: boolean;
  /** Confirm phase: price/shares follow the live mid. */
  livePrice?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

function formatShares(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return n.toFixed(1);
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCents(px: number | null): string {
  if (px == null || !Number.isFinite(px)) return '—';
  return `${Math.round(px * 100)}¢`;
}

function MetricRow({
  label,
  value,
  format,
  strong,
  live,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  strong?: boolean;
  live?: boolean;
}) {
  const { hip4 } = useCopy();
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-3)]">
        {label}
        {live ? (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent-dark)]">
              {hip4.order.live}
            </span>
          </span>
        ) : null}
      </span>
      <RollingNumber
        value={value}
        format={format}
        durationMs={400}
        emptyText="—"
        className={strong ? 'text-base font-extrabold' : 'text-[15px] font-semibold'}
      />
    </div>
  );
}

export function OrderTicketModal({
  open,
  phase,
  payload,
  status,
  error,
  busy,
  livePrice,
  onConfirm,
  onClose,
}: Props) {
  const { hip4 } = useCopy();

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

  const isBuy = payload.tradeSide === 'buy';
  const isReceipt = phase === 'receipt';
  const isError = phase === 'error';
  const accent = payload.accent || YES_COLOR;
  const actionColor = isBuy ? accent : 'var(--danger)';

  const headline = isError
    ? error?.title || hip4.order.failed
    : isReceipt
      ? status === 'resting'
        ? hip4.order.resting
        : status === 'unknown'
          ? hip4.order.sent
          : isBuy
            ? hip4.order.acquired
            : hip4.order.sold
      : hip4.order.review;

  const subhead = isError
    ? error?.message || ''
    : isReceipt
      ? status === 'resting'
        ? hip4.order.restingHint
        : isBuy
          ? hip4.order.acquiredHint
          : hip4.order.soldHint
      : payload.wait
        ? hip4.order.waitHint
        : hip4.order.reviewHint;

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
                <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6Z" />
                <path d="M13 5v2m0 10v2m0-8v2" />
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

        <p className="text-[17px] font-bold leading-snug">{payload.heading}</p>
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

        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="rounded-full px-2.5 py-1 text-[13px] font-extrabold uppercase tracking-wide"
            style={{ background: `${isBuy ? accent : '#DC2626'}22`, color: actionColor }}
          >
            {isBuy ? hip4.ticket.buy : hip4.ticket.sell}
          </span>
          <span className="min-w-0 truncate text-xl font-extrabold">{payload.sideName}</span>
        </div>

        <MetricRow
          label={hip4.order.shares}
          value={payload.shares > 0 ? payload.shares : null}
          format={formatShares}
          strong
        />
        <MetricRow
          label={isBuy ? hip4.order.amount : hip4.order.proceeds}
          value={Number.isFinite(payload.usd) ? payload.usd : null}
          format={formatUsd}
          strong
        />
        <MetricRow
          label={hip4.order.price}
          value={payload.px}
          format={(n) => formatCents(n)}
          strong={!!livePrice}
          live={livePrice}
        />
        <div className="flex items-center justify-between py-1.5">
          <span className="text-[13px] font-medium text-[var(--text-3)]">{hip4.order.type}</span>
          <span className="text-[15px] font-semibold">
            {payload.wait ? hip4.order.wait : hip4.order.fillNow}
          </span>
        </div>
        {payload.fillHint ? (
          <p className="mt-1 text-xs font-medium text-[var(--text-2)]">{payload.fillHint}</p>
        ) : null}
        {payload.closingAll ? (
          <p className="mt-1 text-xs font-medium text-[var(--text-2)]">
            {interpolate(hip4.order.closeNote, { name: payload.sideName })}
          </p>
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
