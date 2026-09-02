import { useEffect, useRef, useState } from 'react';
import { useCopy } from '../lib/copy';
import i18n, {
  SHOW_LANGUAGE_UI,
  changeLanguage,
  SUPPORTED_LANGUAGES,
  normalizeLang,
  type LanguageCode,
} from '../lib/i18n';
import { IconCheck, IconClose } from './icons';
import ukFlag from '../../../frontend/assets/images/united-kingdom-circle.webp';
import cnFlag from '../../../frontend/assets/images/china-circle.webp';
import krFlag from '../../../frontend/assets/images/south-korea-circle.webp';

const LANG_FLAG: Record<LanguageCode, string> = {
  en: ukFlag,
  zh: cnFlag,
  ko: krFlag,
};

function LangFlag({ code, size }: { code: LanguageCode; size: number }) {
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-2)]"
      style={{ width: size, height: size }}
    >
      <img
        src={LANG_FLAG[code] ?? LANG_FLAG.en}
        alt=""
        width={size}
        height={size}
        className="block h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

export function LanguagePicker() {
  const { language, common } = useCopy();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = normalizeLang(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!SHOW_LANGUAGE_UI) return null;

  const select = (code: LanguageCode) => {
    void changeLanguage(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={language.selectLanguage}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-white p-0"
      >
        <img
          src={LANG_FLAG[current]}
          alt=""
          width={32}
          height={32}
          className="block h-full w-full rounded-full object-cover"
          draggable={false}
        />
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--border)] bg-white py-1 shadow-lg">
          <div className="flex items-center justify-between px-3 py-2.5">
            <p className="text-sm font-extrabold">{language.selectLanguage}</p>
            <button
              type="button"
              aria-label={common.close}
              className="rounded-full p-1 text-[var(--text-3)] hover:bg-[var(--bg-2)]"
              onClick={() => setOpen(false)}
            >
              <IconClose size={16} />
            </button>
          </div>
          {SUPPORTED_LANGUAGES.map((item) => {
            const on = item.code === current;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => select(item.code)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                  on ? 'bg-[#ECFDF3]' : 'hover:bg-[var(--bg-2)]'
                }`}
              >
                <LangFlag code={item.code} size={28} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${on ? 'text-[var(--accent-dark)]' : ''}`}>
                    {item.nativeName}
                  </span>
                  <span className="block text-[11px] text-[var(--text-3)]">{item.name}</span>
                </span>
                {on ? <IconCheck size={16} className="shrink-0 text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
