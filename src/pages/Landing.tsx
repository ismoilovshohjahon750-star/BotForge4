import React from 'react';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { Zap, Shield, Terminal, Cpu, Send, ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const Landing: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const handleStart = () => {
    if (user) navigate('/dashboard');
    else login();
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-24 px-4 text-center bg-radial-[at_50%_-20%] from-primary/20 to-transparent">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Zap className="w-3 h-3 text-primary animate-pulse" />
            <span>Botlaringiz uchun 24/7 Cloud Hosting</span>
          </div>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 text-white leading-tight">
            Botlaringizni <span className="text-emerald-400">CloudBot</span> bilan dunyoga taniting
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 mb-10 max-w-2xl mx-auto">
            Telegram, Discord va boshqa botlarni soniyalar ichida yuklang, avtomatik tahlil qiling va 24/7 uzluksiz rejimda ishga tushiring.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" onClick={handleStart} className="text-lg px-8 h-14 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-950/40">
              Ishni Boshlash
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/docs')} className="text-lg px-8 h-14 rounded-xl border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-white">
              Qanday Ishlaydi?
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Terminal className="w-10 h-10 text-emerald-400" />,
              title: "Ko'p tilli qo'llab-quvvatlash",
              desc: "Node.js, Python, Go, Rust va boshqa tillarda yozilgan botlarni muammosiz qo'llab-quvvatlaymiz."
            },
            {
              icon: <Shield className="w-10 h-10 text-emerald-400" />,
              title: "Xavfsiz va Barqaror",
              desc: "Botlaringiz xavfsiz izolatsiyalangan muhitda ishlaydi va har doim onlayn bo'lishi kafolatlanadi."
            },
            {
              icon: <Cpu className="w-10 h-10 text-emerald-400" />,
              title: "Avtomatik Deploy",
              desc: ".zip faylini yuklang, biz qolganini o'zimiz bajaramiz: dependency-larni o'rnatamiz va ishga tushiramiz."
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-8 rounded-2xl border border-white/10 bg-zinc-900/90 hover:border-emerald-500/50 transition-all hover:shadow-2xl hover:shadow-emerald-500/10 group"
            >
              <div className="mb-4 p-3 bg-emerald-500/10 rounded-xl inline-block group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Languages Section */}
      <section className="py-20 bg-card/30 border-y">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-12">Barcha ommabop tillar</h2>
          <div className="flex flex-wrap justify-center gap-12 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
             {/* Mock Icons/Text since no real SVGs requested */}
             {['Node.js', 'Python', 'Go', 'Rust', 'Ruby', 'PHP'].map(lang => (
               <div key={lang} className="text-2xl font-mono font-bold tracking-tighter">{lang}</div>
             ))}
          </div>
        </div>
      </section>

      {/* Admin Telegram Direct Support CTA */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="relative p-8 md:p-10 rounded-3xl bg-gradient-to-br from-sky-950/40 via-card to-background border border-sky-500/30 overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold">
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
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm transition-all shadow-xl shadow-sky-900/30 hover:scale-105 active:scale-95 shrink-0"
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
