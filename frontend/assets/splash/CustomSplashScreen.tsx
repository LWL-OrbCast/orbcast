import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface CustomSplashScreenProps {
  onAnimationComplete?: () => void;
}

export default function CustomSplashScreen({ 
  onAnimationComplete 
}: CustomSplashScreenProps) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const shimmerPosition = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    // Sequence of animations
    Animated.sequence([
      // 1. Logo fades in and scales up with spring
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // 2. Brief pause
      Animated.delay(200),
      // 3. Text fades in and slides up
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(textTranslateY, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Subtle shimmer loop on logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerPosition, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerPosition, {
          toValue: -1,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Callback after splash duration
    const timer = setTimeout(() => {
      onAnimationComplete?.();
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const shimmerTranslateX = shimmerPosition.interpolate({
    inputRange: [-1, 1],
    outputRange: [-width * 0.5, width * 0.5],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7F6" />
      
      {/* Background - matches preview */}
      <View style={StyleSheet.absoluteFill} />

      {/* Logo with animations */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <Image
          source={require('../images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        
        {/* Shimmer overlay */}
        <Animated.View
          style={[
            styles.shimmer,
            {
              transform: [{ translateX: shimmerTranslateX }],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(255, 255, 255, 0.1)',
              'transparent',
            ]}
            style={styles.shimmerGradient}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
          />
        </Animated.View>
      </Animated.View>

      {/* App name with gradient text effect */}
      <Animated.View
        style={[
          styles.textContainer,
          {
            opacity: textOpacity,
            transform: [{ translateY: textTranslateY }],
          },
        ]}
      >
        <View style={styles.brandContainer}>
          <Animated.Text style={styles.hyperText}>OrbCast</Animated.Text>
        </View>
        <Animated.Text style={styles.tagline}>
          Trade what happens next
        </Animated.Text>
      </Animated.View>

      {/* Bottom accent line */}
      <View style={styles.bottomAccent}>
        <LinearGradient
          colors={['#22C55E', '#16A34A']}
          style={styles.accentLine}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 28,
  },
  logo: {
    width: 120,
    height: 120,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shimmerGradient: {
    flex: 1,
    width: 60,
  },
  textContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hyperText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 1,
  },
  tradeTextMaskContainer: {
    marginLeft: 0,
  },
  tradeTextMask: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tradeTextFill: {
    opacity: 0,
  },
  tagline: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.45)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  bottomAccent: {
    position: 'absolute',
    bottom: 60,
    width: 60,
    alignItems: 'center',
  },
  accentLine: {
    height: 3,
    width: '100%',
    borderRadius: 2,
  },
});
