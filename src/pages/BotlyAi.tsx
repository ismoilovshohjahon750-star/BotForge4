import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, serverTimestamp, doc } from 'firebase/firestore';
import { safeAddDoc, safeDeleteDoc, safeUpdateDoc } from '../lib/safeFirestore';
import { ChatHistory } from '../types';
import { useAuth } from '../hooks/useAuth';
import { LogoIcon } from '../components/Logo';
import { 
  Bot, 
  Sparkles, 
  Plus, 
  Mic, 
  ChevronDown, 
  Send, 
  RotateCcw, 
  FileText, 
  Check, 
  Code,
  Globe,
  Settings,
  X,
  Volume2,
  VolumeX,
  User,
  Info,
  MoreVertical,
  History,
  Trash2,
  Copy,
  Download,
  Terminal,
  Layers,
  Key,
  Pin,
  PinOff,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { BotCodeViewer } from '../components/BotCodeViewer';

interface FileItem {
  filename: string;
  content: string;
}

interface SecretItem {
  key: string;
  description: string;
  placeholder?: string;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  isCustomMarkdown?: boolean;
  files?: FileItem[];
  secrets?: SecretItem[];
}

export const BotlyAi: React.FC = () => {
  const { user } = useAuth();
  
  // States
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [activePersona, setActivePersona] = useState<'Agent' | 'Code Expert'>('Agent');
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [textMuted, setTextMuted] = useState(false);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistoryList, setChatHistoryList] = useState<ChatHistory[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Load local cache immediately, then sync with Firestore
  useEffect(() => {
    if (!user) return;
    
    // 1. Initial hydrate from local storage
    try {
      const cached = localStorage.getItem(`botly_chats_${user.uid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChatHistoryList(parsed);
        }
      }
    } catch (e) {}

    // 2. Real-time Firestore sync
    const q = query(
      collection(db, 'chat_history'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ChatHistory));
      setChatHistoryList(items);
      try {
        localStorage.setItem(`botly_chats_${user.uid}`, JSON.stringify(items));
      } catch (e) {}
    }, (error) => {
      console.warn("Chat tarixi obunasida ogohlantirish (quota or offline):", error?.message || error);
      try {
        const cached = localStorage.getItem(`botly_chats_${user.uid}`);
        if (cached) {
          setChatHistoryList(JSON.parse(cached));
        }
      } catch (e) {}
    });
    return () => unsubscribe();
  }, [user]);

  const persistChatSession = async (
    allMessages: Message[], 
    persona: 'Agent' | 'Code Expert', 
    promptText: string, 
    existingChatId?: string | null
  ) => {
    if (!user) return;
    try {
      const cleanMessages = allMessages.map(m => ({
        role: m.role,
        content: m.content || '',
        files: m.files ? m.files.map(f => ({ filename: f.filename, content: f.content })) : [],
        secrets: m.secrets ? m.secrets.map(s => ({ key: s.key, description: s.description, placeholder: s.placeholder || '' })) : []
      }));

      if (existingChatId) {
        await safeUpdateDoc(doc(db, 'chat_history', existingChatId), {
          userId: user.uid,
          persona,
          text: promptText,
          messages: cleanMessages,
          timestamp: serverTimestamp()
        });

        // Update local list
        setChatHistoryList(prev => {
          const updated = prev.map(item => item.id === existingChatId ? {
            ...item,
            persona,
            text: promptText,
            messages: cleanMessages as any
          } : item);
          try {
            localStorage.setItem(`botly_chats_${user.uid}`, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      } else {
        const newDoc = await safeAddDoc(collection(db, 'chat_history'), {
          userId: user.uid,
          persona,
          text: promptText,
          messages: cleanMessages,
          timestamp: serverTimestamp(),
          pinned: false
        });
        const assignedId = newDoc?.id || `local_${Date.now()}`;
        setCurrentChatId(assignedId);

        const newEntry: ChatHistory = {
          id: assignedId,
          userId: user.uid,
          persona,
          text: promptText,
          messages: cleanMessages as any,
          timestamp: new Date(),
          pinned: false
        };

        setChatHistoryList(prev => {
          const updated = [newEntry, ...prev.filter(p => p.id !== assignedId)];
          try {
            localStorage.setItem(`botly_chats_${user.uid}`, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }
    } catch (err) {
      console.error("Chat tarixini saqlashda xatolik:", err);
    }
  };

  const deleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await safeDeleteDoc(doc(db, 'chat_history', id));
    if (currentChatId === id) {
      setCurrentChatId(null);
    }
    setChatHistoryList(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (user) {
        try {
          localStorage.setItem(`botly_chats_${user.uid}`, JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });
    toast.success("Chat tarixi o'chirildi");
  };

  const togglePin = async (e: React.MouseEvent, chat: ChatHistory) => {
    e.stopPropagation();
    const pinnedCount = chatHistoryList.filter(c => c.pinned).length;
    
    if (!chat.pinned && pinnedCount >= 5) {
      toast.error("Maksimal 5 ta chatni pin qilishingiz mumkin");
      return;
    }

    await safeUpdateDoc(doc(db, 'chat_history', chat.id), {
      pinned: !chat.pinned
    });
    setChatHistoryList(prev => {
      const updated = prev.map(c => c.id === chat.id ? { ...c, pinned: !c.pinned } : c);
      if (user) {
        try {
          localStorage.setItem(`botly_chats_${user.uid}`, JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });
    toast.success(chat.pinned ? "Pin olib tashlandi" : "Pin qilindi");
  };

  // Strictly loads the exact stored past conversation - NEVER regenerates or modifies past answers
  const loadChatSession = (item: ChatHistory) => {
    setActivePersona(item.persona);
    setCurrentChatId(item.id);
    setInputVal('');
    setShowHistory(false);
    
    if (item.messages && Array.isArray(item.messages) && item.messages.length > 0) {
      setMessages(item.messages as Message[]);
    } else {
      setMessages([
        { role: 'user', content: item.text },
        { 
          role: 'model', 
          content: `Ushbu suhbat o'sha paytda yozilgan: "${item.text}".` 
        }
      ]);
    }
    toast.success(`Muloqot to'liq ochildi (${item.persona})`);
  };

  // References
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive user name or fallback to "Shohjahon"
  const userFirstName = user?.displayName 
    ? user.displayName.split(' ')[0] 
    : 'Shohjahon';

  // Quick prompt presets
  const promptPresets: { text: string; icon: any }[] = [];

  // Auto scroll to chat bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle message sending
  const sendMessage = async (textToSend?: string) => {
    const finalPrompt = textToSend || inputVal.trim();
    if (!finalPrompt) return;

    if (!user) {
      toast.error("Iltimos, chatdan foydalanish uchun tizimga kiring!");
      return;
    }

    if (!textToSend) {
      setInputVal('');
    }

    // Add user message
    const updatedMessages: Message[] = [...messages, { role: 'user', content: finalPrompt }];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (user) {
        const token = await user.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const targetMode = activePersona === 'Code Expert' ? 'code' : 'chat';
      const requestPrompt = targetMode === 'code' 
        ? finalPrompt 
        : `${finalPrompt} (Eslatma: Botly AI bo'limidan berilayotgan savol. Faol personangiz: ${activePersona})`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: targetMode,
          prompt: requestPrompt,
          chatHistory: messages.map(m => ({ 
            role: m.role, 
            content: m.content 
          }))
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'API sarlavhalarini olishda xatolik yuz berdi');
      }

      const data = await response.json();
      
      let aiMessage: Message;
      if (targetMode === 'code') {
        aiMessage = { 
          role: 'model', 
          content: data.explanation || "Botly AI loyihangiz uchun kodlarni muvaffaqiyatli generatsiya qildi.",
          files: data.files || [],
          secrets: data.secrets || []
        };
      } else {
        aiMessage = { 
          role: 'model', 
          content: data.explanation || "Botly AI platformasi javob qaytardi." 
        };
      }

      const finalConvo = [...updatedMessages, aiMessage];
      setMessages(finalConvo);
      await persistChatSession(finalConvo, activePersona, finalPrompt, currentChatId);
    } catch (error: any) {
      console.error("Chat error:", error);
      
      // Smart recovery
      const errorMsg = error.message || "Xatolik yuz berdi.";
      let fallbackMessage: Message;
      if (activePersona === 'Code Expert') {
        fallbackMessage = { 
          role: 'model', 
          content: `⚠️ Xatolik yuz berdi: ${errorMsg}\n\nAgar quota muammosi bo'lsa, xavotir olmang! Quyida offline andozani yuklab olishingiz mumkin.`,
          files: [
            {
              filename: "main.py",
              content: `import os\nfrom telegram import Update\nfrom telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters\n\n# Tokenni muhit o'zgaruvchisidan o'qiymiz\nBOT_TOKEN = os.getenv("BOT_TOKEN", "SAMPLES_TOKEN")\n\nasync def start(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    await update.message.reply_text("Assalomu alaykum! CloudBot Kino Qidiruv botiga xush kelibsiz!\\nKino nomini yozing.")\n\nasync def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    text = update.message.text\n    await update.message.reply_text(f"Siz qidirgan kino: '{text}' topilmadi. Tizim muloqot rejimida.")\n\nif __name__ == '__main__':\n    app = ApplicationBuilder().token(BOT_TOKEN).build()\n    app.add_handler(CommandHandler("start", start))\n    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))\n    print("Kino boti ishga tushdi...")\n    app.run_polling()\n`
            },
            {
              filename: "requirements.txt",
              content: "python-telegram-bot>=20.0\npython-dotenv>=1.0.0\n"
            },
            {
              filename: ".env",
              content: "BOT_TOKEN=your_telegram_bot_token_here\nADMIN_ID=your_telegram_id\n"
            }
          ],
          secrets: [
            { key: "BOT_TOKEN", description: "Telegram Botfatherni ulash kaliti" }
          ]
        };
      } else {
        fallbackMessage = { 
          role: 'model', 
          content: `👋 Salom! CloudBot AI platformasida biror muammo yuz berdi: ${errorMsg}\n\nYordam kerak bo'lsa, sozlamalarni tekshiring yoki savolingizni boshqatdan yozing.` 
        };
      }

      const finalConvo = [...updatedMessages, fallbackMessage];
      setMessages(finalConvo);
      await persistChatSession(finalConvo, activePersona, finalPrompt, currentChatId);
    } finally {
      setLoading(false);
    }
  };

  // Trigger simulated voice recording
  const handleMicClick = () => {
    if (isRecording) {
      setIsRecording(false);
      // simulate random text input
      const phrase = "Menga Telegram do'kon botining server qismini tushuntirib bera olasizmi?";
      setInputVal(phrase);
      toast.success("Ovoz muvaffaqiyatli matnga o'girildi!");
    } else {
      setIsRecording(true);
      toast.info("Ovoz yozilmoqda... To'xtatish uchun mikrofonga qayta bosing.");
    }
  };

  // Form submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  // Clear / restart chat
  const handleRestart = () => {
    setMessages([]);
    setInputVal('');
    setCurrentChatId(null);
    toast.success("Yangi muloqot boshlandi!");
  };

  return (
    <div className="relative min-h-screen bg-[#07070a] text-slate-100 flex flex-col justify-between overflow-hidden">
      
      {/* Background radial soft light glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/4 left-10 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Top Bar / Header */}
      <header className="relative z-40 flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/40 backdrop-blur-md">
        {/* Left Side: New Chat button */}
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleRestart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-all shadow-sm cursor-pointer"
              title="Yangi suhbat boshlash"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Yangi suhbat</span>
            </button>
          )}
        </div>

        {/* Center: Persona Selector */}
        <div className="flex items-center gap-2 select-none">
          <div className="relative">
            <button 
              type="button"
              onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
              className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-sm font-semibold bg-[#1d1d26] hover:bg-[#252533] border border-white/10 text-white transition-all cursor-pointer shadow-lg outline-none select-none"
            >
              <span>{activePersona}</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showPersonaDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            <AnimatePresence>
              {showPersonaDropdown && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 bg-[#111115] border border-white/10 rounded-xl overflow-hidden py-1 shadow-2xl z-50 text-xs"
                >
                  <div className="px-3 py-2 text-slate-500 font-medium text-center border-b border-white/5 select-none">Rejimlarni Tanlang</div>
                  {(['Agent', 'Code Expert'] as const).map((persona) => (
                    <button
                      key={persona}
                      type="button"
                      onClick={() => {
                        setActivePersona(persona);
                        setShowPersonaDropdown(false);
                        toast.info(`Faol persona: ${persona}`);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 flex items-center justify-between transition-colors text-slate-200 hover:text-white cursor-pointer select-none font-medium"
                    >
                      <span>{persona}</span>
                      {activePersona === persona && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Side: Chat History Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d1d26] hover:bg-[#252533] border border-white/10 text-white transition-all cursor-pointer shadow-lg outline-none text-xs font-medium"
            title="Chat tarixi"
          >
            <History className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Tarix</span>
            {chatHistoryList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px]">
                {chatHistoryList.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex flex-col justify-between overflow-y-auto z-10 px-4 md:px-0 scrollbar-thin scrollbar-thumb-white/10 py-6 max-w-3xl w-full mx-auto">
        <AnimatePresence mode="wait">
          {messages.length === 0 ? (
            /* Splash / Invitation Screen resembling the prompt exactly */
            <motion.div 
              key="intro"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="flex-grow flex flex-col items-center justify-center text-center px-4"
            >
              {/* Huge Google/Gemini-style glowing star centerpiece */}
              <div className="relative mb-8 mt-4">
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500 to-indigo-500 rounded-full blur-2xl opacity-40 animate-pulse w-24 h-24 mx-auto" />
                <LogoIcon size={80} className="relative z-10 animate-idle" />
              </div>

              {/* Greeting message exactly like "Botly AI dan bemalol so'rayvering, Shohjahon!" */}
              <h2 className="text-3xl md:text-4xl font-normal leading-tight tracking-tight text-white max-w-lg mx-auto font-sans">
                Botly AI dan bemalol so'rayvering, <span className="font-semibold text-slate-100">{userFirstName}!</span>
              </h2>

              <p className="text-[#a0a0b2] text-xs max-w-sm mt-3 leading-relaxed">
              </p>

              {/* Preset prompt pills */}
              <div className="flex flex-wrap justify-center gap-3 mt-10 max-w-xl mx-auto">
                {promptPresets.map((preset, index) => {
                  const IconComponent = preset.icon;
                  return (
                    <button
                      key={index}
                      onClick={() => sendMessage(preset.text)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] text-xs text-slate-300 hover:text-white transition-all duration-200 backdrop-blur-sm cursor-pointer select-none"
                    >
                      <IconComponent className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{preset.text}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            /* Active Chat View */
            <motion.div 
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-grow flex flex-col space-y-6 overflow-y-auto px-4 pb-24 pt-4"
            >
              {messages.map((m, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} w-full items-start gap-3`}
                >
                  {/* Bot Sparkle Profile Icon */}
                  {m.role === 'model' && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-600/10 border border-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[85%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      m.role === 'user' 
                        ? 'bg-[#181822] text-white rounded-tr-sm border border-white/5 font-sans' 
                        : 'text-slate-200 transition-colors'
                    }`}>
                      {/* Rich formatting parser */}
                      <div className="whitespace-pre-wrap select-text space-y-2">
                        {m.content.split('\n').map((line, lIdx) => {
                          // Formatting markdown headers
                          if (line.startsWith('## ')) {
                            return <h3 key={lIdx} className="text-base font-bold text-slate-100 pt-2">{line.replace('## ', '')}</h3>;
                          }
                          if (line.startsWith('### ')) {
                            return <h4 key={lIdx} className="text-xs font-bold uppercase tracking-wider text-indigo-400 pt-2">{line.replace('### ', '')}</h4>;
                          }
                          // Emphasizing bullet list items
                          if (line.startsWith('• ') || line.startsWith('* ')) {
                            return (
                              <div key={lIdx} className="flex items-start gap-2 text-slate-300 ml-1">
                                <span className="text-indigo-400 py-1">•</span>
                                <span>{line.substring(2)}</span>
                              </div>
                            );
                          }
                          // Numbered steps parsing
                          const stepMatch = line.match(/^(\d+)[\)\]\.]\s+(.*)/);
                          if (stepMatch) {
                            return (
                              <div key={lIdx} className="flex items-start gap-3 text-slate-300 ml-1 py-1">
                                <span className="font-mono text-indigo-400 font-bold bg-indigo-500/5 px-1.5 py-0.5 rounded text-xs">{stepMatch[1]}</span>
                                <span>{stepMatch[2]}</span>
                              </div>
                            );
                          }
                          // Basic bolding translation
                          if (line.includes('**')) {
                            // Split line dynamically
                            const segments = line.split('**');
                            return (
                              <p key={lIdx} className="text-slate-300 text-sm">
                                {segments.map((seg, sIdx) => sIdx % 2 === 1 ? <strong key={sIdx} className="text-white font-semibold">{seg}</strong> : seg)}
                              </p>
                            );
                          }

                          return <p key={lIdx} className="text-slate-300 text-sm leading-6">{line}</p>;
                        })}
                      </div>
                    </div>
                    {/* Bot Code Viewer integration if files are present in the response */}
                    {m.files && m.files.length > 0 && (
                      <BotCodeViewer files={m.files} secrets={m.secrets} />
                    )}
                  </div>
                </div>
              ))}

              {/* Bot Loading State */}
              {loading && (
                <div className="flex justify-start w-full items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/10 border border-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-1 animate-spin">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="bg-transparent px-4 py-3 rounded-2xl flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Embedded Audio Recording Indicator bar */}
      <AnimatePresence>
        {isRecording && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 w-64 bg-indigo-900/40 border border-indigo-500/30 backdrop-blur-xl rounded-full py-2.5 px-4 flex items-center justify-between shadow-2xl z-40"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <span className="text-xs text-rose-200 font-medium">Ovoz yozilmoqda...</span>
            </div>
            
            <div className="flex gap-1 items-end h-4 pr-1">
              <div className="w-1 h-3 bg-rose-400 animate-pulse" />
              <div className="w-1 h-4 bg-rose-400 animate-pulse [animation-delay:-0.2s]" />
              <div className="w-1 h-2 bg-rose-400 animate-pulse [animation-delay:-0.4s]" />
              <div className="w-1 h-5 bg-rose-400 animate-pulse [animation-delay:-0.1s]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Bottom Input Bar area */}
      <footer className="relative z-10 w-full px-4 md:px-0 pb-8 pt-2">
        <form 
          onSubmit={handleSubmit}
          className="relative max-w-xl w-full mx-auto"
        >
          {/* Main Rounded Input Bar */}
          <div className="bg-[#111116]/95 border border-white/5 rounded-full px-5 py-3.5 flex items-center justify-between gap-3 shadow-[0_12px_45px_rgba(0,0,0,0.7)] backdrop-blur-xl">
            

            {/* Input field */}
            <input 
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={`${activePersona} hamrohidan so'rang...`}
              className="flex-grow bg-transparent border-0 outline-none text-slate-100 placeholder-slate-400 text-sm font-sans tracking-wide"
              disabled={loading}
            />


            {/* Send submission button */}
            <button
              type="submit"
              disabled={!inputVal.trim() || loading}
              className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-2 disabled:opacity-50 transition-all shadow-md active:scale-95 text-sm flex-shrink-0"
              title="Yuborish"
            >
              <span>Send</span>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </footer>

      {/* Side-panel: Chat History List */}
      <AnimatePresence>
        {showHistory && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black z-50 cursor-pointer"
            />

            {/* Sliding Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[#0a0a0f] border-l border-white/10 shadow-2xl z-50 flex flex-col justify-between"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Chat tarixi</h3>
                    <p className="text-[10px] text-slate-400">Agent va Code Expert muloqotlari</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* New Chat Button */}
                  <button
                    type="button"
                    onClick={() => {
                      handleRestart();
                      setShowHistory(false);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                    title="Yangi suhbat boshlash"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yangi chat</span>
                  </button>

                  {/* Clear Button */}
                  {chatHistoryList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setChatHistoryList([]);
                        localStorage.removeItem('botly_chat_history');
                        toast.success("Barcha tarixingiz muvaffaqiyatli o'chirildi!");
                      }}
                      className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                      title="Tarixni tozalash"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-grow overflow-y-auto p-5 space-y-3.5 scrollbar-thin scrollbar-thumb-white/5">
                {chatHistoryList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-10">
                    <History className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm">Hozircha muloqot tarixi mavjud emas</p>
                    <p className="text-[11px] mt-1">Savol yozganingizda u shu yerda to'liq saqlanadi.</p>
                  </div>
                ) : (
                  (() => {
                    const sorted = [...chatHistoryList].sort((a, b) => {
                      const pinA = a.pinned ? 1 : 0;
                      const pinB = b.pinned ? 1 : 0;
                      if (pinB - pinA !== 0) return pinB - pinA;
                      return (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0);
                    });
                    return sorted.map((item) => {
                      const isCurrent = currentChatId === item.id;
                      const msgCount = item.messages?.length || 1;
                      const hasFiles = item.messages?.some(m => m.files && m.files.length > 0);

                      return (
                        <div
                          key={item.id}
                          onClick={() => loadChatSession(item)}
                          className={`group flex flex-col gap-2.5 p-4 rounded-xl border transition-all text-left cursor-pointer ${
                            isCurrent 
                              ? 'bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-950/50' 
                              : item.pinned
                                ? 'border-indigo-500/30 bg-white/[0.02] hover:bg-white/[0.05]'
                                : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.04] hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {item.persona === 'Code Expert' ? (
                                <Code className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                              )}
                              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                                item.persona === 'Code Expert' ? 'text-emerald-400/80' : 'text-indigo-400/80'
                              }`}>
                                {item.persona}
                              </span>

                              {isCurrent && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                                  Faol
                                </span>
                              )}
                            </div>

                            <div className='flex items-center gap-1'>
                              <button 
                                onClick={(e) => togglePin(e, item)} 
                                className={`p-1 rounded hover:bg-white/10 ${item.pinned ? 'text-indigo-400' : 'text-slate-600'}`}
                                title={item.pinned ? "Pinni olish" : "Pin qilish"}
                              >
                                {item.pinned ? <PinOff className='w-3 h-3' /> : <Pin className='w-3 h-3' />}
                              </button>
                              <button 
                                onClick={(e) => deleteChat(e, item.id)} 
                                className='p-1 rounded hover:bg-white/10 text-slate-600 hover:text-rose-400'
                                title="O'chirish"
                              >
                                <Trash2 className='w-3 h-3' />
                              </button>
                              <span className="text-[10px] text-slate-600 font-mono group-hover:text-slate-500 pl-1">
                                {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed group-hover:text-white transition-colors">
                            {item.text}
                          </p>

                          <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3 text-indigo-400" />
                              <span>{msgCount} ta xabar</span>
                            </span>

                            {hasFiles && (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <Code className="w-3 h-3" />
                                <span>Kod andozasi</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/5 bg-black/20 text-center">
                <p className="text-[10px] text-slate-500">
                  Tarixdagi har qanday suhbatni tanlasangiz, sizning savollaringiz va AI javoblari to'liq ekranga chiqariladi.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
