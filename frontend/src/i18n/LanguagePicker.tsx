import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { SHOW_LANGUAGE_UI, SUPPORTED_LANGUAGES, changeLanguage, RTL_LANGUAGES, type LanguageCode } from './index';
import { LANG_FLAG_SOURCE } from './langFlags';

export type LanguagePickerVariant = 'default' | 'headerInline';

function LangFlag({
  code,
  size,
  bordered = true,
}: {
  code: LanguageCode;
  size: number;
  bordered?: boolean;
}) {
  const src = LANG_FLAG_SOURCE[code] ?? LANG_FLAG_SOURCE.en;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
        borderColor: colors.border.primary,
        backgroundColor: colors.background.card,
      }}
    >
      <Image
        source={src}
        style={{ width: size, height: size }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

export function LanguagePicker({ variant = 'default' }: { variant?: LanguagePickerVariant } = {}) {
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(false);
  const currentLang = (SUPPORTED_LANGUAGES.some((l) => l.code === i18n.language)
    ? i18n.language
    : 'en') as LanguageCode;

  if (!SHOW_LANGUAGE_UI) return null;

  const handleSelect = async (code: LanguageCode) => {
    if (code === currentLang) {
      setVisible(false);
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    const wasRTL = RTL_LANGUAGES.includes(currentLang);
    const willBeRTL = RTL_LANGUAGES.includes(code);
    
    const needsRestart = await changeLanguage(code);
    
    if (needsRestart && Platform.OS !== 'web') {
      // RTL direction changed - requires restart
      Alert.alert(
        t('language.restartRequiredTitle', { defaultValue: 'Restart Required' }),
        t('language.restartRequiredMessage', { 
          defaultValue: 'App restart required to apply layout changes. Please close and reopen the app.' 
        }),
        [
          {
            text: t('common.ok', { defaultValue: 'OK' }),
            onPress: () => {
              // On native, we can't programmatically restart, so just close the modal
              setVisible(false);
            },
          },
        ]
      );
    } else {
      setVisible(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={variant === 'headerInline' ? styles.headerInlineTrigger : styles.iconButton}
        onPress={() => setVisible(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={t('language.selectLanguage')}
      >
        <LangFlag
          code={currentLang}
          size={variant === 'headerInline' ? 22 : 28}
          bordered
        />
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
              <Text style={styles.title}>{t('language.selectLanguage')}</Text>
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
              {SUPPORTED_LANGUAGES.map((item) => {
                const isSelected = item.code === currentLang;
                return (
                  <TouchableOpacity
                    key={item.code}
                    style={[styles.item, isSelected && styles.itemSelected]}
                    onPress={() => handleSelect(item.code)}
                    activeOpacity={0.7}
                  >
                    <LangFlag code={item.code} size={28} />
                    <View style={styles.itemTextContainer}>
                      <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>
                        {item.nativeName}
                      </Text>
                      <Text style={styles.itemEnglish}>{item.name}</Text>
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
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Left segment of header locale pill when display-currency UI is enabled. */
  headerInlineTrigger: {
    height: 34,
    paddingLeft: 12,
    paddingRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
