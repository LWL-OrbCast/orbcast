import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Pressable,
  Image,
  ActivityIndicator,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';

export type SocialLoginMoreOption = {
  id: string;
  icon?: keyof typeof Ionicons.glyphMap;
  imageSource?: ImageSourcePropType;
  labelKey: string;
  accessibilityKey: string;
  hintKey?: string;
};

export type SocialLoginMoreSheetProps = {
  visible: boolean;
  onClose: () => void;
  options: SocialLoginMoreOption[];
  onSelect: (id: string) => void;
  loadingId?: string | null;
  disabled?: boolean;
};

const SHEET_TRAVEL = 400;

export function SocialLoginMoreSheet({
  visible,
  onClose,
  options,
  onSelect,
  loadingId = null,
  disabled = false,
}: SocialLoginMoreSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const prevVisibleRef = useRef(visible);
  const [mounted, setMounted] = useState(false);

  const finishClose = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SHEET_TRAVEL,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      closingRef.current = false;
      if (finished) finishClose();
    });
  }, [slideAnim, backdropAnim, finishClose]);

  const animateOpen = useCallback(() => {
    slideAnim.setValue(SHEET_TRAVEL);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    if (visible && !wasVisible) {
      closingRef.current = false;
      setMounted(true);
      animateOpen();
    } else if (!visible && wasVisible && mounted) {
      animateClose();
    }
    prevVisibleRef.current = visible;
  }, [visible, mounted, animateOpen, animateClose]);

  const handleSelect = useCallback(
    (id: string) => {
      if (disabled || loadingId) return;
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      onSelect(id);
    },
    [disabled, loadingId, onSelect],
  );

  const sheetHeight = useMemo(
    () =>
      56 +
      options.reduce((sum, option) => sum + (option.hintKey ? 76 : 56), 0) +
      72 +
      Math.max(insets.bottom, 16),
    [options, insets.bottom],
  );

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={animateClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={animateClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY: slideAnim }],
              minHeight: sheetHeight,
            },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>
            {t('login.moreOptionsTitle', { defaultValue: 'More ways to sign in' })}
          </Text>

          {options.map((option, index) => {
            const isLoading = loadingId === option.id;
            return (
              <React.Fragment key={option.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <TouchableOpacity
                  style={[styles.optionRow, (disabled || loadingId) && styles.optionRowDisabled]}
                  onPress={() => handleSelect(option.id)}
                  disabled={disabled || !!loadingId}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={
                    option.hintKey
                      ? `${t(option.accessibilityKey)}. ${t(option.hintKey, {
                          defaultValue: 'Requires manual approval for txs',
                        })}`
                      : t(option.accessibilityKey)
                  }
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.text.primary} size="small" style={styles.optionIcon} />
                  ) : option.imageSource ? (
                    <Image source={option.imageSource} style={styles.optionImage} resizeMode="contain" />
                  ) : option.icon ? (
                    <Ionicons name={option.icon} size={22} color={colors.text.primary} style={styles.optionIcon} />
                  ) : null}
                  <View style={styles.optionTextCol}>
                    <Text style={styles.optionLabel}>{t(option.labelKey)}</Text>
                    {option.hintKey ? (
                      <Text style={styles.optionHint}>
                        {t(option.hintKey, { defaultValue: 'Requires manual approval for txs' })}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={animateClose}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', { defaultValue: 'Cancel' })}
          >
            <Text style={styles.cancelText}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.primary,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 14,
  },
  optionRowDisabled: {
    opacity: 0.6,
  },
  optionIcon: {
    width: 24,
    textAlign: 'center',
  },
  optionImage: {
    width: 22,
    height: 22,
  },
  optionTextCol: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  optionHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.tertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.primary,
    marginLeft: 38,
  },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.background.tertiary,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
});
