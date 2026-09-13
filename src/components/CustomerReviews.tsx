import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useFeedback } from '../context/FeedbackContext';

export interface FeedbackItem {
  id?: number | string;
  userId?: string;
  userName: string;
  userEmail?: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

// Color palettes for fallback avatars
const AVATAR_GRADIENTS = [
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-indigo-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-emerald-600'
];

function getInitials(name: string): string {
  if (!name) return 'F';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Yaqinda';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Hozirgina';
    if (diffHours < 24) return `${diffHours} soat oldin`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return 'Kecha';
    if (diffDays < 7) return `${diffDays} kun oldin`;
    return d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
  } catch {
    return 'Yaqinda';
  }
}

// Avatar component that retrieves profile picture from email with fallback to initials
const ReviewAvatar: React.FC<{ name: string; email?: string; gradient: string }> = ({
  name,
  email,
  gradient
}) => {
  const [hasError, setHasError] = useState(false);
  const cleanEmail = email?.trim().toLowerCase();
  const avatarUrl = cleanEmail && cleanEmail.includes('@') && !cleanEmail.includes('anonymous')
    ? `https://unavatar.io/${encodeURIComponent(cleanEmail)}`
    : null;

  if (avatarUrl && !hasError) {
    return (
      <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/60 shadow-sm shrink-0 flex items-center justify-center">
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${gradient} flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0`}
    >
      {getInitials(name)}
    </div>
  );
};

export const CustomerReviews: React.FC = () => {
  const { feedbackUpdateTrigger } = useFeedback();
  const [reviews, setReviews] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch only real user feedback from API
  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/feedback');
      const data = await res.json();

      if (data.success && Array.isArray(data.feedbacks) && data.feedbacks.length > 0) {
        const realFeedbacks: FeedbackItem[] = data.feedbacks
          .map((f: any) => ({
            id: `db-${f.id}`,
            userId: f.userId,
            userName: f.userName || 'Foydalanuvchi',
            userEmail: f.userEmail,
            rating: Number(f.rating) || 5,
            comment: f.comment || '',
            createdAt: f.createdAt
          }))
          .filter((f: FeedbackItem) => f.comment && f.comment.trim().length > 0);

        setReviews(realFeedbacks);
      } else {
        setReviews([]);
      }
    } catch (err) {
      console.error('Failed to fetch customer feedbacks:', err);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, [feedbackUpdateTrigger]);

  // If there are no real reviews yet, do not display the section
  if (!loading && reviews.length === 0) {
    return null;
  }

  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, curr) => acc + (curr.rating || 5), 0) / reviews.length).toFixed(1)
    : '5.0';

  return (
    <section className="relative py-12 md:py-16 px-4 overflow-hidden border-t border-zinc-800/80 bg-zinc-950">
      <div className="container mx-auto max-w-5xl relative z-10">
        {/* Section Header - Compact */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold mb-3">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className="w-3 h-3 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="font-bold text-amber-400 ml-1">{avgRating}/5.0</span>
            <span className="text-zinc-500">•</span>
            <span>Mijozlar fikrlari</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Mijozlarimiz fikrlari
          </h2>
        </div>

        {/* Reviews Grid - Compact cards */}
        <div className={`grid gap-4 ${reviews.length === 1 ? 'max-w-md mx-auto' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {reviews.map((item, index) => {
            const avatarGrad = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];

            return (
              <motion.div
                key={item.id || index}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.3) }}
                className="p-4 sm:p-5 rounded-2xl border bg-[#111520] border-zinc-800/90 hover:border-zinc-700/90 shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top user bar: Avatar (from email) + Name + Date */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ReviewAvatar
                        name={item.userName}
                        email={item.userEmail}
                        gradient={avatarGrad}
                      />
                      <h4 className="text-sm font-semibold text-white truncate">
                        {item.userName}
                      </h4>
                    </div>
                    <span className="text-[11px] text-zinc-500 shrink-0">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>

                  {/* Rating Stars */}
                  <div className="flex items-center gap-1 mb-2.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= item.rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-zinc-700 fill-zinc-800'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-semibold text-amber-400/90 ml-1">
                      {item.rating}.0
                    </span>
                  </div>

                  {/* Review Text */}
                  <p className="text-sm text-zinc-200 leading-relaxed italic">
                    "{item.comment}"
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
