/** Opacity pulse (breathing) — brightness fades in/out in place. */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type PulseOpacityProps = {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Opacity at the dimmest point of the cycle (default 0.45). */
  minOpacity?: number;
  durationMs?: number;
};

export function PulseOpacity({
  active,
  children,
  style,
  minOpacity = 0.45,
  durationMs = 900,
}: PulseOpacityProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    loopRef.current = null;

    if (!active) {
      opacity.stopAnimation();
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }

    const half = Math.round(durationMs / 2);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: minOpacity,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [active, durationMs, minOpacity, opacity]);

  return (
    <Animated.View style={[style, { opacity }]}>
      {children}
    </Animated.View>
  );
}
