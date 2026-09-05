import type { ListedMarket } from '@hip4';
import { catalogChipForMarket } from '@hip4/catalog';
import { symbolKeyForMarket, symbolObjectFit, type MarketSymbolKey } from '@hip4/symbol';
import { SportIcon } from './icons';

import btc from '../../../frontend/assets/images/symbols/btc-icon.webp';
import eth from '../../../frontend/assets/images/symbols/eth-icon.webp';
import sol from '../../../frontend/assets/images/symbols/sol-icon.webp';
import hype from '../../../frontend/assets/images/symbols/hype-logo.webp';
import zec from '../../../frontend/assets/images/symbols/zec-icon.webp';
import gold from '../../../frontend/assets/images/symbols/gold-icon.webp';
import oil from '../../../frontend/assets/images/symbols/oil-icon.webp';
import silver from '../../../frontend/assets/images/symbols/silver-icon.webp';
import sp500 from '../../../frontend/assets/images/symbols/sp500-icon.webp';
import xyz100 from '../../../frontend/assets/images/symbols/xyz100-icon.webp';
import dram from '../../../frontend/assets/images/symbols/dram-icon.webp';
import nbis from '../../../frontend/assets/images/symbols/nbis-icon.webp';
import skhx from '../../../frontend/assets/images/symbols/skhx-icon.webp';
import sndk from '../../../frontend/assets/images/symbols/sndk-icon.webp';
import spcx from '../../../frontend/assets/images/symbols/spcx-icon.webp';
import lol from '../../../frontend/assets/images/symbols/lol-icon.webp';
import epl from '../../../frontend/assets/images/symbols/epl-icon.webp';
import nfl from '../../../frontend/assets/images/symbols/nfl-icon.webp';
import mlb from '../../../frontend/assets/images/symbols/mlb-icon.webp';
import uefa from '../../../frontend/assets/images/symbols/uefa-icon.webp';
import fed from '../../../frontend/assets/images/symbols/fed-icon.webp';
import arsenal from '../../../frontend/assets/images/symbols/arsenal.webp';
import madrid from '../../../frontend/assets/images/symbols/madrid.webp';
import mancity from '../../../frontend/assets/images/symbols/mancity.webp';
import manutd from '../../../frontend/assets/images/symbols/manutd.webp';

const SYMBOL_SRC: Record<MarketSymbolKey, string> = {
  btc,
  eth,
  sol,
  hype,
  zec,
  gold,
  oil,
  silver,
  sp500,
  xyz100,
  dram,
  nbis,
  skhx,
  sndk,
  spcx,
  lol,
  epl,
  nfl,
  mlb,
  uefa,
  fed,
  arsenal,
  madrid,
  mancity,
  manutd,
};

function MarkImg({
  symbolKey,
  size,
  className = '',
}: {
  symbolKey: MarketSymbolKey;
  size: number;
  className?: string;
}) {
  const fit = symbolObjectFit(symbolKey);
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-[#ECFDF3] ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={SYMBOL_SRC[symbolKey]}
        alt=""
        draggable={false}
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain p-[12%]'}`}
      />
    </span>
  );
}

export function MarketSymbol({
  market,
  size,
  questionLevel,
  className = '',
}: {
  market: ListedMarket;
  size: number;
  questionLevel?: boolean;
  className?: string;
}) {
  const key = symbolKeyForMarket(market, { questionLevel });
  if (key) {
    return <MarkImg symbolKey={key} size={size} className={className} />;
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-[#ECFDF3] text-[var(--accent-dark)] ${className}`}
      style={{ width: size, height: size }}
    >
      <SportIcon id={catalogChipForMarket(market)} size={Math.max(14, Math.round(size * 0.45))} />
    </span>
  );
}
