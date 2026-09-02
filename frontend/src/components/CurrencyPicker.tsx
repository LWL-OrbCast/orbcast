import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import {
  SHOW_DISPLAY_CURRENCY_UI,
  SUPPORTED_CURRENCIES,
  useDisplayCurrency,
  type CurrencyCode,
} from '../providers/CurrencyProvider';

export type CurrencyPickerVariant = 'default' | 'headerInline';

export function CurrencyPicker({ variant = 'default' }: { variant?: CurrencyPickerVariant } = {}) {
  const { t } = useTranslation();
  const { currency, setCurrency } = useDisplayCurrency();
  const [visible, setVisible] = useState(false);

  if (!SHOW_DISPLAY_CURRENCY_UI) return null;

  const handleSelect = (code: CurrencyCode) => {
    if (code === currency) {
      setVisible(false);
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setCurrency(code);
    setVisible(false);
  };

  const currentMeta = SUPPORTED_CURRENCIES.find((c) => c.code === currency);

  return (
    <>
      <TouchableOpacity
        style={variant === 'headerInline' ? styles.headerInlineTrigger : styles.iconButton}
        onPress={() => setVisible(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text
          style={variant === 'headerInline' ? styles.headerInlineCode : styles.symbolText}
          allowFontScaling={false}
        >
          {variant === 'headerInline' ? (currentMeta?.code ?? 'USD') : (currentMeta?.symbol ?? '$')}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <TouchableOpacity style={styles.card} activeOpacity={1}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('currency.selectCurrency')}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={22} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator
              persistentScrollbar
              indicatorStyle="white"
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {SUPPORTED_CURRENCIES.map((item) => {
                const isSelected = item.code === currency;
                return (
                  <TouchableOpacity
                    key={item.code}
                    style={[styles.item, isSelected && styles.itemSelected]}
                    onPress={() => handleSelect(item.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.flag}>{item.flag}</Text>
                    <View style={styles.itemTextContainer}>
                      <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>
                        {item.code}
                      </Text>
                      <Text style={styles.itemEnglish}>
                        {item.symbol} · {item.name}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.accent.gold} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <LinearGradient
              colors={['transparent', colors.background.primary]}
              style={styles.bottomFade}
              pointerEvents="none"
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: `${colors.accent.gold}12`,
  },
  symbolText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent.gold,
    textAlign: 'center',
  },
  /** Right segment of header locale pill */
  headerInlineTrigger: {
    height: 34,
    paddingLeft: 8,
    paddingRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInlineCode: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.gold,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.background.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    width: '100%',
    maxWidth: 340,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  list: {
    padding: 8,
  },
  listContent: {
    paddingBottom: 24,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
    gap: 12,
  },
  itemSelected: {
    backgroundColor: `${colors.accent.gold}15`,
  },
  flag: {
    fontSize: 24,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  itemNameSelected: {
    color: colors.accent.gold,
  },
  itemEnglish: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 2,
  },
});
