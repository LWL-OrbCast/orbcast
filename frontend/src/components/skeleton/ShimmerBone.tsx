import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';

export const SHIMMER_COLORS = [
  'transparent',
  'rgba(255, 255, 255, 0.35)',
  'rgba(255, 255, 255, 0.7)',
  'rgba(255, 255, 255, 0.35)',
  'transparent',
] as const;

/** Shared shimmer sweep — used by home skeleton placeholders */
export function useShimmerX(outputRange: [number, number] = [-180, 180]) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return shimmer.interpolate({
    inputRange: [0, 1],
    outputRange,
  });
}

export function ShimmerBone({
  style,
  shimmerX,
}: {
  style?: ViewStyle;
  shimmerX: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={[shimmerStyles.bone, style]}>
      <Animated.View
        style={[shimmerStyles.shimmerSweep, { transform: [{ translateX: shimmerX }] }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[...SHIMMER_COLORS]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={shimmerStyles.shimmerGradient}
        />
      </Animated.View>
    </View>
  );
}

export const shimmerStyles = StyleSheet.create({
  bone: {
    backgroundColor: colors.background.skeleton,
    borderRadius: 6,
    overflow: 'hidden',
  },
  shimmerSweep: {
    ...StyleSheet.absoluteFillObject,
    width: '200%',
  },
  shimmerGradient: {
    flex: 1,
  },
});
