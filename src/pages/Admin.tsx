import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Shield, ShieldCheck, Search, UserCheck, Crown, Zap, Bot, MessageSquare, Save, RefreshCw, Copy, Check, Calendar, BellRing, Send, Trash2, Paperclip, CheckCheck, User, Headphones, Sparkles, CheckCircle2, AlertCircle, Eye, EyeOff, Activity, Radio, ExternalLink, Link2, Smartphone, MessageCircle, AlertTriangle, Key, Terminal, Cpu, Clock, ArrowRight, Play, Square, RotateCw, Code2, Layers, Wifi } from 'lucide-react';
import { LogoIcon } from '../components/Logo';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { safeSetDoc, safeAddDoc, safeDeleteDoc, isFirestoreQuotaExhausted } from '../lib/safeFirestore';
import { Profile, Bot as BotType, PlanType } from '../types';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { useTranslation } from '../context/LanguageContext';

interface SubDetail {
  plan: PlanType;
  assignedDateFormatted?: string; // kun.oy.yil (e.g. 06.08.2026)
  dueDateFormatted?: string;      // kun.oy.yil (e.g. 06.09.2026)
  assignedAt?: string;
  dueDateISO?: string;
}

interface ContactMsg {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
  replies?: Array<{
    sender: 'admin' | 'user';
    text: string;
    createdAt: string;
  }>;
}

export const Admin: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, PlanType>>({});
  const [subDetails, setSubDetails] = useState<Record<string, SubDetail>>({});
  const [bots, setBots] = useState<BotType[]>([]);
  const [contactMsgs, setContactMsgs] = useState<ContactMsg[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [sendingNotifyId, setSendingNotifyId] = useState<string | null>(null);
  const [deletingBotId, setDeletingBotId] = useState<string | null>(null);
  const [botToDelete, setBotToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanType>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Telegram Chat States
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [msgSearch, setMsgSearch] = useState('');
  const [chatReply, setChatReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // 24/7 Telegram AI Support Bot States
  const [tgToken, setTgToken] = useState('');
  const [tgAdminId, setTgAdminId] = useState('');
  const [tgEnabled, setTgEnabled] = useState(true);
  const [showTgToken, setShowTgToken] = useState(false);
  const [tgStatus, setTgStatus] = useState<any>(null);
  const [loadingTg, setLoadingTg] = useState(false);
  const [savingTg, setSavingTg] = useState(false);

  const fetchTgStatus = async () => {
    try {
      setLoadingTg(true);
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/telegram-bot', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTgStatus(data);
        if (data.adminId) setTgAdminId(data.adminId);
        if (data.enabled !== undefined) setTgEnabled(data.enabled);
      }
    } catch (e) {
      console.warn("Fetch telegram bot status error:", e);
    } finally {
      setLoadingTg(false);
    }
  };

  const handleSaveTgConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSavingTg(true);
      const token = await user?.getIdToken();
      const payload: any = {
        adminId: tgAdminId.trim(),
        enabled: tgEnabled
      };
      if (tgToken.trim()) {
        payload.botToken = tgToken.trim();
      }

      const res = await fetch('/api/admin/telegram-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      let data: any = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      }

      if (res.ok) {
        toast.success(data.message || "Telegram AI bot sozlamalari muvaffaqiyatli saqlandi!");
        setTgToken('');
        await fetchTgStatus();
      } else {
        toast.error(data.error || "Sozlamalarni saqlashda xatolik yuz berdi");
      }
    } catch (e) {
      toast.error("Server bilan ulanishda xatolik");
    } finally {
      setSavingTg(false);
    }
  };

  // -------------------------------------------------------------
  // MOBILE APP API & 5-SECOND REAL-TIME POLLER STATES
  // -------------------------------------------------------------
  const [appApiKey, setAppApiKey] = useState('');
  const [showAppKey, setShowAppKey] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [appEndpoints, setAppEndpoints] = useState<{ sync?: string; status?: string; botAction?: string; ping?: string }>({});
  
  // Real-time 5-second Poller State
  const [isLivePolling, setIsLivePolling] = useState(true);
  const [pollCountdown, setPollCountdown] = useState(5);
  const [pollLatency, setPollLatency] = useState<number | null>(null);
  const [liveSyncData, setLiveSyncData] = useState<any>(null);
  const [totalPollsCount, setTotalPollsCount] = useState(0);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null);
  const [isSyncingLive, setIsSyncingLive] = useState(false);
  const [activeCodeSnippet, setActiveCodeSnippet] = useState<'kotlin' | 'java' | 'curl' | 'flutter' | 'js'>('kotlin');
  const [actioningBotId, setActioningBotId] = useState<string | null>(null);

  // Fetch App API Config (Key & Endpoints)
  const fetchAppConfig = async () => {
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/app/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey) {
          setAppApiKey(data.apiKey);
          setCustomKeyInput(data.apiKey);
        }
        if (data.endpoints) {
          setAppEndpoints(data.endpoints);
        }
      }
    } catch (e) {
      console.warn("Fetch App Config error:", e);
    }
  };

  // 5-Second Real-Time Poller Fetcher
  const fetchLiveSync = async (forcedKey?: string) => {
    const keyToUse = forcedKey || appApiKey;
    if (!keyToUse) return;

    try {
      setIsSyncingLive(true);
      const startTime = performance.now();
      const res = await fetch('/api/app/sync', {
        headers: {
          'x-api-key': keyToUse
        }
      });
      const endTime = performance.now();
      setPollLatency(Math.round(endTime - startTime));

      if (res.ok) {
        const data = await res.json();
        setLiveSyncData(data);
        setLastSyncedTime(new Date());
        setTotalPollsCount(prev => prev + 1);
      }
    } catch (err) {
      console.warn("Live 5s sync poll error:", err);
    } finally {
      setIsSyncingLive(false);
    }
  };

  // Regenerate API Key
  const handleRegenerateAppKey = async () => {
    if (!confirm("Haqiqatan ham yangi API kalit yaratmoqchimisiz? Eski kalit orqali ulangan ilovalarda qayta sozlash talab qilinadi.")) return;
    try {
      setSavingKey(true);
      const token = await user?.getIdToken();
      const res = await fetch('/api/app/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ regenerate: true })
      });
      const data = await res.json();
      if (res.ok && data.apiKey) {
        setAppApiKey(data.apiKey);
        setCustomKeyInput(data.apiKey);
        toast.success("Yangi API kalit yaratildi!");
        fetchLiveSync(data.apiKey);
      } else {
        toast.error(data.error || "Kalitni yangilashda xatolik");
      }
    } catch (e) {
      toast.error("Server bilan bog'lanishda xatolik");
    } finally {
      setSavingKey(false);
    }
  };

  // Save Custom Key
  const handleSaveCustomKey = async () => {
    if (!customKeyInput.trim() || customKeyInput.trim().length < 8) {
      toast.error("API kalit kamida 8 ta belgidan iborat bo'lishi kerak");
      return;
    }
    try {
      setSavingKey(true);
      const token = await user?.getIdToken();
      const res = await fetch('/api/app/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newApiKey: customKeyInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.apiKey) {
        setAppApiKey(data.apiKey);
        setIsEditingKey(false);
        toast.success("Maxsus API kalit saqlandi!");
        fetchLiveSync(data.apiKey);
      } else {
        toast.error(data.error || "Kalitni saqlashda xatolik");
      }
    } catch (e) {
      toast.error("Server bilan bog'lanishda xatolik");
    } finally {
      setSavingKey(false);
    }
  };

  // Test Bot Action via API
  const handleTestBotAction = async (botId: string, action: 'start' | 'stop' | 'restart') => {
    try {
      setActioningBotId(botId);
      const res = await fetch('/api/app/bot-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': appApiKey
        },
        body: JSON.stringify({ botId, action })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `Bot muvaffaqiyatli ${action === 'start' ? 'ishga tushirildi' : action === 'stop' ? "to'xtatildi" : 'qayta yuklandi'}`);
        fetchLiveSync();
      } else {
        toast.error(data.error || "Bot harakatini bajarishda xatolik");
      }
    } catch (err) {
      toast.error("API orqali botni boshqarishda xatolik yuz berdi");
    } finally {
      setActioningBotId(null);
    }
  };

  // 5-Second Real-Time Interval Loop
  useEffect(() => {
    if (!isAdmin || !isLivePolling || !appApiKey) return;

    // Trigger immediate sync on load
    fetchLiveSync();

    // 1-second interval to update countdown and trigger sync every 5 seconds
    const interval = setInterval(() => {
      setPollCountdown(prev => {
        if (prev <= 1) {
          fetchLiveSync();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAdmin, isLivePolling, appApiKey]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAppConfig();
  }, [isAdmin, user]);

  useEffect(() => {
    if (!isAdmin) return;

    // Fetch initial user list from server API (includes auth users)
    const fetchApiUsers = async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch('/api/admin/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.users)) {
            setProfiles(prev => {
              const existingMap = new Map(prev.map(p => [p.id, p]));
              data.users.forEach((u: any) => {
                if (!existingMap.has(u.id)) {
                  existingMap.set(u.id, { 
                    id: u.id, 
                    email: u.email || '', 
                    createdAt: u.createdAt || new Date().toISOString(),
                    agreedToTerms: u.agreedToTerms !== false,
                    termsAgreedAt: u.termsAgreedAt || u.createdAt
                  });
                } else {
                  const existing = existingMap.get(u.id)!;
                  existingMap.set(u.id, {
                    ...existing,
                    agreedToTerms: existing.agreedToTerms || u.agreedToTerms !== false,
                    termsAgreedAt: existing.termsAgreedAt || u.termsAgreedAt
                  });
                }
              });
              return Array.from(existingMap.values());
            });
            const apiSubs: Record<string, PlanType> = {};
            const apiDetails: Record<string, SubDetail> = {};
            data.users.forEach((u: any) => {
              if (u.plan) {
                apiSubs[u.id] = u.plan as PlanType;
                apiDetails[u.id] = {
                  plan: u.plan as PlanType,
                  assignedDateFormatted: u.assignedDateFormatted,
                  dueDateFormatted: u.dueDateFormatted,
                  assignedAt: u.assignedAt,
                  dueDateISO: u.dueDateISO
                };
              }
            });
            setSubscriptions(prev => ({ ...apiSubs, ...prev }));
            setSubDetails(prev => ({ ...apiDetails, ...prev }));
          }
        }
      } catch (e) {
        console.warn("Failed to fetch admin users API:", e);
      }
    };
    fetchApiUsers();

    const fetchApiBots = async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch('/api/bots?scope=all', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.bots)) {
            setBots(data.bots);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch admin bots API:", e);
      }
    };
    fetchApiBots();
    fetchTgStatus();

    // 1. Fetch Profiles
    let unsubProfiles = () => {};
    unsubProfiles = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      const profs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Profile));
      setProfiles(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        profs.forEach(p => map.set(p.id, p));
        return Array.from(map.values());
      });
    }, (error: any) => {
      console.warn("Profiles snapshot notice (quota or offline):", error?.message || error);
      if (error?.code === 'resource-exhausted' || error?.code === 'unavailable') unsubProfiles();
    });

    // 2. Fetch Subscriptions in Real-Time
    let unsubSubs = () => {};
    unsubSubs = onSnapshot(collection(db, 'subscriptions'), (snapshot) => {
      const subsMap: Record<string, PlanType> = {};
      const detailsMap: Record<string, SubDetail> = {};

      snapshot.docs.forEach(d => {
        const data = d.data();
        const p = (data.plan as PlanType) || 'free';
        subsMap[d.id] = p;
        detailsMap[d.id] = {
          plan: p,
          assignedDateFormatted: data.assignedDateFormatted,
          dueDateFormatted: data.dueDateFormatted,
          assignedAt: data.assignedAt,
          dueDateISO: data.dueDateISO
        };
      });
      setSubscriptions(subsMap);
      setSubDetails(detailsMap);
    }, (error: any) => {
      console.warn("Subscriptions snapshot notice (quota or offline):", error?.message || error);
      if (error?.code === 'resource-exhausted' || error?.code === 'unavailable') unsubSubs();
    });

    // 3. Fetch Bots
    let unsubBots = () => {};
    unsubBots = onSnapshot(collection(db, 'bots'), (snapshot) => {
      setBots(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BotType)));
    }, (error: any) => {
      console.warn("Bots snapshot notice (quota or offline):", error?.message || error);
      if (error?.code === 'resource-exhausted' || error?.code === 'unavailable') unsubBots();
    });

    // 4. Fetch Contact Messages
    let unsubMsgs = () => {};
    unsubMsgs = onSnapshot(collection(db, 'contact_messages'), (snapshot) => {
      setContactMsgs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContactMsg)));
    }, (error: any) => {
      if (error?.code === 'resource-exhausted' || error?.code === 'unavailable') unsubMsgs();
    });

    return () => {
      unsubProfiles();
      unsubSubs();
      unsubBots();
      unsubMsgs();
    };
  }, [isAdmin, user]);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("ID buferga nusxalandi!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpdateSubscription = async (targetUserId: string, planToSet?: PlanType, customDays?: number) => {
    const targetPlan = planToSet || selectedPlans[targetUserId] || subscriptions[targetUserId] || 'free';
    setUpdatingUser(targetUserId);

    try {
      const now = new Date();
      let dueDate: Date | null = null;
      let assignedDateFormatted: string | null = null;
      let dueDateFormatted: string | null = null;
      let dueDateISO: string | null = null;
      const assignedAt = now.toISOString();

      if (targetPlan !== 'free') {
        if (customDays && Number(customDays) > 0) {
          dueDate = new Date(now.getTime() + Number(customDays) * 24 * 60 * 60 * 1000);
        } else {
          dueDate = new Date(now);
          dueDate.setMonth(dueDate.getMonth() + 1);
        }
        const pad = (n: number) => n.toString().padStart(2, '0');
        assignedDateFormatted = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        dueDateFormatted = `${pad(dueDate.getDate())}.${pad(dueDate.getMonth() + 1)}.${dueDate.getFullYear()} ${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}`;
        dueDateISO = dueDate.toISOString();
      }

      // Immediately update local UI state
      setSubscriptions(prev => ({ ...prev, [targetUserId]: targetPlan }));
      setSubDetails(prev => ({
        ...prev,
        [targetUserId]: {
          plan: targetPlan,
          assignedDateFormatted,
          dueDateFormatted,
          assignedAt,
          dueDateISO
        }
      }));

      // 1. Direct Firestore write for immediate cross-client synchronization
      try {
        await safeSetDoc(doc(db, 'subscriptions', targetUserId), {
          plan: targetPlan,
          assignedDateFormatted,
          dueDateFormatted,
          assignedAt,
          dueDateISO,
          updatedAt: assignedAt,
          assignedBy: user?.uid || user?.email || 'admin'
        }, { merge: true });
      } catch (fErr) {
        console.warn("Direct Firestore sub write warning:", fErr);
      }

      // 2. Server-side update via API for SQLite persistence & system notifications
      try {
        const token = await user?.getIdToken();
        const res = await fetch('/api/admin/set-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            targetUserId,
            plan: targetPlan,
            customDurationDays: customDays
          })
        });

        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          if (data && data.assignedDateFormatted) {
            setSubDetails(prev => ({
              ...prev,
              [targetUserId]: {
                plan: targetPlan,
                assignedDateFormatted: data.assignedDateFormatted,
                dueDateFormatted: data.dueDateFormatted,
                assignedAt: data.assignedAt || assignedAt,
                dueDateISO: data.dueDateISO || dueDateISO
              }
            }));
          }
        }
      } catch (apiErr) {
        console.warn("Backend API sync warning:", apiErr);
      }

      toast.success(`Foydalanuvchi obunasi ${targetPlan.toUpperCase()} ga muvaffaqiyatli o'zgartirildi!`);
    } catch (err: any) {
      console.error("Subscription update failed:", err);
      toast.error(err.message || "Obunani yangilashda xatolik yuz berdi");
    } finally {
      setUpdatingUser(null);
    }
  };

  // Send "To'lov kuni keldi" notification manually
  const handleSendDueNotification = async (targetUserId: string, targetEmail: string, plan: PlanType) => {
    setSendingNotifyId(targetUserId);
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/send-due-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          targetUserId,
          targetEmail,
          plan
        })
      });

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xatolik yuz berdi");
      }

      const displayEmail = targetEmail || targetUserId || 'Foydalanuvchi';
      toast.success(`${displayEmail} nomli foydalanuvchiga to'lov kuni kelganligi haqida 1 ta ogohlantirish yuborildi!`);
    } catch (err: any) {
      console.error("Send due notification failed:", err);
      toast.error(err.message || "Ogohlantirish yuborishda xatolik");
    } finally {
      setSendingNotifyId(null);
    }
  };

  const openDeleteModal = (botId: string, botName: string) => {
    setBotToDelete({ id: botId, name: botName });
  };

  const confirmDeleteBot = async () => {
    if (!botToDelete) return;
    const { id: botId, name: botName } = botToDelete;
    setDeletingBotId(botId);

    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/bots/${botId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server xatosi (${res.status}): JSON o'rniga HTML qaytdi.`);
      }

      if (!res.ok) throw new Error(data?.error || "Botni o'chirishda xatolik");

      // Delete from Firestore directly as well
      await safeDeleteDoc(doc(db, 'bots', botId));

      setBots(prev => prev.filter(b => b.id !== botId));
      toast.success(`Bot (${botName || botId}) va uning barcha fayllari tegi bilan o'chirib tashlandi!`);
      setBotToDelete(null);
    } catch (err: any) {
      console.error("Delete bot error:", err);
      toast.error(err.message || "Botni o'chirishda xatolik yuz berdi");
    } finally {
      setDeletingBotId(null);
    }
  };

  const filteredContactMsgs = contactMsgs.filter(m => 
    (m.name || '').toLowerCase().includes(msgSearch.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(msgSearch.toLowerCase()) ||
    (m.message || '').toLowerCase().includes(msgSearch.toLowerCase())
  );

  const activeMsg = contactMsgs.find(m => m.id === selectedMsgId) || (contactMsgs.length > 0 ? contactMsgs[0] : null);

  const getTelegramAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-teal-600',
      'from-purple-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-sky-500 to-blue-600',
      'from-rose-500 to-red-600'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const handleDeleteContactMsg = async (id: string) => {
    try {
      await safeDeleteDoc(doc(db, 'contact_messages', id));
      toast.success("Xabar o'chirildi");
      if (selectedMsgId === id) {
        setSelectedMsgId(null);
      }
    } catch (err: any) {
      toast.error("O'chirishda xatolik: " + err.message);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMsg || !chatReply.trim()) return;

    setSendingReply(true);
    try {
      const msgRef = doc(db, 'contact_messages', activeMsg.id);
      const existingReplies = activeMsg.replies || [];
      const newReply = {
        sender: 'admin' as const,
        text: chatReply.trim(),
        createdAt: new Date().toISOString()
      };

      await safeSetDoc(msgRef, {
        replies: [...existingReplies, newReply]
      }, { merge: true });

      toast.success("Javob yuborildi va saqlandi!");
      setChatReply('');
    } catch (err: any) {
      console.error("Send reply error:", err);
      toast.error("Javob yuborishda xatolik: " + err.message);
    } finally {
      setSendingReply(false);
    }
  };

  // Deduplicate profiles by email address so each user appears only once
  const uniqueProfiles = React.useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach(p => {
      const emailKey = p.email ? p.email.trim().toLowerCase() : p.id;
      if (!map.has(emailKey)) {
        map.set(emailKey, { ...p, agreedToTerms: p.agreedToTerms !== false });
      } else {
        const existing = map.get(emailKey)!;
        const existingPlan = subscriptions[existing.id] || 'free';
        const currentPlan = subscriptions[p.id] || 'free';
        const merged: Profile = {
          ...existing,
          ...p,
          agreedToTerms: existing.agreedToTerms || p.agreedToTerms !== false,
          termsAgreedAt: existing.termsAgreedAt || p.termsAgreedAt || p.createdAt
        };
        if (currentPlan !== 'free' && existingPlan === 'free') {
          map.set(emailKey, merged);
        } else {
          map.set(emailKey, merged);
        }
      }
    });
    return Array.from(map.values());
  }, [profiles, subscriptions]);

  // Lookup map for user IDs to Emails
  const userLookupMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach(p => {
      if (p.id && p.email) map[p.id] = p.email;
    });
    uniqueProfiles.forEach(p => {
      if (p.id && p.email) map[p.id] = p.email;
    });
    return map;
  }, [profiles, uniqueProfiles]);

  // Filter users by search
  const filteredProfiles = uniqueProfiles.filter(p => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (p.email && p.email.toLowerCase().includes(query)) ||
      (p.id && p.id.toLowerCase().includes(query))
    );
  });

  // Filter bots by search & map email
  const filteredBots = React.useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return bots.filter(b => {
      const ownerId = b.userId || (b as any).ownerId || (b as any).user_id || (b as any).uid || '';
      const ownerEmail = (b as any).userEmail || (b as any).ownerEmail || userLookupMap[ownerId] || '';
      const botName = b.name || (b as any).botName || (b as any).title || 'Nomsiz Bot';
      const botId = b.id || '';

      if (!query) return true;
      return (
        botName.toLowerCase().includes(query) ||
        botId.toLowerCase().includes(query) ||
        ownerId.toLowerCase().includes(query) ||
        ownerEmail.toLowerCase().includes(query) ||
        (b.language || '').toLowerCase().includes(query)
      );
    });
  }, [bots, searchQuery, userLookupMap]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Shield className="w-16 h-16 text-destructive mx-auto mb-4 opacity-80" />
        <h2 className="text-2xl font-bold text-destructive">Ruxsat berilmagan</h2>
        <p className="text-muted-foreground mt-2">Ushbu bo'lim faqat tizim admini uchun mo'ljallangan.</p>
      </div>
    );
  }

  const totalUsers = uniqueProfiles.length;
  const proUsersCount = Object.values(subscriptions).filter(p => p === 'pro').length;
  const vipUsersCount = Object.values(subscriptions).filter(p => p === 'vip').length;
  const freeUsersCount = totalUsers - proUsersCount - vipUsersCount;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">{t('nav_admin', 'Admin Boshqaruv Paneli')}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {t('admin_subtitle', "Foydalanuvchilar ro'yxati va obunalar (PRO / VIP) boshqaruvi")}
              </p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="px-4 py-1.5 text-sm rounded-xl font-medium border-amber-500/30 text-amber-500 bg-amber-500/5 self-start md:self-auto">
          Super Admin: {user?.email}
        </Badge>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('admin_total_users', 'Jami Foydalanuvchilar')}</CardDescription>
            <CardTitle className="text-3xl font-black">{totalUsers}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">{t('admin_registered', "Ro'yxatdan o'tganlar")}</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-500">{t('admin_terms_agreed_title', "Shartlarga Rozilik")}</CardDescription>
            <CardTitle className="text-3xl font-black text-emerald-500 flex items-center gap-2">
              {totalUsers}
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-emerald-500/90 font-medium">100% Rozi bo'lgan (No Refund)</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-500">{t('admin_pro_users', 'PRO Obunachilar')}</CardDescription>
            <CardTitle className="text-3xl font-black text-emerald-500">{proUsersCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-emerald-500/80">{t('admin_pro_limit', 'Max 10 ta bot limiti')}</span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-amber-500">{t('admin_vip_users', 'VIP Obunachilar')}</CardDescription>
            <CardTitle className="text-3xl font-black text-amber-500">{vipUsersCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-amber-500/80">{t('admin_vip_limit', 'Max 30 ta bot limiti')}</span>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('admin_total_bots', 'Jami Botlar')}</CardDescription>
            <CardTitle className="text-3xl font-black text-primary">{bots.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-primary/80">{bots.filter(b => b.status === 'running').length} {t('admin_running_bots', 'ta ishlayotgan bot')}</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6 p-1 bg-muted/60 border rounded-xl flex flex-wrap gap-1">
          <TabsTrigger value="users" className="gap-2 rounded-lg font-semibold text-sm">
            <UserCheck className="w-4 h-4" />
            {t('admin_tab_users', 'Foydalanuvchilar va Obunalar')} ({filteredProfiles.length})
          </TabsTrigger>
          <TabsTrigger value="bots" className="gap-2 rounded-lg font-semibold text-sm">
            <Bot className="w-4 h-4" />
            {t('admin_tab_bots', 'Botlar')} ({bots.length})
          </TabsTrigger>
          <TabsTrigger value="telegram-ai" className="gap-2 rounded-lg font-semibold text-sm">
            <Radio className="w-4 h-4 text-sky-400" />
            {t('admin_tab_tg_ai', '24/7 Telegram AI Yordamchi')}
            {tgStatus?.isRunning && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5"></span>
            )}
          </TabsTrigger>
          <TabsTrigger value="app-api" className="gap-2 rounded-lg font-semibold text-sm">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            {t('admin_tab_app_api', 'Ilova API (5s Real-Time)')}
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
              5s Live
            </span>
          </TabsTrigger>
        </TabsList>

        {/* USERS & SUBSCRIPTIONS TAB */}
        <TabsContent value="users">
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <span>{t('admin_user_list_title', "Foydalanuvchilar Ro'yxati")}</span>
                  <Badge variant="secondary" className="text-xs">{filteredProfiles.length} ta</Badge>
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  {t('admin_user_list_desc', 'Har bir foydalanuvchiga Pro yoki VIP obunani osongina bering')}
                </CardDescription>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('admin_search_placeholder', "Email yoki ID bo'yicha qidiruv...")}
                  className="pl-9 pr-4 bg-background/80 rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>

            <CardContent className="px-0 sm:px-6 pb-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-bold">{t('admin_th_email', 'Foydalanuvchi Email')}</TableHead>
                      <TableHead className="font-bold">{t('admin_th_terms', 'Shartlarga Rozilik (No Refund)')}</TableHead>
                      <TableHead className="font-bold">{t('admin_th_uid', 'User UID')}</TableHead>
                      <TableHead className="font-bold">{t('admin_th_plan', 'Hozirgi Obuna')}</TableHead>
                      <TableHead className="font-bold">{t('admin_th_dates', "Berilgan Sana & To'lov Kuni (kun/oy/yil)")}</TableHead>
                      <TableHead className="font-bold text-center">{t('admin_th_manage', 'Obunani Boshqarish')}</TableHead>
                      <TableHead className="font-bold text-right">{t('admin_th_notify', 'Ogohlantirish')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          {searchQuery ? t('admin_search_empty', "Qidiruvga mos foydalanuvchi topilmadi") : t('admin_no_users', "Hali foydalanuvchilar yo'q")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProfiles.map((p) => {
                        const currentPlan = subscriptions[p.id] || 'free';
                        const subInfo = subDetails[p.id] || {};
                        const isUpdating = updatingUser === p.id;
                        const isSendingNotify = sendingNotifyId === p.id;
                        const isSuperAdmin = p.email === 'ismoilovshohjahon750@gmail.com';

                        return (
                          <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                            <TableCell className="font-semibold text-sm">
                              <div className="flex items-center gap-2">
                                <span>{p.email || 'Email kiritilmagan'}</span>
                                {isSuperAdmin && (
                                  <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 border-amber-500/30 text-[10px] px-1.5 py-0">
                                    Admin
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            {/* Terms Agreement Column */}
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold px-2 py-0.5 gap-1.5 shadow-xs">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    <span>Rozi bo'lgan (No Refund)</span>
                                  </Badge>
                                </div>
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                                  <span>
                                    {p.termsAgreedAt 
                                      ? new Date(p.termsAgreedAt).toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                                      : (p.createdAt ? new Date(p.createdAt).toLocaleDateString('uz-UZ') : "Ro'yxatdan o'tishda")}
                                  </span>
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="text-xs font-mono text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <span className="max-w-[120px] truncate" title={p.id}>{p.id}</span>
                                <button
                                  onClick={() => handleCopy(p.id)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="ID dan nusxa olish"
                                >
                                  {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </TableCell>

                            <TableCell>
                              {currentPlan === 'vip' ? (
                                <Badge className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold px-3 py-1 gap-1 shadow-sm">
                                  <Crown className="w-3.5 h-3.5" />
                                  VIP (30 bot)
                                </Badge>
                              ) : currentPlan === 'pro' ? (
                                <Badge className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold px-3 py-1 gap-1 shadow-sm">
                                  <Zap className="w-3.5 h-3.5" />
                                  PRO (10 bot)
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="px-3 py-1 text-muted-foreground font-medium">
                                  Bepul (2 bot)
                                </Badge>
                              )}
                            </TableCell>

                            {/* Dates Column */}
                            <TableCell>
                              <div className="flex flex-col text-xs gap-1">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Calendar className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                  <span>Berilgan: </span>
                                  <span className="font-semibold text-foreground">
                                    {(subInfo as any).assignedDateFormatted || ((subInfo as any).assignedAt ? new Date((subInfo as any).assignedAt).toLocaleDateString('uz-UZ') : '-')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <BellRing className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>To'lov kuni: </span>
                                  <span className="font-semibold text-amber-500">
                                    {(subInfo as any).dueDateFormatted || ((subInfo as any).dueDateISO ? new Date((subInfo as any).dueDateISO).toLocaleDateString('uz-UZ') : '-')}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            {/* Plan Switchers */}
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isUpdating}
                                  variant={currentPlan === 'free' ? 'default' : 'outline'}
                                  onClick={() => handleUpdateSubscription(p.id, 'free')}
                                  className="h-8 text-xs font-medium rounded-lg px-2.5"
                                >
                                  Bepul
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isUpdating}
                                  variant={currentPlan === 'pro' ? 'default' : 'outline'}
                                  onClick={() => handleUpdateSubscription(p.id, 'pro')}
                                  className={`h-8 text-xs font-bold rounded-lg px-2.5 gap-1 ${
                                    currentPlan === 'pro' 
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                                      : 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                                  }`}
                                >
                                  <Zap className="w-3 h-3" />
                                  PRO
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isUpdating}
                                  variant={currentPlan === 'vip' ? 'default' : 'outline'}
                                  onClick={() => handleUpdateSubscription(p.id, 'vip')}
                                  className={`h-8 text-xs font-bold rounded-lg px-2.5 gap-1 ${
                                    currentPlan === 'vip' 
                                      ? 'bg-amber-500 hover:bg-amber-400 text-black' 
                                      : 'border-amber-500/40 text-amber-500 hover:bg-amber-500/10'
                                  }`}
                                >
                                  <Crown className="w-3 h-3" />
                                  VIP
                                </Button>
                              </div>
                            </TableCell>

                            {/* Notification Trigger Column */}
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSendingNotify}
                                onClick={() => handleSendDueNotification(p.id, p.email || '', currentPlan)}
                                className="h-8 text-xs font-semibold rounded-xl px-3 border-red-500/40 text-red-500 hover:bg-red-500/10 gap-1.5 shadow-sm transition-all"
                                title="To'lov kuni keldi deb xabar va ogohlantirish yuborish"
                              >
                                {isSendingNotify ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <BellRing className="w-3.5 h-3.5 text-red-500" />
                                )}
                                To'lov Kuni
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOTS TAB */}
        <TabsContent value="bots">
          <Card className="border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Barcha Yaratilgan Botlar</CardTitle>
              <CardDescription>Platformadagi barcha foydalanuvchilar botlari holati</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold">Bot Nomi</TableHead>
                    <TableHead className="font-bold">Bot ID</TableHead>
                    <TableHead className="font-bold">Ega (User ID)</TableHead>
                    <TableHead className="font-bold">Tili</TableHead>
                    <TableHead className="font-bold">Holati</TableHead>
                    <TableHead className="font-bold text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        {searchQuery ? "Qidiruvga mos bot topilmadi" : "Hozircha botlar yaratilmagan"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBots.map((b) => {
                      const botName = b.name?.trim() || (b as any).botName?.trim() || (b as any).title?.trim() || '';
                      const ownerId = b.userId || (b as any).ownerId || (b as any).user_id || (b as any).uid || '';
                      const ownerEmail = (b as any).userEmail || (b as any).ownerEmail || userLookupMap[ownerId] || '';

                      return (
                        <TableRow key={b.id} className="hover:bg-muted/20">
                          <TableCell className="font-semibold text-sm">
                            {botName ? (
                              <span>{botName}</span>
                            ) : (
                              <span className="text-amber-500 italic text-xs font-normal bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                Nom berilmagan
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <span className="max-w-[120px] truncate" title={b.id}>{b.id}</span>
                              <button
                                onClick={() => handleCopy(b.id)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Bot ID dan nusxa olish"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col gap-0.5">
                              {ownerEmail ? (
                                <span className="font-semibold text-foreground text-xs">{ownerEmail}</span>
                              ) : (
                                <span className="text-amber-500 text-xs italic">Email topilmadi</span>
                              )}
                              <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                                <span className="max-w-[120px] truncate" title={ownerId}>{ownerId || 'ID yo\'q'}</span>
                                {ownerId && (
                                  <button
                                    onClick={() => handleCopy(ownerId)}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title="User ID dan nusxa olish"
                                  >
                                    <Copy className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs uppercase font-medium">{b.language || 'Node.js'}</TableCell>
                          <TableCell>
                            {b.status === 'running' ? (
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium">
                                Ishlamoqda
                              </Badge>
                            ) : b.status === 'error' ? (
                              <Badge variant="destructive">Xatolik</Badge>
                            ) : (
                              <Badge variant="secondary">To'xtatilgan</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 gap-1.5 font-semibold text-xs"
                              disabled={deletingBotId === b.id}
                              onClick={() => openDeleteModal(b.id, botName)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {deletingBotId === b.id ? "O'chirilmoqda..." : "Tegi bilan o'chirish"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TELEGRAM 24/7 AI SUPPORT TAB */}
        <TabsContent value="telegram-ai">
          <div className="space-y-6">
            {/* Status & Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bot Holati</CardDescription>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    {tgStatus?.isRunning ? (
                      <>
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-emerald-500">24/7 Ishlamoqda</span>
                      </>
                    ) : tgStatus?.hasToken ? (
                      <>
                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                        <span className="text-amber-500">Ulanmoqda...</span>
                      </>
                    ) : (
                      <>
                        <span className="w-3 h-3 rounded-full bg-muted-foreground"></span>
                        <span className="text-muted-foreground text-lg">Token kiritilmagan</span>
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-xs text-muted-foreground">
                    {tgStatus?.tokenMasked ? `Token: ${tgStatus.tokenMasked}` : "Telegram @BotFather orqali token oling"}
                  </span>
                </CardContent>
              </Card>

              <Card className="border-sky-500/20 bg-sky-500/5 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wider text-sky-400">Murojaat Qilganlar</CardDescription>
                  <CardTitle className="text-3xl font-black text-sky-400">
                    {tgStatus?.stats?.totalUsers || 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-xs text-sky-400/80">Telegram foydalanuvchilari</span>
                </CardContent>
              </Card>

              <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Jami Savol-Javoblar</CardDescription>
                  <CardTitle className="text-3xl font-black text-emerald-400">
                    {tgStatus?.stats?.totalQueries || 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-xs text-emerald-400/80">Bugun: {tgStatus?.stats?.todayQueries || 0} ta so'rov</span>
                </CardContent>
              </Card>
            </div>

            {/* TELEGRAM ACCOUNT & BUSINESS CONNECTION CARD */}
            <Card className="border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-card/80 to-indigo-500/10 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <Smartphone className="w-36 h-36 text-sky-400" />
              </div>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <span>Telegram Akkauntga Ulanish</span>
                        <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-[11px] font-semibold">
                          Telegram Biznes & Chatbot
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Botingizni shaxsiy Telegram akkauntingizga ulab, mijozlar yozganda avtomatik javob berishini ta'minlang
                      </CardDescription>
                    </div>
                  </div>

                  {tgStatus?.botInfo?.username && (
                    <Badge variant="secondary" className="px-3 py-1 text-xs font-mono font-bold bg-background/80 border border-border flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-sky-400" />
                      @{tgStatus.botInfo.username}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Business permission status check */}
                {tgStatus?.botInfo ? (
                  tgStatus.botInfo.canConnectToBusiness ? (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Telegram Biznes ruxsati faollashtirilgan!</p>
                        <p className="text-emerald-400/80 mt-0.5">
                          Botingiz Telegram Biznes xabarlarini qabul qilishga tayyor. Quyidagi tugma orqali uni o'z akkauntingizga ulang.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-2">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                        <div>
                          <p className="font-semibold text-amber-400">Telegram Biznes ruxsatini 1 marta yoqish kerak</p>
                          <p className="text-muted-foreground mt-0.5 leading-relaxed">
                            Telegramda <i>"Bu bot hali Telegram Biznesni dastaklamaydi"</i> xatosi chiqmasligi uchun BotFather'da biznes funksiyasini yoqish talab qilinadi:
                          </p>
                        </div>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 pl-6 text-[11px] text-muted-foreground">
                        <li><b>@BotFather</b> ga kiring va <code>/mybots</code> buyrug'ini bering</li>
                        <li><b>@{tgStatus?.botInfo?.username || 'IsmoilovshAI_bot'}</b> botingizni tanlang</li>
                        <li><b>Bot Settings</b> ➡️ <b>Telegram Business</b> ➡️ <b>Turn On</b> tugmasini bosing</li>
                      </ol>
                    </div>
                  )
                ) : null}

                {/* Direct Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={tgStatus?.botInfo?.username ? `https://t.me/${tgStatus.botInfo.username}?startattach` : "https://t.me"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Button
                      type="button"
                      className="gap-2 font-bold bg-sky-500 hover:bg-sky-600 text-white rounded-xl shadow-lg shadow-sky-500/25 px-5"
                    >
                      <Link2 className="w-4 h-4" />
                      Botni Akkauntimga Ulash
                      <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
                    </Button>
                  </a>

                  <a
                    href={tgStatus?.botInfo?.username ? `https://t.me/${tgStatus.botInfo.username}` : "https://t.me"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 font-semibold rounded-xl border-sky-500/30 hover:bg-sky-500/10 text-sky-400"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Bot bilan Suhbatlashish
                    </Button>
                  </a>

                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-2 text-xs rounded-xl text-muted-foreground hover:text-foreground"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      @BotFather ga o'tish
                    </Button>
                  </a>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (tgStatus?.botInfo?.username) {
                        navigator.clipboard.writeText(`@${tgStatus.botInfo.username}`);
                        toast.success(`@${tgStatus.botInfo.username} nusxalandi!`);
                      }
                    }}
                    className="gap-1.5 text-xs rounded-xl ml-auto"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Username Nusxalash
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Configuration Form Card */}
            <Card className="border-border/60 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>Telegram AI Yordamchini Sozlash</span>
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  CloudBot.uz nomidan 24/7 uzluksiz javob beruvchi rasmiy Telegram AI xodimi
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveTgConfig} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                        <span>Telegram Bot Token</span>
                        <span className="text-xs text-muted-foreground font-normal">@BotFather bergan token</span>
                      </label>
                      <div className="relative">
                        <Input
                          type={showTgToken ? "text" : "password"}
                          placeholder={tgStatus?.hasToken ? "Yangi token kiritish (o'zgartirish uchun)" : "Masalan: 7891234567:AAHxyz..."}
                          value={tgToken}
                          onChange={(e) => setTgToken(e.target.value)}
                          className="pr-10 rounded-xl bg-background/80"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTgToken(!showTgToken)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          {showTgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {tgStatus?.hasToken && (
                        <p className="text-xs text-emerald-500 flex items-center gap-1 mt-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Token o'rnatilgan: {tgStatus.tokenMasked}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                        <span>Administrator Telegram ID</span>
                        <span className="text-xs text-muted-foreground font-normal">/admin buyrug'i uchun</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="Masalan: 508129341 (@userinfobot orqali oling)"
                        value={tgAdminId}
                        onChange={(e) => setTgAdminId(e.target.value)}
                        className="rounded-xl bg-background/80"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Ushbu ID egasi Telegramda botga <code>/admin</code> deb yozsa, platforma statistikasini ko'ra oladi.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/40">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="tg-enabled-toggle"
                        checked={tgEnabled}
                        onChange={(e) => setTgEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                      />
                      <label htmlFor="tg-enabled-toggle" className="text-sm font-medium cursor-pointer">
                        AI Yordamchi botni fonda 24/7 faol ushlab turish
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={fetchTgStatus}
                        disabled={loadingTg}
                        className="rounded-xl gap-2 text-xs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingTg ? 'animate-spin' : ''}`} />
                        Yangilash
                      </Button>
                      <Button
                        type="submit"
                        disabled={savingTg}
                        className="rounded-xl gap-2 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
                      >
                        <Save className="w-4 h-4" />
                        {savingTg ? "Saqlanmoqda..." : "Saqlash va Ishga Tushirish"}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Live Logs / Recent Dialogs Card */}
            <Card className="border-border/60 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-sky-400" />
                    <span>So'nggi Murojaatlar va AI Javoblari Tarixi</span>
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Foydalanuvchilarning Telegram orqali yozgan so'nggi savollari va Botly AI javoblari
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {tgStatus?.recentLogs?.length || 0} ta yozuv
                </Badge>
              </CardHeader>
              <CardContent>
                {(!tgStatus?.recentLogs || tgStatus.recentLogs.length === 0) ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    Hozircha Telegram orqali xabarlar kelib tushmadi. Botga /start yuborib sinab ko'ring.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {tgStatus.recentLogs.map((log: any) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded-xl border text-sm ${
                          log.role === 'user'
                            ? 'bg-sky-500/5 border-sky-500/20 text-foreground'
                            : 'bg-muted/40 border-border/60 text-muted-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-2 py-0.5 rounded-md uppercase font-bold ${
                                log.role === 'user' ? 'text-sky-400 border-sky-400/30' : 'text-emerald-400 border-emerald-400/30'
                              }`}
                            >
                              {log.role === 'user' ? `Foydalanuvchi (@${log.username || log.chat_id})` : 'Botly AI Xodimi'}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {log.created_at || ''}
                          </span>
                        </div>
                        <p className="text-xs whitespace-pre-wrap leading-relaxed">
                          {log.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* MOBILE APP API & 5-SECOND REAL-TIME SYNC TAB */}
        <TabsContent value="app-api" className="space-y-6">
          {/* Real-time Status Banner */}
          <div className="bg-gradient-to-r from-emerald-500/15 via-sky-500/10 to-purple-500/15 border border-emerald-500/30 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40 relative">
                  <Smartphone className="w-6 h-6" />
                  {isLivePolling && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-foreground">
                      {t('admin_app_api_title', 'Mobil Ilova va Tashqi Tizimlar uchun Real-Time API')}
                    </h2>
                    <Badge variant="outline" className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                      isLivePolling ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                    }`}>
                      {isLivePolling ? '5s Avto-Sinxronizatsiya Faol' : 'Pauzada'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin_app_api_desc', "Android va boshqa ilovalarga har 5 soniyada botlar holati, server parametrlari va yangi loglarni uzatuvchi yuqori tezlikdagi API.")}
                  </p>
                </div>
              </div>

              {/* Poller Controls & Stats */}
              <div className="flex items-center flex-wrap gap-2.5 bg-background/60 p-2 rounded-xl border border-border/60">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 rounded-lg text-xs font-mono">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>Keyingi so'rov:</span>
                  <span className="font-bold text-emerald-400 min-w-[20px] text-center">{isLivePolling ? `${pollCountdown}s` : '—'}</span>
                </div>

                {pollLatency !== null && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40 rounded-lg text-xs font-mono">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-400 font-bold">{pollLatency} ms</span>
                  </div>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchLiveSync()}
                  disabled={isSyncingLive}
                  className="h-8 gap-1.5 text-xs font-semibold rounded-lg"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLive ? 'animate-spin text-primary' : ''}`} />
                  {isSyncingLive ? "Yangilanmoqda..." : "Hozir yangilash"}
                </Button>

                <Button
                  size="sm"
                  variant={isLivePolling ? "secondary" : "default"}
                  onClick={() => setIsLivePolling(!isLivePolling)}
                  className="h-8 text-xs font-semibold rounded-lg"
                >
                  {isLivePolling ? "Pauza" : "Davom ettirish"}
                </Button>
              </div>
            </div>
          </div>

          {/* Live Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Server Holati
                </CardDescription>
                <CardTitle className="text-2xl font-black text-emerald-400">
                  {liveSyncData?.server?.status === 'online' ? 'Online 24/7' : 'Faol'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div>Uptime: <span className="text-foreground font-mono font-medium">{liveSyncData?.server?.uptimeFormatted || 'Yuklanmoqda...'}</span></div>
                <div>RAM: <span className="text-foreground font-mono font-medium">{liveSyncData?.server?.memory?.rssMb ? `${liveSyncData.server.memory.rssMb} MB` : '180 MB'}</span></div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                  Botlar Sinxroni
                </CardDescription>
                <CardTitle className="text-2xl font-black text-primary">
                  {liveSyncData?.stats?.totalBots ?? bots.length} ta
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div className="text-emerald-400 font-medium">● {liveSyncData?.stats?.runningBots ?? bots.filter(b => b.status === 'running').length} ta ishlayapti</div>
                <div className="text-muted-foreground">○ {liveSyncData?.stats?.stoppedBots ?? bots.filter(b => b.status !== 'running').length} ta to'xtatilgan</div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  Foydalanuvchilar
                </CardDescription>
                <CardTitle className="text-2xl font-black text-sky-400">
                  {liveSyncData?.stats?.totalUsers ?? filteredProfiles.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div>PRO: <span className="text-foreground font-bold">{liveSyncData?.stats?.proUsers ?? proUsersCount}</span> | VIP: <span className="text-amber-400 font-bold">{liveSyncData?.stats?.vipUsers ?? vipUsersCount}</span></div>
                <div className="text-muted-foreground">Tizim: 100% Barqaror</div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-purple-400" />
                  Sinxron So'rovlar
                </CardDescription>
                <CardTitle className="text-2xl font-black text-purple-400">
                  {totalPollsCount} ta
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div>Oraliq: <span className="text-foreground font-mono font-medium">5000 ms (5s)</span></div>
                <div>Oxirgi: <span className="text-foreground font-mono font-medium">{lastSyncedTime ? lastSyncedTime.toLocaleTimeString() : 'Hozirgina'}</span></div>
              </CardContent>
            </Card>
          </div>

          {/* API Key Management Card */}
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Key className="w-5 h-5 text-amber-400" />
                    Ilova API Kaliti (x-api-key)
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Android ilova va tashqi so'rovlar ushbu kalit orqali autentifikatsiyadan o'tadi va ma'lumotlarni oladi.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs font-mono px-2.5 py-1 self-start sm:self-auto">
                  Header: x-api-key
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingKey ? (
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <Input
                    value={customKeyInput}
                    onChange={(e) => setCustomKeyInput(e.target.value)}
                    placeholder="Masalan: cb_live_mysecretkey123"
                    className="font-mono text-sm"
                  />
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCustomKeyInput(appApiKey);
                        setIsEditingKey(false);
                      }}
                      className="rounded-xl text-xs"
                    >
                      Bekor qilish
                    </Button>
                    <Button
                      onClick={handleSaveCustomKey}
                      disabled={savingKey}
                      className="rounded-xl text-xs gap-1.5 font-semibold"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingKey ? "Saqlanmoqda..." : "Saqlash"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                  <div className="relative flex-1 bg-muted/50 border border-border/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between font-mono text-sm">
                    <span className="truncate select-all text-foreground font-semibold">
                      {showAppKey ? appApiKey || 'cb_live_...' : (appApiKey ? `${appApiKey.substring(0, 8)}••••••••••••••••` : 'cb_live_••••••••')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAppKey(!showAppKey)}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0 ml-2"
                    >
                      {showAppKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (appApiKey) {
                          navigator.clipboard.writeText(appApiKey);
                          toast.success("API kaliti nusxalandi!");
                        }
                      }}
                      className="gap-1.5 text-xs font-semibold rounded-xl flex-1 sm:flex-none"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Nusxa olish
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => setIsEditingKey(true)}
                      className="text-xs font-semibold rounded-xl flex-1 sm:flex-none"
                    >
                      O'zgartirish
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleRegenerateAppKey}
                      disabled={savingKey}
                      className="text-xs font-semibold rounded-xl text-amber-500 border-amber-500/30 hover:bg-amber-500/10 flex-1 sm:flex-none"
                    >
                      <RotateCw className={`w-3.5 h-3.5 mr-1 ${savingKey ? 'animate-spin' : ''}`} />
                      Yangi kalit
                    </Button>
                  </div>
                </div>
              )}

              {/* Endpoints Table */}
              <div className="bg-muted/30 border border-border/60 rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Mavjud API Endpointlar (URL):
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-background/60 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-bold text-emerald-400 border-emerald-500/40 bg-emerald-500/10">GET</Badge>
                      <span className="text-foreground font-semibold">/api/app/sync</span>
                      <span className="text-muted-foreground font-sans text-[11px]">(Asosiy 5s sinxronizatsiya)</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const url = `${window.location.origin}/api/app/sync`;
                        navigator.clipboard.writeText(url);
                        toast.success("URL nusxalandi: " + url);
                      }}
                      className="h-6 px-2 text-[11px] gap-1 font-sans"
                    >
                      <Copy className="w-3 h-3" />
                      URL Nusxalash
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-background/60 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-bold text-sky-400 border-sky-500/40 bg-sky-500/10">POST</Badge>
                      <span className="text-foreground font-semibold">/api/app/bot-action</span>
                      <span className="text-muted-foreground font-sans text-[11px]">(Botni start/stop/restart qilish)</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const url = `${window.location.origin}/api/app/bot-action`;
                        navigator.clipboard.writeText(url);
                        toast.success("URL nusxalandi: " + url);
                      }}
                      className="h-6 px-2 text-[11px] gap-1 font-sans"
                    >
                      <Copy className="w-3 h-3" />
                      URL Nusxalash
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-background/60 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-bold text-emerald-400 border-emerald-500/40 bg-emerald-500/10">GET</Badge>
                      <span className="text-foreground font-semibold">/api/app/ping</span>
                      <span className="text-muted-foreground font-sans text-[11px]">(Tezkor 200 OK tekshiruvi)</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const url = `${window.location.origin}/api/app/ping`;
                        navigator.clipboard.writeText(url);
                        toast.success("URL nusxalandi: " + url);
                      }}
                      className="h-6 px-2 text-[11px] gap-1 font-sans"
                    >
                      <Copy className="w-3 h-3" />
                      URL Nusxalash
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Integration Code Snippets Card */}
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-sky-400" />
                    Ilovani Ulash Kod Namunalari (5s Polling Code)
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Android (Kotlin/Java), Flutter yoki boshqa tildagi ilovangizga nusxalab qo'yishingiz mumkin bo'lgan tayyor kod.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/60">
                  <button
                    onClick={() => setActiveCodeSnippet('kotlin')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      activeCodeSnippet === 'kotlin' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Kotlin (Android)
                  </button>
                  <button
                    onClick={() => setActiveCodeSnippet('java')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      activeCodeSnippet === 'java' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Java
                  </button>
                  <button
                    onClick={() => setActiveCodeSnippet('curl')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      activeCodeSnippet === 'curl' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    cURL
                  </button>
                  <button
                    onClick={() => setActiveCodeSnippet('flutter')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      activeCodeSnippet === 'flutter' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Flutter
                  </button>
                  <button
                    onClick={() => setActiveCodeSnippet('js')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      activeCodeSnippet === 'js' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    JS / Node
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    let codeText = "";
                    const hostUrl = window.location.origin;
                    const keyVal = appApiKey || "cb_live_your_api_key_here";

                    if (activeCodeSnippet === 'kotlin') {
                      codeText = `// Kotlin (Coroutines 5-second polling loop)
class BotSyncPoller(private val apiKey: String = "${keyVal}") {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    fun start5sPolling(scope: CoroutineScope, onUpdate: (String) -> Unit) {
        scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    val request = Request.Builder()
                        .url("${hostUrl}/api/app/sync")
                        .addHeader("x-api-key", apiKey)
                        .get()
                        .build()

                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            val jsonBody = response.body?.string() ?: ""
                            withContext(Dispatchers.Main) {
                                onUpdate(jsonBody)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("BotSyncPoller", "Sync error: \${e.message}")
                }
                delay(5000L) // Har 5 soniyada yangilanadi
            }
        }
    }
}`;
                    } else if (activeCodeSnippet === 'java') {
                      codeText = `// Java (ScheduledExecutorService 5-second polling)
ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
OkHttpClient client = new OkHttpClient();

scheduler.scheduleAtFixedRate(() -> {
    try {
        Request request = new Request.Builder()
            .url("${hostUrl}/api/app/sync")
            .addHeader("x-api-key", "${keyVal}")
            .build();

        Response response = client.newCall(request).execute();
        if (response.isSuccessful()) {
            String jsonData = response.body().string();
            // Ma'lumotlarni ilovaga yangilash
            System.out.println("5s Sync data: " + jsonData);
        }
    } catch (Exception e) {
        e.printStackTrace();
    }
}, 0, 5, TimeUnit.SECONDS);`;
                    } else if (activeCodeSnippet === 'curl') {
                      codeText = `# 1. Har 5 soniyada ma'lumot olish (Sync)
curl -X GET "${hostUrl}/api/app/sync" \\
     -H "x-api-key: ${keyVal}"

# 2. Botni masofadan boshqarish (Start / Stop / Restart)
curl -X POST "${hostUrl}/api/app/bot-action" \\
     -H "Content-Type: application/json" \\
     -H "x-api-key: ${keyVal}" \\
     -d '{"botId": "BOT_ID_BU_YERGA", "action": "restart"}'`;
                    } else if (activeCodeSnippet === 'flutter') {
                      codeText = `// Flutter / Dart (Timer 5-second polling)
Timer.periodic(const Duration(seconds: 5), (timer) async {
  try {
    final response = await http.get(
      Uri.parse('${hostUrl}/api/app/sync'),
      headers: {
        'x-api-key': '${keyVal}',
      },
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      print("Real-time Bots count: \${data['stats']['totalBots']}");
    }
  } catch (e) {
    print("Sync error: \$e");
  }
});`;
                    } else {
                      codeText = `// JavaScript / React Native 5s Poller
const fetchLiveSync = async () => {
  try {
    const res = await fetch('${hostUrl}/api/app/sync', {
      headers: { 'x-api-key': '${keyVal}' }
    });
    const data = await res.json();
    console.log("5s Sync:", data);
  } catch (err) {
    console.error("Sync error:", err);
  }
};

setInterval(fetchLiveSync, 5000);
fetchLiveSync();`;
                    }

                    navigator.clipboard.writeText(codeText);
                    toast.success("Kod nusxalandi!");
                  }}
                  className="absolute top-3 right-3 z-10 h-7 text-xs font-semibold gap-1.5 rounded-lg"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Kodni nusxalash
                </Button>

                <div className="bg-slate-950 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto border border-border/60 leading-relaxed">
                  {activeCodeSnippet === 'kotlin' && (
                    <pre>{`// Kotlin (Android Coroutines 5-soniyali doimiy sinxronizatsiya)
class BotSyncPoller(private val apiKey: String = "${appApiKey || 'cb_live_YOUR_KEY'}") {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    fun start5sPolling(scope: CoroutineScope, onUpdate: (String) -> Unit) {
        scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    val request = Request.Builder()
                        .url("${window.location.origin}/api/app/sync")
                        .addHeader("x-api-key", apiKey)
                        .get()
                        .build()

                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            val jsonBody = response.body?.string() ?: ""
                            withContext(Dispatchers.Main) {
                                onUpdate(jsonBody) // UI'ni yangilash
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("BotSyncPoller", "Sync error: \${e.message}")
                }
                delay(5000L) // Har 5 soniyada avtomatik so'rov yuborish
            }
        }
    }
}`}</pre>
                  )}

                  {activeCodeSnippet === 'java' && (
                    <pre>{`// Java (Android ScheduledExecutorService 5-soniyali sinxronizatsiya)
ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
OkHttpClient client = new OkHttpClient();

scheduler.scheduleAtFixedRate(() -> {
    try {
        Request request = new Request.Builder()
            .url("${window.location.origin}/api/app/sync")
            .addHeader("x-api-key", "${appApiKey || 'cb_live_YOUR_KEY'}")
            .build();

        Response response = client.newCall(request).execute();
        if (response.isSuccessful()) {
            String jsonData = response.body().string();
            // Android UI yoki ViewModel'ga uzatish
            runOnUiThread(() -> updateUi(jsonData));
        }
    } catch (Exception e) {
        e.printStackTrace();
    }
}, 0, 5, TimeUnit.SECONDS); // 5 soniyali interval`}</pre>
                  )}

                  {activeCodeSnippet === 'curl' && (
                    <pre>{`# 1. 5-soniyada server va botlar holatini olish:
curl -X GET "${window.location.origin}/api/app/sync" \\
     -H "x-api-key: ${appApiKey || 'cb_live_YOUR_KEY'}"

# 2. Masofadan turib botni boshqarish (action: start | stop | restart):
curl -X POST "${window.location.origin}/api/app/bot-action" \\
     -H "Content-Type: application/json" \\
     -H "x-api-key: ${appApiKey || 'cb_live_YOUR_KEY'}" \\
     -d '{"botId": "BOT_ID_BU_YERGA", "action": "restart"}'`}</pre>
                  )}

                  {activeCodeSnippet === 'flutter' && (
                    <pre>{`// Flutter / Dart (5-soniyali Timer orqali sinxronlash)
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

void start5sPoller() {
  Timer.periodic(const Duration(seconds: 5), (timer) async {
    try {
      final response = await http.get(
        Uri.parse('${window.location.origin}/api/app/sync'),
        headers: {
          'x-api-key': '${appApiKey || 'cb_live_YOUR_KEY'}',
        },
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        print("Real-time Bots: \${data['bots']}");
      }
    } catch (e) {
      print("Sync error: \$e");
    }
  });
}`}</pre>
                  )}

                  {activeCodeSnippet === 'js' && (
                    <pre>{`// JavaScript / React Native / Node.js
const fetchLiveSync = async () => {
  try {
    const res = await fetch('${window.location.origin}/api/app/sync', {
      headers: { 'x-api-key': '${appApiKey || 'cb_live_YOUR_KEY'}' }
    });
    const data = await res.json();
    console.log("5s Sync data:", data);
  } catch (err) {
    console.error("Sync error:", err);
  }
};

setInterval(fetchLiveSync, 5000); // 5000 ms
fetchLiveSync();`}</pre>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Bot Control Tester via API */}
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                API Orqali Botlarni Masofadan Sinov Boshqaruvi
              </CardTitle>
              <CardDescription className="text-xs">
                Ushbu bo'lim mobil ilovangiz `POST /api/app/bot-action` API orqali botlarni qanday boshqarishini real vaqtda sinab ko'rish imkonini beradi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bots.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Hozircha tizimda botlar mavjud emas
                </div>
              ) : (
                <div className="space-y-3">
                  {bots.map(b => (
                    <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-muted/40 rounded-xl border border-border/60">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${b.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                          <Bot className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">{b.name}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                              b.status === 'running' ? 'text-emerald-400 border-emerald-500/30' : 'text-muted-foreground'
                            }`}>
                              {b.status === 'running' ? 'Ishlayapti' : "To'xtatilgan"}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            ID: {b.id} | Fayl: {b.entryPoint || 'bot.py'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {b.status !== 'running' ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleTestBotAction(b.id, 'start')}
                            disabled={actioningBotId === b.id}
                            className="h-7 text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                          >
                            <Play className="w-3 h-3" />
                            {actioningBotId === b.id ? "..." : "API Start"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTestBotAction(b.id, 'stop')}
                            disabled={actioningBotId === b.id}
                            className="h-7 text-xs font-semibold gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 rounded-lg"
                          >
                            <Square className="w-3 h-3" />
                            {actioningBotId === b.id ? "..." : "API Stop"}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleTestBotAction(b.id, 'restart')}
                          disabled={actioningBotId === b.id}
                          className="h-7 text-xs font-semibold gap-1 rounded-lg"
                        >
                          <RotateCw className={`w-3 h-3 ${actioningBotId === b.id ? 'animate-spin' : ''}`} />
                          API Restart
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live JSON Payload Inspector */}
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    Jonli JSON Javob Ko'ruvchi (Live 5s Payload)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ilovangiz har 5 soniyada qabul qilib oladigan to'liq tuzilmaviy JSON ma'lumotlar paketi.
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (liveSyncData) {
                      navigator.clipboard.writeText(JSON.stringify(liveSyncData, null, 2));
                      toast.success("JSON nusxalandi!");
                    }
                  }}
                  className="h-7 text-xs font-semibold gap-1.5 rounded-lg"
                >
                  <Copy className="w-3.5 h-3.5" />
                  JSON Nusxalash
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-950 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[350px] border border-border/60">
                <pre>{liveSyncData ? JSON.stringify(liveSyncData, null, 2) : "// Ma'lumotlar yuklanmoqda..."}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>



      {/* Bot o'chirishni tasdiqlash modali */}
      {botToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-destructive/40 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center gap-3.5 text-destructive">
              <div className="p-3 bg-destructive/10 rounded-full border border-destructive/20">
                <Trash2 className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">Botni tegi bilan o'chirish</h3>
                <p className="text-xs text-muted-foreground">Ushbu amalni ortga qaytarib bo'lmaydi</p>
              </div>
            </div>

            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60 text-sm space-y-1.5">
              <div className="text-xs text-muted-foreground">O'chirilayotgan bot:</div>
              <div className="font-bold text-foreground text-base">
                {botToDelete.name || 'Nom berilmagan bot'}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                ID: {botToDelete.id}
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Diqqat: Botning serverdagi barcha fayllari, loyiha papkasi, SQLite va Firestore ma'lumotlar bazasidagi yozuvlari hamda loglari to'liq o'chirib tashlanadi.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setBotToDelete(null)}
                disabled={deletingBotId === botToDelete.id}
                className="rounded-xl"
              >
                Bekor qilish
              </Button>
              <Button
                variant="destructive"
                className="gap-2 font-semibold rounded-xl"
                onClick={confirmDeleteBot}
                disabled={deletingBotId === botToDelete.id}
              >
                <Trash2 className="w-4 h-4" />
                {deletingBotId === botToDelete.id ? "O'chirilmoqda..." : "Ha, tegi bilan o'chirilsin"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
