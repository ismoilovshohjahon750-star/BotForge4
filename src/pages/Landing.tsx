import React from 'react';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { Zap, Shield, Terminal, Cpu, Send, ExternalLink } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { TechLeadersQuotes } from '../components/TechLeadersQuotes';
import { NodeJsIcon, PythonIcon, GoIcon, RustIcon, RubyIcon, PhpIcon } from '../components/LanguageIcons';

export const Landing: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  const handleDocs = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate('/docs');
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      {/* Hero Section */}
      <section className="relative pt-16 pb-20 md:py-24 px-4 text-center overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-6 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{t('hero_badge', 'Botlaringiz uchun 24/7 Cloud Hosting')}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-white leading-tight max-w-3xl">
            {t('hero_title_prefix', 'Botlaringizni')}{' '}
            <span className="text-emerald-400">{t('hero_title_accent', 'CloudBot')}</span>{' '}
            {t('hero_title_suffix', 'bilan dunyoga taniting')}
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-zinc-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            {t('hero_subtitle', 'Telegram, Discord va boshqa botlarni soniyalar ichida yuklang, avtomatik tahlil qiling va 24/7 uzluksiz rejimda ishga tushiring.')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-md mx-auto">
            <Button
              size="lg"
              onClick={handleStart}
              className="flex-1 min-w-[160px] h-13 text-base font-bold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-950/50 cursor-pointer transition-all active:scale-95"
            >
              {t('hero_start_btn', 'Ishni Boshlash')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleDocs}
              className="flex-1 min-w-[160px] h-13 text-base font-semibold border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-xl cursor-pointer transition-all active:scale-95"
            >
              {t('hero_how_btn', 'Qanday Ishlaydi?')}
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-20 container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <Terminal className="w-8 h-8 text-emerald-400" />,
              title: t('feat_multilang_title', "Ko'p tilli qo'llab-quvvatlash"),
              desc: t('feat_multilang_desc', "Node.js, Python, Go, Rust va boshqa tillarda yozilgan botlarni muammosiz qo'llab-quvvatlaymiz.")
            },
            {
              icon: <Shield className="w-8 h-8 text-emerald-400" />,
              title: t('feat_secure_title', "Xavfsiz va Barqaror"),
              desc: t('feat_secure_desc', "Botlaringiz xavfsiz izolatsiyalangan muhitda ishlaydi va har doim onlayn bo'lishi kafolatlanadi.")
            },
            {
              icon: <Cpu className="w-8 h-8 text-emerald-400" />,
              title: t('feat_deploy_title', "Avtomatik Deploy"),
              desc: t('feat_deploy_desc', ".zip faylini yuklang, biz qolganini o'zimiz bajaramiz: dependency-larni o'rnatamiz va ishga tushiramiz.")
            }
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 md:p-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 hover:border-emerald-500/40 transition-all shadow-md"
            >
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl inline-block text-emerald-400">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Languages Section */}
      <section className="relative py-16 md:py-20 px-4 overflow-hidden bg-zinc-950">
        {/* Soft background ambient light */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(16,185,129,0.06),transparent_70%)] pointer-events-none" />

        <div className="container mx-auto max-w-5xl relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800/80 text-zinc-400 text-xs font-medium mb-4 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Ko'p tilli qo'llab-quvvatlash</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-3 text-white tracking-tight">
            {t('landing_popular_langs', 'Barcha ommabop dasturlash tillari')}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Node.js, Python, Go, Rust, Ruby yoki PHP — istalgan backend va bot freymvorklarini avtomatik muhitda bir xil barqarorlik bilan ishga tushiring.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {[
              {
                name: 'Node.js',
                ext: 'JS / TS',
                icon: <NodeJsIcon className="w-8 h-8" />,
                badgeColor: 'bg-emerald-950/40 border-emerald-500/30 group-hover:border-emerald-400/60 shadow-emerald-500/10',
                hoverGlow: 'group-hover:border-emerald-500/40 group-hover:shadow-emerald-950/40'
              },
              {
                name: 'Python',
                ext: 'v3.10+',
                icon: <PythonIcon className="w-8 h-8" />,
                badgeColor: 'bg-sky-950/40 border-sky-500/30 group-hover:border-sky-400/60 shadow-sky-500/10',
                hoverGlow: 'group-hover:border-sky-500/40 group-hover:shadow-sky-950/40'
              },
              {
                name: 'Go',
                ext: 'Golang',
                icon: <GoIcon className="w-9 h-9" />,
                badgeColor: 'bg-cyan-950/40 border-cyan-500/30 group-hover:border-cyan-400/60 shadow-cyan-500/10',
                hoverGlow: 'group-hover:border-cyan-500/40 group-hover:shadow-cyan-950/40'
              },
              {
                name: 'Rust',
                ext: 'Cargo',
                icon: <RustIcon className="w-8 h-8" />,
                badgeColor: 'bg-amber-950/40 border-amber-500/30 group-hover:border-amber-400/60 shadow-amber-500/10',
                hoverGlow: 'group-hover:border-amber-500/40 group-hover:shadow-amber-950/40'
              },
              {
                name: 'Ruby',
                ext: 'Gems',
                icon: <RubyIcon className="w-8 h-8" />,
                badgeColor: 'bg-rose-950/40 border-rose-500/30 group-hover:border-rose-400/60 shadow-rose-500/10',
                hoverGlow: 'group-hover:border-rose-500/40 group-hover:shadow-rose-950/40'
              },
              {
                name: 'PHP',
                ext: 'v8.2+',
                icon: <PhpIcon className="w-9 h-9" />,
                badgeColor: 'bg-indigo-950/40 border-indigo-500/30 group-hover:border-indigo-400/60 shadow-indigo-500/10',
                hoverGlow: 'group-hover:border-indigo-500/40 group-hover:shadow-indigo-950/40'
              }
            ].map(lang => (
              <div
                key={lang.name}
                className={`group relative p-4 sm:p-5 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 backdrop-blur-sm transition-all duration-300 flex flex-col items-center justify-center text-center shadow-md hover:shadow-xl hover:-translate-y-1 ${lang.hoverGlow}`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 border transition-all duration-300 group-hover:scale-110 shadow-md ${lang.badgeColor}`}>
                  {lang.icon}
                </div>
                <span className="font-mono font-bold text-sm text-zinc-100 group-hover:text-white transition-colors">
                  {lang.name}
                </span>
                <span className="text-[11px] text-zinc-400 group-hover:text-zinc-300 mt-0.5 font-mono">
                  {lang.ext}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Leaders Quotes & Wisdom Section (replaces customer reviews on landing) */}
      <TechLeadersQuotes />

      {/* Admin Telegram Direct Support CTA */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="relative p-6 md:p-10 rounded-3xl bg-zinc-900 border border-sky-500/30 overflow-hidden shadow-2xl">
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-500/30 text-sky-400 text-xs font-semibold">
                  <Send className="w-3 h-3" />
                  <span>{t('support_badge', '24/7 Shaxsiy Telegram Yordam')}</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  {t('support_title', 'Bot sozlashda yordam kerakmi?')}
                </h3>
                <p className="text-sm text-zinc-400 max-w-md">
                  {t('support_desc', "Administrator bilan to'g'ridan-to'g'ri Telegram orqali bog'laning va 5 daqiqa ichida loyihangizni serverga joylashtiring.")}
                </p>
              </div>
              <a
                href="https://t.me/shoh_deweloper"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-bold text-sm transition-all shadow-xl shadow-sky-950/40 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{t('support_btn', '@shoh_deweloper ga yozish')}</span>
                <ExternalLink className="w-4 h-4 opacity-70" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

