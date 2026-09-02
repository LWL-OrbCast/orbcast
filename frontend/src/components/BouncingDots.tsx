/**
 * BouncingDots — three dots bouncing in sequence, used as a lightweight
 * "working on it" indicator (computing a balance total, fetching a live
 * quote, etc.) in place of a static "…" or a plain ActivityIndicator.
 *
 * All three dots share one cycle, staggered so the bounce "travels"
 * left-to-right, and every dot's cycle is padded to the same length so they
 * never drift out of phase.
 *
 * Optional `pulse` fades opacity in place (bounce + brightness pulse).
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { PulseOpacity } from './PulseOpacity';

type BouncingDotsProps = {
  color?: string;
  dotSize?: number;
  style?: ViewStyle;
  /** Brightness pulse (1 ↔ dimmer) while bouncing. */
  pulse?: boolean;
  pulseMinOpacity?: number;
};

export function BouncingDots({
  color = colors.text.primary,
  dotSize = 9,
  style,
  pulse = false,
  pulseMinOpacity = 0.45,
}: BouncingDotsProps) {
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const STAGGER = 150;
    const UP = 280;
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: UP,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: UP,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(2 * STAGGER - delay),
        ]),
      );
    const a1 = make(d1, 0);
    const a2 = make(d2, STAGGER);
    const a3 = make(d3, 2 * STAGGER);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [d1, d2, d3]);

  const dotStyle = (v: Animated.Value) => ({
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: color,
    transform: [
      {
        translateY: v.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -dotSize],
        }),
      },
    ],
  });

  const row = (
    <View style={[styles.row, { height: dotSize * 2, gap: dotSize * 0.78 }]}>
      <Animated.View style={dotStyle(d1)} />
      <Animated.View style={dotStyle(d2)} />
      <Animated.View style={dotStyle(d3)} />
    </View>
  );

  if (pulse) {
    return (
      <PulseOpacity active style={style} minOpacity={pulseMinOpacity}>
        {row}
      </PulseOpacity>
    );
  }

  return <View style={style}>{row}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 2,
  },
});
