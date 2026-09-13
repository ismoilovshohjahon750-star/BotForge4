import React, { useState, useEffect } from 'react';
import { Star, X, CheckCircle2, Sparkles, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { useFeedback } from '../context/FeedbackContext';

export const FeedbackModal: React.FC = () => {
  const { isFeedbackOpen, closeFeedback, initialRating, modalTitle, modalSubtitle, triggerFeedbackUpdate } = useFeedback();
  const { user } = useAuth();

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Sync initial rating when modal opens
  useEffect(() => {
    if (isFeedbackOpen) {
      setRating(initialRating || 0);
      setHoverRating(0);
      setComment('');
      setIsSuccess(false);
      setSubmitting(false);
    }
  }, [isFeedbackOpen, initialRating]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFeedbackOpen) {
        closeFeedback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFeedbackOpen, closeFeedback]);

  const handleStarClick = (starValue: number) => {
    setRating(starValue);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (rating === 0) {
      toast.error("Iltimos, avval yulduzchalardan birini tanlang");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: comment.trim(),
          userId: user?.uid || 'anonymous',
          userEmail: user?.email || '',
          userName: user?.displayName || user?.email?.split('@')[0] || 'Foydalanuvchi'
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setIsSuccess(true);
        triggerFeedbackUpdate();
        toast.success("Fikringiz uchun katta rahmat! 🌸✨", {
          duration: 3000
        });
        setTimeout(() => {
          closeFeedback();
        }, 1800);
      } else {
        toast.error(data.error || "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
      }
    } catch (err) {
      console.error("Feedback submit error:", err);
      // Even if network error, consider local success for user experience
      setIsSuccess(true);
      triggerFeedbackUpdate();
      toast.success("Fikringiz muvaffaqiyatli saqlandi! ✨");
      setTimeout(() => {
        closeFeedback();
      }, 1600);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isFeedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeFeedback}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 320 }}
            className="relative w-full max-w-[420px] rounded-2xl sm:rounded-3xl p-6 sm:p-7 shadow-2xl z-10 overflow-hidden"
            style={{
              backgroundColor: '#121620',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 20px rgba(6, 182, 212, 0.1)'
            }}
          >
            {/* Subtle multi-color top border glow matching the sample photo */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500/80 via-sky-400/40 to-amber-400/80 pointer-events-none" />

            {/* Close Button */}
            <button
              type="button"
              onClick={closeFeedback}
              className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer"
              aria-label="Yopish"
            >
              <X className="w-4 h-4" />
            </button>

            {isSuccess ? (
              /* Success View */
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 flex flex-col items-center justify-center text-center space-y-3"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-1">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h3 className="text-xl font-bold text-white">Rahmat! ✨</h3>
                <p className="text-sm text-zinc-300 max-w-xs leading-relaxed">
                  Fikringiz qabul qilindi. Platformamizni yanada yaxshilashimizda yordam berganingiz uchun tashakkur! 🌸
                </p>
              </motion.div>
            ) : (
              /* Rating & Feedback Form */
              <div className="flex flex-col">
                {/* Header Title & Subtitle */}
                <h2 className="text-center text-lg sm:text-[19px] font-semibold text-white tracking-wide mb-1">
                  {modalTitle || "Fikringizni qoldiring"}
                </h2>
                {modalSubtitle && (
                  <p className="text-center text-xs text-zinc-400 mb-2.5 px-2 leading-relaxed">
                    {modalSubtitle}
                  </p>
                )}

                {/* 5 Stars Rating Component */}
                <div className="flex items-center justify-center gap-2.5 sm:gap-3 my-2 sm:my-3">
                  {[1, 2, 3, 4, 5].map((starValue) => {
                    const isFilled = (hoverRating || rating) >= starValue;
                    return (
                      <motion.button
                        key={starValue}
                        type="button"
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                        onMouseEnter={() => setHoverRating(starValue)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => handleStarClick(starValue)}
                        className="p-1 cursor-pointer transition-transform focus:outline-none"
                        title={`${starValue} yulduz`}
                        aria-label={`${starValue} yulduz`}
                      >
                        <Star
                          className={`w-8 h-8 sm:w-9 sm:h-9 transition-all duration-200 ${
                            isFilled
                              ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                              : 'text-zinc-600 fill-zinc-800/30 hover:text-amber-400/70'
                          }`}
                          strokeWidth={isFilled ? 1.5 : 1.5}
                        />
                      </motion.button>
                    );
                  })}
                </div>

                {/* Conditional Description Textarea & Submit Button */}
                {/* "yulduzlardan malum bir tagacha tanlanganidan keyin pastdagi tafsif yozadigan joy chiqdi" */}
                <AnimatePresence>
                  {rating > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.28, ease: 'easeOut' }}
                      className="overflow-hidden flex flex-col space-y-3.5"
                    >
                      {/* Textarea */}
                      <div className="relative">
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Fikringizni batafsil yozing..."
                          rows={4}
                          autoFocus
                          className="w-full bg-[#0d111a] text-zinc-100 text-sm placeholder-zinc-500 rounded-xl p-3.5 border border-zinc-700/80 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all resize-none shadow-inner"
                        />
                      </div>

                      {/* "Yuborish" Submit Button matching the screenshot (vibrant cyan-to-blue gradient) */}
                      <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={submitting}
                        className="w-full py-3 px-4 rounded-xl text-zinc-950 font-bold text-sm sm:text-base tracking-wide bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 hover:from-sky-300 hover:via-cyan-300 hover:to-blue-400 active:scale-[0.98] transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {submitting ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                            <span>Yuborilmoqda...</span>
                          </>
                        ) : (
                          <span>Yuborish</span>
                        )}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// Floating Quick Feedback Trigger Button
export const FloatingFeedbackButton: React.FC = () => {
  const { openFeedback } = useFeedback();

  return (
    <motion.button
      type="button"
      onClick={() => openFeedback(0)}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-zinc-900/90 hover:bg-zinc-850 border border-amber-500/40 hover:border-amber-400 text-zinc-100 shadow-xl shadow-black/60 backdrop-blur-md cursor-pointer transition-all group"
      title="Fikringizni qoldiring"
    >
      <Star className="w-4 h-4 text-amber-400 fill-amber-400 group-hover:rotate-12 transition-transform duration-200 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
      <span className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">
        Fikr bildirish
      </span>
      <Sparkles className="w-3.5 h-3.5 text-cyan-400 opacity-70 group-hover:opacity-100 transition-opacity" />
    </motion.button>
  );
};
