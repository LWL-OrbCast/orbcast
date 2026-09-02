import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { fonts } from '../../theme/fonts';
import { YES_COLOR } from './OddsPill';
import { colors } from '../../theme/colors';

export type ChartTick = {
  id: string;
  px: number;
  signedUsd: number;
};

type Props = {
  ticks: ChartTick[];
  height: number;
  plotWidth: number;
  onDone: (id: string) => void;
};

const MAX_VISIBLE = 5;
const TICK_LIFE_MS = 1600;
/** Fast dissolve before unmount — long enough to read as a fade, not a pop. */
const EXIT_FADE_MS = 120;
const EASE = Easing.bezier(0.4, 0.0, 0.2, 1);

function formatTick(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '−';
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${k >= 10 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  if (abs >= 10) return `${sign}$${Math.round(abs)}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(1)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

function TickBubble({
  tick,
  index,
  onDone,
}: {
  tick: ChartTick;
  index: number;
  onDone: (id: string) => void;
}) {
  const buy = tick.signedUsd >= 0;
  const color = buy ? YES_COLOR : colors.status.error;
  const fade = useSharedValue(1);
  const leaving = useRef(false);

  useEffect(() => {
    if (leaving.current) return;
    fade.value = withTiming(Math.max(0.28, 1 - index * 0.18), { duration: 180, easing: EASE });
  }, [index, fade]);

  useEffect(() => {
    leaving.current = false;
    const fadeAt = Math.max(0, TICK_LIFE_MS - EXIT_FADE_MS);
    const fadeTimer = setTimeout(() => {
      leaving.current = true;
      fade.value = withTiming(0, { duration: EXIT_FADE_MS, easing: EASE });
    }, fadeAt);
    const doneTimer = setTimeout(() => onDone(tick.id), TICK_LIFE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [tick.id, onDone, fade]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View
      entering={FadeIn.duration(140).easing(EASE)}
      exiting={FadeOut.duration(EXIT_FADE_MS).easing(EASE)}
      layout={LinearTransition.duration(180).easing(EASE)}
      pointerEvents="none"
    >
      <Animated.View style={[styles.bubble, { borderColor: color }, fadeStyle]}>
        <Text style={[styles.label, { color }]}>{formatTick(tick.signedUsd)}</Text>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Right-edge cassette tape: newest print always takes the top slot,
 * older ones slide down and fade. No overlapping price-anchored badges.
 */
export function ChartTradeTicks({ ticks, onDone }: Props) {
  const lane = ticks.slice(0, MAX_VISIBLE);
  return (
    <Animated.View style={styles.lane} pointerEvents="none">
      {lane.map((tick, i) => (
        <TickBubble key={tick.id} tick={tick} index={i} onDone={onDone} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lane: {
    position: 'absolute',
    top: 6,
    right: 6,
    alignItems: 'flex-end',
    gap: 4,
  },
  bubble: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  label: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
