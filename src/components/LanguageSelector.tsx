import React, { useState } from 'react';
import { Globe, Check, ChevronDown, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useTranslation } from '../context/LanguageContext';
import { AppLanguage } from '../lib/languages';

interface LanguageSelectorProps {
  onSelect?: () => void;
  className?: string;
  defaultExpanded?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  onSelect,
  className = '',
  defaultExpanded = false,
}) => {
  const { language, setLanguage, t, currentLang, languages } = useTranslation();
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const handleSelectLanguage = (lang: AppLanguage) => {
    setLanguage(lang.code);
    toast.success(lang.confirmText, {
      icon: lang.flag,
      duration: 2500,
    });
    if (onSelect) {
      onSelect();
    }
  };

  return (
    <div className={`w-full rounded-2xl bg-zinc-900/90 border border-zinc-800/90 overflow-hidden shadow-lg transition-all ${className}`}>
      {/* Header Button / Current Selection Preview */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3.5 hover:bg-zinc-800/60 transition-colors text-left group cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0 group-hover:scale-105 transition-transform">
            <Globe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white group-hover:text-teal-400 transition-colors">
                {t('nav_languageSettings', 'Til sozlamalari')}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                {currentLang.badge}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
              <span>{currentLang.flag}</span>
              <span className="font-semibold text-zinc-300">{currentLang.nativeName}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs font-semibold text-teal-400 hidden xs:inline-block">
            {isExpanded ? t('nav_close', 'Yopish') : t('nav_selectLanguage', 'Tanlash')}
          </span>
          <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 group-hover:text-white">
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-teal-400' : ''}`} />
          </div>
        </div>
      </button>

      {/* Expandable Languages List */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-zinc-800/80 bg-zinc-950/70"
          >
            <div className="p-2 space-y-1.5">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-teal-400" />
                <span>{t('nav_availableLanguages', 'Mavjud tillar:')}</span>
              </div>

              {languages.map((lang) => {
                const isSelected = lang.code === language;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleSelectLanguage(lang)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-500/15 border border-teal-500/40 text-white shadow-sm'
                        : 'hover:bg-zinc-800/80 text-zinc-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg shrink-0 leading-none">{lang.flag}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isSelected ? 'text-teal-300' : 'text-zinc-200'}`}>
                            {lang.nativeName}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                            isSelected ? 'bg-teal-500/25 text-teal-200' : 'bg-zinc-800/90 text-zinc-400'
                          }`}>
                            {lang.badge}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {lang.sublabel}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-black shrink-0 ml-2 shadow-sm">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
