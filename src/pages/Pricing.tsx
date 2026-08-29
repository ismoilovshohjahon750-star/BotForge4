import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { 
  Check, 
  MessageSquare, 
  Send, 
  X, 
  Sparkles, 
  ShieldCheck, 
  PhoneCall, 
  User, 
  Mail, 
  Loader2, 
  ArrowRight, 
  Zap, 
  Bot, 
  Server, 
  HelpCircle,
  ExternalLink,
  CheckCircle2,
  Clock,
  Cpu
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface Plan {
  id: 'free' | 'pro' | 'vip';
  name: string;
  price: string;
  desc: string;
  features: string[];
  button: string;
  popular?: boolean;
}

export const Pricing: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [userTier, setUserTier] = useState<string>('free');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const plans: Plan[] = [
    {
      id: 'free',
      name: "Bepul",
      price: "$0",
      desc: "Yangi boshlovchilar va sinov uchun",
      features: [
        "2 tagacha bot joylashtirish",
        "Botlar 2 oy ishlab beradi",
        "Ish vaqti: 07:25 dan 21:00 gacha (O'zb vaqti)",
        "Botly AI limiti: 45 tokin/kuniga",
        "Avtomatik ertalabki tiklanish",
        "Standart qo'llab-quvvatlash"
      ],
      button: "Hozir boshlang",
      popular: false
    },
    {
      id: 'pro',
      name: "Pro",
      price: "$20",
      desc: "Kichik biznes va faol loyihalar uchun",
      features: [
        "10 tagacha bot joylashtirish",
        "Botlar 10 oy davomida kafolatli ishlaydi",
        "Ish vaqti: 06:30 dan 22:35 gacha (O'zb vaqti)",
        "Botly AI limiti: 145 tokin/kuniga",
        "Batafsil terminal loglari va audit",
        "Prioritet tezkor qo'llab-quvvatlash",
        "Maxsus webhooklar va ZIP arxiv yuklash",
        "Kengaytirilgan xotira va CPU resursi"
      ],
      button: "Obuna bo'lish",
      popular: true
    },
    {
      id: 'vip',
      name: "VIP",
      price: "$49",
      desc: "Professional va yirik loyihalar uchun",
      features: [
        "30 tagacha bot joylashtirish",
        "Botlar cheksiz ravishda ishlab beradi",
        "Ish vaqti: 04:00 dan 00:00 (yarim kecha) gacha",
        "Botly AI limiti: 500 tokin/kuniga",
        "Cheksiz terminal loglari tarixi",
        "24/7 Shaxsiy Telegram yordamchi",
        "Maksimal server resurslari va tezkor tarmoq",
        "Avtomatik xatoliklarni tuzatuvchi sun'iy intellekt"
      ],
      button: "Obuna bo'lish",
      popular: false
    }
  ];

  const faqs = [
    {
      q: "Bepul tarifdan qanday foydalanish mumkin?",
      a: "Bepul tarifni tanlash uchun hech qanday karta yoki to'lov talab qilinmaydi. 'Hozir boshlang' tugmasini bosib to'g'ridan-to'g'ri Dashboardga o'tasiz va darhol o'z botingizni deploy qilishingiz mumkin."
    },
    {
      q: "Pro yoki VIP tarifga qanday to'lov qilinadi?",
      a: "Tarif ostidagi 'Obuna bo'lish' tugmasini bosib, telefon raqamingizni yuborsangiz yoki to'g'ridan-to'g'ri @shoh_deweloper telegram profiliga yozsangiz, administrator bir necha daqiqada sizga to'lov rekvizitlarini (Payme / Click / Visa / Kripto) yuboradi va obunangizni faollashtiradi."
    },
    {
      q: "Botlarim qanday texnologiyalarda ishlaydi?",
      a: "CloudBot platformasi Python (Aiogram 3, Telebot, Python-Telegram-Bot) va Node.js (Telegraf, Grammy) texnologiyalarini to'liq qo'llab-quvvatlaydi. Muhitlar izolyatsiyalangan holda 24/7 ishlaydi."
    },
    {
      q: "Botly AI tokenlari nima uchun kerak?",
      a: "Botly AI — bu siz uchun Python/Node.js bot kodlarini generatsiya qilib beruvchi, xatoliklarni avtomatik tuzatuvchi va savollaringizga javob beruvchi maxsus aqlli yordamchidir."
    }
  ];

  // Load user profile / tier info
  useEffect(() => {
    if (user) {
      if (user.displayName && !name) setName(user.displayName);
      const loadProfile = async () => {
        try {
          const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
          if (profileDoc.exists()) {
            const data = profileDoc.data();
            if (data.tier) setUserTier(data.tier.toLowerCase());
          }
        } catch (e) {
          console.warn("Profile tier fetch error:", e);
        }
      };
      loadProfile();
    }
  }, [user]);

  const handlePlanClick = (plan: Plan) => {
    if (plan.id === 'free') {
      // Bepul obunadagi tugma to'g'ridan-to'g'ri Dashboardni ochadi!
      if (!user) {
        toast.info("Dashboardga kirish uchun tizimga kiring");
        login().then(() => {
          navigate('/dashboard');
        }).catch(() => {
          navigate('/dashboard');
        });
      } else {
        toast.success("Dashboardga o'tilmoqda...");
        navigate('/dashboard');
      }
      return;
    }

    // Pro va VIP uchun esa modal ochiladi
    setSelectedPlan(plan);
    setIsModalOpen(true);
    setMessage(`Assalomu alaykum! Men CloudBot platformasidagi ${plan.name} (${plan.price}/oy) tarifiga obuna bo'lmoqchiman. Iltimos to'lov rekvizitlari va faollashtirish shartlarini yuborsangiz.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Telefon raqamingizni kiritishingiz shart!");
      return;
    }
    if (!message.trim()) {
      toast.error("Iltimos, xabar matnini kiriting!");
      return;
    }

    setSending(true);
    try {
      const planName = selectedPlan?.name || "Noma'lum";
      const planPrice = selectedPlan?.price || "";
      const senderName = name.trim() || user?.displayName || "Foydalanuvchi";
      const senderPhone = phone.trim();
      const userEmail = user?.email || "Noma'lum email";

      const formattedMessage = `[TARIF SO'ROVI: ${planName} (${planPrice}/oy)]\n\n📞 Telefon raqami: ${senderPhone}\n✉️ Account Email: ${userEmail}\n\n💬 Xabar:\n${message.trim()}`;

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: senderName,
          email: `${senderPhone} (${userEmail})`,
          message: formattedMessage
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Xabaringiz muvaffaqiyatli yuborildi! Administrator ${senderPhone} raqamiga tez orada javob beradi.`);
        setIsModalOpen(false);
      } else {
        toast.error(data.error || "Xabarni yuborishda xatolik yuz berdi");
      }
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Tarmoq xatosi. Xabar yuborilmadi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 md:py-24 relative max-w-7xl">
      {/* Header Banner */}
      <div className="text-center mb-16 max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider">
          <Zap className="w-3.5 h-3.5" />
          <span>Shaffof va Qulay Tariflar</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
          Sizga mos tarif rejasini tanlang
        </h1>
        <p className="text-slate-400 text-sm md:text-base leading-relaxed">
          Bepul boshlang yoki loyihangiz ko'lamiga qarab yuqori quvvatli server va kengaytirilgan Botly AI imkoniyatlarini faollashtiring.
        </p>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch pt-4">
        {plans.map((plan) => {
          const isCurrentPlan = user && userTier === plan.id;
          const isFree = plan.id === 'free';

          return (
            <Card 
              key={plan.id} 
              className={`relative flex flex-col transition-all duration-300 rounded-2xl bg-[#111116] border overflow-visible ${
                plan.popular 
                  ? 'border-primary shadow-2xl shadow-primary/20 md:-translate-y-2 z-10' 
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-primary to-indigo-600 text-white text-xs font-bold rounded-full shadow-xl flex items-center gap-1.5 whitespace-nowrap z-30 border border-white/20">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ENG OMMABOP</span>
                </div>
              )}

              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
                    {plan.name}
                  </CardTitle>
                  {isCurrentPlan && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Joriy Tarif
                    </span>
                  )}
                </div>
                <CardDescription className="text-xs text-slate-400 min-h-[32px] pt-1">
                  {plan.desc}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-6">
                <div className="flex items-baseline gap-1.5 border-b border-white/5 pb-6">
                  <span className="text-4xl md:text-5xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-slate-400 text-sm">{isFree ? '/abadiy' : '/oyiga'}</span>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Tarif imkoniyatlari:
                  </p>
                  <ul className="space-y-3">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-xs md:text-sm text-slate-300 leading-snug">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>

              <CardFooter className="pt-2 pb-6">
                <Button 
                  className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm cursor-pointer transition-all shadow-md ${
                    isFree 
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/40' 
                      : plan.popular 
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/30' 
                        : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                  }`}
                  onClick={() => handlePlanClick(plan)}
                >
                  {isFree ? (
                    <>
                      <span>{plan.button}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4" />
                      <span>{plan.button}</span>
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Trust & Guarantee Badges */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">24/7 Ishonchli Uptime</h4>
            <p className="text-[11px] text-slate-400">Botlaringiz hech qachon to'xtamaydi</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">Kafolatlangan Xavfsizlik</h4>
            <p className="text-[11px] text-slate-400">Ma'lumotlar va maxfiy kalitlar himoyasi</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">Botly AI Integratsiyasi</h4>
            <p className="text-[11px] text-slate-400">Kod tuzatish va generatsiya yordamchisi</p>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mt-24 max-w-3xl mx-auto">
        <div className="text-center mb-10 space-y-2">
          <h3 className="text-2xl md:text-3xl font-bold text-white">Ko'p beriladigan savollar</h3>
          <p className="text-xs md:text-sm text-slate-400">Tariflar va platforma bo'yicha eng muhim ma'lumotlar</p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div 
                key={idx}
                className="rounded-xl border border-white/5 bg-[#111116] overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 text-sm font-semibold text-slate-200 hover:text-white cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>{faq.q}</span>
                  </span>
                  <span className="text-slate-400 text-lg font-light">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs md:text-sm text-slate-400 leading-relaxed border-t border-white/5">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Direct Telegram Support Banner */}
      <div className="mt-16 p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900 border border-indigo-500/20 max-w-3xl mx-auto text-center space-y-4">
        <div className="space-y-1">
          <h4 className="text-lg font-bold text-white">Yordam yoki maxsus taklif kerakmi?</h4>
          <p className="text-xs text-slate-300">
            Administrator bilan to'g'ridan-to'g'ri Telegram orqali bog'lanishingiz mumkin.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://t.me/shoh_deweloper"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold transition-colors shadow-lg shadow-sky-950/50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram: @shoh_deweloper</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
        </div>
      </div>

      {/* Subscription Request & Direct Message Modal */}
      <AnimatePresence>
        {isModalOpen && selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-[#111116] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">Obuna va Xabar Yuborish</h2>
                    <p className="text-xs text-slate-400">
                      <span className="font-semibold text-primary">{selectedPlan.name}</span> ({selectedPlan.price}/oy) tarifi bo'yicha administratorga murojaat
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Plan Badge Preview */}
              <div className="px-6 py-3 bg-primary/5 border-b border-white/10 flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5 text-primary">
                  <ShieldCheck className="w-4 h-4" />
                  Murojaatingiz bevosita administratsiyaga yetkaziladi
                </span>
                <span className="bg-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">
                  {selectedPlan.name} - {selectedPlan.price}
                </span>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Name field */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Ismingiz
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ismingizni kiriting"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                </div>

                {/* Mandatory Phone field */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Telefon raqamingiz</span>
                    <span className="text-rose-400 font-bold">* Majburiy</span>
                  </label>
                  <div className="relative">
                    <PhoneCall className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                </div>

                {/* Message Textarea */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Xabaringiz
                  </label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Xabaringiz va obuna bo'yicha istaklaringizni shu yerga yozing..."
                    className="w-full p-3 rounded-xl border border-white/10 bg-black/40 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    required
                  />
                </div>

                {/* Modal Actions */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl text-slate-400 hover:text-white"
                  >
                    Bekor qilish
                  </Button>
                  <Button
                    type="submit"
                    disabled={sending}
                    className="rounded-xl px-6 flex items-center gap-2 font-semibold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Yuborilmoqda...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Xabarni Yuborish</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};


