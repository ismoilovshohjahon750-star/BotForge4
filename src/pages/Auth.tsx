import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect 
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from '../lib/firebase';
import { LogoIcon } from '../components/Logo';
import { 
  Bot, 
  Mail, 
  Github, 
  Lock, 
  UserCheck, 
  Key, 
  ShieldCheck, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle,
  Send,
  HelpCircle,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

export const Auth: React.FC = () => {
  const { user } = useAuth();
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // Custom interactive credentials states
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Email verification state variables for displaying designed Uzbek mail body
  const [verificationSent, setVerificationSent] = useState<boolean>(false);
  const [sentEmailAddress, setSentEmailAddress] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Handle Google OAuth
  const handleGoogleLogin = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
      toast.success("Google orqali muvaffaqiyatli kirdingiz!");
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        try {
          toast.info("Oyna bloklangani sababli yo'naltirilmoqda...");
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirErr) {
          toast.error("Oyna bloklangan. Iltimos Email va Parol orqali kiring.");
        }
      } else if (error.code === 'auth/popup-closed-by-user') {
        // User closed popup
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error("Ushbu email manzili allaqachon boshqa kirish usuli bilan ro'yxatdan o'tkazilgan. Iltimos o'sha usuldan foydalanib kiring.");
      } else if (error.code === 'auth/user-disabled') {
        toast.error("Ushbu hisob admin tomonidan cheklangan. Iltimos qo'llab-quvvatlash xizmatiga murojaat qiling.");
      } else {
        toast.error("Google orqali kirishda xatolik yuz berdi: " + (error.message || 'Xatolik'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Classic Email & Password submission
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Barcha maydonlarni to'ldirish majburiy!");
      return;
    }

    if (isSignUp) {
      if (password !== confirmPassword) {
        toast.error("Parollar bir-biriga mos kelmadi!");
        return;
      }
      if (password.length < 6) {
        toast.error("Parol uzunligi kamida 6 ta belgidan iborat bo'lishi shart!");
        return;
      }

      setLoading(true);
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const currentUser = userCredential.user;
        
        // Dispatch official verification email with return URL
        try {
          await sendEmailVerification(currentUser, {
            url: window.location.origin + '/dashboard',
            handleCodeInApp: false
          });
          setSentEmailAddress(email.trim());
          setVerificationSent(true);
          toast.success("Tasdiqlash havolasi kiritilgan emailingizga yuborildi! Pochtani tekshiring.");
        } catch (verifError: any) {
          console.warn("sendEmailVerification notice:", verifError);
          setSentEmailAddress(email.trim());
          setVerificationSent(true);
          toast.info("Hisob yaratildi. Tasdiqlash xati yuborildi.");
        }
      } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
          setIsSignUp(false);
          toast.error("Ushbu email allaqachon ro'yxatdan o'tgan! Kirish oynasiga o'tkazildingiz. Parolingizni kiriting yoki 'Parolni unutdingizmi?' orqali tiklang.");
        } else if (error.code === 'auth/user-disabled') {
          toast.error("Ushbu hisob admin tomonidan cheklangan. Iltimos qo'llab-quvvatlash xizmatiga murojaat qiling.");
        } else if (error.code === 'auth/invalid-email') {
          toast.error("Email manzili noto'g'ri kiritilgan!");
        } else if (error.code === 'auth/weak-password') {
          toast.error("Parol juda oddiy! Kamida 6 ta belgidan iborat kuchliroq parol kiriting.");
        } else {
          toast.error("Xatolik: " + (error.message || "Ro'yxatdan o'tishda xatolik yuz berdi"));
        }
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const loggedUser = userCredential.user;
        
        if (loggedUser && !loggedUser.emailVerified) {
          toast.info("Tizimga kirdingiz. Emailingiz hali tasdiqlanmagan.");
        } else {
          toast.success("Tizimga muvaffaqiyatli kirdingiz!");
        }
        window.location.href = '/dashboard';
      } catch (error: any) {
        if (error.code === 'auth/user-disabled') {
          toast.error("Ushbu hisob admin tomonidan cheklangan. Iltimos qo'llab-quvvatlash xizmatiga murojaat qiling.");
        } else if (
          error.code === 'auth/invalid-credential' || 
          error.code === 'auth/user-not-found' || 
          error.code === 'auth/wrong-password' ||
          error.code === 'auth/invalid-login-credentials'
        ) {
          toast.error("Email yoki parol noto'g'ri! Iltimos tekshirib qaytadan kiring yoki 'Parolni unutdingizmi?' orqali parolni tiklang.");
        } else if (error.code === 'auth/invalid-email') {
          toast.error("Email manzili noto'g'ri kiritilgan!");
        } else if (error.code === 'auth/too-many-requests') {
          toast.error("Bir necha marta xato urinish bo'ldi. Iltimos birozdan so'ng qayta urinib ko'ring yoki 'Parolni unutdingizmi?' orqali yangilang.");
        } else {
          toast.error("Kirishda xatolik: " + (error.message || "Xatolik yuz berdi"));
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle Forgot Password
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.info("Iltimos, avval Email Manzil maydoniga emailingizni kiriting va so'ng 'Parolni unutdingizmi?' tugmasini bosing.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: window.location.origin + '/auth',
        handleCodeInApp: false
      });
      toast.success(`${email.trim()} manziliga parolni tiklash havolasi yuborildi! Pochtani tekshiring.`);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        toast.error("Ushbu email bilan ro'yxatdan o'tgan foydalanuvchi topilmadi.");
      } else if (err.code === 'auth/invalid-email') {
        toast.error("Email manzili noto'g'ri formatda.");
      } else {
        toast.error("Parolni tiklashda xatolik: " + (err.message || "Xatolik yuz berdi"));
      }
    } finally {
      setLoading(false);
    }
  };

  // Resend Verification Email Functionality
  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser, {
          url: window.location.origin + '/dashboard',
          handleCodeInApp: false
        });
        toast.success("Tasdiqlash havolasi qayta yuborildi! Pochtani tekshiring.");
        setResendCooldown(60);
        const timer = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } catch (e: any) {
        toast.error("Xat yuborishda xatolik: " + (e.message || 'Xatolik yuz berdi'));
      }
    } else {
      toast.error("Foydalanuvchi tizimda topilmadi, qaytadan ro'yxatdan o'ting.");
    }
  };

  // Check verification status live
  const handleCheckVerification = async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          toast.success("Email muvaffaqiyatli tasdiqlandi! Boshqaruv paneliga yo'naltirilmoqda...");
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 800);
        } else {
          toast.warning("Email hali tasdiqlanmagan. Iltimos, emailingizga kelgan havolani bosing va qayta tekshiring.");
        }
      } catch (err: any) {
        toast.error("Tekshirishda xatolik: " + err.message);
      }
    } else {
      window.location.href = '/dashboard';
    }
  };

  // Quick email provider link helper
  const getEmailProviderUrl = (emailAddr: string) => {
    const domain = emailAddr.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'https://mail.google.com';
    if (domain.includes('mail.ru') || domain.includes('bk.ru') || domain.includes('inbox.ru')) return 'https://e.mail.ru';
    if (domain.includes('yandex') || domain.includes('ya.ru')) return 'https://mail.yandex.com';
    if (domain.includes('outlook') || domain.includes('hotmail')) return 'https://outlook.live.com';
    return 'https://' + domain;
  };

  return (
    <div className="relative min-h-screen bg-[#07070a] text-slate-100 flex flex-col justify-center items-center py-12 px-4 overflow-hidden select-none">
      
      {/* Absolute futuristic ambient glow design (Vibe focused background logic) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Main card logic - centered layout with focus (Promotional block removed per user request) */}
      <div className="w-full max-w-md relative z-10">
        
        {user && !verificationSent ? (
          <Card className="w-full bg-[#0d0d14]/90 backdrop-blur-xl border border-emerald-500/20 text-center relative overflow-hidden shadow-2xl rounded-3xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <CardHeader className="pt-8">
              <div className="mx-auto w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">Xush Kelibsiz!</CardTitle>
              <CardDescription className="text-slate-400">Siz allaqachon tizimga muvaffaqiyatli kirgansiz.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-8 px-6">
              <p className="text-xs text-slate-500 font-mono">Sessiya ID: {user.uid.slice(0, 16)}...</p>
              <Button className="w-full py-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-500/10 cursor-pointer" onClick={() => window.location.href = '/dashboard'}>
                Boshqaruv Paneliga O'tish <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ) : verificationSent ? (
            /* Email Verification Portal and Beautiful Uzbek Message Card */
            <Card className="w-full bg-[#0d0d14]/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl overflow-hidden animate-fade-in relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />
              
              <CardHeader className="text-center pb-2 pt-6">
                <div className="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-3 text-emerald-400 relative">
                  <span className="absolute inset-0 rounded-2xl bg-emerald-500/10 animate-ping" />
                  <Mail className="w-8 h-8 text-emerald-400 relative z-10" />
                </div>
                <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">Tasdiqlash Havolasi Yuborildi!</CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-1">
                  Siz kiritgan <span className="text-emerald-400 font-mono break-all font-semibold">{sentEmailAddress}</span> manziliga faollashtirish havolasi yo'llandi.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 px-6 pb-8">
                
                {/* Step by step action guide */}
                <div className="bg-[#12121c] border border-white/5 rounded-2xl p-4 space-y-3 text-xs text-slate-300">
                  <div className="font-bold text-white flex items-center gap-2 text-xs uppercase tracking-wide">
                    <Sparkles className="w-4 h-4 text-emerald-400" /> Hisobingizni faollashtirish uchun:
                  </div>
                  <ol className="space-y-2 text-slate-400 text-xs list-decimal list-inside leading-relaxed">
                    <li><strong className="text-slate-200">Email pochtangizni</strong> oching.</li>
                    <li><strong className="text-slate-200">Botly</strong> tomonidan yuborilgan tasdiqlash xatini toping.</li>
                    <li>Xat ichidagi <strong className="text-emerald-400">Tasdiqlash havolasini</strong> bosing.</li>
                    <li>Tasdiqlagandan so'ng pastdagi <strong>"Tasdiqlanganini tekshirish"</strong> tugmasini bosing.</li>
                  </ol>
                </div>

                {/* Direct Open Mailbox Button */}
                {sentEmailAddress && (
                  <a
                    href={getEmailProviderUrl(sentEmailAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs transition-all shadow-sm group"
                  >
                    <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span>Pochtani ochish ({sentEmailAddress.split('@')[1] || 'Email'})</span>
                  </a>
                )}

                {/* Verification Guidance Alerts */}
                <div className="p-3.5 bg-yellow-500/5 border border-yellow-500/10 rounded-xl text-[11.5px] text-yellow-400/90 flex items-start gap-2.5 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
                  <div>
                    <strong className="block text-white mb-0.5">Xat kelmadimi?</strong>
                    Iltimos, pochtangizning <strong>Spam (Keraksiz xatlar)</strong> yoki <strong>Promotions (Reklama)</strong> bo'limlarini ham tekshirib ko'ring.
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleResendVerification}
                    disabled={resendCooldown > 0}
                    className="py-5 border-white/10 hover:bg-white/5 rounded-xl text-xs font-semibold text-slate-300 disabled:opacity-50"
                  >
                    {resendCooldown > 0 ? `Qayta yuborish (${resendCooldown}s)` : "Xatni Qayta Yuborish"}
                  </Button>
                  <Button 
                    type="button" 
                    onClick={handleCheckVerification}
                    className="py-5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/15"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Tasdiqlandi, Kirish
                  </Button>
                </div>

                <div className="text-center pt-2">
                  <button 
                    type="button" 
                    onClick={() => setVerificationSent(false)} 
                    className="text-[11px] text-slate-400 hover:text-white font-medium hover:underline transition-all cursor-pointer"
                  >
                    ← Kirish sahifasiga qaytish
                  </button>
                </div>

              </CardContent>
            </Card>
          ) : (
            /* Traditional login layout with Email tabs */
            <Card className="w-full bg-[#0d0d14]/90 backdrop-blur-xl border border-white/10 shadow-3xl rounded-3xl overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-600" />
              
              <CardHeader className="text-center pb-4 pt-8">
                <div className="mx-auto w-14 h-14 bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 rounded-2xl flex items-center justify-center mb-3 border border-emerald-500/10 shadow-lg">
                  <LogoIcon size={38} />
                </div>
                <CardTitle className="text-2xl font-black text-white tracking-tight uppercase">
                  {isSignUp ? 'Yangi Hisob Yaratish' : 'Tizimga Kirish'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  {isSignUp 
                    ? 'Botly platformasining imkoniyatlaridan to\'liq foydalanish uchun ro\'yxatdan o\'ting'
                    : 'Boshqaruv paneliga kirish va botlarni boshqarish uchun tizimga kiring'
                  }
                </CardDescription>
              </CardHeader>

              {/* Login Tab Toggles */}
              <div className="px-6 pb-2">
                <div className="flex p-1 bg-[#12121c] rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                      !isSignUp ? 'bg-[#181826] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSignUp(true)}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                      isSignUp ? 'bg-[#181826] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
              </div>

              <CardContent className="space-y-5 px-6 pb-8 pt-4">
                
                {/* Social Login Full Width Container (First) */}
                <div className="w-full">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 border border-white/10 bg-[#12121c] hover:bg-[#181826]/80 text-white text-xs font-bold rounded-xl transition-all cursor-pointer select-none shadow-md"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    <span>Google orqali kirish</span>
                  </button>
                </div>

                {/* Separator block */}
                <div className="relative my-4 select-none flex items-center gap-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-white/15" />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-[#6b6b99] font-mono font-black shrink-0">
                    yoki
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/10 to-white/15" />
                </div>

                {/* Traditional Email / Password Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  
                  {/* Email Input */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Email Manzil:</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder=""
                        className="w-full bg-[#12121c] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-sans"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between pl-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maxfiy Parol:</label>
                      {!isSignUp && (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={loading}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors cursor-pointer hover:underline"
                        >
                          Parolni unutdingizmi?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder=""
                        className="w-full bg-[#12121c] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password (Only if Sign Up) */}
                  {isSignUp && (
                    <div className="space-y-1.5 text-left animate-fade-in">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Parolni Tasdiqlang:</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Key className="w-4 h-4" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder=""
                          className="w-full bg-[#12121c] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Submit Action Button */}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full py-6 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-xs uppercase tracking-wider shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>{isSignUp ? "Hisob yaratish va emailni tasdiqlash" : "Tizimga xavfsiz kirish"}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </Button>
                </form>

                {/* Premium quality notice statement tag */}
                <div className="pt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Barcha huquqlar himoyalangan</span>
                </div>

              </CardContent>
            </Card>
          )}

      </div>
    </div>
  );
};
