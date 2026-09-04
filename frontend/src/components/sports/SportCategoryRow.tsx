import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTranslation } from 'react-i18next';
import { CATALOG_CHIPS, type SportChipId } from '../../lib/marketCatalog';

export type { SportChipId };

const CHIP_ICON: Record<SportChipId, keyof typeof Ionicons.glyphMap> = {
  all: 'apps',
  crypto: 'logo-bitcoin',
  stocks: 'briefcase',
  economics: 'stats-chart',
  football: 'football',
  nfl: 'american-football',
  nba: 'basketball',
  basketball: 'basketball',
  tennis: 'tennisball',
  mlb: 'baseball',
  hockey: 'snow',
  mma: 'fitness',
  rugby: 'american-football',
  volleyball: 'baseball',
  afl: 'american-football',
  f1: 'speedometer-outline',
  handball: 'basketball',
  esports: 'game-controller',
};

const TRAY_BG = colors.background.card;

type Props = {
  active: SportChipId;
  onChange: (id: SportChipId) => void;
};

export function SportCategoryRow({ active, onChange }: Props) {
  const { t } = useTranslation();
  const viewW = useRef(0);
  const contentW = useRef(0);
  const offsetX = useRef(0);
  const [showEndFade, setShowEndFade] = useState(false);

  const syncFade = () => {
    setShowEndFade(contentW.current - viewW.current - offsetX.current > 8);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetX.current = e.nativeEvent.contentOffset.x;
    syncFade();
  };

  return (
    <View style={styles.shell}>
      <View style={styles.tray}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          style={styles.scroller}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={(e) => {
            viewW.current = e.nativeEvent.layout.width;
            syncFade();
          }}
          onContentSizeChange={(w) => {
            contentW.current = w;
            syncFade();
          }}
        >
          {CATALOG_CHIPS.map((id) => {
            const on = active === id;
            return (
              <TouchableOpacity
                key={id}
                style={styles.item}
                onPress={() => onChange(id)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                  <Ionicons
                    name={CHIP_ICON[id]}
                    size={16}
                    color={on ? '#FFFFFF' : colors.text.secondary}
                  />
                </View>
                <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                  {t(`hip4.sport.${id}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {showEndFade ? (
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0)', TRAY_BG]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.endFade}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexGrow: 0,
    flexShrink: 0,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 20,
  },
  tray: {
    position: 'relative',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border.primary,
    backgroundColor: TRAY_BG,
    overflow: 'hidden',
  },
  scroller: { flexGrow: 0 },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingRight: 28,
  },
  endFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 36,
  },
  item: {
    width: 64,
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOn: {
    backgroundColor: colors.accent.gold,
    borderColor: colors.accent.goldDark,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  labelOn: {
    color: colors.accent.goldDark,
    fontFamily: fonts.bold,
  },
});
