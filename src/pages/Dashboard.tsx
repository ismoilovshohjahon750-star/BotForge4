import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Play, Square, RefreshCcw, FileUp, Terminal, Activity, FileText, Trash2, Search, Copy, Check, Radio, Clock, Shield, Cpu, Filter, X, ArrowLeft, Key, Eye, EyeOff, Settings, Sliders, Database, Github, Send, ExternalLink, Sparkles, Wand2, AlertTriangle, Mail, Zap } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, serverTimestamp } from 'firebase/firestore';
import { GithubAuthProvider, signInWithPopup, linkWithPopup, sendEmailVerification } from 'firebase/auth';
import { safeSetDoc, safeUpdateDoc, safeDeleteDoc, isFirestoreQuotaExhausted } from '../lib/safeFirestore';
import { db, auth, githubProvider } from '../lib/firebase';
import { Bot, BotStatus, BotLog } from '../types';
import { toast } from 'sonner';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [customGithubName, setCustomGithubName] = useState('');
  const [autoStartGithub, setAutoStartGithub] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('cloudbot_github_token') || '');
  const [userRepos, setUserRepos] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');

  const fetchUserRepos = async (tokenToUse?: string) => {
    const activeToken = tokenToUse || githubToken;
    if (!activeToken) return;
    setLoadingRepos(true);
    try {
      const userAuthToken = await user?.getIdToken();
      const res = await fetch(`/api/github/repos?token=${encodeURIComponent(activeToken)}`, {
        headers: { 'Authorization': `Bearer ${userAuthToken}` }
      });
      const data = await res.json();
      if (res.ok && data.repos) {
        setUserRepos(data.repos);
      } else {
        toast.error(data.error || "Repozitoriyalarni yuklab bo'lmadi");
      }
    } catch (e: any) {
      toast.error("GitHub API xatoligi: " + e.message);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    if (githubToken) {
      localStorage.setItem('cloudbot_github_token', githubToken);
    }
  }, [githubToken]);

  const handleConnectGithub = async () => {
    try {
      let token = '';

      if (auth.currentUser) {
        try {
          const res = await linkWithPopup(auth.currentUser, githubProvider);
          const cred = GithubAuthProvider.credentialFromResult(res);
          if (cred?.accessToken) {
            token = cred.accessToken;
          }
        } catch (linkErr: any) {
          console.log("linkWithPopup info:", linkErr);
          const credFromErr = GithubAuthProvider.credentialFromError(linkErr);
          if (credFromErr?.accessToken) {
            token = credFromErr.accessToken;
          } else {
            // Fallback to signInWithPopup
            try {
              const signRes = await signInWithPopup(auth, githubProvider);
              const cred = GithubAuthProvider.credentialFromResult(signRes);
              if (cred?.accessToken) {
                token = cred.accessToken;
              }
            } catch (signErr: any) {
              const credFromSignErr = GithubAuthProvider.credentialFromError(signErr);
              if (credFromSignErr?.accessToken) {
                token = credFromSignErr.accessToken;
              } else {
                if (signErr.code === 'auth/popup-closed-by-user' || linkErr.code === 'auth/popup-closed-by-user') {
                  toast.info("GitHub ulanish oynasi yopildi.");
                  return;
                }
                throw signErr;
              }
            }
          }
        }
      } else {
        try {
          const res = await signInWithPopup(auth, githubProvider);
          const cred = GithubAuthProvider.credentialFromResult(res);
          if (cred?.accessToken) {
            token = cred.accessToken;
          }
        } catch (signErr: any) {
          const credFromSignErr = GithubAuthProvider.credentialFromError(signErr);
          if (credFromSignErr?.accessToken) {
            token = credFromSignErr.accessToken;
          } else {
            if (signErr.code === 'auth/popup-closed-by-user') {
              toast.info("GitHub ulanish oynasi yopildi.");
              return;
            }
            throw signErr;
          }
        }
      }

      if (token) {
        setGithubToken(token);
        localStorage.setItem('cloudbot_github_token', token);
        toast.success("GitHub hisobingiz ulandi! Repozitoriyalaringiz yuklanmoqda...");
        fetchUserRepos(token);
      } else {
        toast.info("GitHub muvaffaqiyatli ulandi. Repozitoriyalar uchun token olinganligini tekshiring.");
      }
    } catch (err: any) {
      console.error("GitHub connect error:", err);
      toast.error("GitHub ulanishida xatolik: " + (err.message || err));
    }
  };

  // Env / Bot Token settings states
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [envModalTab, setEnvModalTab] = useState<'form' | 'raw'>('form');
  const [rawEnvText, setRawEnvText] = useState<string>('');
  const [selectedBotForEnv, setSelectedBotForEnv] = useState<Bot | null>(null);
  const [detectedEnvVars, setDetectedEnvVars] = useState<any[]>([]);
  const [envFormValues, setEnvFormValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isLoadingEnv, setIsLoadingEnv] = useState(false);
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [newCustomEnvKey, setNewCustomEnvKey] = useState('');
  const [newCustomEnvVal, setNewCustomEnvVal] = useState('');

  // User subscription state
  const [userPlan, setUserPlan] = useState<'free' | 'pro' | 'vip'>('free');
  const [scheduleInfo, setScheduleInfo] = useState<{
    plan: 'free' | 'pro' | 'vip';
    planName: string;
    startHour: string;
    endHour: string;
    currentUzbTime: string;
    isActive: boolean;
    description: string;
  } | null>(null);

  // Terminal Real-Time Logs states
  const [selectedBotForLogs, setSelectedBotForLogs] = useState<Bot | null>(null);
  const [botToDelete, setBotToDelete] = useState<Bot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [botLogs, setBotLogs] = useState<{type: string, message: string, createdAt: string}[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [logsIntervalId, setLogsIntervalId] = useState<any>(null);
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [logSearchFilter, setLogSearchFilter] = useState('');
  const [logCategory, setLogCategory] = useState<'all' | 'run' | 'deploy' | 'system'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Live timer tick for Uptime update (throttled when tab is inactive)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchSubFromApi = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/user/subscription', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.plan) {
            setUserPlan(data.plan);
          }
        }
      } catch (e) {}
    };

    fetchSubFromApi();

    if (isFirestoreQuotaExhausted()) return;

    const subRef = doc(db, 'subscriptions', user.uid);
    let unsubSub = () => {};
    unsubSub = onSnapshot(subRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserPlan((snapshot.data()?.plan as any) || 'free');
      } else {
        setUserPlan('free');
      }
    }, (err: any) => {
      fetchSubFromApi();
      if (err?.code === 'resource-exhausted' || err?.code === 'unavailable') {
        unsubSub();
      }
    });
    return () => unsubSub();
  }, [user]);

  const maxBotsAllowed = userPlan === 'vip' ? 30 : userPlan === 'pro' ? 10 : 2;

  useEffect(() => {
    return () => {
      if (logsIntervalId) clearInterval(logsIntervalId);
    };
  }, [logsIntervalId]);

  useEffect(() => {
    if (autoScroll && selectedBotForLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [botLogs, autoScroll, selectedBotForLogs]);

  const fetchLogs = async (botId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/bots/${botId}/logs`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) return;
      const data = await response.json();
      setBotLogs(data.logs || []);
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn("Logs poll info:", e?.message || e);
      }
    }
  };

  const openBotLogs = async (bot: Bot) => {
    setSelectedBotForLogs(bot);
    setIsLogsLoading(true);
    setLogSearchFilter('');
    setLogCategory('all');
    await fetchLogs(bot.id);
    setIsLogsLoading(false);

    // Poll logs every 3 seconds (pauses automatically if browser tab is in background)
    if (logsIntervalId) clearInterval(logsIntervalId);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchLogs(bot.id);
    }, 3000);
    setLogsIntervalId(interval);
  };

  const closeBotLogs = () => {
    if (logsIntervalId) {
      clearInterval(logsIntervalId);
      setLogsIntervalId(null);
    }
    setSelectedBotForLogs(null);
    setBotLogs([]);
  };

  const handleClearLogs = async (botId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/bots/${botId}/logs/clear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setBotLogs([]);
        toast.success("Loglar muvaffaqiyatli tozalandi");
      } else {
        toast.error("Loglarni tozalab bo'lmadi");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const [isFixingErrors, setIsFixingErrors] = useState(false);

  const handleFixBotErrors = async (bot: Bot) => {
    if (!user) {
      toast.error("Iltimos, tizimga kiring!");
      return;
    }
    setIsFixingErrors(true);
    toast.loading("Botly AI koddagi barcha xatoliklarni tekshirmoqda va tuzatmoqda...", { id: 'ai-fix-toast' });
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/bots/${bot.id}/fix-errors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Xatolikni tuzatishda muammo yuz berdi", { id: 'ai-fix-toast', duration: 6000 });
        return;
      }
      toast.success(`✨ ${data.message || "Xatoliklar muvaffaqiyatli tuzatildi!"}`, { id: 'ai-fix-toast', duration: 6000 });
      if (data.explanation) {
        toast.info(`Tafsilot: ${data.explanation.slice(0, 150)}...`, { duration: 8000 });
      }
      // Refresh logs
      await fetchLogs(bot.id);
    } catch (err: any) {
      toast.error(err?.message || "Server bilan bog'lanishda xatolik", { id: 'ai-fix-toast' });
    } finally {
      setIsFixingErrors(false);
    }
  };

  const copyAllLogs = () => {
    if (botLogs.length === 0) return;
    const fullText = botLogs.map(l => `[${new Date(l.createdAt).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(fullText);
    setIsCopied(true);
    toast.success("Barcha loglar buferga nusxalandi!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const getUptimeString = (bot: Bot): string => {
    if (bot.status !== 'running') return "To'xtatilgan";
    
    const startTimeStr = bot.uptimeStart || bot.createdAt;
    if (!startTimeStr) return "Faol";

    let start = 0;
    if (typeof startTimeStr === 'object' && (startTimeStr as any).toDate) {
      start = (startTimeStr as any).toDate().getTime();
    } else if (typeof startTimeStr === 'object' && (startTimeStr as any).seconds) {
      start = (startTimeStr as any).seconds * 1000;
    } else {
      start = new Date(startTimeStr).getTime();
    }

    if (isNaN(start) || start <= 0) return "Ishlamoqda";

    const diffMs = Math.max(0, nowTime - start);
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} kun ${hours % 24} soat ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours} soat ${minutes % 60} daq ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes} daq ${seconds % 60}s`;
    } else {
      return `${seconds} sek`;
    }
  };

  const deletedBotIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchFromApi = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/bots', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.bots && isMounted) {
            const validBots = (data.bots as Bot[]).filter(b => 
              (!b.userId || b.userId === user.uid || user.email === 'ismoilovshohjahon750@gmail.com') && !deletedBotIdsRef.current.has(b.id)
            );
            setBots(prev => {
              const map = new Map<string, Bot>();
              // Keep previous user bots
              prev.forEach(b => {
                if ((!b.userId || b.userId === user.uid || user.email === 'ismoilovshohjahon750@gmail.com') && !deletedBotIdsRef.current.has(b.id)) {
                  map.set(b.id, b);
                }
              });
              // Merge API runtime data
              validBots.forEach(b => {
                if (map.has(b.id)) {
                  map.set(b.id, { ...map.get(b.id)!, ...b });
                } else {
                  map.set(b.id, b);
                }
              });
              return Array.from(map.values());
            });
          }
          if (data.userPlan && isMounted) {
            setUserPlan(data.userPlan);
          }
          if (data.schedule && isMounted) {
            setScheduleInfo(data.schedule);
          }
        }
      } catch (err) {
        console.warn('API bots fetch warning:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // First, try loading via API immediately
    fetchFromApi();

    // Safety fallback: never keep Dashboard on full-screen loading for more than 500ms
    const fallbackTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 500);

    const q = query(collection(db, 'bots'), where('userId', '==', user.uid));
    let unsubscribe = () => {};
    try {
      unsubscribe = onSnapshot(q, (snapshot) => {
        const botsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bot))
          .filter(b => !deletedBotIdsRef.current.has(b.id));
        if (isMounted) {
          setBots(prev => {
            const map = new Map<string, Bot>();
            // Add primary firestore bots
            botsData.forEach(b => map.set(b.id, b));
            // Merge existing runtime status from API
            prev.forEach(b => {
              if (map.has(b.id)) {
                map.set(b.id, { ...b, ...map.get(b.id)! });
              }
            });
            return Array.from(map.values()).filter(b => !deletedBotIdsRef.current.has(b.id));
          });
        }
        if (isMounted) setLoading(false);
      }, (error: any) => {
        console.warn("Firestore bots listener notice:", error?.message || error);
        if (error?.code === 'resource-exhausted' || error?.code === 'unavailable') {
          unsubscribe();
        }
        fetchFromApi();
        if (isMounted) setLoading(false);
      });
    } catch (e) {
      console.warn("Firestore subscription catch:", e);
      fetchFromApi();
      if (isMounted) setLoading(false);
    }

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchFromApi();
    }, 8000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchFromApi();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    if (bots.length >= maxBotsAllowed) {
      toast.error(`Sizning tarifingizda (${userPlan.toUpperCase()} - maks ${maxBotsAllowed} ta bot) limitga yetdingiz. Davom etish uchun tarifingizni yangilang.`);
      return;
    }

    setIsUploading(true);
    try {
      // Create a Firestore document reference first to predetermine the ID
      const docRef = doc(collection(db, 'bots'));
      const botId = docRef.id;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', uploadName);

      const token = await user.getIdToken();
      const response = await fetch(`/api/bots/upload?id=${botId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-client-bot-count': bots.length.toString()
        },
        body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Save to Firestore using the exact same ID so SQLite and Firestore match perfectly
      await safeSetDoc(docRef, {
        userId: user.uid,
        userEmail: user.email || '',
        name: result.data.name,
        language: result.data.language,
        status: 'running',
        entryPoint: result.data.entryPoint,
        createdAt: serverTimestamp(),
        uptimeStart: serverTimestamp()
      }, { merge: true });

      // Auto start bot process
      try {
        await fetch(`/api/bots/${botId}/action`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'start' })
        });
      } catch (e) {}

      toast.success('Bot muvaffaqiyatli yuklandi va ishga tushirildi!');
      setUploadName('');
      setFile(null);
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGithubImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl || !user) return;

    if (bots.length >= maxBotsAllowed) {
      toast.error(`Sizning tarifingizda (${userPlan.toUpperCase()} - maks ${maxBotsAllowed} ta bot) limitga yetdingiz. Davom etish uchun tarifingizni yangilang.`);
      return;
    }

    setIsImporting(true);
    try {
      const token = await user.getIdToken();

      // Create a Firestore document reference first to predetermine the ID
      const docRef = doc(collection(db, 'bots'));
      const botId = docRef.id;

      toast.info("GitHub repozitoriyasidan fayllar yuklanmoqda va tahlil qilinmoqda...");

      const response = await fetch('/api/bots/github-import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-client-bot-count': bots.length.toString()
        },
        body: JSON.stringify({
          repoUrl,
          name: customGithubName,
          id: botId,
          clientBotCount: bots.length,
          githubToken
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Save to Firestore using the exact same ID so SQLite and Firestore match perfectly
      await safeSetDoc(docRef, {
        userId: user.uid,
        userEmail: user.email || '',
        name: result.data.name,
        language: result.data.language,
        status: 'stopped',
        entryPoint: result.data.entryPoint,
        createdAt: serverTimestamp(),
        uptimeStart: null
      }, { merge: true });

      const importedBot: Bot = {
        id: botId,
        userId: user.uid,
        name: result.data.name,
        language: result.data.language,
        status: 'stopped',
        entryPoint: result.data.entryPoint,
        createdAt: new Date().toISOString()
      };

      if (result.data.detectedVars && result.data.detectedVars.length > 0) {
        setDetectedEnvVars(result.data.detectedVars);
        const initVals: Record<string, string> = {};
        result.data.detectedVars.forEach((v: any) => {
          initVals[v.key] = v.value || '';
        });
        setEnvFormValues(initVals);
        setSelectedBotForEnv(importedBot);
        setEnvModalOpen(true);
        toast.success(`🔍 Kod tahlil qilindi! Telegram Bot Token va Admin ID kabi sozlamalarni kiriting.`);
      } else {
        if (autoStartGithub) {
          try {
            await fetch(`/api/bots/${botId}/action`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ action: 'start' })
            });
            await safeUpdateDoc(docRef, { status: 'running', uptimeStart: serverTimestamp() });
          } catch (e) {}
        }
        toast.success(`Bot (${result.data.name}) GitHub'dan muvaffaqiyatli import qilindi (${result.data.fileCount} ta fayl)!`);
      }

      setRepoUrl('');
      setCustomGithubName('');
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const openEnvModal = async (bot: Bot) => {
    setSelectedBotForEnv(bot);
    setEnvModalOpen(true);
    setIsLoadingEnv(true);
    setEnvModalTab('form');
    setNewCustomEnvKey('');
    setNewCustomEnvVal('');
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/bots/${bot.id}/env`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const initVals: Record<string, string> = {};

      if (data.detectedVars) {
        setDetectedEnvVars(data.detectedVars);
        data.detectedVars.forEach((v: any) => {
          initVals[v.key] = v.value || '';
        });
      }

      if (data.existingEnv) {
        Object.entries(data.existingEnv).forEach(([k, v]: [string, any]) => {
          initVals[k] = String(v ?? '');
        });
      }

      setEnvFormValues(initVals);

      if (data.rawEnv && data.rawEnv.trim()) {
        setRawEnvText(data.rawEnv);
      } else {
        const lines = Object.entries(initVals).map(([k, v]) => `${k}=${v}`);
        setRawEnvText(lines.join('\n'));
      }
    } catch (e: any) {
      toast.error("Sozlamalarni yuklashda xatolik: " + e.message);
    } finally {
      setIsLoadingEnv(false);
    }
  };

  const syncFormToRaw = () => {
    const lines = Object.entries(envFormValues).map(([k, v]) => `${k}=${v}`);
    setRawEnvText(lines.join('\n'));
  };

  const syncRawToForm = (raw: string) => {
    setRawEnvText(raw);
    const newVals: Record<string, string> = {};
    raw.split('\n').forEach(l => {
      let t = l.trim();
      if (t.startsWith('export ')) t = t.substring(7).trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const eq = t.indexOf('=');
        const k = t.substring(0, eq).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const v = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (k) newVals[k] = v;
      }
    });
    setEnvFormValues(newVals);
    setDetectedEnvVars(prev => {
      const existingKeys = new Set(prev.map(p => p.key));
      const updated = [...prev];
      Object.keys(newVals).forEach(k => {
        if (!existingKeys.has(k)) {
          updated.push({
            key: k,
            label: k,
            description: "Maxsus o'zgaruvchi",
            placeholder: "Qiymat...",
            value: newVals[k]
          });
        }
      });
      return updated;
    });
  };

  const removeEnvVariable = (keyToRemove: string) => {
    setEnvFormValues(prev => {
      const copy = { ...prev };
      delete copy[keyToRemove];
      const lines = Object.entries(copy).map(([k, v]) => `${k}=${v}`);
      setRawEnvText(lines.join('\n'));
      return copy;
    });
    setDetectedEnvVars(prev => prev.filter(v => v.key !== keyToRemove));
    toast.info(`"${keyToRemove}" o'chirildi`);
  };

  const addQuickEnvVar = (key: string, defaultVal: string = '') => {
    const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!cleanKey) return;
    setDetectedEnvVars(prev => {
      if (prev.some(x => x.key === cleanKey)) return prev;
      return [...prev, {
        key: cleanKey,
        label: cleanKey,
        description: "Qo'shilgan o'zgaruvchi",
        placeholder: "Qiymat...",
        value: defaultVal
      }];
    });
    setEnvFormValues(prev => {
      const next = { ...prev, [cleanKey]: defaultVal };
      const lines = Object.entries(next).map(([k, v]) => `${k}=${v}`);
      setRawEnvText(lines.join('\n'));
      return next;
    });
    toast.success(`"${cleanKey}" ro'yxatga qo'shildi`);
  };

  const saveBotEnv = async (shouldStartBot: boolean = false) => {
    if (!selectedBotForEnv) return;
    setIsSavingEnv(true);
    try {
      const token = await user?.getIdToken();

      // If in raw mode, sync to form values first
      let payload: any = {
        envVars: envFormValues,
        rawEnv: rawEnvText,
        autoRestart: selectedBotForEnv.status === 'running' && !shouldStartBot,
        startBot: shouldStartBot
      };

      if (envModalTab === 'raw') {
        payload.rawEnv = rawEnvText;
      }

      const res = await fetch(`/api/bots/${selectedBotForEnv.id}/env`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Saqlashda xatolik yuz berdi");

      toast.success("🔑 Atrof-muhit o'zgaruvchilari (.env) muvaffaqiyatli saqlandi!");

      if (shouldStartBot) {
        setBots(prev => prev.map(b => b.id === selectedBotForEnv.id ? { ...b, status: 'running' } : b));
        await safeUpdateDoc(doc(db, 'bots', selectedBotForEnv.id), {
          status: 'running',
          uptimeStart: serverTimestamp()
        });
        toast.success("🚀 Bot yangi sozlamalar bilan ishga tushirildi!");
      }

      setEnvModalOpen(false);
    } catch (e: any) {
      toast.error("Xatolik: " + e.message);
    } finally {
      setIsSavingEnv(false);
    }
  };

  const toggleBot = async (bot: Bot) => {
    const newStatus = bot.status === 'running' ? 'stopped' : 'running';
    // Optimistic UI update
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, status: newStatus } : b));
    
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/bots/${bot.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: newStatus === 'running' ? 'start' : 'stop' })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Amalni bajarib bo'lmadi");
      }

      await safeUpdateDoc(doc(db, 'bots', bot.id), {
        status: newStatus,
        uptimeStart: newStatus === 'running' ? serverTimestamp() : null
      });

      toast.success(`Bot ${newStatus === 'running' ? 'ishga tushirildi' : 'to\'xtatildi'}`);
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
      // Rollback on failure
      setBots(prev => prev.map(b => b.id === bot.id ? { ...b, status: bot.status } : b));
    }
  };

  const restartBot = async (bot: Bot) => {
    // Optimistic UI update
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, status: 'running' } : b));
    
    try {
      const token = await user?.getIdToken();
      toast.info(`Bot (${bot.name}) qayta ishga tushirilmoqda...`);
      const res = await fetch(`/api/bots/${bot.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'restart' })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Qayta ishga tushirishda xatolik");
      }

      await safeUpdateDoc(doc(db, 'bots', bot.id), {
        status: 'running',
        uptimeStart: serverTimestamp()
      });

      toast.success(`Bot (${bot.name}) muvaffaqiyatli qayta ishga tushirildi!`);
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
    }
  };

  const openDeleteModal = (bot: Bot) => {
    setBotToDelete(bot);
  };

  const confirmDeleteBot = async () => {
    if (!botToDelete) return;
    const targetBot = botToDelete;
    const targetId = targetBot.id;
    const targetName = targetBot.name;

    // 1. Mark as deleted immediately and close dialog (Never hang on UI)
    deletedBotIdsRef.current.add(targetId);
    setBots(prev => prev.filter(b => b.id !== targetId));
    setBotToDelete(null);
    setIsDeleting(false);

    // 2. Perform background delete operations on server and Firestore
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/bots/${targetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("Backend bot delete notice:", data);
      }

      // Cleanup from Firestore with safe timeout
      await safeDeleteDoc(doc(db, 'bots', targetId));
      toast.success(`Bot (${targetName}) muvaffaqiyatli o'chirildi`);
    } catch (error: any) {
      console.warn("Bot delete notice:", error);
      toast.success(`Bot (${targetName}) o'chirildi`);
    }
  };

  if (loading) return <div className="p-20 text-center">Yuklanmoqda...</div>;

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Unverified Email Warning Banner */}
      {user && !user.emailVerified && user.providerData?.some(p => p.providerId === 'password') && (
        <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-300 text-xs shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <strong className="text-white block sm:inline font-semibold">Emailingiz ({user.email}) hali tasdiqlanmagan.</strong>{' '}
              <span className="text-amber-200/90">Botly tizimidagi barcha imkoniyatlar uchun pochtangizga borgan tasdiqlash havolasini bosing.</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  if (auth.currentUser) {
                    await sendEmailVerification(auth.currentUser, {
                      url: window.location.origin + '/dashboard',
                      handleCodeInApp: false
                    });
                    toast.success("Tasdiqlash havolasi qayta emailingizga yuborildi! Pochtani tekshiring.");
                  }
                } catch (e: any) {
                  toast.error("Xat yuborishda xatolik: " + e.message);
                }
              }}
              className="text-xs h-8 rounded-lg border-amber-500/40 text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              Havolani qayta yuborish
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  if (auth.currentUser) {
                    await auth.currentUser.reload();
                    if (auth.currentUser.emailVerified) {
                      toast.success("Emailingiz muvaffaqiyatli tasdiqlandi!");
                      window.location.reload();
                    } else {
                      toast.warning("Emailingiz hali tasdiqlanmagan. Iltimos pochtangizdagi havolani bosing.");
                    }
                  }
                } catch (err: any) {
                  toast.error("Tekshirishda xatolik: " + err.message);
                }
              }}
              className="text-xs h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold cursor-pointer"
            >
              Tekshirish
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Boshqaruv Paneli</h1>
          <p className="text-muted-foreground mt-1">Barcha botlaringiz va ularning holati</p>
        </div>
        
        <Dialog>
          <DialogTrigger render={<Button className="gap-2 rounded-xl" />}>
            <Plus className="w-4 h-4" />
            Yangi Bot
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yangi Bot Qo'shish</DialogTitle>
              <DialogDescription>
                Yangi botni yuklash usulini tanlang.
              </DialogDescription>
            </DialogHeader>

            {bots.length >= maxBotsAllowed && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs rounded-xl flex items-center justify-between">
                <span>⚠️ {userPlan === 'free' ? 'Bepul obunada maksimal 2 ta bot joylashingiz mumkin.' : `Obuna limitiga yetdingiz (${bots.length}/${maxBotsAllowed}).`}</span>
                <a href="/pricing" className="underline font-semibold ml-2">Tarifni oshirish</a>
              </div>
            )}
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Zip Fayl</TabsTrigger>
                <TabsTrigger value="github">GitHub</TabsTrigger>
              </TabsList>
              <TabsContent value="upload">
                <form onSubmit={handleUpload} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bot nomi</label>
                    <Input 
                      placeholder="Mening Botim" 
                      value={uploadName} 
                      onChange={e => setUploadName(e.target.value)} 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Zip fayl</label>
                    <div className="border-2 border-dashed rounded-xl p-8 text-center hover:bg-primary/5 transition-colors cursor-pointer relative">
                      <input 
                        type="file" 
                        accept=".zip" 
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={e => setFile(e.target.files?.[0] || null)}
                      />
                      <FileUp className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {file ? file.name : "Faylni tanlang yoki shu yerga tashlang"}
                      </p>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isUploading || bots.length >= maxBotsAllowed}>
                    {bots.length >= maxBotsAllowed ? `Limitga yetdingiz (${bots.length}/${maxBotsAllowed})` : isUploading ? "Yuklanmoqda..." : "Yuklash va Tekshirish"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="github" className="pt-4 space-y-4">
                <form onSubmit={handleGithubImport} className="space-y-4">
                  {/* GitHub Auth / Private repo access header */}
                  <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Github className="w-4.5 h-4.5 text-indigo-400" />
                        <span className="text-xs font-semibold text-zinc-200">GitHub Hisobni Ulash & Private Repozitoriyalar</span>
                      </div>
                      {githubToken ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-medium">
                            ✓ Ulangan
                          </span>
                          <button
                            type="button"
                            onClick={() => fetchUserRepos()}
                            disabled={loadingRepos}
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            title="Repozitoriyalarni yangilash"
                          >
                            <RefreshCcw className={`w-3.5 h-3.5 ${loadingRepos ? 'animate-spin text-primary' : ''}`} />
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleConnectGithub}
                          className="h-7 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/30 gap-1.5 cursor-pointer"
                        >
                          <Github className="w-3.5 h-3.5" />
                          GitHub orqali ulanish
                        </Button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-muted-foreground">GitHub Access Token (PAT):</label>
                      <Input
                        type="password"
                        placeholder="ghp_... yoki github_pat_... (avtomatik olinadi)"
                        value={githubToken}
                        onChange={e => {
                          setGithubToken(e.target.value);
                          if (e.target.value.length > 10) {
                            fetchUserRepos(e.target.value);
                          }
                        }}
                        className="h-8 text-xs font-mono bg-zinc-950/50"
                      />
                    </div>
                  </div>

                  {/* Connected User Repositories Selector */}
                  {userRepos.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-950/10 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                          <span>Sizning Repozitoriyalaringiz ({userRepos.length} ta)</span>
                          <span className="text-[10px] text-zinc-400 font-normal">(Private & Public)</span>
                        </label>
                      </div>

                      <Input
                        placeholder="Repozitoriya qidirish..."
                        value={repoSearch}
                        onChange={e => setRepoSearch(e.target.value)}
                        className="h-8 text-xs bg-zinc-950/60"
                      />

                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                        {userRepos
                          .filter(r => r.name.toLowerCase().includes(repoSearch.toLowerCase()) || r.fullName.toLowerCase().includes(repoSearch.toLowerCase()))
                          .map((repo: any) => {
                            const isSelected = repoUrl === repo.url || repoUrl === repo.cloneUrl;
                            return (
                              <button
                                key={repo.id}
                                type="button"
                                onClick={() => {
                                  setRepoUrl(repo.url);
                                  setCustomGithubName(repo.name);
                                  toast.info(`"${repo.name}" tanlandi`);
                                }}
                                className={`w-full text-left p-2 rounded-lg border transition-all text-xs flex items-center justify-between ${
                                  isSelected 
                                    ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium' 
                                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  {repo.private ? (
                                    <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded shrink-0">
                                      🔒 Private
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded shrink-0">
                                      🌐 Public
                                    </span>
                                  )}
                                  <span className="truncate font-mono">{repo.fullName}</span>
                                </div>
                                <span className="text-[10px] text-zinc-400 shrink-0 ml-2 font-mono">
                                  {repo.language}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">GitHub Repository URL</label>
                    <Input 
                      placeholder="https://github.com/username/repository yoki username/repo" 
                      value={repoUrl} 
                      onChange={e => {
                        setRepoUrl(e.target.value);
                        if (!customGithubName && e.target.value.includes('/')) {
                          const parts = e.target.value.trim().split('/');
                          const lastPart = parts[parts.length - 1].replace('.git', '');
                          if (lastPart) setCustomGithubName(lastPart);
                        }
                      }} 
                      required
                      disabled={bots.length >= maxBotsAllowed}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bot Nomi <span className="text-xs text-muted-foreground">(ixtiyoriy)</span></label>
                    <Input 
                      placeholder="Masalan: Aiogram Bot" 
                      value={customGithubName} 
                      onChange={e => setCustomGithubName(e.target.value)} 
                      disabled={bots.length >= maxBotsAllowed}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input 
                      type="checkbox" 
                      id="autoStartGithub" 
                      checked={autoStartGithub} 
                      onChange={e => setAutoStartGithub(e.target.checked)} 
                      className="rounded border-zinc-800 text-primary focus:ring-primary h-4 w-4 bg-zinc-900 cursor-pointer"
                    />
                    <label htmlFor="autoStartGithub" className="text-xs text-muted-foreground cursor-pointer select-none">
                      Import qilingandan so'ng avtomatik ishga tushirish (Auto Start)
                    </label>
                  </div>

                  {/* Popular Templates */}
                  <div className="pt-2 border-t border-zinc-800/80">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
                      <span>⚡ Tayyor Ochiq-Manbali Shablonlar:</span>
                      <span className="text-[10px] text-zinc-500 font-normal">Bir bosishda tanlash</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: "Aiogram 3 Template", lang: "Python", url: "https://github.com/aiogram/aiogram-bot-template" },
                        { name: "pyTelegramBotAPI", lang: "Python", url: "https://github.com/eternnoir/pyTelegramBotAPI" },
                        { name: "Telegraf Bot", lang: "Node.js", url: "https://github.com/telegraf/telegraf" },
                        { name: "Discord.py Bot", lang: "Python", url: "https://github.com/Rapptz/discord.py" },
                        { name: "grammY Bot", lang: "Node.js", url: "https://github.com/grammyjs/grammY" },
                        { name: "Telethon Client", lang: "Python", url: "https://github.com/LonamiWebs/Telethon" }
                      ].map((tpl, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setRepoUrl(tpl.url);
                            setCustomGithubName(tpl.name);
                            toast.info(`"${tpl.name}" shabloni tanlandi`);
                          }}
                          className="text-left p-2 rounded-lg border border-zinc-800/70 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800/50 transition-all text-xs"
                        >
                          <div className="font-medium text-zinc-200 truncate">{tpl.name}</div>
                          <div className="text-[10px] text-emerald-400/90 font-mono mt-0.5">{tpl.lang}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button type="submit" className="w-full gap-2 mt-2" disabled={isImporting || bots.length >= maxBotsAllowed}>
                    <Terminal className="w-4 h-4" />
                    {bots.length >= maxBotsAllowed ? `Limitga yetdingiz (${bots.length}/${maxBotsAllowed})` : isImporting ? "GitHub'dan yuklab olinmoqda..." : "GitHub'dan import qilish"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-8">
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Jami Botlar</CardDescription>
              <CardTitle className="text-2xl">{bots.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ishlayotgan</CardDescription>
              <CardTitle className="text-2xl text-primary">{bots.filter(b => b.status === 'running').length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>To'xtatilgan</CardDescription>
              <CardTitle className="text-2xl">{bots.filter(b => b.status === 'stopped').length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Botlar Ro'yxati</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Til</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead className="text-right">Harakatlar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      Sizda hali botlar yo'q
                    </TableCell>
                  </TableRow>
                ) : (
                  bots.map((bot) => (
                    <TableRow key={bot.id}>
                      <TableCell className="font-medium">{bot.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {bot.language}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={bot.status === 'running' ? 'default' : 'secondary'} className="gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${bot.status === 'running' ? 'bg-primary-foreground animate-pulse' : 'bg-muted-foreground'}`} />
                          {bot.status === 'running' ? 'Ishlayapti' : 'To\'xtatilgan'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        <span className={`inline-flex items-center gap-1.5 ${bot.status === 'running' ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
                          <Clock className="w-3 h-3" />
                          {getUptimeString(bot)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={() => openBotLogs(bot)} 
                            title="Real-vaqt holati va live loglar"
                            className="relative text-zinc-400 hover:text-emerald-400 border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-950/30 transition-all group"
                          >
                            <Activity className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                            {bot.status === 'running' && (
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                              </span>
                            )}
                          </Button>
                          <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={() => openEnvModal(bot)} 
                            title="Bot Token va Env Sozlamalari (.env)"
                            className="text-zinc-400 hover:text-amber-400 border-zinc-800 hover:border-amber-500/50 hover:bg-amber-950/30 transition-all"
                          >
                            <Key className="w-4 h-4 text-amber-400" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={() => restartBot(bot)} 
                            title="Qayta ishga tushirish (Re-deploy)"
                            className="text-zinc-400 hover:text-blue-400 border-zinc-800 hover:bg-blue-950/30"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="outline" onClick={() => toggleBot(bot)} title={bot.status === 'running' ? "To'xtatish" : "Ishga tushirish"} className="border-zinc-800">
                            {bot.status === 'running' ? <Square className="w-4 h-4 fill-current text-red-500" /> : <Play className="w-4 h-4 fill-current text-emerald-500" />}
                          </Button>
                          <Button size="icon" variant="outline" onClick={() => openDeleteModal(bot)} title="Botni o'chirish" className="text-zinc-400 hover:text-red-400 border-zinc-800">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Logs & Live Status Fullscreen Panel */}
      {selectedBotForLogs && (() => {
        const currentBot = bots.find(b => b.id === selectedBotForLogs.id) || selectedBotForLogs;
        const uptimeStr = getUptimeString(currentBot);

        // Filter logs based on search filter & category
        const filteredLogs = (botLogs || []).filter(log => {
          if (!log) return false;
          const matchesCategory = logCategory === 'all' || log.type === logCategory;
          const msgStr = log.message ? String(log.message) : '';
          const matchesSearch = !logSearchFilter || msgStr.toLowerCase().includes(logSearchFilter.toLowerCase());
          return matchesCategory && matchesSearch;
        });

        return (
        <div className="fixed inset-0 z-50 bg-zinc-950 text-zinc-100 flex flex-col w-screen h-screen overflow-hidden p-3 sm:p-5 md:p-6 space-y-3 animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-zinc-900 pb-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <Button
                size="icon"
                variant="ghost"
                onClick={closeBotLogs}
                className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl"
                title="Orqaga / Yopish"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>

              <div className="relative p-2 bg-emerald-950/50 border border-emerald-900/50 rounded-xl text-emerald-400">
                <Activity className="w-5 h-5 animate-pulse" />
                {currentBot.status === 'running' && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base sm:text-lg text-zinc-100">{currentBot.name}</span>
                  <Badge variant="outline" className="text-[10px] border-zinc-800 bg-zinc-900 text-zinc-400 uppercase font-mono">
                    {currentBot.language}
                  </Badge>
                </div>
                <p className="text-zinc-400 text-xs hidden sm:block">
                  To'liq ekran real-vaqt bot holati va jonli loglar konsoli
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Button 
                size="sm" 
                variant="outline" 
                className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 text-xs gap-1.5 rounded-xl h-8 px-2.5"
                onClick={copyAllLogs}
                title="Barcha loglarni nusxalash"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isCopied ? "Nusxalandi" : "Nusxalash"}</span>
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 text-xs gap-1.5 rounded-xl h-8 px-2.5"
                onClick={() => handleClearLogs(currentBot.id)}
              >
                <span className="hidden sm:inline">Tozalash</span>
                <span className="sm:hidden">Clear</span>
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="border-zinc-800 bg-zinc-900 text-blue-400 hover:bg-blue-950/40 hover:text-blue-300 text-xs gap-1.5 rounded-xl h-8 px-2.5"
                onClick={() => restartBot(currentBot)}
                title="Qayta ishga tushirish"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </Button>
              <Button
                size="sm"
                className={`rounded-xl h-8 text-xs font-semibold gap-1.5 px-3 ${
                  currentBot.status === 'running' 
                    ? 'bg-red-950/60 text-red-400 hover:bg-red-900/80 border border-red-900/80' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-950/50'
                }`}
                onClick={async () => {
                  await toggleBot(currentBot);
                }}
              >
                {currentBot.status === 'running' ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>To'xtatish</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ishga tushirish</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Bot Live Metrics Bar */}
          <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${currentBot.status === 'running' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50' : 'bg-red-950/60 text-red-400 border border-red-900/50'}`}>
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-zinc-500 font-medium">Joriy Holat</div>
                <div className={`text-xs font-bold truncate ${currentBot.status === 'running' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {currentBot.status === 'running' ? '🟢 Ishlayapti (Active)' : '🔴 To\'xtatilgan'}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-950/60 text-blue-400 border border-blue-900/50">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-zinc-500 font-medium">Uptime (Ishlash vaqti)</div>
                <div className="text-xs font-bold text-zinc-200 font-mono truncate">
                  {uptimeStr}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-purple-950/60 text-purple-400 border border-purple-900/50">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-zinc-500 font-medium">Boshlang'ich fayl</div>
                <div className="text-xs font-bold text-zinc-200 font-mono truncate">
                  {currentBot.entryPoint || 'bot.py'}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-950/60 text-amber-400 border border-amber-900/50">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-zinc-500 font-medium">Jami loglar</div>
                <div className="text-xs font-bold text-amber-400 font-mono truncate">
                  {botLogs.length} ta yozuv
                </div>
              </div>
            </div>
          </div>

          {/* Log Controls & Filter Bar */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5 py-1.5 border-b border-zinc-900">
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                <Input 
                  placeholder="Loglarda qidirish..." 
                  value={logSearchFilter}
                  onChange={e => setLogSearchFilter(e.target.value)}
                  className="h-8 pl-8 text-xs bg-zinc-900/90 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 rounded-xl"
                />
              </div>
              {logSearchFilter && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => setLogSearchFilter('')}
                  className="h-8 px-2 text-[10px] text-zinc-400 hover:text-zinc-200"
                >
                  Tozalash
                </Button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-850 text-xs overflow-x-auto max-w-full">
              <button
                onClick={() => setLogCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ${logCategory === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Barchasi ({botLogs.length})
              </button>
              <button
                onClick={() => setLogCategory('run')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ${logCategory === 'run' ? 'bg-emerald-950 text-emerald-300 border border-emerald-900/50' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                🟢 RUN ({botLogs.filter(l => l.type === 'run').length})
              </button>
              <button
                onClick={() => setLogCategory('deploy')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ${logCategory === 'deploy' ? 'bg-purple-950 text-purple-300 border border-purple-900/50' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                📦 DEPLOY ({botLogs.filter(l => l.type === 'deploy').length})
              </button>
              <button
                onClick={() => setLogCategory('system')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ${logCategory === 'system' ? 'bg-blue-950 text-blue-300 border border-blue-900/50' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                ⚙️ SYSTEM ({botLogs.filter(l => l.type === 'system').length})
              </button>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`h-8 px-2.5 text-[11px] gap-1.5 rounded-xl border shrink-0 ${autoScroll ? 'border-emerald-900/50 bg-emerald-950/30 text-emerald-400' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoScroll ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span>Avto-skroll: {autoScroll ? 'Yoqilgan' : 'O\'chirilgan'}</span>
            </Button>

            <Button
              size="sm"
              disabled={isFixingErrors}
              onClick={() => handleFixBotErrors(currentBot)}
              className="h-8 px-3 text-[11px] gap-1.5 rounded-xl border border-purple-800/60 bg-purple-950/40 text-purple-300 hover:bg-purple-900/60 hover:text-purple-100 transition-all font-medium shrink-0 shadow-sm"
              title="Bot kodi va loglaridagi xatoliklarni Botly AI orqali avtomatik tuzatish (30 token sarflanadi)"
            >
              <Sparkles className={`w-3.5 h-3.5 text-purple-400 ${isFixingErrors ? 'animate-spin' : ''}`} />
              <span>{isFixingErrors ? "AI tuzatmoqda..." : "Error correction (Xatoliklarni tuzatish)"}</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-purple-900/80 text-purple-200 rounded font-mono border border-purple-700/50">
                30 token
              </span>
            </Button>
          </div>

          {/* Terminal Console View */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-950 border border-zinc-900/90 font-mono text-xs rounded-xl p-3 sm:p-4 space-y-2 select-text scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {isLogsLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <RefreshCcw className="w-5 h-5 animate-spin text-emerald-400" />
                <span className="text-xs">Loglar yuklanmoqda va real-vaqt bog'lanish o'rnatilmoqda...</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600 italic space-y-2">
                <Terminal className="w-8 h-8 text-zinc-800 mx-auto" />
                <div>Chop etilgan loglar mavjud emas.</div>
                <span className="text-[10px] text-zinc-700 not-italic block">
                  {logSearchFilter ? "Qidiruv so'roviga mos keluvchi loglar topilmadi." : "Bot birinchi marotaba ishga tushganida barcha hodisalar shu yerda ko'rinadi."}
                </span>
              </div>
            ) : (
              filteredLogs.map((log, idx) => {
                let badgeColor = "text-blue-400 bg-blue-950/40 border border-blue-900/40";
                let prefix = "⚙️ SYSTEM";
                if (log.type === "deploy") {
                  badgeColor = "text-purple-400 bg-purple-950/40 border border-purple-900/40";
                  prefix = "📦 DEPLOY";
                } else if (log.type === "run") {
                  badgeColor = "text-emerald-400 bg-emerald-950/40 border border-emerald-900/40";
                  prefix = "🟢 RUN";
                }

                let logTime = '--:--:--';
                if (log.createdAt) {
                  try {
                    const d = new Date(log.createdAt);
                    if (!isNaN(d.getTime())) {
                      logTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    }
                  } catch (e) {
                    // ignore
                  }
                }

                return (
                  <div key={idx} className="flex flex-col sm:flex-row gap-1 sm:gap-2.5 hover:bg-zinc-900/50 p-2 rounded-lg border border-zinc-900/50 hover:border-zinc-800 transition-colors items-start">
                    <div className="flex items-center gap-2 shrink-0 select-none">
                      <span className="text-[10px] text-zinc-600 font-mono min-w-[24px]">#{idx + 1}</span>
                      <span className="text-[10px] text-zinc-500 font-mono min-w-[65px]">
                        {logTime}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badgeColor}`}>
                        {prefix}
                      </span>
                    </div>
                    <pre className="flex-1 text-zinc-200 whitespace-pre-wrap font-mono text-xs leading-relaxed break-words w-full overflow-x-auto">
                      {log.message}
                    </pre>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
          
          {/* Live Polling Footer Bar */}
          <div className="shrink-0 flex justify-between items-center text-zinc-500 text-[10px] pt-2 border-t border-zinc-900 select-none">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${currentBot.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-zinc-400">
                Status: <b>{currentBot.status === 'running' ? 'Active Live Polling (2.5s)' : 'To\'xtatilgan'}</b>
                {lastRefreshedAt && <span className="text-zinc-600 ml-2 hidden sm:inline">• Songi yangilanish: {lastRefreshedAt}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-zinc-500">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Platform: CloudBot VPS Engine v2.0</span>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Bot o'chirishni tasdiqlash modali */}
      {botToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-red-900/40 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-5 text-zinc-100">
            <div className="flex items-center gap-3.5 text-red-500">
              <div className="p-3 bg-red-950/40 rounded-full border border-red-900/40">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-zinc-100">Botni o'chirish</h3>
                <p className="text-xs text-zinc-400">Ushbu amalni ortga qaytarib bo'lmaydi</p>
              </div>
            </div>

            <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800 text-sm space-y-1.5">
              <div className="text-xs text-zinc-400">O'chirilayotgan bot:</div>
              <div className="font-bold text-zinc-100 text-base">
                {botToDelete.name || 'Nom berilmagan bot'}
              </div>
              <div className="font-mono text-xs text-zinc-400">
                ID: {botToDelete.id}
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Diqqat: Bot va uning serverdagi barcha fayllari hamda ma'lumotlar bazasidagi yozuvlari to'liq o'chirib tashlanadi.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setBotToDelete(null)}
                disabled={isDeleting}
                className="border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              >
                Bekor qilish
              </Button>
              <Button
                variant="destructive"
                className="gap-2 font-semibold bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmDeleteBot}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? "O'chirilmoqda..." : "Ha, o'chirilsin"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Bot Environment Variables & Token Configuration Modal */}
      <Dialog open={envModalOpen} onOpenChange={setEnvModalOpen}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[92vh] flex flex-col p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-5 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-950/60 border border-amber-900/50 rounded-xl text-amber-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                    <span>Bot Sozlamalari & Muhit (.env)</span>
                    {selectedBotForEnv && (
                      <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {selectedBotForEnv.name}
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                    Telegram Bot Token, Admin ID, API kalitlar va barcha atrof-muhit parametrlarini boshqaring
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Mode switcher tabs */}
            <div className="flex items-center gap-1.5 mt-4 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  if (envModalTab === 'raw') syncRawToForm(rawEnvText);
                  setEnvModalTab('form');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  envModalTab === 'form'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Vizual Sozlamalar (Form)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (envModalTab === 'form') syncFormToRaw();
                  setEnvModalTab('raw');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  envModalTab === 'raw'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>To'g'ridan-to'g'ri .env Muharriri (Raw)</span>
              </button>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
            {isLoadingEnv ? (
              <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
                <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-zinc-300 font-medium">Kod tahlil qilinmoqda va .env sozlamalari yuklanmoqda...</span>
              </div>
            ) : envModalTab === 'form' ? (
              <>
                <div className="bg-amber-950/25 border border-amber-900/40 rounded-xl p-3.5 text-xs text-amber-300/90 flex items-start gap-3">
                  <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold block text-amber-200">💡 Qulay muhit sozlamalari</span>
                    <p className="text-zinc-300/90 leading-relaxed text-[11.5px]">
                      Quyidagi maydonlarga kerakli qiymatlarni kiriting. Saqlaganingizda avtomatik <code className="font-mono text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded border border-amber-900/50">.env</code> fayli yangilanadi va botingiz ushbu sozlamalar bilan ishlaydi.
                    </p>
                  </div>
                </div>

                {/* Quick Add Suggestion Chips */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    ⚡ Tezkor parametrlar qo'shish:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { key: 'BOT_TOKEN', label: '+ BOT_TOKEN' },
                      { key: 'ADMIN_ID', label: '+ ADMIN_ID' },
                      { key: 'OPENAI_API_KEY', label: '+ OPENAI_API_KEY' },
                      { key: 'GEMINI_API_KEY', label: '+ GEMINI_API_KEY' },
                      { key: 'TELEGRAM_API_ID', label: '+ TELEGRAM_API_ID' },
                      { key: 'TELEGRAM_API_HASH', label: '+ TELEGRAM_API_HASH' },
                      { key: 'CHANNEL_ID', label: '+ CHANNEL_ID' },
                      { key: 'PAYMENT_PROVIDER_TOKEN', label: '+ PROVIDER_TOKEN' }
                    ].map(chip => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => addQuickEnvVar(chip.key)}
                        className={`text-[11px] font-mono px-2 py-1 rounded-lg border transition-all ${
                          envFormValues[chip.key] !== undefined
                            ? 'bg-zinc-900/60 text-zinc-500 border-zinc-800 opacity-60 cursor-default'
                            : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800 hover:border-amber-500/50 hover:text-amber-300'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Variables list */}
                <div className="space-y-3.5">
                  {detectedEnvVars.map((item: any) => {
                    const isPass = item.isToken || /TOKEN|SECRET|PASSWORD|KEY|HASH/i.test(item.key);
                    const isShowing = showPasswords[item.key] || false;

                    return (
                      <div
                        key={item.key}
                        className="space-y-1.5 p-3.5 rounded-xl border border-zinc-800/90 bg-zinc-900/40 hover:border-zinc-700 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-emerald-400 text-xs font-semibold bg-emerald-950/40 px-2.5 py-0.5 rounded-md border border-emerald-900/50">
                              {item.key}
                            </span>
                            {item.label && item.label !== item.key && (
                              <span className="text-xs text-zinc-300 font-medium">({item.label})</span>
                            )}
                            {item.required && (
                              <span className="text-[10px] bg-red-950/50 text-red-400 border border-red-900/50 px-1.5 py-0.5 rounded font-bold">
                                Majburiy *
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {isPass && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-zinc-400 hover:text-zinc-200"
                                onClick={() => setShowPasswords(prev => ({ ...prev, [item.key]: !isShowing }))}
                                title={isShowing ? "Yashirish" : "Ko'rsatish"}
                              >
                                {isShowing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-zinc-500 hover:text-red-400 opacity-60 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeEnvVariable(item.key)}
                              title="O'chirish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {item.description && (
                          <p className="text-[11px] text-zinc-400 leading-tight">{item.description}</p>
                        )}

                        <Input
                          type={isPass && !isShowing ? "password" : "text"}
                          placeholder={item.placeholder || `${item.key} qiymati...`}
                          value={envFormValues[item.key] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEnvFormValues(prev => {
                              const next = { ...prev, [item.key]: val };
                              const lines = Object.entries(next).map(([k, v]) => `${k}=${v}`);
                              setRawEnvText(lines.join('\n'));
                              return next;
                            });
                          }}
                          className="font-mono text-xs bg-zinc-950/90 border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 text-zinc-100"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Custom Env Variable Addition */}
                <div className="pt-4 border-t border-zinc-800 space-y-2.5">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    Maxsus O'zgaruvchi Qo'shish (Custom KEY=VALUE)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="NOM (masalan: CHANNEL_ID)"
                      value={newCustomEnvKey}
                      onChange={(e) => setNewCustomEnvKey(e.target.value.toUpperCase())}
                      className="font-mono text-xs uppercase bg-zinc-900 border-zinc-800 flex-1 focus:border-amber-500/50"
                    />
                    <Input
                      placeholder="QIYMAT..."
                      value={newCustomEnvVal}
                      onChange={(e) => setNewCustomEnvVal(e.target.value)}
                      className="font-mono text-xs bg-zinc-900 border-zinc-800 flex-1 focus:border-amber-500/50"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs shrink-0 text-amber-300 hover:text-amber-200"
                      onClick={() => {
                        if (!newCustomEnvKey.trim()) {
                          toast.error("O'zgaruvchi nomini kiriting!");
                          return;
                        }
                        const k = newCustomEnvKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                        addQuickEnvVar(k, newCustomEnvVal.trim());
                        setNewCustomEnvKey('');
                        setNewCustomEnvVal('');
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Qo'shish
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* Raw Text Mode */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>To'g'ridan-to'g'ri .env matnini tahrirlang yoki nusxalab joylang:</span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-zinc-300 hover:text-white"
                      onClick={() => {
                        navigator.clipboard.writeText(rawEnvText);
                        toast.success("Nusxalandi!");
                      }}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Nusxa olish
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-amber-400 hover:text-amber-300"
                      onClick={() => {
                        const template = `# Telegram Bot Konfiguratsiyasi\nBOT_TOKEN=1234567890:AAHd82-xXabc123456\nADMIN_ID=508129341\n# Qo'shimcha kalitlar\nOPENAI_API_KEY=\nGEMINI_API_KEY=\n`;
                        syncRawToForm(template);
                        toast.success("Standart Telegram shabloni joylashtirildi");
                      }}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Shablon
                    </Button>
                  </div>
                </div>

                <div className="relative rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                  <textarea
                    rows={14}
                    value={rawEnvText}
                    onChange={(e) => syncRawToForm(e.target.value)}
                    placeholder="# .env fayli namunasi\nBOT_TOKEN=123456:AAH...\nADMIN_ID=123456789"
                    className="w-full bg-zinc-950 p-4 font-mono text-xs text-emerald-400 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-y leading-relaxed"
                    spellCheck={false}
                  />
                </div>

                <p className="text-[11px] text-zinc-500 italic">
                  💡 Har bir qator <code>KEY=VALUE</code> ko'rinishida yozilishi kerak. Izohlar uchun <code>#</code> belgisidan foydalaning.
                </p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 shrink-0 flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEnvModalOpen(false)}
              className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs rounded-xl"
            >
              Yopish
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSavingEnv}
              onClick={() => saveBotEnv(false)}
              className="text-xs rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium"
            >
              {isSavingEnv ? "Saqlanmoqda..." : "Faqat Saqlash"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSavingEnv}
              onClick={() => saveBotEnv(true)}
              className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow-lg shadow-emerald-950/50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isSavingEnv ? "Saqlanmoqda..." : "Saqlash va Botni Qayta Ishga Tushirish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
