import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useAppStore } from '../../store/appStore';
import { ProfileAvatar } from '../ProfileAvatar';
import { CurrencyPicker } from '../CurrencyPicker';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import { SHOW_LANGUAGE_UI } from '../../i18n/builderFlags';
import { SHOW_DISPLAY_CURRENCY_UI } from '../../providers/CurrencyProvider';
import { useTranslation } from 'react-i18next';
import { BRAND_NAME } from '../../lib/brand';
import { usePositionActivity } from '../../hooks/usePositionActivity';
import { navigateRouteOnce } from '../../lib/pushRouteOnce';
import { CatalogSearchModal } from './CatalogSearchModal';

const MARK = require('../../../assets/images/orbcast-logo-circle.png');

type Props = {
  onPressBell?: () => void;
  onPressAvatar: () => void;
  kicker?: string;
};

export function HomeHeader({ onPressBell, onPressAvatar, kicker }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const activity = usePositionActivity();
  const [searchOpen, setSearchOpen] = useState(false);
  const kickerLabel = kicker ?? t('hip4.header.home');
  const positionsLabel =
    activity.badge > 0
      ? `${t('hip4.nav.positions')} (${activity.badge > 99 ? '99+' : activity.badge})`
      : t('hip4.nav.positions');

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <Image source={MARK} style={styles.mark} accessibilityLabel={BRAND_NAME} />
        <View>
          <Text style={styles.wordmark} numberOfLines={1}>
            {BRAND_NAME}
          </Text>
          <Text style={styles.sub}>{kickerLabel}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setSearchOpen(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('hip4.header.search')}
        >
          <Ionicons name="search" size={18} color={colors.text.primary} />
        </TouchableOpacity>
        {onPressBell ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onPressBell}
            activeOpacity={0.8}
            accessibilityLabel={t('hip4.header.notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.text.primary} />
            <View style={styles.dot} />
          </TouchableOpacity>
        ) : null}
        {SHOW_LANGUAGE_UI && SHOW_DISPLAY_CURRENCY_UI ? (
          <View style={styles.localePill}>
            <LanguagePicker variant="headerInline" />
            <View style={styles.localeSep} />
            <CurrencyPicker variant="headerInline" />
          </View>
        ) : SHOW_LANGUAGE_UI ? (
          <LanguagePicker />
        ) : SHOW_DISPLAY_CURRENCY_UI ? (
          <CurrencyPicker />
        ) : null}
        {isAuthenticated ? (
          <>
            <View style={styles.positionsWrap}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigateRouteOnce(router, '/portfolio')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={positionsLabel}
              >
                <Ionicons name="analytics-outline" size={18} color={colors.text.primary} />
              </TouchableOpacity>
              {activity.badge > 0 ? (
                <View style={styles.badge} pointerEvents="none">
                  <Text style={styles.badgeText}>
                    {activity.badge > 99 ? '99+' : activity.badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onPressAvatar}
              activeOpacity={0.8}
              accessibilityLabel={t('hip4.header.wallet')}
            >
              <ProfileAvatar size={40} />
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.authBtns}>
            <TouchableOpacity
              onPress={onPressAvatar}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('hip4.header.logIn')}
              style={styles.logInBtn}
            >
              <Text style={styles.logInLabel}>{t('hip4.header.logIn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onPressAvatar}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('hip4.header.signUp')}
              style={styles.signUpBtn}
            >
              <Text style={styles.signUpLabel}>{t('hip4.header.signUp')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <CatalogSearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  wordmark: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  sub: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.accent.goldDark,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logInBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.text.primary,
    backgroundColor: colors.background.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logInLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.text.primary,
  },
  signUpBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.text.primary,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signUpLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: '#F5F7F6',
  },
  localePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
    overflow: 'hidden',
  },
  localeSep: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: colors.border.accent,
  },
  positionsWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    lineHeight: 12,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.gold,
    borderWidth: 1.5,
    borderColor: colors.background.card,
  },
});
