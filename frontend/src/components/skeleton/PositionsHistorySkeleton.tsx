import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
import { ShimmerBone, useShimmerX } from './ShimmerBone';

function HistoryRowBone({ shimmerX }: { shimmerX: ReturnType<typeof useShimmerX> }) {
  return (
    <View style={styles.row}>
      <ShimmerBone shimmerX={shimmerX} style={styles.badge} />
      <View style={styles.body}>
        <ShimmerBone shimmerX={shimmerX} style={styles.title} />
        <ShimmerBone shimmerX={shimmerX} style={styles.meta} />
      </View>
      <ShimmerBone shimmerX={shimmerX} style={styles.value} />
    </View>
  );
}

export function PositionsHistorySkeleton({ rows = 6 }: { rows?: number }) {
  const shimmerX = useShimmerX([-220, 220]);
  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <HistoryRowBone key={i} shimmerX={shimmerX} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 14,
    marginBottom: 10,
  },
  badge: { width: 40, height: 24, borderRadius: 10 },
  body: { flex: 1, minWidth: 0, gap: 8 },
  title: { height: 14, width: '78%', borderRadius: 6 },
  meta: { height: 11, width: '52%', borderRadius: 6 },
  value: { width: 64, height: 16, borderRadius: 6 },
});
