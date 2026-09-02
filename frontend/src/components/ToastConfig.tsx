import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import type { BaseToastProps } from 'react-native-toast-message';

type CustomToastProps = BaseToastProps & { type?: string };

const ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string; border: string }> = {
  success: { name: 'checkmark-circle', color: colors.status.success, border: `${colors.status.success}30` },
  error: { name: 'alert-circle', color: colors.status.error, border: `${colors.status.error}30` },
  info: { name: 'information-circle', color: colors.accent.gold, border: `${colors.accent.gold}30` },
  copied: { name: 'checkmark-circle', color: colors.accent.gold, border: `${colors.accent.gold}30` },
};

const CustomToast = memo(function CustomToast({ text1, text2, type }: CustomToastProps) {
  const cfg = ICONS[type ?? 'info'] ?? ICONS.info;
  return (
    <View style={[styles.container, { borderColor: cfg.border }]}>
      <Ionicons
        name={cfg.name}
        size={20}
        color={cfg.color}
        style={styles.icon}
      />
      <View style={styles.textWrap}>
        {!!text1 && (
          <Text
            style={[styles.title, { color: cfg.color }]}
            numberOfLines={1}
          >
            {text1}
          </Text>
        )}
        {!!text2 && (
          <Text style={styles.message} numberOfLines={2}>
            {text2}
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        }
      : { elevation: 3 }),
  },
  icon: {
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
    lineHeight: 16,
  },
});

export const toastConfig = {
  success: (props: BaseToastProps) => <CustomToast {...props} type="success" />,
  error: (props: BaseToastProps) => <CustomToast {...props} type="error" />,
  info: (props: BaseToastProps) => <CustomToast {...props} type="info" />,
  copied: (props: BaseToastProps) => <CustomToast {...props} type="copied" />,
};
