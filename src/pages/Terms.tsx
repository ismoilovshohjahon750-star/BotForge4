import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FileText, AlertTriangle, CheckCircle2, ArrowLeft, Lock, Ban, CreditCard } from 'lucide-react';
import { LogoFull } from '../components/Logo';
import { useTranslation } from '../context/LanguageContext';

export const Terms: React.FC = () => {
  const { t, language } = useTranslation();
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>('terms');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Top bar navigation */}
        <div className="flex items-center justify-between pb-8 mb-8 border-b border-zinc-800">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors bg-zinc-900/80 px-3.5 py-2 rounded-xl border border-zinc-800 hover:border-zinc-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Bosh sahifaga qaytish</span>
          </Link>
          <LogoFull size={24} showSub={false} />
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl max-w-md mx-auto mb-8 shadow-xl">
          <button
            onClick={() => setActiveTab('terms')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-zinc-800 text-cyan-400 shadow-md border border-cyan-500/20'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Foydalanish Shartlari (Terms)</span>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-zinc-800 text-emerald-400 shadow-md border border-emerald-500/20'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Maxfiylik Siyosati (Privacy)</span>
          </button>
        </div>

        {/* Highlight Banner: To'lovlar qaytarilmasligi va qat'iy qoidalar */}
        <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-3.5 shadow-lg">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="text-xs space-y-1">
            <strong className="block text-white text-sm font-bold">
              MUHIM QOIDALAR: To'lovlar qaytarilmaydi & Zararli botlar taqiqlanadi!
            </strong>
            <p className="text-amber-200/90 leading-relaxed">
              CloudBot platformasida har qanday obuna (Pro, VIP) yoki xizmatlar uchun to'langan mablag'lar 
              <strong> qat'iy va yakuniy bo'lib, to'lovlar qaytarib berilmaydi (No Refund Policy)</strong>. 
              Saytni buzuvchi, exploit, fishing yoki o'g'irlik qiluvchi botlar qat'iyan taqiqlanadi va darhol bloklanadi.
            </p>
          </div>
        </div>

        {/* Content Container */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
          {activeTab === 'terms' ? (
            <div className="space-y-8 text-xs text-zinc-300 leading-relaxed">
              <div>
                <div className="flex items-center gap-2.5 text-cyan-400 font-bold text-base mb-2">
                  <FileText className="w-5 h-5" />
                  <h2>1. Umumiy Foydalanish Shartlari</h2>
                </div>
                <p>
                  Ushbu Foydalanish Shartlari (bundan buyon "Shartlar") CloudBot.uz platformasidan, uning veb-saytidan, 
                  Botly AI xizmatlaridan hamda Telegram yordamchi botlaridan foydalanish qoidalarini belgilaydi. 
                  Ro'yxatdan o'tish orqali siz ushbu shartlarni to'liq qabul qilgan hisoblanasiz.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-white">
                  <CreditCard className="w-4 h-4 text-rose-400" />
                  <h3>2. To'lovlar va Qaytarib Berilmaslik Qoidasi (No Refund Policy)</h3>
                </div>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  2.1. CloudBot.uz platformasida Pro, VIP va har qanday pullik tariflar yoki qo'shimcha xizmatlar uchun to'langan to'lovlar 
                  <strong> QAT'IY VA YAKUNIY (FINAL & NON-REFUNDABLE)</strong> hisoblanadi.
                </p>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  2.2. Xizmat yoqilgandan yoki to'lov amalga oshirilgandan so'ng hech qanday holatda mablag' qaytarib berilmaydi. 
                  Foydalanuvchi obuna bo'lishdan oldin tarif shartlari, bot limiti va xizmat ko'rsatish vaqti bilan to'liq tanishib chiqishi shart.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2.5 text-cyan-400 font-bold text-base mb-2">
                  <Ban className="w-5 h-5 text-rose-400" />
                  <h2>3. Taqiqlangan Botlar va Xavfsizlik Talablari</h2>
                </div>
                <p className="mb-2">Quyidagi toifadagi botlarni yuklash, yaratish yoki ishga tushirish qat'iyan man etiladi:</p>
                <ul className="list-disc list-inside space-y-1.5 pl-2 text-zinc-300">
                  <li>Saytni yoki serverlarni buzuvchi, resurslarni o'g'irlovchi exploit va virusli skriptlar.</li>
                  <li>DDoS, phishing, parollarni o'g'irlash yoki ruxsatsiz shaxsiy ma'lumotlarni yig'ishga qaratilgan botlar.</li>
                  <li>Spam tarqatuvchi, noqonuniy mahsulotlar savdosi yoki firibgarlik botlari.</li>
                  <li>Sayt kodi yoki server arxitekturasini buzishga, o'g'irlashga urinuvchi har qanday jarayonlar.</li>
                </ul>
                <p className="mt-2 text-amber-300/90">
                  Bunday noqonuniy harakatlar aniqlanganda, bot va foydalanuvchi hisobi ogohlantirishsiz darhol bloklanadi va to'lov qaytarilmaydi!
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2.5 text-cyan-400 font-bold text-base mb-2">
                  <ShieldCheck className="w-5 h-5" />
                  <h2>4. Server Resurslari va Kafolatlar</h2>
                </div>
                <p>
                  Platforma foydalanuvchilar botlarining barqaror va uzluksiz ishlashini ta'minlaydi. Har bir tarif (Free, Pro, VIP) 
                  uchun belgilangan ish jadvali (O'zbekiston vaqti bo'yicha) va botlar limiti doirasida to'liq xizmat ko'rsatiladi.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2.5 text-cyan-400 font-bold text-base mb-2">
                  <Lock className="w-5 h-5" />
                  <h2>5. Xizmatni To'xtatish va O'zgartirish</h2>
                </div>
                <p>
                  CloudBot ma'muriyati shartlarni buzgan foydalanuvchilar hisobini vaqtincha yoki butunlay to'xtatish huquqini o'zida saqlab qoladi.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-8 text-xs text-zinc-300 leading-relaxed">
              <div>
                <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base mb-2">
                  <ShieldCheck className="w-5 h-5" />
                  <h2>1. Shaxsiy Ma'lumotlarni Himoyalash</h2>
                </div>
                <p>
                  CloudBot.uz sizning shaxsiy ma'lumotlaringiz (email, profil nomi) va maxfiy konfiguratsiyalaringiz xavfsizligini ta'minlashni o'z burchi deb biladi. 
                  Siz kiritgan ma'lumotlar zamonaviy shifrlash standartlari asosida saqlanadi.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base mb-2">
                  <Lock className="w-5 h-5" />
                  <h2>2. Bot Tokenlari va Maxfiy Kalitlar (Secrets) Maxfiyligi</h2>
                </div>
                <p>
                  Siz yuklagan botlarning tokenlari (BOT_TOKEN, API kalitlar, parollar) maxsus izolyatsiyalangan xavfsiz xotirada saqlanadi. 
                  Ushbu ma'lumotlar hech qachon uchinchi shaxslarga berilmaydi, ommaga chiqarilmaydi yoki boshqa maqsadlarda foydalanilmaydi.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
                  <ShieldCheck className="w-4 h-4" />
                  <h3>3. Server va Sayt Infratuzilmasi Maxfiyligi</h3>
                </div>
                <p className="text-xs leading-relaxed">
                  3.1. CloudBot serverlarining joylashuvi, ichki arxitekturasi, server qayerdan olingani va backend kodi xavfsizlik nuqtai nazaridan qat'iyan MAXFIY saqlanadi.
                </p>
                <p className="text-xs leading-relaxed">
                  3.2. Botly AI yoki Telegram yordamchi boti hech qachon saytning ichki kodlarini, server sirlarini yoki maxfiy fayllarni oshkor qilmaydi.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base mb-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <h2>4. Uchinchi Shaxslarga Oshkor Qilmaslik</h2>
                </div>
                <p>
                  Foydalanuvchining hisob qaydnomasi, bot kodlari yoki murojaatlari hech qanday reklama agentliklariga yoki uchinchi tomonlarga sotilmaydi va taqdim etilmaydi.
                </p>
              </div>
            </div>
          )}

          {/* Contact help footer in Terms */}
          <div className="mt-10 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
            <span>Savollaringiz bormi? Admin bilan bog'laning:</span>
            <a
              href="https://t.me/shoh_deweloper"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 font-semibold transition-all"
            >
              <span>@shoh_deweloper</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
