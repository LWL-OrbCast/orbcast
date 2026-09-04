import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ListedMarket } from '../../lib/hip4';
import { symbolKeyForMarket, symbolObjectFit, type MarketSymbolKey } from '../../lib/marketSymbol';
import { sportGlyph } from '../../lib/sportGlyph';
import { colors } from '../../theme/colors';

const SYMBOL_SOURCE: Record<MarketSymbolKey, ImageSourcePropType> = {
  btc: require('../../../assets/images/symbols/btc-icon.webp'),
  eth: require('../../../assets/images/symbols/eth-icon.webp'),
  sol: require('../../../assets/images/symbols/sol-icon.webp'),
  hype: require('../../../assets/images/symbols/hype-logo.webp'),
  gold: require('../../../assets/images/symbols/gold-icon.webp'),
  oil: require('../../../assets/images/symbols/oil-icon.webp'),
  silver: require('../../../assets/images/symbols/silver-icon.webp'),
  sp500: require('../../../assets/images/symbols/sp500-icon.webp'),
  xyz100: require('../../../assets/images/symbols/xyz100-icon.webp'),
  dram: require('../../../assets/images/symbols/dram-icon.webp'),
  nbis: require('../../../assets/images/symbols/nbis-icon.webp'),
  skhx: require('../../../assets/images/symbols/skhx-icon.webp'),
  sndk: require('../../../assets/images/symbols/sndk-icon.webp'),
  spcx: require('../../../assets/images/symbols/spcx-icon.webp'),
  lol: require('../../../assets/images/symbols/lol-icon.webp'),
  epl: require('../../../assets/images/symbols/epl-icon.webp'),
  nfl: require('../../../assets/images/symbols/nfl-icon.webp'),
  mlb: require('../../../assets/images/symbols/mlb-icon.webp'),
  uefa: require('../../../assets/images/symbols/uefa-icon.webp'),
  fed: require('../../../assets/images/symbols/fed-icon.webp'),
  arsenal: require('../../../assets/images/symbols/arsenal.webp'),
  madrid: require('../../../assets/images/symbols/madrid.webp'),
  mancity: require('../../../assets/images/symbols/mancity.webp'),
  manutd: require('../../../assets/images/symbols/manutd.webp'),
};

type BoxProps = {
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

function SymbolImage({
  symbolKey,
  size,
  radius,
  style,
}: BoxProps & { symbolKey: MarketSymbolKey }) {
  const fit = symbolObjectFit(symbolKey);
  const r = radius ?? Math.round(size * 0.32);
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: r }, style]}>
      <Image
        source={SYMBOL_SOURCE[symbolKey]}
        style={[
          styles.img,
          fit === 'contain' ? styles.imgPad : null,
          { borderRadius: r },
        ]}
        resizeMode={fit}
      />
    </View>
  );
}

export function MarketSymbol({
  market,
  size,
  radius,
  glyphSize,
  questionLevel,
  style,
}: BoxProps & {
  market: ListedMarket;
  glyphSize?: number;
  questionLevel?: boolean;
}) {
  const key = symbolKeyForMarket(market, { questionLevel });
  if (key) {
    return <SymbolImage symbolKey={key} size={size} radius={radius} style={style} />;
  }
  const r = radius ?? Math.round(size * 0.32);
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: r }, style]}>
      <Ionicons
        name={sportGlyph(market)}
        size={glyphSize ?? Math.max(14, Math.round(size * 0.45))}
        color={colors.accent.goldDark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  imgPad: {
    transform: [{ scale: 0.86 }],
  },
});
