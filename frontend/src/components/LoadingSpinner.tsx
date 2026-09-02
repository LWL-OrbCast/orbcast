import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Easing, ViewStyle, ImageStyle, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

/**
 * LoadingSpinner - A branded loading spinner using the OrbCast mark
 * 
 * @example
 * // Basic usage (replaces ActivityIndicator)
 * <LoadingIndicator size="small" />
 * 
 * // Custom size
 * <LoadingSpinner size={40} />
 * 
 * // Full screen loading
 * <LoadingScreen message="Loading assets..." />
 * 
 * // With overlay
 * <LoadingSpinner size="large" overlay />
 */
type LoadingSpinnerProps = {
  size?: 'small' | 'medium' | 'large' | number;
  color?: string;
  style?: ViewStyle;
  overlay?: boolean;
};

const SIZE_MAP = {
  small: 20,
  medium: 32,
  large: 48,
};

export const LoadingSpinner = ({ 
  size = 'medium', 
  color,
  style,
  overlay = false,
}: LoadingSpinnerProps) => {
  const shimmerValue = useRef(new Animated.Value(0)).current;
  const opacityValue = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    // Rotating shimmer animation - sweeps around the circle
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Subtle opacity pulse for breathing effect
    const opacityAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacityValue, {
          toValue: 0.7,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    shimmerAnimation.start();
    opacityAnimation.start();

    return () => {
      shimmerAnimation.stop();
      opacityAnimation.stop();
    };
  }, [shimmerValue, opacityValue]);

  const actualSize = typeof size === 'number' ? size : SIZE_MAP[size];
  const imageSize = actualSize;
  const containerSize = Math.round(actualSize * 1.45);

  // Rotating shimmer - sweeps around the circle
  const shimmerRotation = shimmerValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Shimmer opacity - subtle glint that doesn't overpower the logo
  const shimmerOpacity = shimmerValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 0.4, 0, 0.4, 0],
  });

  const containerStyle: ViewStyle = {
    width: containerSize,
    height: containerSize,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: containerSize / 2,
    ...(overlay && {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      zIndex: 1000,
    }),
    ...style,
  };

  return (
    <View style={containerStyle}>
      <Animated.View
        style={{
          width: imageSize,
          height: imageSize,
          opacity: opacityValue,
        }}
      >
        <Image
          source={require('../../assets/images/orbcast-logo-circle.png')}
          style={{
            width: imageSize,
            height: imageSize,
            tintColor: color,
          }}
          resizeMode="contain"
        />
      </Animated.View>
      
      {/* Rotating white shimmer overlay - sweeps around the circle */}
      <Animated.View
        style={{
          position: 'absolute',
          width: containerSize,
          height: containerSize,
          transform: [{ rotate: shimmerRotation }],
          opacity: shimmerOpacity,
        }}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['transparent', 'rgba(255, 255, 255, 0.25)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: containerSize / 2,
          }}
        />
      </Animated.View>
    </View>
  );
};

// Convenience component for full-screen loading
export const LoadingScreen = ({ 
  message,
  size = 'large',
}: { 
  message?: string;
  size?: 'small' | 'medium' | 'large' | number;
}) => {
  return (
    <View style={loadingScreenStyles.container}>
      <LoadingSpinner size={size} />
      {message && <Text style={loadingScreenStyles.message}>{message}</Text>}
    </View>
  );
};

// Convenience component for inline loading (replaces ActivityIndicator)
export const LoadingIndicator = ({ 
  size = 'small',
  color,
  style,
}: {
  size?: 'small' | 'medium' | 'large' | number;
  color?: string;
  style?: ViewStyle;
}) => {
  return <LoadingSpinner size={size} color={color} style={style} />;
};

const loadingScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
  message: {
    marginTop: 16,
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '600',
  },
});
