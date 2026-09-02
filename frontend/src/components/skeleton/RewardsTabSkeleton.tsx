import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
import { ShimmerBone, useShimmerX } from './ShimmerBone';

function AchievementRowSkeleton({ shimmerX }: { shimmerX: ReturnType<typeof useShimmerX> }) {
  return (
    <View style={styles.achievementRow}>
      <ShimmerBone shimmerX={shimmerX} style={styles.achievementIconBone} />
      <View style={styles.achievementTextCol}>
        <ShimmerBone shimmerX={shimmerX} style={styles.achievementTitleBone} />
        <ShimmerBone shimmerX={shimmerX} style={styles.achievementDescBone} />
      </View>
    </View>
  );
}

export function RewardsTabSkeleton() {
  const shimmerX = useShimmerX([-200, 200]);

  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Tier card */}
      <View style={styles.tierCard}>
        <View style={styles.tierTop}>
          <ShimmerBone shimmerX={shimmerX} style={styles.tierBadgeBone} />
          <View style={styles.tierInfoCol}>
            <ShimmerBone shimmerX={shimmerX} style={styles.tierNameBone} />
            <ShimmerBone shimmerX={shimmerX} style={styles.tierSubBone} />
          </View>
          <ShimmerBone shimmerX={shimmerX} style={styles.pointsBone} />
        </View>
        <View style={styles.progressHeader}>
          <ShimmerBone shimmerX={shimmerX} style={styles.progressLabelBone} />
          <ShimmerBone shimmerX={shimmerX} style={styles.progressHintBone} />
        </View>
        <ShimmerBone shimmerX={shimmerX} style={styles.progressTrackBone} />
        <View style={styles.tierLadderRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.ladderItem}>
              <ShimmerBone shimmerX={shimmerX} style={styles.ladderBadgeBone} />
              <ShimmerBone shimmerX={shimmerX} style={styles.ladderLabelBone} />
            </View>
          ))}
        </View>
      </View>

      {/* Volume progress */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <ShimmerBone shimmerX={shimmerX} style={styles.sectionTitleBone} />
          <ShimmerBone shimmerX={shimmerX} style={styles.volumeValueBone} />
        </View>
        <ShimmerBone shimmerX={shimmerX} style={styles.progressTrackBone} />
        <ShimmerBone shimmerX={shimmerX} style={styles.milestoneLineBone} />
      </View>

      {/* Achievements */}
      <View style={styles.sectionCard}>
        <ShimmerBone shimmerX={shimmerX} style={styles.sectionTitleBone} />
        <View style={styles.achievementsList}>
          <AchievementRowSkeleton shimmerX={shimmerX} />
          <AchievementRowSkeleton shimmerX={shimmerX} />
          <AchievementRowSkeleton shimmerX={shimmerX} />
          <AchievementRowSkeleton shimmerX={shimmerX} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  tierCard: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
    gap: 14,
  },
  tierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tierBadgeBone: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  tierInfoCol: {
    flex: 1,
    gap: 8,
  },
  tierNameBone: {
    width: '52%',
    height: 22,
    borderRadius: 5,
  },
  tierSubBone: {
    width: '38%',
    height: 12,
    borderRadius: 4,
  },
  pointsBone: {
    width: 64,
    height: 44,
    borderRadius: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  progressLabelBone: {
    width: 90,
    height: 12,
    borderRadius: 4,
  },
  progressHintBone: {
    flex: 1,
    maxWidth: 140,
    height: 11,
    borderRadius: 4,
  },
  progressTrackBone: {
    width: '100%',
    height: 10,
    borderRadius: 6,
  },
  tierLadderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  ladderItem: {
    alignItems: 'center',
    gap: 6,
  },
  ladderBadgeBone: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  ladderLabelBone: {
    width: 36,
    height: 10,
    borderRadius: 3,
  },
  sectionCard: {
    backgroundColor: colors.background.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleBone: {
    width: '48%',
    height: 16,
    borderRadius: 4,
  },
  volumeValueBone: {
    width: 72,
    height: 18,
    borderRadius: 4,
  },
  milestoneLineBone: {
    width: '85%',
    height: 12,
    borderRadius: 4,
  },
  achievementsList: {
    gap: 8,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.background.elevated,
    gap: 10,
  },
  achievementIconBone: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  achievementTextCol: {
    flex: 1,
    gap: 6,
  },
  achievementTitleBone: {
    width: '55%',
    height: 13,
    borderRadius: 4,
  },
  achievementDescBone: {
    width: '88%',
    height: 11,
    borderRadius: 3,
  },
});
