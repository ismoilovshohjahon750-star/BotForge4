export type LanguageCode = 'uz_lat' | 'uz_cyr' | 'ru' | 'en';

export interface AppLanguage {
  code: LanguageCode;
  name: string;
  nativeName: string;
  badge: string;
  sublabel: string;
  flag: string;
  confirmText: string;
}

export const APP_LANGUAGES: AppLanguage[] = [
  {
    code: 'uz_lat',
    name: "Oʻzbekcha",
    nativeName: "Oʻzbekcha (Lotin)",
    badge: "Davlat tili",
    sublabel: "Oʻzbekiston Respublikasi",
    flag: "🇺🇿",
    confirmText: "Til tanlandi: Oʻzbekcha",
  },
  {
    code: 'uz_cyr',
    name: "Ўзбекча",
    nativeName: "Ўзбекча (Кирилл)",
    badge: "Давлат тили",
    sublabel: "Кирилл алифбосида",
    flag: "🇺🇿",
    confirmText: "Тил танланди: Ўзбекча",
  },
  {
    code: 'ru',
    name: "Русский",
    nativeName: "Русский",
    badge: "Русский",
    sublabel: "Русский язык",
    flag: "🇷🇺",
    confirmText: "Язык выбран: Русский",
  },
  {
    code: 'en',
    name: "English",
    nativeName: "English",
    badge: "Global",
    sublabel: "English language",
    flag: "🇬🇧",
    confirmText: "Language selected: English",
  },
];

export const getSavedLanguage = (): LanguageCode => {
  if (typeof window === 'undefined') return 'uz_lat';
  try {
    const saved = localStorage.getItem('cloudbot_language') as LanguageCode;
    if (saved && APP_LANGUAGES.some(l => l.code === saved)) {
      return saved;
    }
  } catch (_) {}
  return 'uz_lat';
};

export const setSavedLanguage = (code: LanguageCode): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('cloudbot_language', code);
    window.dispatchEvent(new CustomEvent('cloudbot_language_changed', { detail: code }));
  } catch (_) {}
};
