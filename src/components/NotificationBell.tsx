import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2, AlertTriangle, Crown, Zap, Info, ShieldAlert, MessageSquare, X, UserPlus } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, orderBy } from 'firebase/firestore';
import { safeUpdateDoc, safeDeleteDoc, safeAddDoc } from '../lib/safeFirestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export interface AppNotification {
  id: string;
  userId: string;
  userEmail?: string;
  title: string;
  message: string;
  type?: 'due_warning' | 'sub_assigned' | 'sub_expired' | 'chat_message' | 'contact_message' | 'chat_invite' | 'chat_invite_accepted' | 'chat_invite_declined' | 'admin_alert' | string;
  chatId?: string;
  senderEmail?: string;
  senderName?: string;
  status?: 'pending' | 'accepted' | 'declined' | string;
  createdAt: string;
  read: boolean;
}

export const NotificationBell: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewAlert, setHasNewAlert] = useState(false);
  const [hasPromptedNative, setHasPromptedNative] = useState(false);
  const [nativePermStatus, setNativePermStatus] = useState<string>('granted'); // Default to granted to hide until evaluated

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNativePermStatus(Notification.permission);
      }
    } catch (e) {
      console.warn("Could not read Notification.permission", e);
    }
  }, []);

  // Request browser notification permission for phone system panel
  const requestNativeNotificationPermission = async () => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'denied') {
          toast.info("Brauzer sozlamalaridan (Sayt sozlamalari > Bildirishnomalar) ushbu sayt uchun bildirishnomalarni yoqishingiz kerak.");
          return;
        }
        const perm = await Notification.requestPermission();
        setNativePermStatus(perm);
        if (perm === 'granted') {
          toast.success("Telefon tizim bildirishnomalari yoqildi!");
          new Notification("Bildirishnomalar Faol!", {
            body: "Endi obuna, to'lov va chat xabarlari to'g'ridan-to'g'ri telefoningiz bildirishnoma panelida chiqadi.",
            icon: "/favicon.svg"
          });
        } else {
          toast.info("Telefon bildirishnomasiga ruxsat berilmadi. Sozlamalardan yoqishingiz mumkin.");
        }
      } else {
        toast.error("Brauzeringiz tizim bildirishnomalarini qo'llab-quvvatlamaydi");
      }
    } catch (e) {
      console.warn("Notification error:", e);
      toast.info("Sizning qurilmangizda bildirishnomalar qo'llab-quvvatlanmaydi yoki xatolik yuz berdi.");
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch user or admin notifications
    const q = query(
      collection(db, 'notifications')
    );

    let initialLoad = true;

    const unsub = onSnapshot(q, (snapshot) => {
      const all: AppNotification[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as AppNotification));

      // Filter relevant notifications for current user or admin
      const relevant = all.filter(n => {
        const myEmail = user.email?.toLowerCase();
        const senderEmail = n.senderEmail?.toLowerCase();

        // 1. Never notify the user about their own message or action
        if (senderEmail && myEmail && senderEmail === myEmail) {
          return false;
        }

        // 2. If notification is strictly marked for admin
        if (n.userId === 'admin') {
          return isAdmin;
        }

        // 3. If notification is addressed to this user's UID or Email
        if (n.userId && (n.userId === user.uid || n.userId.toLowerCase() === myEmail)) return true;
        if (n.userEmail && myEmail && n.userEmail.toLowerCase() === myEmail) return true;

        // 4. Admin fallback for system events (contact messages)
        if (isAdmin && (n.type === 'chat_message' || n.type === 'contact_message')) {
          // Only show to admin if admin wasn't the sender
          return true;
        }

        return false;
      });

      // Sort by createdAt desc
      relevant.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Check for new unread items
      const unreads = relevant.filter(n => !n.read);
      if (unreads.length > 0) {
        setHasNewAlert(true);

        // If newly added in real-time after initial load, fire native phone system notification!
        try {
          if (!initialLoad && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const latest = unreads[0];
            new Notification(latest.title, {
              body: latest.message,
              icon: '/favicon.svg'
            });
          }
        } catch (e) {
          console.warn("Failed to check/fire native notification:", e);
        }
      }

      setNotifications(relevant);
      initialLoad = false;
    }, (error: any) => {
      console.warn("Notification snapshot warning:", error?.message || error);
      if (error?.code === 'resource-exhausted' || error?.code === 'unavailable') {
        unsub();
      }
    });

    return () => unsub();
  }, [user, isAdmin]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const deleteAllNotifications = async () => {
    setHasNewAlert(false);
    const toDelete = [...notifications];
    setNotifications([]);
    toast.success("Barcha bildirishnomalar o'chirildi");
    for (const n of toDelete) {
      await safeDeleteDoc(doc(db, 'notifications', n.id));
    }
  };

  const markAllRead = async () => {
    setHasNewAlert(false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    for (const n of notifications) {
      if (!n.read) {
        await safeUpdateDoc(doc(db, 'notifications', n.id), { read: true });
      }
    }
  };

  const markSingleRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await safeUpdateDoc(doc(db, 'notifications', id), { read: true });
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast.success("Bildirishnoma o'chirildi");
    await safeDeleteDoc(doc(db, 'notifications', id));
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.read) {
      await markSingleRead(n.id);
    }
    setIsOpen(false);

    if (n.chatId) {
      navigate(`/messages?chatId=${n.chatId}`);
    } else if (n.type === 'chat_message' || n.type === 'contact_message' || n.type === 'chat_invite_accepted') {
      navigate('/messages');
    }
  };

  const handleAcceptChatInvite = async (n: AppNotification) => {
    try {
      const senderNameVal = n.senderName || n.senderEmail?.split('@')[0] || 'Foydalanuvchi';
      const senderEmailVal = n.senderEmail || '';

      // 1. Create active chat document in contact_messages
      const docRef = await safeAddDoc(collection(db, 'contact_messages'), {
        userId: senderEmailVal,
        userEmail: senderEmailVal,
        userName: senderNameVal,
        targetUserId: user?.uid || '',
        targetUserEmail: user?.email || '',
        targetUserName: user?.displayName || user?.email?.split('@')[0] || 'Foydalanuvchi',
        message: '',
        createdAt: new Date().toISOString(),
        read: false,
        unreadAdmin: false,
        unreadUser: false,
        unreadTarget: false,
        replies: []
      });

      // 2. Update notification status to accepted
      await safeUpdateDoc(doc(db, 'notifications', n.id), {
        status: 'accepted',
        read: true,
        chatId: docRef ? docRef.id : null
      });

      // 3. Notify sender that invitation was accepted
      if (senderEmailVal) {
        await safeAddDoc(collection(db, 'notifications'), {
          userId: senderEmailVal.toLowerCase(),
          userEmail: senderEmailVal.toLowerCase(),
          senderEmail: user?.email?.toLowerCase() || '',
          senderName: user?.displayName || user?.email?.split('@')[0] || 'Foydalanuvchi',
          title: `✅ Chat taklifi qabul qilindi`,
          message: `${user?.displayName || user?.email?.split('@')[0] || 'Foydalanuvchi'} sizning chat taklifingizni qabul qildi.`,
          type: 'chat_invite_accepted',
          chatId: docRef ? docRef.id : null,
          createdAt: new Date().toISOString(),
          read: false
        });
      }

      toast.success("Chat taklifi qabul qilindi! Chat yaratildi.");
      setIsOpen(false);
      if (docRef) {
        navigate(`/messages?chatId=${docRef.id}`);
      } else {
        navigate('/messages');
      }
    } catch (err: any) {
      console.error("Accept chat invite error:", err);
      toast.error("Xatolik yuz berdi: " + err.message);
    }
  };

  const handleDeclineChatInvite = async (n: AppNotification) => {
    try {
      // 1. Update notification status to declined
      await safeUpdateDoc(doc(db, 'notifications', n.id), {
        status: 'declined',
        read: true
      });

      // 2. Notify sender that invitation was declined
      if (n.senderEmail) {
        await safeAddDoc(collection(db, 'notifications'), {
          userId: n.senderEmail.toLowerCase(),
          userEmail: n.senderEmail.toLowerCase(),
          senderEmail: user?.email?.toLowerCase() || '',
          senderName: user?.displayName || user?.email?.split('@')[0] || 'Foydalanuvchi',
          title: `❌ Chat taklifi rad etildi`,
          message: `${user?.displayName || user?.email?.split('@')[0] || 'Foydalanuvchi'} chat taklifingizni rad etdi.`,
          type: 'chat_invite_declined',
          createdAt: new Date().toISOString(),
          read: false
        });
      }

      toast.info("Chat taklifi rad etildi. Chat yaratilmadi.");
    } catch (err: any) {
      console.error("Decline chat invite error:", err);
      toast.error("Xatolik yuz berdi: " + err.message);
    }
  };

  if (!user) return null;

  return (
    <div className="relative z-50">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) markAllRead();
        }}
        className="relative p-2 rounded-xl border border-border/60 bg-card hover:bg-muted/80 text-foreground transition-all focus:outline-none shrink-0 flex items-center justify-center"
        title="Bildirishnomalar va ogohlantirishlar"
      >
        <Bell className="w-4 h-4 text-foreground" />
        
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow-lg animate-pulse"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Popover Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm">Bildirishnomalar</span>
                  {unreadCount > 0 && (
                    <span className="text-xs bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full font-bold">
                      {unreadCount} ta yangi
                    </span>
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={markAllRead}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                      title="Barchasini o'qilgan deb belgilash"
                    >
                      <Check className="w-3.5 h-3.5" />
                      O'qildi
                    </button>
                    <button
                      onClick={deleteAllNotifications}
                      className="text-xs text-red-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                      title="Barcha bildirishnomalarni o'chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Tozalash
                    </button>
                  </div>
                )}
              </div>

              {/* Native Push Request Banner */}
              {nativePermStatus !== 'granted' && (
                <div className="px-3 py-3 bg-primary/10 border-b border-primary/20 flex flex-col gap-2">
                  <span className="text-[12px] font-medium text-foreground leading-snug">
                    📱 Telefoningiz bildirishnoma panelida xabarlar chiqishi uchun ruxsat bering
                  </span>
                  <button
                    onClick={requestNativeNotificationPermission}
                    className="self-end bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    Yoqish
                  </button>
                </div>
              )}

              {/* List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-border/40">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    <Info className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                    Hozircha bildirishnomalar yo'q
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isDueWarning = n.type === 'due_warning';
                    const isChatMessage = n.type === 'chat_message' || n.type === 'contact_message' || n.type === 'chat_invite_accepted';
                    const isSubExpired = n.type === 'sub_expired';
                    const isChatInvite = n.type === 'chat_invite';

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`p-3.5 transition-colors flex gap-3 items-start relative cursor-pointer group ${
                          !n.read ? 'bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/10' : 'hover:bg-muted/40'
                        }`}
                      >
                        {/* Type Icon */}
                        <div className={`p-2 rounded-xl shrink-0 ${
                          isChatInvite
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : isChatMessage
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                            : isSubExpired || isDueWarning
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                            : 'bg-primary/10 text-primary border border-primary/20'
                        }`}>
                          {isChatInvite ? (
                            <UserPlus className="w-4 h-4" />
                          ) : isChatMessage ? (
                            <MessageSquare className="w-4 h-4" />
                          ) : isSubExpired ? (
                            <ShieldAlert className="w-4 h-4" />
                          ) : isDueWarning ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <Crown className="w-4 h-4" />
                          )}
                        </div>

                        {/* Text Content */}
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors">
                              {n.title}
                            </span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 inline-block" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug whitespace-pre-wrap line-clamp-3">
                            {n.message}
                          </p>

                          {/* Chat Invite Action Buttons */}
                          {isChatInvite && (!n.status || n.status === 'pending') && (
                            <div className="mt-2 pt-2 border-t border-border/30">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcceptChatInvite(n);
                                  }}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1 shadow-sm transition-all"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Qabul qilish</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeclineChatInvite(n);
                                  }}
                                  className="flex-1 bg-red-600/10 hover:bg-red-600/20 text-red-600 text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1 border border-red-500/20 transition-all"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Rad etish</span>
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-muted-foreground/70">
                              {n.createdAt ? new Date(n.createdAt).toLocaleString('uz-UZ') : ''}
                            </span>
                            
                            {isChatInvite && n.status === 'accepted' && (
                              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                ✅ Qabul qilingan
                              </span>
                            )}

                            {isChatInvite && n.status === 'declined' && (
                              <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                                ❌ Rad etilgan
                              </span>
                            )}

                            {isChatMessage && (
                              <span className="text-[10px] font-semibold text-primary">
                                Chatga o'tish &rarr;
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(n.id);
                          }}
                          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
