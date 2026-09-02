import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { useDisplayCurrency } from '../providers/CurrencyProvider';

type CurrencyHintProps = {
  usd: number | null | undefined;
  /** below = centered under a value; inline = to the left on the same row */
  placement?: 'below' | 'inline';
  textStyle?: TextStyle;
};

/**
 * Subtle local-currency hint for USD-denominated trading values.
 * Only renders when a non-USD display currency is active and rates are ready.
 */
export function CurrencyHint({ usd, placement = 'below', textStyle }: CurrencyHintProps) {
  const { isConverted, isDisplayCurrencyLoading, formatCompactPrice } = useDisplayCurrency();

  if (!isConverted || isDisplayCurrencyLoading) return null;
  if (usd == null || !Number.isFinite(usd)) return null;

  const converted = formatCompactPrice(usd);
  if (converted === '--') return null;

  const label = converted.startsWith('≈') ? converted : `≈ ${converted}`;

  return (
    <Text
      style={[
        placement === 'inline' ? styles.inline : styles.below,
        textStyle,
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit={placement === 'below'}
      minimumFontScale={0.75}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  below: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '600',
    color: colors.text.tertiary,
    textAlign: 'center',
    opacity: 0.85,
  },
  inline: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.tertiary,
    opacity: 0.85,
  },
});
