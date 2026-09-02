import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchBuilderConfig } from '../lib/api';
import { useWebAuth } from '../lib/auth';
import { BUILDER_FEE_TENTHS } from '../lib/config';
import { useCopy } from '../lib/copy';
import { formatBuilderPercent } from '../lib/builderFee';

export function FeesPage() {
  const { fees: feesCopy } = useCopy();
  const { address } = useWebAuth();
  const feeQ = useQuery({
    queryKey: ['api', 'builder-config', address],
    queryFn: () => fetchBuilderConfig(address ?? undefined),
  });
  const tenths =
    typeof feeQ.data?.fee === 'number'
      ? Math.min(Math.max(0, Math.floor(feeQ.data.fee)), BUILDER_FEE_TENTHS)
      : BUILDER_FEE_TENTHS;
  const sell = formatBuilderPercent(tenths, feesCopy.free);

  return (
    <div className="max-w-3xl">
      <Link to="/wallet" className="text-sm font-semibold text-[var(--text-2)]">
        ← {feesCopy.title}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold">{feesCopy.title}</h1>
      <p className="mt-3 text-sm text-[var(--text-2)]">{feesCopy.tradingFeesNote}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-[var(--border)] bg-white p-5">
        <div>
          <div className="text-xs font-bold uppercase text-[var(--text-3)]">{feesCopy.binance}</div>
          <div className="text-lg font-extrabold line-through">0.100%</div>
          <div className="text-xs text-[var(--text-3)]">{feesCopy.standardUser}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-[var(--accent-dark)]">OrbCast</div>
          <div className="text-lg font-extrabold text-[var(--accent-dark)]">{feesCopy.free}</div>
          <div className="text-xs text-[var(--accent-dark)]">{feesCopy.startsAt}</div>
        </div>
      </div>

      <h2 className="mt-6 font-extrabold">{feesCopy.tradingFees}</h2>
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-[var(--text-3)]">
            <th className="py-2">{feesCopy.market}</th>
            <th>{feesCopy.buy}</th>
            <th>{feesCopy.sell}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-[var(--border)]">
            <td className="py-3">
              <div className="font-bold">{feesCopy.categories.predictions}</div>
              <div className="text-xs text-[var(--text-3)]">{feesCopy.categories.predictionsAssets}</div>
            </td>
            <td className="font-bold text-[var(--yes)]">{feesCopy.free}</td>
            <td className="font-bold">{sell}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-8 font-extrabold">{feesCopy.otherFees}</h2>
      <ul className="mt-2 space-y-2 text-sm">
        <li className="flex justify-between border-b border-[var(--border)] py-2">
          <span>{feesCopy.other.walletCreation}</span>
          <span className="font-bold">{feesCopy.free}</span>
        </li>
        <li className="flex justify-between border-b border-[var(--border)] py-2">
          <span>{feesCopy.other.deposits}</span>
          <span className="font-bold">{feesCopy.free}</span>
        </li>
        <li className="flex justify-between border-b border-[var(--border)] py-2">
          <span>{feesCopy.other.walletToTrade}</span>
          <span className="font-bold">{feesCopy.free}</span>
        </li>
        <li className="flex justify-between border-b border-[var(--border)] py-2">
          <span>{feesCopy.other.tradeToWallet}</span>
          <span className="font-bold">1 USDC</span>
        </li>
        <li className="flex justify-between py-2">
          <span>{feesCopy.other.withdrawals}</span>
          <span className="font-bold">{feesCopy.free}</span>
        </li>
      </ul>
      <p className="mt-4 text-xs text-[var(--text-3)]">{feesCopy.rewardsNote}</p>
    </div>
  );
}
