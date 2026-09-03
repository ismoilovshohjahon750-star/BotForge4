import React from 'react';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { Zap, Shield, Terminal, Cpu, Send, ExternalLink } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const Landing: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

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
            <span>Botlaringiz uchun 24/7 Cloud Hosting</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-white leading-tight max-w-3xl">
            Botlaringizni <span className="text-emerald-400">CloudBot</span> bilan dunyoga taniting
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-zinc-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Telegram, Discord va boshqa botlarni soniyalar ichida yuklang, avtomatik tahlil qiling va 24/7 uzluksiz rejimda ishga tushiring.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-md mx-auto">
            <Button
              size="lg"
              onClick={handleStart}
              className="flex-1 min-w-[160px] h-13 text-base font-bold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-950/50 cursor-pointer transition-all active:scale-95"
            >
              Ishni Boshlash
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleDocs}
              className="flex-1 min-w-[160px] h-13 text-base font-semibold border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-xl cursor-pointer transition-all active:scale-95"
            >
              Qanday Ishlaydi?
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
              title: "Ko'p tilli qo'llab-quvvatlash",
              desc: "Node.js, Python, Go, Rust va boshqa tillarda yozilgan botlarni muammosiz qo'llab-quvvatlaymiz."
            },
            {
              icon: <Shield className="w-8 h-8 text-emerald-400" />,
              title: "Xavfsiz va Barqaror",
              desc: "Botlaringiz xavfsiz izolatsiyalangan muhitda ishlaydi va har doim onlayn bo'lishi kafolatlanadi."
            },
            {
              icon: <Cpu className="w-8 h-8 text-emerald-400" />,
              title: "Avtomatik Deploy",
              desc: ".zip faylini yuklang, biz qolganini o'zimiz bajaramiz: dependency-larni o'rnatamiz va ishga tushiramiz."
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
      <section className="py-16 bg-zinc-900/40 border-y border-zinc-800/80">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white">Barcha ommabop dasturlash tillari</h2>
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 text-zinc-400">
            {['Node.js', 'Python', 'Go', 'Rust', 'Ruby', 'PHP'].map(lang => (
              <div key={lang} className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-lg font-mono font-bold text-zinc-300">
                {lang}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Admin Telegram Direct Support CTA */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="relative p-6 md:p-10 rounded-3xl bg-zinc-900 border border-sky-500/30 overflow-hidden shadow-2xl">
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-500/30 text-sky-400 text-xs font-semibold">
                  <Send className="w-3 h-3" />
                  <span>24/7 Shaxsiy Telegram Yordam</span>
                </div>
                <h3 className="text-2xl font-bold text-white">Bot sozlashda yordam kerakmi?</h3>
                <p className="text-sm text-zinc-400 max-w-md">
                  Administrator bilan to'g'ridan-to'g'ri Telegram orqali bog'laning va 5 daqiqa ichida loyihangizni serverga joylashtiring.
                </p>
              </div>
              <a
                href="https://t.me/shoh_deweloper"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-bold text-sm transition-all shadow-xl shadow-sky-950/40 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>@shoh_deweloper ga yozish</span>
                <ExternalLink className="w-4 h-4 opacity-70" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

