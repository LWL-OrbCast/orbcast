import React, { useRef } from 'react';
import { Text, StyleSheet, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { RollingNumber } from '../RollingNumber';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  probability: number | null;
  variant?: 'yes' | 'no';
  accent?: string;
  selected?: boolean;
  compact?: boolean;
  onPress?: () => void;
};

export const YES_COLOR = '#22C55E';
export const NO_COLOR = '#A78BFA';
/** Extra legs on a question (Increase / Draw / …). */
export const LEG_PALETTE = ['#22C55E', '#38BDF8', '#A78BFA', '#F59E0B', '#F43F5E', '#14B8A6'] as const;

export const OddsPill = React.memo(function OddsPill({
  label,
  probability,
  variant = 'yes',
  accent,
  selected,
  compact,
  onPress,
}: Props) {
  const color = accent ?? (variant === 'yes' ? YES_COLOR : NO_COLOR);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const look = [
    styles.pill,
    compact && styles.compact,
    { borderColor: color, backgroundColor: selected ? `${color}28` : `${color}14` },
    selected && { borderWidth: 1.5 },
  ];

  const cents = probability != null && Number.isFinite(probability) ? Math.round(probability * 100) : null;
  const lastCents = useRef<number | null>(null);
  const jump = lastCents.current != null && cents != null ? Math.abs(cents - lastCents.current) : 0;
  lastCents.current = cents;

  const inner = (
    <>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.oddsRow, compact && styles.oddsRowCompact]}>
        <RollingNumber
          value={cents}
          format={(n) => `${Math.round(n)}¢`}
          emptyText="—"
          align="left"
          durationMs={jump > 12 ? 0 : 420}
          style={{
            fontSize: compact ? 15 : 18,
            fontWeight: '800',
            color,
            lineHeight: compact ? 18 : 22,
          }}
        />
      </View>
    </>
  );

  if (!onPress) {
    return <Animated.View style={look}>{inner}</Animated.View>;
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 16, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={[look, animated]}
    >
      {inner}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  compact: {
    minHeight: 44,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  oddsRow: {
    marginTop: 2,
    minHeight: 22,
    justifyContent: 'center',
  },
  oddsRowCompact: {
    minHeight: 18,
  },
  odds: {
    fontSize: 18,
    fontWeight: '800',
  },
  oddsCompact: {
    fontSize: 15,
  },
});
