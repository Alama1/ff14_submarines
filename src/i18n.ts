import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };

export const LANGS = ['en', 'fr', 'de'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_STORAGE_KEY = 'ff14_lang';

/** Auto-adjust to the user's browser locale unless they picked a language manually. */
export function detectLang(
  saved: string | null,
  browserLangs: readonly string[]
): string {
  if (saved && (LANGS as readonly string[]).includes(saved)) return saved;
  for (const b of browserLangs) {
    const l = b.slice(0, 2).toLowerCase();
    if ((LANGS as readonly string[]).includes(l)) return l;
  }
  return 'en';
}

const initial = detectLang(
  localStorage.getItem(LANG_STORAGE_KEY),
  navigator.languages ?? [navigator.language ?? 'en']
);

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (l) => {
  localStorage.setItem(LANG_STORAGE_KEY, l);
  document.documentElement.lang = l;
});

document.documentElement.lang = initial;

export default i18n;
