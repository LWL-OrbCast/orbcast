import React, { useLayoutEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** Fade the home hero when the featured match identity changes. */
export function FeaturedHeroFade({ id, children }: { id: string; children: React.ReactNode }) {
  const opacity = useSharedValue(1);
  const [node, setNode] = useState(children);
  const idRef = useRef(id);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      idRef.current = id;
      setNode(children);
      return;
    }
    if (id === idRef.current) {
      setNode(children);
      return;
    }
    idRef.current = id;
    opacity.value = 0;
    setNode(children);
    opacity.value = withTiming(1, { duration: 380 });
  }, [id, children, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{node}</Animated.View>;
}
