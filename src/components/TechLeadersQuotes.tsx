import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Quote, Sparkles, ChevronLeft, ChevronRight, Zap } from 'lucide-react';

import steveJobsImg from '../assets/images/steve_jobs_avatar_1789832978259.jpg';
import elonMuskImg from '../assets/images/elon_musk_avatar_1789832994207.jpg';
import billGatesImg from '../assets/images/bill_gates_avatar_1789833008323.jpg';
import markZuckImg from '../assets/images/zuck_bezos_avatar_1789833033848.jpg';
import jeffBezosImg from '../assets/images/jeff_bezos_avatar_1789833051054.jpg';
import samAltmanImg from '../assets/images/sam_altman_avatar_1789836091206.jpg';

export interface LeaderQuote {
  id: string;
  name: string;
  role: string;
  quote: string;
  badge: string;
  gradient: string;
  borderAccent: string;
  avatarBg: string;
  image: string;
}

export const LEADER_QUOTES: LeaderQuote[] = [
  {
    id: 'sam-altman',
    name: 'Sam Altman',
    role: 'OpenAI asoschisi & CEO',
    quote: '“Sun\'iy intellekt insoniyat yaratgan eng qudratli texnologiya bo\'ladi.”',
    badge: 'Sun\'iy Intellekt & Kelajak',
    gradient: 'from-emerald-600/20 via-teal-600/10 to-transparent',
    borderAccent: 'border-emerald-500/40 hover:border-emerald-400',
    avatarBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    image: samAltmanImg,
  },
  {
    id: 'steve-jobs',
    name: 'Steve Jobs',
    role: 'Apple asoschisi va texnologiya afsonasi',
    quote: '“Sizning vaqtingiz cheklangan, shuning uchun uni boshqaning hayotini yashab o\'tkazmang.”',
    badge: 'Innovatsiya & Qat\'iyat',
    gradient: 'from-blue-600/20 via-sky-600/10 to-transparent',
    borderAccent: 'border-sky-500/40 hover:border-sky-400',
    avatarBg: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    image: steveJobsImg,
  },
  {
    id: 'elon-musk',
    name: 'Elon Musk',
    role: 'Tesla, SpaceX & xAI asoschisi',
    quote: '“Agar siz hech qachon tanqid qilinmoqchi bo\'lmasangiz, u holda yangi narsa qilmang.”',
    badge: 'Jasorat & Kelajak',
    gradient: 'from-cyan-600/20 via-blue-600/10 to-transparent',
    borderAccent: 'border-cyan-500/40 hover:border-cyan-400',
    avatarBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    image: elonMuskImg,
  },
  {
    id: 'bill-gates',
    name: 'Bill Gates',
    role: 'Microsoft asoschisi & filantrop',
    quote: '“Muvaffaqiyatni nishonlash yaxshi, lekin muvaffaqiyatsizlik sabablariga e\'tibor qaratish muhimroq.”',
    badge: 'Strategiya & Saboq',
    gradient: 'from-indigo-600/20 via-blue-600/10 to-transparent',
    borderAccent: 'border-indigo-500/40 hover:border-indigo-400',
    avatarBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    image: billGatesImg,
  },
  {
    id: 'mark-zuckerberg',
    name: 'Mark Zuckerberg',
    role: 'Meta (Facebook) asoschisi & CEO',
    quote: '“Eng katta xavf – hech qanday xavfga qo\'l urmaslikdir.”',
    badge: 'Tavakkal & Tezlik',
    gradient: 'from-blue-600/20 via-indigo-600/10 to-transparent',
    borderAccent: 'border-blue-500/40 hover:border-blue-400',
    avatarBg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    image: markZuckImg,
  },
  {
    id: 'jeff-bezos',
    name: 'Jeff Bezos',
    role: 'Amazon & Blue Origin asoschisi',
    quote: '“Biz uzoq muddatli qarashda qat\'iy, tafsilotlarda esa moslashuvchanmiz.”',
    badge: 'Mijoz & Vizyon',
    gradient: 'from-sky-600/20 via-cyan-600/10 to-transparent',
    borderAccent: 'border-sky-500/40 hover:border-sky-400',
    avatarBg: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    image: jeffBezosImg,
  }
];

export const TechLeadersQuotes: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  // Automatic carousel rotation every 6 seconds if autoplay enabled
  useEffect(() => {
    if (!autoplay) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % LEADER_QUOTES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [autoplay]);

  const nextQuote = () => {
    setAutoplay(false);
    setActiveIndex((prev) => (prev + 1) % LEADER_QUOTES.length);
  };

  const prevQuote = () => {
    setAutoplay(false);
    setActiveIndex((prev) => (prev - 1 + LEADER_QUOTES.length) % LEADER_QUOTES.length);
  };

  return (
    <section className="relative py-16 md:py-24 px-4 overflow-hidden border-t border-zinc-800/80 bg-zinc-950">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-72 bg-gradient-to-r from-blue-600/10 via-cyan-500/10 to-emerald-500/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-950/80 border border-blue-500/30 text-blue-300 text-xs font-semibold mb-4 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span>Buyuk Asoschilar Falsafasi</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Muvaffaqiyat va Innovatsiya Saboqlari
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 max-w-xl">
            Dunyoning yetakchi IT va texnologiya asoschilarining platformamiz va rivojlanish falsafasiga hamohang bo'lgan qimmatli fikrlari.
          </p>
        </div>

        {/* 5 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {LEADER_QUOTES.map((item, idx) => {
            const isFeatured = idx === 0 || idx === 1;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className={`relative group rounded-3xl p-6 sm:p-7 border bg-zinc-900/70 backdrop-blur-md transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl ${item.borderAccent}`}
              >
                {/* Glow accent in card background */}
                <div className={`absolute inset-0 bg-gradient-to-b ${item.gradient} opacity-40 group-hover:opacity-80 transition-opacity pointer-events-none`} />

                <div className="relative z-10">
                  {/* Top Badge & Quote Icon */}
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/90 border border-zinc-700/60 text-[11px] font-semibold text-zinc-300 font-mono">
                      <Zap className="w-3 h-3 text-sky-400" />
                      {item.badge}
                    </span>
                    <Quote className="w-6 h-6 text-sky-400/40 group-hover:text-sky-400 transition-colors" />
                  </div>

                  {/* Leader's Quote in quotes */}
                  <p className="text-base sm:text-lg font-medium text-zinc-100 leading-relaxed tracking-wide italic mb-6">
                    {item.quote}
                  </p>
                </div>

                {/* Leader Profile Info with Real Portrait Photo */}
                <div className="relative z-10 pt-4 border-t border-zinc-800/80 flex items-center gap-3.5">
                  <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-zinc-700/80 shrink-0 shadow-lg group-hover:border-sky-400/60 group-hover:scale-105 transition-all">
                    <img
                      src={item.image}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2 group-hover:text-sky-300 transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-xs text-zinc-400 truncate">
                      {item.role}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
