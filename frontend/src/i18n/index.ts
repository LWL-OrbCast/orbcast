import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import zh from './locales/zh.json';
import ko from './locales/ko.json';
import { SHOW_LANGUAGE_UI } from './builderFlags';

export { SHOW_LANGUAGE_UI } from './builderFlags';

const LANGUAGE_KEY = 'hip4_language';

export const RTL_LANGUAGES = ['ar', 'he'];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  ko: { translation: ko },
};

export function applyRTL(_languageCode: string): boolean {
  return false;
}

export async function getSavedLanguage(): Promise<LanguageCode> {
  if (!SHOW_LANGUAGE_UI) return 'en';
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      return saved as LanguageCode;
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

export async function saveLanguage(code: LanguageCode): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

export async function changeLanguage(code: LanguageCode): Promise<boolean> {
  await saveLanguage(code);
  await i18n.changeLanguage(code);
  return applyRTL(code);
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
