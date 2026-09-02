import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/**
 * Pitch watermark — stadium rings + a corner bloom. Saturated enough to
 * read as green, kept off the type so the card stays a white ticket.
 */
export function WalletHubCardArt() {
  return (
    <View
      style={styles.host}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 860 540"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <RadialGradient id="whPitchGlow" cx="92%" cy="8%" r="46%">
            <Stop offset="0%" stopColor="#22C55E" stopOpacity={0.38} />
            <Stop offset="55%" stopColor="#22C55E" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="whPitchBand" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#22C55E" stopOpacity={0} />
            <Stop offset="100%" stopColor="#16A34A" stopOpacity={0.16} />
          </LinearGradient>
          <ClipPath id="whClip">
            <Rect x={0} y={0} width={860} height={540} rx={40} ry={40} />
          </ClipPath>
        </Defs>

        <G clipPath="url(#whClip)">
          <Rect x={0} y={0} width={860} height={540} fill="url(#whPitchBand)" />
          <Rect x={0} y={0} width={860} height={540} fill="url(#whPitchGlow)" />
          <Ellipse cx={430} cy={270} rx={88} ry={70} fill="none" stroke="#16A34A" strokeWidth={2.2} opacity={0.28} />
          <Ellipse cx={430} cy={270} rx={138} ry={110} fill="none" stroke="#22C55E" strokeWidth={1.8} opacity={0.24} />
          <Ellipse cx={430} cy={270} rx={188} ry={150} fill="none" stroke="#16A34A" strokeWidth={1.6} opacity={0.2} />
          <Ellipse cx={430} cy={270} rx={240} ry={192} fill="none" stroke="#22C55E" strokeWidth={1.4} opacity={0.16} />
          <Ellipse cx={430} cy={270} rx={294} ry={236} fill="none" stroke="#15803D" strokeWidth={1.2} opacity={0.12} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
