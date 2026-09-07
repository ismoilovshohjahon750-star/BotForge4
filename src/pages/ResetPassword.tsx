import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  ArrowLeft, 
  ShieldCheck, 
  Loader2, 
  Mail, 
  KeyRound, 
  AlertCircle,
  Cloud,
  Check
} from 'lucide-react';
import { 
  verifyPasswordResetCode, 
  confirmPasswordReset, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { LogoIcon } from '../components/Logo';
import { toast } from 'sonner';

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL parameters from Firebase email link
  const oobCode = searchParams.get('oobCode') || searchParams.get('code');
  const mode = searchParams.get('mode');

  // Form states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Verification states
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Action states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Request new link state (if no oobCode or code expired)
  const [requestEmail, setRequestEmail] = useState(searchParams.get('email') || '');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSentSuccess, setLinkSentSuccess] = useState(false);

  // 1. Verify oobCode when component mounts
  useEffect(() => {
    if (!oobCode) return;

    let isMounted = true;
    setIsVerifyingCode(true);
    setCodeError(null);

    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        if (isMounted) {
          setVerifiedEmail(email);
          setIsVerifyingCode(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setIsVerifyingCode(false);
          let message = "Tasdiqlash havolasi eskirgan yoki noto'g'ri.";
          if (err.code === 'auth/expired-action-code') {
            message = "Parolni tiklash havolasining amal qilish muddati tugagan. Iltimos, yangi havola so'rang.";
          } else if (err.code === 'auth/invalid-action-code') {
            message = "Havola kodi yaroqsiz yoki allaqachon foydalanilgan.";
          }
          setCodeError(message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [oobCode]);

  // 2. Password Strength Evaluation
  const passwordCriteria = useMemo(() => {
    return {
      hasLength: newPassword.length >= 8,
      hasUpper: /[A-Z]/.test(newPassword),
      hasLower: /[a-z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
    };
  }, [newPassword]);

  const strengthScore = useMemo(() => {
    if (!newPassword) return 0;
    let score = 0;
    if (passwordCriteria.hasLength) score += 1;
    if (passwordCriteria.hasLower && passwordCriteria.hasUpper) score += 1;
    if (passwordCriteria.hasNumber) score += 1;
    if (passwordCriteria.hasSpecial) score += 1;
    return score;
  }, [newPassword, passwordCriteria]);

  const strengthInfo = useMemo(() => {
    if (strengthScore <= 1) {
      return {
        label: "Zaif",
        color: "text-rose-400",
        barColor: "bg-rose-500",
        percent: 25,
      };
    }
    if (strengthScore === 2 || strengthScore === 3) {
      return {
        label: "O'rtacha",
        color: "text-amber-400",
        barColor: "bg-amber-500",
        percent: 65,
      };
    }
    return {
      label: "Kuchli",
      color: "text-emerald-400",
      barColor: "bg-emerald-500",
      percent: 100,
    };
  }, [strengthScore]);

  // 3. Confirm match indicator
  const isMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isFormValid = newPassword.length >= 8 && isMatch && !isSubmitting;

  // 4. Handle Password Update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode) {
      toast.error("Parolni tiklash havolasi mavjud emas.");
      return;
    }

    if (newPassword.length < 8) {
      toast.warning("Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Kiritilgan parollar mos kelmadi!");
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setIsSuccess(true);
      toast.success("Parolingiz muvaffaqiyatli yangilandi!");
    } catch (err: any) {
      console.error("confirmPasswordReset error:", err);
      let errorMsg = "Parolni yangilashda xatolik yuz berdi.";
      if (err.code === 'auth/expired-action-code') {
        errorMsg = "Havolaning muddati o'tgan. Iltimos, qaytadan so'rang.";
      } else if (err.code === 'auth/invalid-action-code') {
        errorMsg = "Ushbu havola yaroqsiz.";
      } else if (err.code === 'auth/weak-password') {
        errorMsg = "Parol juda oddiy. Kuchliroq parol tanlang.";
      }
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Handle Requesting New Reset Link
  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = requestEmail.trim().toLowerCase();
    if (!cleanEmail) {
      toast.info("Iltimos, emailingizni kiriting.");
      return;
    }

    setIsSendingLink(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail, {
        url: window.location.origin + '/reset-password',
        handleCodeInApp: false
      });
      setLinkSentSuccess(true);
      toast.success(`${cleanEmail} manziliga parolni tiklash havolasi yuborildi!`);
    } catch (err: any) {
      console.error("sendPasswordResetEmail error:", err);
      if (err.code === 'auth/user-not-found') {
        toast.error("Ushbu email bilan ro'yxatdan o'tgan hisob topilmadi.");
      } else {
        toast.error("Xat yuborishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
      }
    } finally {
      setIsSendingLink(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-slate-950">
      {/* Dynamic Background Tech Mesh & Radial Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-teal-500/15 via-emerald-500/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-[500px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl" />
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ 
            backgroundImage: `radial-gradient(circle at 1px 1px, #2dd4bf 1px, transparent 0)`,
            backgroundSize: '32px 32px'
          }} 
        />
      </div>

      <div className="relative w-full max-w-md z-10 animate-in fade-in zoom-in-95 duration-300">
        {/* SUCCESS VIEW */}
        {isSuccess ? (
          <Card className="border border-emerald-500/20 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-emerald-500/10 rounded-2xl overflow-hidden text-center">
            <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 via-emerald-400 to-green-500" />
            <CardHeader className="pt-8 pb-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20 animate-bounce">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-white tracking-tight">
                Parol Muvaffaqiyatli Yangilandi!
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm mt-2 leading-relaxed">
                Hisobingizning xavfsizlik paroli yangilandi. Endi yangi parolingiz orqali CloudBot boshqaruv paneliga kirishingiz mumkin.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-8 pt-2">
              <Button
                type="button"
                onClick={() => navigate('/auth')}
                className="w-full py-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Tizimga Kirish</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </Button>
            </CardContent>
          </Card>
        ) : isVerifyingCode ? (
          /* VERIFYING CODE STATE */
          <Card className="border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-2xl p-8 text-center">
            <Loader2 className="w-10 h-10 text-teal-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white">Havola tekshirilmoqda...</h3>
            <p className="text-xs text-slate-400 mt-2">Iltimos kuting, xavfsizlik kodi tekshirilmoqda.</p>
          </Card>
        ) : codeError ? (
          /* CODE EXPIRED / INVALID STATE */
          <Card className="border border-rose-500/20 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden">
            <div className="h-1.5 w-full bg-rose-500" />
            <CardHeader className="pt-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-3">
                <AlertCircle className="w-7 h-7 text-rose-400" />
              </div>
              <CardTitle className="text-xl font-bold text-white">Havola Yaroqsiz</CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-1">
                {codeError}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {linkSentSuccess ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-emerald-300 font-medium">Yangi havola emailingizga yuborildi! Pochtani tekshiring.</p>
                </div>
              ) : (
                <form onSubmit={handleSendResetEmail} className="space-y-3">
                  <label className="text-xs font-semibold text-slate-300">Yangi havola olish uchun emailni kiriting:</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      className="pl-10 py-5 bg-slate-950/60 border-white/10 rounded-xl text-white text-sm"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSendingLink}
                    className="w-full py-5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md"
                  >
                    {isSendingLink ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Qayta Havola Yuborish
                  </Button>
                </form>
              )}

              <div className="text-center pt-2">
                <Link to="/auth" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kirish sahifasiga qaytish</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : !oobCode ? (
          /* NO CODE PROVIDED (DIRECT ACCESS -> REQUEST RESET LINK) */
          <Card className="border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden">
            <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400" />
            <CardHeader className="text-center pt-6 pb-4">
              {/* Sleek CloudBot Logo & Lock Icon Placeholder */}
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="relative">
                  <LogoIcon size={38} />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center shadow-md">
                    <Lock className="w-3 h-3" />
                  </div>
                </div>
              </div>
              <CardTitle className="text-xl font-bold text-white tracking-tight">
                Parolni Tiklash
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Hisobingiz email manzilini kiriting. Biz sizga xavfsiz parolni tiklash havolasini yuboramiz.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {linkSentSuccess ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Havola Yuborildi!</h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      <strong className="text-emerald-300">{requestEmail}</strong> pochtasiga xat yuborildi. Iltimos, xat ichidagi havolani bosing.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLinkSentSuccess(false)}
                    className="text-xs py-2 border-white/10 text-slate-300 hover:bg-white/5"
                  >
                    Boshqa email kiritish
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSendResetEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Email Manzil</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <Input
                        type="email"
                        placeholder="namuna@gmail.com"
                        value={requestEmail}
                        onChange={(e) => setRequestEmail(e.target.value)}
                        className="pl-10 py-5 bg-slate-950/60 border-white/10 focus:border-teal-400 rounded-xl text-white text-sm"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSendingLink}
                    className="w-full py-6 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-extrabold text-sm shadow-lg shadow-teal-500/15 cursor-pointer transition-all"
                  >
                    {isSendingLink ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Yuborilmoqda...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4 mr-2" />
                        <span>Tiklash Havolasini Yuborish</span>
                      </>
                    )}
                  </Button>
                </form>
              )}

              <div className="text-center pt-2">
                <Link to="/auth" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kirish sahifasiga qaytish</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* ACTIVE RESET FORM WITH VERIFIED OOBCODE */
          <Card className="border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-teal-500/5 rounded-2xl overflow-hidden">
            {/* Top Accent Line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400" />
            
            <CardHeader className="text-center pt-7 pb-4">
              {/* Branding: Sleek CloudBot Logo with Lock icon badge */}
              <div className="flex items-center justify-center gap-2.5 mb-3">
                <div className="relative">
                  <LogoIcon size={38} />
                  <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 flex items-center justify-center shadow-md border-2 border-slate-900">
                    <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                  </div>
                </div>
              </div>

              <CardTitle className="text-2xl font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
                <span>Cloud</span><span className="text-teal-400">Bot</span>
                <span className="text-slate-400 text-lg font-normal ml-1">· Parolni Yangilash</span>
              </CardTitle>

              <CardDescription className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
                {verifiedEmail ? (
                  <span><strong className="text-teal-300 font-semibold">{verifiedEmail}</strong> hisobi uchun yangi maxfiy parol o'rnating.</span>
                ) : (
                  "Hisobingiz uchun yangi xavfsiz va mustahkam parol tanlang."
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 pb-7">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 1. New Password Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Yangi parol</label>
                    {newPassword && (
                      <span className={`text-[11px] font-bold ${strengthInfo.color}`}>
                        {strengthInfo.label}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Yangi parolni kiriting"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10 pr-10 py-5 bg-slate-950/60 border-white/10 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 rounded-xl text-white text-sm tracking-wide transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Progress Bar */}
                  {newPassword && (
                    <div className="pt-1.5 space-y-1">
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex gap-1">
                        <div 
                          className={`h-full transition-all duration-300 rounded-full ${strengthInfo.barColor}`} 
                          style={{ width: `${strengthInfo.percent}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[10.5px] text-slate-400 pt-1">
                        <span className={`flex items-center gap-1 ${passwordCriteria.hasLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <Check className="w-3 h-3" /> Kamida 8 ta belgi
                        </span>
                        <span className={`flex items-center gap-1 ${passwordCriteria.hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <Check className="w-3 h-3" /> Raqamlar (0-9)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Confirm New Password Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Parolni tasdiqlang</label>
                    {confirmPassword && (
                      <span className={`text-[11px] font-semibold ${isMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isMatch ? "Mos keldi" : "Mos emas"}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <ShieldCheck className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                      isMatch ? 'text-emerald-400' : isMismatch ? 'text-rose-400' : 'text-slate-400'
                    }`} />
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Parolni qayta kiriting"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`pl-10 pr-10 py-5 bg-slate-950/60 border rounded-xl text-white text-sm tracking-wide transition-all ${
                        isMatch 
                          ? 'border-emerald-500/60 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400' 
                          : isMismatch 
                          ? 'border-rose-500/60 focus:border-rose-400 focus:ring-1 focus:ring-rose-400' 
                          : 'border-white/10 focus:border-teal-400'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                      aria-label="Toggle confirm password visibility"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Real-time Confirmation Feedback */}
                  {confirmPassword && (
                    <div className="flex items-center gap-1.5 text-[11px] pt-1">
                      {isMatch ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Parollar bir xil kiritildi</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-rose-300">Parollar bir-biriga mos kelmadi</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Primary Action Button */}
                <Button
                  type="submit"
                  disabled={!isFormValid}
                  className="w-full py-6 rounded-xl bg-gradient-to-r from-teal-500 via-emerald-500 to-green-600 hover:from-teal-400 hover:via-emerald-400 hover:to-green-500 active:scale-[0.99] text-slate-950 font-extrabold text-sm shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Yangilanmoqda...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4 text-slate-950" />
                      <span>Parolni Yangilash</span>
                    </>
                  )}
                </Button>
              </form>

              {/* Navigation Footer */}
              <div className="text-center pt-2 border-t border-white/5">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 font-medium transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kirish sahifasiga qaytish</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
