import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Shield, Search, UserCheck, Crown, Zap, Bot, MessageSquare, Save, RefreshCw, Copy, Check, Calendar, BellRing, Send, Trash2, Paperclip, CheckCheck, User, Headphones, Sparkles, CheckCircle2, AlertCircle, Eye, EyeOff, Activity, Radio, ExternalLink, Link2, Smartphone, MessageCircle, AlertTriangle } from 'lucide-react';
import { LogoIcon } from '../components/Logo';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { safeSetDoc, safeAddDoc, safeDeleteDoc, isFirestoreQuotaExhausted } from '../lib/safeFirestore';
import { Profile, Bot as BotType, PlanType } from '../types';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

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
                  existingMap.set(u.id, { id: u.id, email: u.email || '', createdAt: u.createdAt || new Date().toISOString() });
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
        map.set(emailKey, p);
      } else {
        const existing = map.get(emailKey)!;
        const existingPlan = subscriptions[existing.id] || 'free';
        const currentPlan = subscriptions[p.id] || 'free';
        if (currentPlan !== 'free' && existingPlan === 'free') {
          map.set(emailKey, p);
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
              <h1 className="text-3xl font-extrabold tracking-tight">Admin Boshqaruv Paneli</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Foydalanuvchilar ro'yxati va obunalar (PRO / VIP) boshqaruvi
              </p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="px-4 py-1.5 text-sm rounded-xl font-medium border-amber-500/30 text-amber-500 bg-amber-500/5 self-start md:self-auto">
          Super Admin: {user?.email}
        </Badge>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jami Foydalanuvchilar</CardDescription>
            <CardTitle className="text-3xl font-black">{totalUsers}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">Ro'yxatdan o'tganlar</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-500">PRO Obunachilar</CardDescription>
            <CardTitle className="text-3xl font-black text-emerald-500">{proUsersCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-emerald-500/80">Max 10 ta bot limiti</span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-amber-500">VIP Obunachilar</CardDescription>
            <CardTitle className="text-3xl font-black text-amber-500">{vipUsersCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-amber-500/80">Max 30 ta bot limiti</span>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jami Botlar</CardDescription>
            <CardTitle className="text-3xl font-black text-primary">{bots.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-primary/80">{bots.filter(b => b.status === 'running').length} ta ishlayotgan bot</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6 p-1 bg-muted/60 border rounded-xl">
          <TabsTrigger value="users" className="gap-2 rounded-lg font-semibold text-sm">
            <UserCheck className="w-4 h-4" />
            Foydalanuvchilar va Obunalar ({filteredProfiles.length})
          </TabsTrigger>
          <TabsTrigger value="bots" className="gap-2 rounded-lg font-semibold text-sm">
            <Bot className="w-4 h-4" />
            Botlar ({bots.length})
          </TabsTrigger>
          <TabsTrigger value="telegram-ai" className="gap-2 rounded-lg font-semibold text-sm">
            <Radio className="w-4 h-4 text-sky-400" />
            24/7 Telegram AI Yordamchi
            {tgStatus?.isRunning && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5"></span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* USERS & SUBSCRIPTIONS TAB */}
        <TabsContent value="users">
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <span>Foydalanuvchilar Ro'yxati</span>
                  <Badge variant="secondary" className="text-xs">{filteredProfiles.length} ta</Badge>
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Har bir foydalanuvchiga Pro yoki VIP obunani osongina bering
                </CardDescription>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Email yoki ID bo'yicha qidiruv..."
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
                      <TableHead className="font-bold">Foydalanuvchi Email</TableHead>
                      <TableHead className="font-bold">User UID</TableHead>
                      <TableHead className="font-bold">Hozirgi Obuna</TableHead>
                      <TableHead className="font-bold">Berilgan Sana & To'lov Kuni (kun/oy/yil)</TableHead>
                      <TableHead className="font-bold text-center">Obunani Boshqarish</TableHead>
                      <TableHead className="font-bold text-right">Ogohlantirish</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          {searchQuery ? "Qidiruvga mos foydalanuvchi topilmadi" : "Hali foydalanuvchilar yo'q"}
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
