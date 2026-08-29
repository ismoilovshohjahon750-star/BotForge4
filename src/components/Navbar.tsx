import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';
import { Bot, LogOut, LayoutDashboard, ShieldCheck, Menu, X, Coins, LogIn, MessageSquare, Send, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LogoFull } from './Logo';
import { NotificationBell } from './NotificationBell';

export const Navbar: React.FC = () => {
  const { user, isAdmin, logout, login } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

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
    <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" onClick={closeMenu} className="flex items-center z-50 hover:opacity-90 transition-opacity">
          <LogoFull size={26} showSub={false} />
        </Link>

        {/* Right side controls (NotificationBell & Hamburger) */}
        <div className="flex items-center gap-3 z-50">
          {user && <NotificationBell />}
          <button
            onClick={toggleMenu}
            className="p-2.5 rounded-xl border bg-card hover:bg-primary/10 transition-all text-foreground focus:outline-none flex items-center gap-2 shadow-sm cursor-pointer"
            aria-label="Menyuni ochish/yopish"
          >
            {isOpen ? (
              <X className="w-5 h-5 text-primary transition-transform duration-300 rotate-90" />
            ) : (
              <>
                <Menu className="w-5 h-5 text-foreground transition-transform duration-300" />
                <span className="text-xs font-semibold hidden sm:inline-block pr-1">Menyu</span>
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
                className="fixed inset-0 top-16 bg-black/60 backdrop-blur-xs z-0"
              />

              <div className="relative z-10 max-w-xl mx-auto px-3 sm:px-4 pt-2 sm:pt-3 pb-8">
                <motion.div
                  initial={{ opacity: 0, y: -16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden text-foreground"
                >
                  <div className="p-4 sm:p-5 flex flex-col gap-2">
                    {user && (
                      <div className="flex items-center justify-between gap-3 p-3.5 mb-1 rounded-2xl bg-muted/50 border border-border/60 shadow-inner">
                        <div className="flex items-center gap-3.5 min-w-0">
                          {user.photoURL ? (
                            <img 
                              src={user.photoURL} 
                              alt={user.displayName || 'Profile'} 
                              className="w-11 h-11 rounded-full object-cover border-2 border-primary/30 shrink-0" 
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                              {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold truncate text-foreground">{user.displayName || user.email?.split('@')[0] || 'Foydalanuvchi'}</span>
                            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                          </div>
                        </div>

                        <button
                          onClick={handleLogout}
                          className="p-2.5 rounded-xl hover:bg-destructive/15 text-destructive transition-colors shrink-0 ml-1 cursor-pointer"
                          title="Chiqish"
                          aria-label="Chiqish"
                        >
                          <LogOut className="w-5 h-5" />
                        </button>
                      </div>
                    )}

                    <Link
                      to="/pricing"
                      onClick={closeMenu}
                      className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                    >
                      <Coins className="w-4 h-4 text-primary" />
                      <span>Narxlar</span>
                    </Link>

                    <Link
                      to="/botly-ai"
                      onClick={closeMenu}
                      className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                    >
                      <Bot className="w-4 h-4 text-primary" />
                      <span>Botly AI</span>
                    </Link>

                    {user ? (
                      <>
                        <Link
                          to="/dashboard"
                          onClick={closeMenu}
                          className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                        >
                          <LayoutDashboard className="w-4 h-4 text-primary" />
                          <span>Dashboard Panel</span>
                        </Link>

                        <Link
                          to="/messages"
                          onClick={closeMenu}
                          className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                        >
                          <MessageSquare className="w-4 h-4 text-primary" />
                          <span>Xabarlar</span>
                        </Link>

                        {isAdmin && (
                          <Link
                            to="/admin"
                            onClick={closeMenu}
                            className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-amber-500/10 text-amber-500 transition-all text-sm font-medium"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>Admin Panel</span>
                          </Link>
                        )}

                      </>
                    ) : (
                      <button
                        onClick={() => { closeMenu(); navigate('/auth'); }}
                        className="flex items-center gap-3 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white transition-all text-sm font-bold w-full justify-center cursor-pointer mt-2"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Kirish</span>
                      </button>
                    )}
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


