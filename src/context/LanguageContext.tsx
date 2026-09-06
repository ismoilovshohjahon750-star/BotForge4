import React, { createContext, useContext, useState, useEffect } from 'react';
import { APP_LANGUAGES, AppLanguage, LanguageCode, getSavedLanguage, setSavedLanguage } from '../lib/languages';
import { TRANSLATIONS } from '../lib/translations';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string, defaultText?: string) => string;
  currentLang: AppLanguage;
  languages: AppLanguage[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLangState] = useState<LanguageCode>(() => getSavedLanguage());

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<LanguageCode>;
      if (customEvent.detail) {
        setLangState(customEvent.detail);
      } else {
        setLangState(getSavedLanguage());
      }
    };

    window.addEventListener('cloudbot_language_changed', handleLangChange);
    return () => {
      window.removeEventListener('cloudbot_language_changed', handleLangChange);
    };
  }, []);

  const setLanguage = (code: LanguageCode) => {
    setLangState(code);
    setSavedLanguage(code);
  };

  const t = (key: string, defaultText?: string): string => {
    const currentDict = TRANSLATIONS[language] || TRANSLATIONS['uz_lat'];
    if (currentDict && currentDict[key]) {
      return currentDict[key];
    }
    const fallbackDict = TRANSLATIONS['uz_lat'];
    if (fallbackDict && fallbackDict[key]) {
      return fallbackDict[key];
    }
    return defaultText || key;
  };

  const currentLang = APP_LANGUAGES.find(l => l.code === language) || APP_LANGUAGES[0];

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        currentLang,
        languages: APP_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback if used outside provider
    const fallbackLang = getSavedLanguage();
    const currentLang = APP_LANGUAGES.find(l => l.code === fallbackLang) || APP_LANGUAGES[0];
    return {
      language: fallbackLang,
      setLanguage: setSavedLanguage,
      t: (key: string, defaultText?: string) => {
        return TRANSLATIONS[fallbackLang]?.[key] || defaultText || key;
      },
      currentLang,
      languages: APP_LANGUAGES,
    };
  }
  return context;
};
