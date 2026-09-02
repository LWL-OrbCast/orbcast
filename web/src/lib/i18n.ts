import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../frontend/src/i18n/locales/en.json';
import zh from '../../../frontend/src/i18n/locales/zh.json';
import ko from '../../../frontend/src/i18n/locales/ko.json';
import { SHOW_LANGUAGE_UI } from '../../../frontend/src/i18n/builderFlags';

export { SHOW_LANGUAGE_UI };

const LANGUAGE_KEY = 'hip4_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];
export type LocaleBundle = typeof en;

export function isLanguageCode(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((l) => l.code === value);
}

export function normalizeLang(code: string | undefined): LanguageCode {
  const base = (code ?? 'en').split('-')[0]?.toLowerCase() ?? 'en';
  return isLanguageCode(base) ? base : 'en';
}

function readSavedLanguage(): LanguageCode {
  if (!SHOW_LANGUAGE_UI) return 'en';
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && isLanguageCode(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'en';
}

export function applyDocumentLang(code: LanguageCode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
}

export async function changeLanguage(code: LanguageCode): Promise<void> {
  try {
    localStorage.setItem(LANGUAGE_KEY, code);
  } catch {
    /* ignore */
  }
  await i18n.changeLanguage(code);
  applyDocumentLang(code);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function mergeDeep<T extends Record<string, unknown>>(base: T, over: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const prev = out[k];
    out[k] = isRecord(prev) && isRecord(v) ? mergeDeep(prev, v) : v;
  }
  return out as T;
}

const snapshots = new Map<LanguageCode, LocaleBundle>();

export function currentBundle(): LocaleBundle {
  const lang = normalizeLang(i18n.resolvedLanguage ?? i18n.language);
  const cached = snapshots.get(lang);
  if (cached) return cached;
  const over = i18n.getResourceBundle(lang, 'translation') as LocaleBundle | undefined;
  const snap = lang === 'en' || !over ? en : mergeDeep(en as Record<string, unknown>, over as Record<string, unknown>) as LocaleBundle;
  snapshots.set(lang, snap);
  return snap;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ko: { translation: ko },
  },
  lng: readSavedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

applyDocumentLang(normalizeLang(i18n.resolvedLanguage ?? i18n.language));

i18n.on('languageChanged', (lng) => {
  snapshots.delete(normalizeLang(lng));
});

export default i18n;
