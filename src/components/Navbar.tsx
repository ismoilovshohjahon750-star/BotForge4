import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';
import { Bot, LogOut, LayoutDashboard, ShieldCheck, Menu, X, Coins, LogIn, MessageSquare, Send, ExternalLink, Globe, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { LogoFull } from './Logo';
import { NotificationBell } from './NotificationBell';
import { LanguageSelector } from './LanguageSelector';
import { useTranslation } from '../context/LanguageContext';

export const Navbar: React.FC = () => {
  const { user, isAdmin, logout, login } = useAuth();
  const { t, currentLang, language, setLanguage, languages } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close language popup on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    if (isLangOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLangOpen]);

  const toggleMenu = () => {
    setIsLangOpen(false);
    setIsOpen(!isOpen);
  };
  const closeMenu = () => {
    setIsOpen(false);
    setIsLangOpen(false);
  };

  const handleLogout = async () => {
    closeMenu();
    await logout();
    navigate('/');
  };

  const handleLogin = async () => {
    closeMenu();
    await login();
  };

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/95 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" onClick={closeMenu} className="flex items-center z-50 hover:opacity-90 transition-opacity">
          <LogoFull size={26} showSub={false} />
        </Link>

        {/* Right side controls (Language quick switch, NotificationBell & Hamburger) */}
        <div className="flex items-center gap-2 sm:gap-3 z-50">
          {/* Quick Language Dropdown */}
          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => {
                setIsLangOpen(!isLangOpen);
                if (isOpen) setIsOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-zinc-700/80 bg-zinc-900/90 hover:bg-zinc-800 active:bg-zinc-800 text-zinc-200 text-xs font-semibold cursor-pointer transition-all shadow-sm"
              title={t('nav_languageSettings', 'Til sozlamalari')}
              aria-expanded={isLangOpen}
            >
              <span className="text-base leading-none">{currentLang.flag}</span>
              <span className="hidden xs:inline-block text-[11px] font-bold text-zinc-300 uppercase">{currentLang.badge}</span>
              <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${isLangOpen ? 'rotate-180 text-emerald-400' : ''}`} />
            </button>

            {/* Floating Language Dropdown Menu */}
            <AnimatePresence>
              {isLangOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 mt-2 w-64 rounded-2xl border border-zinc-800 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-2 z-50"
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5 border-b border-zinc-800/80 mb-1">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('nav_availableLanguages', 'Mavjud tillar:')}</span>
                  </div>

                  <div className="space-y-1">
                    {languages.map((lang) => {
                      const isSelected = lang.code === language;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => {
                            setLanguage(lang.code);
                            setIsLangOpen(false);
                            toast.success(lang.confirmText, {
                              icon: lang.flag,
                              duration: 2500,
                            });
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/15 border border-emerald-500/40 text-white shadow-sm'
                              : 'hover:bg-zinc-800/80 text-zinc-300 hover:text-white border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-base shrink-0 leading-none">{lang.flag}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold ${isSelected ? 'text-emerald-300' : 'text-zinc-200'}`}>
                                  {lang.nativeName}
                                </span>
                                <span className={`text-[10px] px-1 py-0.2 rounded font-medium ${
                                  isSelected ? 'bg-emerald-500/25 text-emerald-200' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                  {lang.badge}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate">
                                {lang.sublabel}
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <Check className="w-4 h-4 text-emerald-400 stroke-[2.5] shrink-0 ml-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {user && <NotificationBell />}
          <button
            type="button"
            onClick={toggleMenu}
            className="p-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 transition-all text-white focus:outline-none flex items-center gap-2 shadow-sm cursor-pointer"
            aria-label={t('nav_menu', 'Menyu')}
          >
            {isOpen ? (
              <X className="w-5 h-5 text-emerald-400" />
            ) : (
              <>
                <Menu className="w-5 h-5 text-zinc-200" />
                <span className="text-xs font-semibold hidden sm:inline-block pr-1 text-zinc-200">{t('nav_menu', 'Menyu')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Drawer Menu (For all screen sizes) */}
      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 top-16 z-40 overflow-y-auto">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeMenu}
                className="fixed inset-0 top-16 bg-black/75 z-0"
              />

              <div className="relative z-10 max-w-xl mx-auto px-3 sm:px-4 pt-2 sm:pt-3 pb-8">
                <motion.div
                  initial={{ opacity: 0, y: -16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="border border-zinc-800 bg-zinc-900 shadow-2xl rounded-2xl overflow-hidden text-white"
                >
                  <div className="p-4 sm:p-5 flex flex-col gap-2">
                    {user && (
                      <div className="flex items-center justify-between gap-3 p-3.5 mb-1 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 shadow-inner">
                        <div className="flex items-center gap-3.5 min-w-0">
                          {user.photoURL ? (
                            <img 
                              src={user.photoURL} 
                              alt={user.displayName || 'Profile'} 
                              className="w-11 h-11 rounded-full object-cover border-2 border-emerald-500/50 shrink-0" 
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                              {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold truncate text-white">{user.displayName || user.email?.split('@')[0] || 'Foydalanuvchi'}</span>
                            <span className="text-xs text-zinc-400 truncate">{user.email}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleLogout}
                          className="p-2.5 rounded-xl hover:bg-red-500/15 text-red-400 transition-colors shrink-0 ml-1 cursor-pointer"
                          title={t('nav_logout', 'Chiqish')}
                          aria-label={t('nav_logout', 'Chiqish')}
                        >
                          <LogOut className="w-5 h-5" />
                        </button>
                      </div>
                    )}

                    <Link
                      to="/pricing"
                      onClick={closeMenu}
                      className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-zinc-800 text-zinc-200 hover:text-emerald-400 transition-all text-sm font-medium"
                    >
                      <Coins className="w-4 h-4 text-emerald-400" />
                      <span>{t('nav_pricing', 'Narxlar')}</span>
                    </Link>

                    <Link
                      to="/botly-ai"
                      onClick={closeMenu}
                      className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-zinc-800 text-zinc-200 hover:text-emerald-400 transition-all text-sm font-medium"
                    >
                      <Bot className="w-4 h-4 text-emerald-400" />
                      <span>{t('nav_botlyAi', 'Botly AI')}</span>
                    </Link>

                    {user ? (
                      <>
                        <Link
                          to="/dashboard"
                          onClick={closeMenu}
                          className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-zinc-800 text-zinc-200 hover:text-emerald-400 transition-all text-sm font-medium"
                        >
                          <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                          <span>{t('nav_dashboard', 'Dashboard Panel')}</span>
                        </Link>

                        <Link
                          to="/messages"
                          onClick={closeMenu}
                          className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-zinc-800 text-zinc-200 hover:text-emerald-400 transition-all text-sm font-medium"
                        >
                          <MessageSquare className="w-4 h-4 text-emerald-400" />
                          <span>{t('nav_messages', 'Xabarlar')}</span>
                        </Link>

                        {isAdmin && (
                          <Link
                            to="/admin"
                            onClick={closeMenu}
                            className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-amber-500/10 text-amber-400 transition-all text-sm font-medium"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>{t('nav_admin', 'Admin Panel')}</span>
                          </Link>
                        )}

                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { closeMenu(); navigate('/auth'); }}
                        className="flex items-center gap-3 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white transition-all text-sm font-bold w-full justify-center cursor-pointer mt-2"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>{t('nav_login', 'Kirish')}</span>
                      </button>
                    )}

                    {/* Til Sozlamalari (O'zbekiston davlat tillari va kirill) */}
                    <div className="pt-2 mt-2 border-t border-zinc-800/80">
                      <LanguageSelector defaultExpanded={false} onSelect={closeMenu} />
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </nav>
  );
};


