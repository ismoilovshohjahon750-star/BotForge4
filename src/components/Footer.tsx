import React, { useState } from 'react';
import { LogoFull } from './Logo';
import { Mail, Phone, Copy, Check, X, ShieldCheck, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';

export const Footer: React.FC = () => {
  const [activeModal, setActiveModal] = useState<'shartlar' | 'maxfiylik' | 'kontakt' | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${label} nusxalandi: ${text}`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSendContactForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactMessage.trim()) {
      toast.error("Iltimos, xabaringizni yozing");
      return;
    }
    setSendingMsg(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          message: contactMessage
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Xabaringiz ismoilovshohjahon750@gmail.com manziliga muvaffaqiyatli yuborildi!`);
        setContactMessage('');
        setContactName('');
        setContactEmail('');
        setActiveModal(null);
      } else {
        toast.error(data.error || "Xabarni yuborishda xatolik yuz berdi");
      }
    } catch (err) {
      toast.error("Tarmoq xatosi. Xabar yuborilmadi.");
    } finally {
      setSendingMsg(false);
    }
  };

  return (
    <>
      <footer className="py-10 border-t border-zinc-800 bg-zinc-950/60 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <LogoFull size={24} showSub={false} />
          </div>

          <p className="text-xs text-zinc-400 font-mono">
            © 2026 CLOUDBOT. Barcha huquqlar himoyalangan.
          </p>

          <div className="flex items-center gap-4 text-xs text-zinc-300 font-medium">
            <button
              onClick={() => setActiveModal('shartlar')}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Shartlar
            </button>
            <button
              onClick={() => setActiveModal('maxfiylik')}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Maxfiylik
            </button>
            <button
              onClick={() => setActiveModal('kontakt')}
              className="hover:text-cyan-400 transition-colors cursor-pointer px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-cyan-500/50"
            >
              Kontakt
            </button>
          </div>
        </div>
      </footer>

      {/* MODAL BACKDROP */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden text-zinc-100 p-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                {activeModal === 'shartlar' && <FileText className="w-5 h-5 text-cyan-400" />}
                {activeModal === 'maxfiylik' && <ShieldCheck className="w-5 h-5 text-emerald-400" />}
                {activeModal === 'kontakt' && <Mail className="w-5 h-5 text-amber-400" />}
                <h3 className="text-lg font-bold text-white capitalize">
                  {activeModal === 'shartlar' && "Foydalanish Shartlari"}
                  {activeModal === 'maxfiylik' && "Maxfiylik Siyosati"}
                  {activeModal === 'kontakt' && "Biz bilan bog'lanish"}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            {activeModal === 'shartlar' && (
              <div className="space-y-4 text-xs text-zinc-300 max-h-[60vh] overflow-y-auto pr-2 leading-relaxed">
                <p className="font-semibold text-zinc-100">1. Umumiy qoidalar</p>
                <p>
                  CloudBot platformasi Telegram va Discord botlarini 24/7 cloud serverlarda xavfsiz saqlash va ishga tushirish xizmatini taklif etadi.
                </p>

                <p className="font-semibold text-zinc-100">2. Bot materiallariga qo'yiladigan talablar</p>
                <p>
                  Foydalanuvchi serverga yuklanayotgan bot fayllari va kodi uchun to'liq mas'uldir.
                  Zararli dasturlar (malware, virus, DDoS hujum skriptlari) yoki noqonuniy botlarni yuklash taqiqlanadi va hisob bloklanishiga olib keladi.
                </p>

                <p className="font-semibold text-zinc-100">3. Server resurslaridan foydalanish</p>
                <p>
                  Har bir botga ajratilgan resurslar chegaralangan. Server tizimlariga zarar yetkazuvchi va cheksiz operatsiyalarni bajaruvchi botlar avtomatik to'xtatiladi.
                </p>

                <p className="font-semibold text-zinc-100">4. Xizmat kafolati</p>
                <p>
                  CloudBot platformasi botlarning 24/7 uzluksiz va yuqori tezlikda ishlashini ta'minlashga harakat qiladi.
                </p>
              </div>
            )}

            {activeModal === 'maxfiylik' && (
              <div className="space-y-4 text-xs text-zinc-300 max-h-[60vh] overflow-y-auto pr-2 leading-relaxed">
                <p className="font-semibold text-zinc-100">1. Ma'lumotlarni muhofaza qilish</p>
                <p>
                  Siz yuklagan fayllar, kodlar hamda `.env` konfiguratsiya fayllaridagi Bot Token va maxfiy kalitlar maxfiy va shifrlangan holda saqlanadi.
                </p>

                <p className="font-semibold text-zinc-100">2. Uchinchi shaxslarga berilmaslik kafolati</p>
                <p>
                  Foydalanuvchining shaxsiy ma'lumotlari yoki bot kodlari uchinchi shaxslarga berilmaydi va tijorat maqsadida sotilmaydi.
                </p>

                <p className="font-semibold text-zinc-100">3. Loglar va Ma'lumotlar avtomatizatsiyasi</p>
                <p>
                  Server loglari faqat foydalanuvchining bot xatolarini diagnostika qilish uchun paneldagi jurnalda ko'rsatiladi.
                </p>
              </div>
            )}

            {activeModal === 'kontakt' && (
              <div className="space-y-5">
                {/* Contact Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Telegram Admin Card */}
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-sky-500/30 hover:border-sky-500/60 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-sky-400 text-xs font-semibold mb-1">
                        <Send className="w-3.5 h-3.5" />
                        <span>Telegram Admin</span>
                      </div>
                      <p className="text-xs text-white font-mono font-bold">
                        @shoh_deweloper
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-zinc-800/50">
                      <button
                        onClick={() => copyToClipboard('@shoh_deweloper', 'Telegram')}
                        className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1 transition-colors"
                      >
                        {copiedField === 'Telegram' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'Telegram' ? "Nusxalandi" : "Nusxalash"}</span>
                      </button>
                      <a
                        href="https://t.me/shoh_deweloper"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-600 text-white font-semibold transition-colors"
                      >
                        Yozish
                      </a>
                    </div>
                  </div>

                  {/* Email Card */}
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 hover:border-cyan-500/40 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-semibold mb-1">
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email manzil</span>
                      </div>
                      <p className="text-[11px] text-zinc-200 font-mono break-all font-medium">
                        ismoilovshohjahon750@gmail.com
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-zinc-800/50">
                      <button
                        onClick={() => copyToClipboard('ismoilovshohjahon750@gmail.com', 'Email')}
                        className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1 transition-colors"
                      >
                        {copiedField === 'Email' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'Email' ? "Nusxalandi" : "Nusxalash"}</span>
                      </button>
                      <a
                        href="mailto:ismoilovshohjahon750@gmail.com"
                        className="text-[10px] px-2.5 py-1 rounded bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/50 transition-colors"
                      >
                        Yozish
                      </a>
                    </div>
                  </div>

                  {/* Phone Card */}
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 hover:border-emerald-500/40 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold mb-1">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Telefon</span>
                      </div>
                      <p className="text-xs text-zinc-200 font-mono font-medium">
                        +998(77)-499-71-55
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-zinc-800/50">
                      <button
                        onClick={() => copyToClipboard('+998774997155', 'Telefon')}
                        className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1 transition-colors"
                      >
                        {copiedField === 'Telefon' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'Telefon' ? "Nusxalandi" : "Nusxalash"}</span>
                      </button>
                      <a
                        href="tel:+998774997155"
                        className="text-[10px] px-2.5 py-1 rounded bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 transition-colors"
                      >
                        Qo'ng'iroq
                      </a>
                    </div>
                  </div>
                </div>

                {/* Direct Message Form */}
                <form onSubmit={handleSendContactForm} className="space-y-3 pt-2 border-t border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-300">Tezkor xabar yuborish:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Ismingiz"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="email"
                      placeholder="Email manzilingiz"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Savolingiz yoki taklifingizni kiriting..."
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingMsg ? "Yuborilmoqda..." : "Xabarni yuborish"}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
