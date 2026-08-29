import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, query, where, getDocs } from 'firebase/firestore';
import { safeAddDoc, safeSetDoc, safeDeleteDoc, safeUpdateDoc } from '../lib/safeFirestore';
import { 
  MessageSquare, Send, Plus, Search, Trash2, CheckCheck,
  User, ShieldAlert, Clock, ArrowLeft, RefreshCw, X, Sparkles, MessageCircle,
  Paperclip, Smile, Phone, Download, File, FileText, FileCode,
  FileArchive, FileSpreadsheet, Film, Music, Check, Shield, Circle,
  ChevronRight, Copy, ExternalLink, Bot, Inbox, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { LogoIcon } from '../components/Logo';
import feedbackAvatarImg from '../assets/images/feedback_avatar_1786443979118.jpg';
import { extractUrls, FormattedMessageText, RichLinkPreviewCard } from '../components/RichLinkPreview';
import { useCall } from '../context/CallContext';

interface MessageReply {
  sender: 'admin' | 'user';
  text: string;
  createdAt: string;
  senderName?: string;
  senderId?: string;
  senderEmail?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileExtension?: string;
  fileSize?: string;
  reactions?: Record<string, string[]>;
}

interface ContactMessage {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  targetUserName?: string;
  subject?: string;
  message: string;
  status?: string;
  createdAt: string;
  replies?: MessageReply[];
  unreadUser?: boolean;
  unreadAdmin?: boolean;
  unreadTarget?: boolean;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileExtension?: string;
  fileSize?: string;
  reactions?: Record<string, string[]>;
}

const AVAILABLE_REACTIONS = ['❤️', '👍', '🔥', '😂', '👏', '🎉', '😮', '⚡', '💯'];
const INPUT_EMOJIS = ['😊', '❤️', '👍', '🔥', '😂', '👏', '🎉', '😮', '⚡', '💯', '🚀', '✨', '🤝', '😎', '🙏'];

interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  username?: string;
  photoURL?: string;
}

interface SelectedAttachment {
  file: File;
  name: string;
  size: string;
  dataUrl: string;
  category: {
    type: 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'archive' | 'code' | 'file';
    extension: string;
  };
}

function getFileCategory(fileName: string, mimeType: string): {
  type: 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'archive' | 'code' | 'file';
  extension: string;
} {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return { type: 'image', extension: ext.toUpperCase() };
  }
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv'].includes(ext)) {
    return { type: 'video', extension: ext.toUpperCase() };
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(ext)) {
    return { type: 'audio', extension: ext.toUpperCase() };
  }
  if (ext === 'pdf' || mimeType.includes('pdf')) {
    return { type: 'pdf', extension: 'PDF' };
  }
  if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'csv'].includes(ext)) {
    return { type: 'doc', extension: ext.toUpperCase() };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { type: 'archive', extension: ext.toUpperCase() };
  }
  if (['html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'cpp', 'c', 'cs', 'java', 'json', 'php', 'rb', 'go', 'rs', 'sql', 'sh', 'xml', 'yaml', 'yml', 'md', 'kt', 'swift'].includes(ext)) {
    return { type: 'code', extension: ext.toUpperCase() };
  }
  return { type: 'file', extension: ext ? ext.toUpperCase() : 'FILE' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export const Messages: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { startCall } = useCall();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialChatId = searchParams.get('chatId');

  const [messagesList, setMessagesList] = useState<ContactMessage[]>([]);
  const [activeMsg, setActiveMsg] = useState<ContactMessage | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // File attachment state
  const [selectedFile, setSelectedFile] = useState<SelectedAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New chat modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedTargetUser, setSelectedTargetUser] = useState<UserProfile | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [creatingMsg, setCreatingMsg] = useState(false);

  // Delete modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState<boolean>(false);
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<{ type: 'initial' | 'reply', replyIndex?: number } | null>(null);

  // Reaction picker state
  const [activeReactionPicker, setActiveReactionPicker] = useState<{ type: 'initial' | 'reply', replyIndex?: number } | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState<boolean>(false);

  // Filter tabs: 'all' | 'unread'
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  // Mobile view state: 'list' or 'chat'
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load all user profiles for searching
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      const profs = snapshot.docs.map(d => {
        const data = d.data();
        const email = data.email || '';
        const name = data.displayName || email.split('@')[0] || 'Foydalanuvchi';
        const photoURL = data.photoURL || (email ? `https://unavatar.io/${encodeURIComponent(email)}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2b5278&color=ffffff&bold=true` : '');
        return {
          id: d.id,
          email,
          displayName: name,
          username: data.username || email.split('@')[0] || '',
          photoURL
        };
      }).filter(p => p.id !== user.uid && p.email?.toLowerCase() !== user.email?.toLowerCase());
      setAllProfiles(profs);
    }, (err) => {
      console.warn("Profiles listen error:", err);
    });
    return () => unsub();
  }, [user]);

  // Fetch messages in real-time
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(collection(db, 'contact_messages'), (snapshot) => {
      const allMsgs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as ContactMessage));

      const filtered = allMsgs.filter(m => {
        if (isAdmin) return true;
        const myEmail = user.email?.toLowerCase();
        const myUid = user.uid;

        const isSender = m.userId === myUid || (m.userEmail && myEmail && m.userEmail.toLowerCase() === myEmail);
        const isTarget = (m.targetUserId && m.targetUserId === myUid) || (m.targetUserEmail && myEmail && m.targetUserEmail.toLowerCase() === myEmail);

        return isSender || isTarget;
      });

      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMessagesList(filtered);
    }, (err) => {
      console.warn("Contact messages listen error:", err);
    });

    return () => unsub();
  }, [user, isAdmin]);

  useEffect(() => {
    if (messagesList.length === 0) {
      setActiveMsg(null);
      return;
    }

    if (initialChatId) {
      const found = messagesList.find(m => m.id === initialChatId);
      if (found) {
        setActiveMsg(found);
        setMobileView('chat');
        return;
      }
    }

    if (activeMsg) {
      const updated = messagesList.find(m => m.id === activeMsg.id);
      if (updated) {
        setActiveMsg(updated);
        return;
      }
    }

    if (!activeMsg && messagesList.length > 0) {
      setActiveMsg(messagesList[0]);
    }
  }, [messagesList, initialChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMsg?.replies, activeMsg?.id]);

  useEffect(() => {
    if (!activeMsg || !user) return;
    const myEmail = user.email?.toLowerCase();
    const isSender = activeMsg.userId === user.uid || (activeMsg.userEmail && myEmail && activeMsg.userEmail.toLowerCase() === myEmail);

    if (!isAdmin) {
      if (isSender && activeMsg.unreadUser) {
        const msgRef = doc(db, 'contact_messages', activeMsg.id);
        safeUpdateDoc(msgRef, { unreadUser: false }).catch(console.error);
      } else if (!isSender && activeMsg.unreadTarget) {
        const msgRef = doc(db, 'contact_messages', activeMsg.id);
        safeUpdateDoc(msgRef, { unreadTarget: false }).catch(console.error);
      }
    } else if (isAdmin && activeMsg.unreadAdmin) {
      const msgRef = doc(db, 'contact_messages', activeMsg.id);
      safeUpdateDoc(msgRef, { unreadAdmin: false }).catch(console.error);
    }

    // Automatically mark all unread notifications for this active chat as read
    try {
      const qNotifs = query(
        collection(db, 'notifications'),
        where('chatId', '==', activeMsg.id),
        where('read', '==', false)
      );
      getDocs(qNotifs).then(snap => {
        snap.forEach(d => {
          const data = d.data();
          if (data.userEmail?.toLowerCase() === myEmail || data.userId === user.uid || (data.userId && data.userId.toLowerCase() === myEmail)) {
            safeUpdateDoc(doc(db, 'notifications', d.id), { read: true }).catch(() => {});
          }
        });
      }).catch(console.error);
    } catch (e) {
      console.warn("Auto-read notifications error:", e);
    }
  }, [activeMsg, user, isAdmin]);

  const getUserAvatarUrl = (email?: string, name?: string, photoURL?: string) => {
    if (photoURL) return photoURL;
    if (!email && !name) return undefined;
    const displayName = name || email?.split('@')[0] || 'User';
    if (email) {
      return `https://unavatar.io/${encodeURIComponent(email)}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2b5278&color=ffffff&bold=true`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2b5278&color=ffffff&bold=true`;
  };

  const getChatPartner = (m: ContactMessage) => {
    if (!user) return { name: 'Foydalanuvchi', email: '', photoURL: '', isSupport: false };
    const myUid = user.uid;
    const myEmail = user.email?.toLowerCase();

    const isSender = m.userId === myUid || (m.userEmail && myEmail && m.userEmail.toLowerCase() === myEmail);

    let name = '';
    let email = '';
    let isSupport = false;

    if (isSender) {
      if (m.targetUserName || m.targetUserEmail) {
        name = m.targetUserName || m.targetUserEmail?.split('@')[0] || 'Foydalanuvchi';
        email = m.targetUserEmail || '';
      } else {
        name = "Shikoyatlar va takliflar";
        email = 'admin@cloudbot.uz';
        isSupport = true;
      }
    } else {
      name = m.userName || m.userEmail?.split('@')[0] || 'Foydalanuvchi';
      email = m.userEmail || '';
    }

    if (email === 'admin@cloudbot.uz' || email === 'admin@botforge.uz' || name === 'Shikoyatlar va takliflar') {
      isSupport = true;
    }

    const prof = allProfiles.find(p => p.email?.toLowerCase() === email.toLowerCase());
    const photoURL = prof?.photoURL || getUserAvatarUrl(email, name);

    return {
      name,
      email,
      photoURL,
      isSupport
    };
  };

  const renderPartnerAvatar = (partner: { name: string; email: string; photoURL?: string; isSupport?: boolean }, sizeClass = "w-10 h-10") => {
    if (partner.isSupport || partner.email === 'admin@cloudbot.uz' || partner.email === 'admin@botforge.uz' || partner.name === 'Shikoyatlar va takliflar') {
      return (
        <div className="relative shrink-0">
          <img 
            src={feedbackAvatarImg} 
            alt="Shikoyatlar va takliflar" 
            className={`${sizeClass} rounded-full object-cover shrink-0 border-2 border-amber-500/40 shadow-sm shadow-amber-500/20`} 
            referrerPolicy="no-referrer" 
          />
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-[#0c0d14] flex items-center justify-center">
            <Shield className="w-2 h-2 text-black fill-black" />
          </span>
        </div>
      );
    }

    const avatarUrl = partner.photoURL || getUserAvatarUrl(partner.email, partner.name);

    return (
      <div className="relative shrink-0">
        <img
          src={avatarUrl}
          alt={partner.name || 'User'}
          className={`${sizeClass} rounded-full object-cover shrink-0 border border-white/10 shadow-sm`}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.name || 'User')}&background=06b6d4&color=ffffff&bold=true`;
          }}
        />
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0c0d14]" />
      </div>
    );
  };

  const handleSelectChat = (msg: ContactMessage) => {
    setActiveMsg(msg);
    setSearchParams({ chatId: msg.id });
    setMobileView('chat');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit for Firestore document (850KB max)
    if (file.size > 850 * 1024) {
      toast.error("Fayl hajmi 850 KB dan oshmasligi kerak (Firestore cheklovi)");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const category = getFileCategory(file.name, file.type);
      setSelectedFile({
        file,
        name: file.name,
        size: formatFileSize(file.size),
        dataUrl,
        category
      });
      toast.success(`${file.name} biriktirildi`);
    };
    reader.onerror = () => {
      toast.error("Faylni o'qishda xatolik yuz berdi");
    };
    reader.readAsDataURL(file);
  };

  const renderAttachment = (item: MessageReply | ContactMessage) => {
    if (!item.fileUrl) return null;

    const fileName = item.fileName || 'Fayl';
    const fileType = item.fileType || 'file';
    const fileExtension = item.fileExtension || 'FILE';
    const fileSize = item.fileSize || '';

    if (fileType === 'image') {
      return (
        <div className="my-2 overflow-hidden rounded-xl border border-white/10 bg-black/40 max-w-xs sm:max-w-sm shadow-md">
          <img 
            src={item.fileUrl} 
            alt={fileName} 
            className="w-full max-h-72 object-contain rounded-t-xl cursor-pointer hover:opacity-90 transition-opacity bg-black/60"
            onClick={() => window.open(item.fileUrl, '_blank')}
          />
          <div className="p-2.5 flex items-center justify-between text-[11px] text-zinc-400 bg-white/[0.03] border-t border-white/5">
            <span className="truncate max-w-[180px] font-medium text-zinc-200">{fileName}</span>
            <a
              href={item.fileUrl}
              download={fileName}
              className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors flex items-center gap-1 text-[10px]"
              title="Yuklab olish"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      );
    }

    if (fileType === 'video') {
      return (
        <div className="my-2 overflow-hidden rounded-xl border border-white/10 bg-black/50 max-w-xs sm:max-w-sm shadow-md">
          <video src={item.fileUrl} controls className="w-full max-h-64 rounded-t-xl bg-black" />
          <div className="p-2.5 flex items-center justify-between text-[11px] text-zinc-400 bg-white/[0.03] border-t border-white/5">
            <span className="truncate font-medium text-zinc-200">{fileName}</span>
            <a
              href={item.fileUrl}
              download={fileName}
              className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors"
              title="Yuklab olish"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>
      );
    }

    if (fileType === 'audio') {
      return (
        <div className="my-2 p-3 rounded-xl border border-white/10 bg-white/[0.04] max-w-xs sm:max-w-sm shadow-md">
          <div className="flex items-center gap-2 mb-2 text-[11px] font-medium text-zinc-200 truncate">
            <Music className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
          <audio src={item.fileUrl} controls className="w-full h-8" />
        </div>
      );
    }

    let IconComp = File;
    let iconBg = "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30";

    if (fileType === 'code') {
      IconComp = FileCode;
      iconBg = "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    } else if (fileType === 'pdf') {
      IconComp = FileText;
      iconBg = "bg-rose-500/15 text-rose-400 border border-rose-500/30";
    } else if (fileType === 'doc') {
      IconComp = FileSpreadsheet;
      iconBg = "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    } else if (fileType === 'archive') {
      IconComp = FileArchive;
      iconBg = "bg-purple-500/15 text-purple-400 border border-purple-500/30";
    }

    return (
      <div className="my-2 p-3 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-sm flex items-center justify-between gap-3 max-w-xs sm:max-w-sm shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 font-bold shadow-inner`}>
            <IconComp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-200 truncate">{fileName}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
              <span className="font-mono uppercase bg-white/10 px-1.5 py-0.5 rounded text-cyan-300 font-medium">{fileExtension}</span>
              {fileSize && <span>{fileSize}</span>}
            </div>
          </div>
        </div>
        <a
          href={item.fileUrl}
          download={fileName}
          className="p-2 bg-white/[0.06] hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 rounded-xl transition-all shrink-0 flex items-center gap-1 text-[10px]"
          title="Yuklab olish"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    );
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!replyText.trim() && !selectedFile) || !activeMsg || !user) return;

    setSending(true);
    try {
      const msgRef = doc(doc(db, 'contact_messages', activeMsg.id).firestore, 'contact_messages', activeMsg.id);
      const existingReplies = activeMsg.replies || [];
      const newReply: MessageReply = {
        sender: isAdmin ? 'admin' : 'user',
        senderId: user.uid,
        senderEmail: user.email || '',
        text: replyText.trim(),
        createdAt: new Date().toISOString(),
        senderName: user.displayName || user.email?.split('@')[0] || (isAdmin ? 'Admin' : 'Foydalanuvchi'),
        ...(selectedFile ? {
          fileUrl: selectedFile.dataUrl,
          fileName: selectedFile.name,
          fileType: selectedFile.category.type,
          fileExtension: selectedFile.category.extension,
          fileSize: selectedFile.size
        } : {})
      };

      const myEmail = user.email?.toLowerCase();
      const isSender = activeMsg.userId === user.uid || (activeMsg.userEmail && myEmail && activeMsg.userEmail.toLowerCase() === myEmail);

      const updateData: any = {
        replies: [...existingReplies, newReply],
        updatedAt: new Date().toISOString()
      };

      if (isAdmin) {
        updateData.unreadUser = true;
        updateData.unreadTarget = true;
      } else if (isSender) {
        updateData.unreadTarget = true;
        updateData.unreadAdmin = true;
      } else {
        updateData.unreadUser = true;
      }

      await safeSetDoc(msgRef, updateData, { merge: true });

      const partner = getChatPartner(activeMsg);
      if (partner.email && partner.email.toLowerCase() !== user.email?.toLowerCase() && partner.email !== 'admin@cloudbot.uz' && partner.email !== 'admin@botforge.uz') {
        try {
          const notificationMsg = selectedFile 
            ? `📎 ${selectedFile.name}${replyText.trim() ? ': ' + replyText.trim() : ''}`
            : replyText.trim();
          await safeAddDoc(collection(db, 'notifications'), {
            userId: partner.email.toLowerCase(),
            userEmail: partner.email.toLowerCase(),
            senderEmail: user.email?.toLowerCase() || '',
            senderName: user.displayName || user.email?.split('@')[0] || (isAdmin ? 'Admin' : 'Foydalanuvchi'),
            title: "Yangi xabar",
            message: `${user.displayName || user.email?.split('@')[0] || (isAdmin ? 'Admin' : 'Foydalanuvchi')}: ${notificationMsg.substring(0, 50)}...`,
            type: 'chat_message',
            chatId: activeMsg.id,
            read: false,
            createdAt: new Date().toISOString()
          });
        } catch (nErr) {
          console.warn("Notification send error:", nErr);
        }
      }

      setReplyText('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error("Reply error:", err);
      toast.error("Xabar yuborishda xatolik: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleCreateNewMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setCreatingMsg(true);
    try {
      let targetId = '';
      let targetEmail = '';
      let targetName = '';

      if (selectedTargetUser) {
        targetId = selectedTargetUser.id;
        targetEmail = selectedTargetUser.email;
        targetName = selectedTargetUser.displayName || selectedTargetUser.username || selectedTargetUser.email;
      } else if (userSearchQuery.trim()) {
        targetEmail = userSearchQuery.trim();
        targetName = userSearchQuery.trim().split('@')[0];
      } else {
        toast.error("Iltimos, foydalanuvchini tanlang");
        setCreatingMsg(false);
        return;
      }

      if (targetEmail.toLowerCase() === user.email?.toLowerCase()) {
        toast.error("O'zingizga chat taklifini yubora olmaysiz");
        setCreatingMsg(false);
        return;
      }

      // Check if active chat with this user already exists
      const existingChat = messagesList.find(m => {
        const partner = getChatPartner(m);
        return partner.email?.toLowerCase() === targetEmail.toLowerCase();
      });

      if (existingChat) {
        toast.info("Ushbu foydalanuvchi bilan allaqachon muloqotingiz mavjud!");
        setActiveMsg(existingChat);
        setSearchParams({ chatId: existingChat.id });
        setIsNewModalOpen(false);
        setUserSearchQuery('');
        setSelectedTargetUser(null);
        setCreatingMsg(false);
        return;
      }


      // Send chat invite notification to target user
      await safeAddDoc(collection(db, 'notifications'), {
        userId: targetEmail.toLowerCase(),
        userEmail: targetEmail.toLowerCase(),
        senderEmail: user.email || '',
        senderName: user.displayName || user.email?.split('@')[0] || 'Foydalanuvchi',
        title: "Chat taklifi",
        message: `${user.displayName || user.email?.split('@')[0] || 'Foydalanuvchi'} (${user.email || ''}) sizga chat taklifini yubordi.`,
        type: 'chat_invite',
        status: 'pending',
        read: false,
        createdAt: new Date().toISOString()
      });

      toast.success("Chat taklifi muvaffaqiyatli yuborildi!");
      setIsNewModalOpen(false);
      setUserSearchQuery('');
      setSelectedTargetUser(null);
    } catch (err: any) {
      console.error("Create invite error:", err);
      toast.error("Chat taklifini yuborishda xatolik: " + err.message);
    } finally {
      setCreatingMsg(false);
    }
  };

  const triggerDeleteSingle = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDeleteMessage = async () => {
    if (!deleteMessageTarget || !activeMsg || !user) return;
    const target = deleteMessageTarget;
    setDeleteMessageTarget(null);

    try {
      if (target.type === 'initial') {
        const msgRef = doc(db, 'contact_messages', activeMsg.id);
        const hasReplies = activeMsg.replies && activeMsg.replies.length > 0;
        if (hasReplies) {
          await safeUpdateDoc(msgRef, {
            message: '',
            fileName: null,
            fileUrl: null,
            fileType: null,
            fileExtension: null,
            fileSize: null,
            updatedAt: new Date().toISOString()
          });
          toast.success("Xabar o'chirildi");
        } else {
          setMessagesList(prev => prev.filter(m => m.id !== activeMsg.id));
          setActiveMsg(null);
          setMobileView('list');
          await safeDeleteDoc(msgRef);
          toast.success("Xabar va suhbat o'chirildi");
        }
      } else if (target.type === 'reply' && typeof target.replyIndex === 'number') {
        const msgRef = doc(db, 'contact_messages', activeMsg.id);
        const currentReplies = [...(activeMsg.replies || [])];
        if (target.replyIndex >= 0 && target.replyIndex < currentReplies.length) {
          currentReplies.splice(target.replyIndex, 1);
          await safeUpdateDoc(msgRef, {
            replies: currentReplies,
            updatedAt: new Date().toISOString()
          });
          toast.success("Xabar o'chirildi");
        }
      }
    } catch (err: any) {
      console.error("Delete message error:", err);
      toast.error("Xabarni o'chirishda xatolik: " + err.message);
    }
  };

  const handleToggleReaction = async (
    target: { type: 'initial' | 'reply'; replyIndex?: number },
    emoji: string
  ) => {
    if (!activeMsg || !user) return;
    const userIdentifier = user.uid;

    try {
      const msgRef = doc(db, 'contact_messages', activeMsg.id);

      if (target.type === 'initial') {
        const existingReactions: Record<string, string[]> = { ...(activeMsg.reactions || {}) };
        const currentUsers = [...(existingReactions[emoji] || [])];
        
        const userIdx = currentUsers.indexOf(userIdentifier);
        if (userIdx > -1) {
          currentUsers.splice(userIdx, 1);
        } else {
          currentUsers.push(userIdentifier);
        }

        if (currentUsers.length > 0) {
          existingReactions[emoji] = currentUsers;
        } else {
          delete existingReactions[emoji];
        }

        setActiveMsg(prev => prev ? { ...prev, reactions: existingReactions } : null);

        await safeUpdateDoc(msgRef, {
          reactions: existingReactions,
          updatedAt: new Date().toISOString()
        });
      } else if (target.type === 'reply' && typeof target.replyIndex === 'number') {
        const currentReplies = [...(activeMsg.replies || [])];
        if (target.replyIndex >= 0 && target.replyIndex < currentReplies.length) {
          const reply = { ...currentReplies[target.replyIndex] };
          const existingReactions: Record<string, string[]> = { ...(reply.reactions || {}) };
          const currentUsers = [...(existingReactions[emoji] || [])];

          const userIdx = currentUsers.indexOf(userIdentifier);
          if (userIdx > -1) {
            currentUsers.splice(userIdx, 1);
          } else {
            currentUsers.push(userIdentifier);
          }

          if (currentUsers.length > 0) {
            existingReactions[emoji] = currentUsers;
          } else {
            delete existingReactions[emoji];
          }

          reply.reactions = existingReactions;
          currentReplies[target.replyIndex] = reply;

          setActiveMsg(prev => prev ? { ...prev, replies: currentReplies } : null);

          await safeUpdateDoc(msgRef, {
            replies: currentReplies,
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err: any) {
      console.error("Toggle reaction error:", err);
      toast.error("Reaksiya bildirishda xatolik yuz berdi");
    } finally {
      setActiveReactionPicker(null);
    }
  };

  const renderReactions = (
    reactions: Record<string, string[]> | undefined,
    target: { type: 'initial' | 'reply'; replyIndex?: number },
    isMe: boolean
  ) => {
    const currentUserId = user?.uid || '';
    const entries = Object.entries(reactions || {}).filter(([_, users]) => users && users.length > 0);

    const isPickerOpen =
      activeReactionPicker?.type === target.type &&
      activeReactionPicker?.replyIndex === target.replyIndex;

    return (
      <div className="relative mt-2 flex flex-wrap items-center gap-1.5 pt-0.5">
        {entries.map(([emoji, users]) => {
          const hasReacted = users.includes(currentUserId);
          return (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleReaction(target, emoji);
              }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all transform active:scale-95 cursor-pointer shadow-sm ${
                hasReacted
                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/60 shadow-cyan-950/40'
                  : 'bg-black/30 text-zinc-300 border border-white/10 hover:bg-white/15'
              }`}
              title={`${users.length} ta reaksiya`}
            >
              <span className="text-xs">{emoji}</span>
              <span className="font-mono text-[10px] font-bold">{users.length}</span>
            </button>
          );
        })}

        {/* Quick Add Reaction Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveReactionPicker(isPickerOpen ? null : target);
          }}
          className="p-1 rounded-full text-white/60 hover:text-cyan-300 hover:bg-white/10 transition-all cursor-pointer shrink-0"
          title="Reaksiya bildirish"
        >
          <Smile className="w-3.5 h-3.5" />
        </button>

        {/* Reaction Popover Bar - positioned safely inside parent container */}
        {isPickerOpen && (
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`absolute z-30 bottom-full mb-2 ${isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'} flex items-center gap-1 p-1 sm:p-1.5 bg-[#0e101a]/95 border border-cyan-500/40 rounded-2xl shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-150 ring-1 ring-white/10 max-w-[calc(100vw-32px)] overflow-x-auto`}
          >
            {AVAILABLE_REACTIONS.map((emoji) => {
              const users = reactions?.[emoji] || [];
              const hasReacted = users.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(target, emoji)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-sm sm:text-base rounded-xl transition-all transform hover:scale-125 active:scale-90 shrink-0 cursor-pointer ${
                    hasReacted ? 'bg-cyan-500/30 border border-cyan-400/50 shadow-sm' : 'hover:bg-white/15'
                  }`}
                  title={emoji}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const handleInitiateCall = (m: ContactMessage) => {
    if (!m || !user) return;
    const partner = getChatPartner(m);
    
    // Determine the exact receiver UID and Email
    let receiverUid = '';
    if (partner.isSupport) {
      receiverUid = 'support_admin';
    } else {
      if (m.userId !== user.uid && m.userId) {
        receiverUid = m.userId;
      } else if (m.targetUserId) {
        receiverUid = m.targetUserId;
      }

      if (!receiverUid && partner.email) {
        const targetProf = allProfiles.find(p => p.email?.toLowerCase().trim() === partner.email?.toLowerCase().trim());
        if (targetProf) receiverUid = targetProf.id;
      }
    }

    startCall({
      chatId: m.id,
      receiverEmail: partner.email || '',
      receiverName: partner.name || 'Foydalanuvchi',
      receiverId: receiverUid,
      receiverAvatar: partner.photoURL,
      isSupport: partner.isSupport
    });
  };

  const confirmDeleteSingle = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);

    try {
      setMessagesList(prev => prev.filter(m => m.id !== id));
      if (activeMsg?.id === id) {
        setActiveMsg(null);
        setMobileView('list');
      }
      await safeDeleteDoc(doc(db, 'contact_messages', id));
      toast.success("Suhbat o'chirildi");
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error("O'chirishda xatolik: " + err.message);
    }
  };

  const confirmDeleteAll = async () => {
    setShowDeleteAllModal(false);
    if (messagesList.length === 0) return;

    try {
      const toDelete = [...messagesList];
      setMessagesList([]);
      setActiveMsg(null);
      setMobileView('list');
      toast.success("Barcha suhbatlar o'chirildi");

      for (const m of toDelete) {
        await safeDeleteDoc(doc(db, 'contact_messages', m.id));
      }
    } catch (err: any) {
      console.error("Delete all error:", err);
      toast.error("O'chirishda xatolik: " + err.message);
    }
  };

  const filteredList = useMemo(() => {
    return messagesList.filter(m => {
      // 1. Tab filter
      const partner = getChatPartner(m);
      const isSender = m.userId === user?.uid || (m.userEmail && user?.email && m.userEmail.toLowerCase() === user.email.toLowerCase());
      const hasUnread = isAdmin ? m.unreadAdmin : (isSender ? m.unreadUser : m.unreadTarget);

      if (activeTab === 'unread' && !hasUnread) return false;

      // 2. Search filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (m.subject && m.subject.toLowerCase().includes(term)) ||
        (m.message && m.message.toLowerCase().includes(term)) ||
        (m.userEmail && m.userEmail.toLowerCase().includes(term)) ||
        (m.userName && m.userName.toLowerCase().includes(term)) ||
        (partner.name && partner.name.toLowerCase().includes(term))
      );
    });
  }, [messagesList, activeTab, searchTerm, user, isAdmin]);

  const totalUnreadCount = useMemo(() => {
    return messagesList.filter(m => {
      const isSender = m.userId === user?.uid || (m.userEmail && user?.email && m.userEmail.toLowerCase() === user.email.toLowerCase());
      return isAdmin ? m.unreadAdmin : (isSender ? m.unreadUser : m.unreadTarget);
    }).length;
  }, [messagesList, user, isAdmin]);

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-[#08090f] text-slate-100 overflow-hidden relative font-sans">
      
      {/* CloudBot Left Sidebar - Chat List */}
      <div className={`w-full md:w-[360px] lg:w-[400px] bg-[#0c0d15]/95 backdrop-blur-xl border-r border-white/[0.08] flex flex-col h-full z-10 ${
        mobileView === 'chat' ? 'hidden md:flex' : 'flex'
      }`}>
        
        {/* Sidebar Header */}
        <div className="p-4 bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/[0.08] flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-teal-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center shadow-inner text-cyan-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-white text-base tracking-tight">Xabarlar</h1>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Real vaqtli muloqot
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              {messagesList.length > 0 && (
                <>
                  <button
                    onClick={() => setShowDeleteAllModal(true)}
                    className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                    title="Barcha suhbatlarni tozalash"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsNewModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-semibold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                    title="Yangi suhbat ochish"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span className="hidden sm:inline">Yangi</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Suhbat yoki foydalanuvchini qidirish..."
              className="w-full bg-white/[0.04] text-white placeholder-zinc-500 border border-white/[0.08] text-xs rounded-xl pl-10 pr-9 py-2.5 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs bg-white/10 w-5 h-5 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white/10 text-white border border-white/15 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
              }`}
            >
              <span>Barchasi</span>
              {messagesList.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'all' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-zinc-400'
                }`}>
                  {messagesList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('unread')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'unread'
                  ? 'bg-white/10 text-white border border-white/15 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
              }`}
            >
              <span>O'qilmagan</span>
              {totalUnreadCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500 text-black font-bold font-mono animate-pulse">
                  {totalUnreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Chat List Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04] p-2 space-y-1">
          {filteredList.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-zinc-500 flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-zinc-200 mb-1">
                {activeTab === 'unread' ? "O'qilmagan xabarlar yo'q" : "Suhbatlar topilmadi"}
              </p>
              <p className="text-xs text-zinc-500 mb-5 max-w-xs mx-auto">
                {searchTerm 
                  ? 'Qidiruv mezonlariga mos keladigan suhbat topilmadi' 
                  : activeTab === 'unread'
                  ? 'Barcha xabarlar o\'qilgan'
                  : 'CloudBot platformasida yangi suhbatni boshlang'}
              </p>
              {!searchTerm && activeTab === 'all' && (
                <button
                  onClick={() => setIsNewModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  Yangi chat boshlash
                </button>
              )}
            </div>
          ) : (
            filteredList.map((m) => {
              const isSelected = activeMsg?.id === m.id;
              const partner = getChatPartner(m);
              const isSender = m.userId === user?.uid || (m.userEmail && user?.email && m.userEmail.toLowerCase() === user.email.toLowerCase());
              const hasUnread = isAdmin ? m.unreadAdmin : (isSender ? m.unreadUser : m.unreadTarget);

              const rawLastText = m.replies && m.replies.length > 0 
                ? m.replies[m.replies.length - 1].text 
                : m.message;
              const displayLastText = (rawLastText === 'Chat taklifi qabul qilindi. Muloqotni boshlashingiz mumkin!' || !rawLastText || !rawLastText.trim())
                ? (m.fileName ? `📎 ${m.fileName}` : "Hozircha xabarlar yo'q")
                : rawLastText;
              const lastTime = m.replies && m.replies.length > 0
                ? m.replies[m.replies.length - 1].createdAt
                : m.createdAt;

              return (
                <div
                  key={m.id}
                  onClick={() => handleSelectChat(m)}
                  className={`p-3 rounded-xl cursor-pointer transition-all relative flex items-center gap-3 border ${
                    isSelected 
                      ? 'bg-gradient-to-r from-cyan-500/15 via-teal-500/10 to-transparent border-cyan-500/40 text-white shadow-lg shadow-cyan-950/20' 
                      : 'border-transparent hover:bg-white/[0.04] text-zinc-300 hover:text-white'
                  }`}
                >
                  <div className="relative shrink-0">
                    {renderPartnerAvatar(partner, "w-11 h-11")}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-cyan-300' : 'text-white'}`}>
                          {partner.name}
                        </h4>
                        {partner.isSupport && (
                          <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-semibold px-1.5 py-0.2 rounded">
                            Support
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                        {new Date(lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className={`text-xs truncate mb-1 ${hasUnread ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>
                      {m.subject && <span className="text-cyan-400/90 font-medium mr-1">[{m.subject}]</span>}
                      {displayLastText}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="truncate max-w-[150px]">{partner.email}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasUnread ? (
                          <span className="w-5 h-5 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-bold flex items-center justify-center text-[10px] shadow-sm animate-pulse">
                            1
                          </span>
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 text-cyan-400/80" />
                        )}
                        <button
                          onClick={(e) => triggerDeleteSingle(m.id, e)}
                          title="Suhbatni o'chirish"
                          className="p-1 hover:text-rose-400 text-zinc-500/60 rounded-lg hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CloudBot Right Chat Area */}
      <div className={`flex-1 flex flex-col h-full bg-[#08090f] relative ${
        mobileView === 'list' ? 'hidden md:flex' : 'flex'
      }`}>
        {activeMsg ? (
          <>
            {/* Active Chat Header */}
            <div className="px-4 py-3 bg-[#0c0d15]/95 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 z-10 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden p-2 rounded-xl hover:bg-white/10 text-white transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {(() => {
                  const partner = getChatPartner(activeMsg);
                  return (
                    <>
                      {renderPartnerAvatar(partner, "w-10 h-10")}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-white truncate">
                            {partner.name}
                          </h3>
                          {partner.isSupport && (
                            <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Rasmiy Support
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate flex items-center gap-2">
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            faol
                          </span>
                          <span>•</span>
                          <span className="text-zinc-400 truncate font-mono text-[10px]">{partner.email || activeMsg.subject || 'CloudBot Chat'}</span>
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => handleInitiateCall(activeMsg)}
                  className="p-2.5 rounded-xl hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 transition-colors border border-transparent hover:border-cyan-500/30 cursor-pointer" 
                  title="Ovozli qo'ng'iroq qilish"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => triggerDeleteSingle(activeMsg.id)}
                  className="p-2.5 rounded-xl hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-colors border border-transparent hover:border-rose-500/20 cursor-pointer" 
                  title="Suhbatni o'chirish"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Timeline & Bubbles */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[radial-gradient(#1e293b_1px,transparent_1px)] bg-[size:24px_24px] bg-[#08090f]">
              
              {/* Initial Message Bubble */}
              {activeMsg.message && activeMsg.message.trim() !== '' && activeMsg.message !== 'Chat taklifi qabul qilindi. Muloqotni boshlashingiz mumkin!' && (() => {
                const partner = getChatPartner(activeMsg);
                const myEmail = user?.email?.toLowerCase();
                const isInitialMsgFromMe = activeMsg.userId === user?.uid || (activeMsg.userEmail && myEmail && activeMsg.userEmail.toLowerCase() === myEmail);

                return (
                  <div className={`group flex flex-col max-w-[90%] sm:max-w-[85%] md:max-w-[75%] min-w-0 ${isInitialMsgFromMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                    <div className={`relative px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-lg w-full max-w-full overflow-hidden break-words ${
                      isInitialMsgFromMe 
                        ? 'bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white rounded-tr-xs border border-cyan-400/25' 
                        : 'bg-[#13151f] text-zinc-100 rounded-tl-xs border border-white/[0.08]'
                    }`}>
                      <div className="text-[10px] font-semibold mb-1 flex items-center justify-between gap-3 min-w-0">
                        <span className={`truncate ${isInitialMsgFromMe ? 'text-cyan-200' : 'text-cyan-400'}`}>
                          {isInitialMsgFromMe ? (user?.displayName || 'Siz') : (activeMsg.userName || partner.name)}
                        </span>
                        {(isInitialMsgFromMe || isAdmin) && (
                          <button
                            type="button"
                            onClick={() => setDeleteMessageTarget({ type: 'initial' })}
                            title="Xabarni o'chirish"
                            className="opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 text-white/70 hover:text-rose-400 hover:bg-black/20 rounded-md -mr-1 shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {activeMsg.message && (
                        <div className="pr-1 text-slate-100 font-normal max-w-full break-all [overflow-wrap:anywhere] overflow-hidden">
                          <FormattedMessageText text={activeMsg.message} isMe={isInitialMsgFromMe} />
                        </div>
                      )}
                      {(() => {
                        const urls = extractUrls(activeMsg.message || '');
                        if (urls.length > 0) {
                          return <RichLinkPreviewCard url={urls[0]} isMe={isInitialMsgFromMe} />;
                        }
                        return null;
                      })()}
                      {renderAttachment(activeMsg)}
                      
                      {renderReactions(activeMsg.reactions, { type: 'initial' }, isInitialMsgFromMe)}

                      <div className="flex items-center justify-end gap-1 text-[9px] text-zinc-400 mt-1">
                        <span>{new Date(activeMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isInitialMsgFromMe && <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Empty Chat State */}
              {(!activeMsg.message || !activeMsg.message.trim() || activeMsg.message === 'Chat taklifi qabul qilindi. Muloqotni boshlashingiz mumkin!') && (!activeMsg.replies || activeMsg.replies.length === 0) && (
                <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center p-6 select-none my-auto">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center shadow-lg mb-4 text-cyan-400">
                    <Send className="w-8 h-8 ml-0.5" />
                  </div>
                  <h3 className="text-white text-base font-bold mb-1">
                    Hozircha xabarlar yo'q
                  </h3>
                  <p className="text-zinc-400 text-xs max-w-xs">
                    Muloqotni boshlash uchun quyidagi maydonga birinchi xabaringizni yozing!
                  </p>
                </div>
              )}

              {/* Replies Bubbles */}
              {activeMsg.replies && activeMsg.replies.map((r, idx) => {
                const partner = getChatPartner(activeMsg);
                const myEmail = user?.email?.toLowerCase();
                const isInitialMsgFromMe = activeMsg.userId === user?.uid || (activeMsg.userEmail && myEmail && activeMsg.userEmail.toLowerCase() === myEmail);

                const isMe = (() => {
                  if (!user) return false;
                  if (r.senderEmail && user.email && r.senderEmail.toLowerCase() === user.email.toLowerCase()) return true;
                  if (r.senderId && r.senderId === user.uid) return true;
                  if (isAdmin) return r.sender === 'admin';

                  if (isInitialMsgFromMe) {
                    return r.sender === 'user';
                  } else {
                    return r.sender === 'user' && r.senderName !== activeMsg.userName;
                  }
                })();

                return (
                  <div
                    key={idx}
                    className={`group flex flex-col max-w-[90%] sm:max-w-[85%] md:max-w-[75%] min-w-0 ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <div className={`relative px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-lg w-full max-w-full overflow-hidden break-words ${
                      isMe 
                        ? 'bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white rounded-tr-xs border border-cyan-400/25' 
                        : r.sender === 'admin'
                        ? 'bg-gradient-to-b from-amber-500/10 to-[#13151f] text-zinc-100 rounded-tl-xs border border-amber-500/30 shadow-amber-950/20'
                        : 'bg-[#13151f] text-zinc-100 rounded-tl-xs border border-white/[0.08]'
                    }`}>
                      <div className="text-[10px] font-semibold mb-1 flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {r.sender === 'admin' ? (
                            <span className="text-amber-400 font-bold flex items-center gap-1 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 truncate">
                              <ShieldAlert className="w-3 h-3 shrink-0" /> Shikoyatlar va takliflar
                            </span>
                          ) : (
                            <span className={`truncate ${isMe ? 'text-cyan-200' : 'text-cyan-400'}`}>
                              {isMe ? (user?.displayName || 'Siz') : (r.senderName || partner.name)}
                            </span>
                          )}
                        </div>
                        {(isMe || isAdmin) && (
                          <button
                            type="button"
                            onClick={() => setDeleteMessageTarget({ type: 'reply', replyIndex: idx })}
                            title="Xabarni o'chirish"
                            className="opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 text-white/70 hover:text-rose-400 hover:bg-black/20 rounded-md -mr-1 shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {r.text && (
                        <div className="pr-1 text-slate-100 font-normal max-w-full break-all [overflow-wrap:anywhere] overflow-hidden">
                          <FormattedMessageText text={r.text} isMe={isMe} />
                        </div>
                      )}
                      {(() => {
                        const urls = extractUrls(r.text || '');
                        if (urls.length > 0) {
                          return <RichLinkPreviewCard url={urls[0]} isMe={isMe} />;
                        }
                        return null;
                      })()}
                      {renderAttachment(r)}

                      {renderReactions(r.reactions, { type: 'reply', replyIndex: idx }, isMe)}

                      <div className="flex items-center justify-end gap-1 text-[9px] text-zinc-400 mt-1">
                        <span>{new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>

            {/* Floating Attachment & Input Bar */}
            <div className="p-3 bg-[#0c0d15]/95 backdrop-blur-xl border-t border-white/[0.08] shrink-0 relative">
              {/* Quick Input Emoji Picker */}
              {showInputEmojiPicker && (
                <div className="mb-2 p-2 bg-[#13151f] border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-wrap items-center gap-1.5 max-w-4xl mx-auto animate-in slide-in-from-bottom-2 duration-150 backdrop-blur-xl">
                  {INPUT_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setReplyText(prev => prev + emoji);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded-xl hover:bg-white/10 hover:scale-120 active:scale-95 transition-all cursor-pointer"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowInputEmojiPicker(false)}
                    className="ml-auto p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10"
                    title="Yopish"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept="*" 
              />

              {/* Selected File Attachment Preview */}
              {selectedFile && (
                <div className="flex items-center justify-between gap-3 bg-[#131622] border border-cyan-500/40 rounded-2xl p-2.5 mb-2 text-xs text-white shadow-2xl max-w-4xl w-full mx-auto backdrop-blur-md animate-in slide-in-from-bottom-2 duration-150 overflow-hidden">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Media Thumbnail or Icon */}
                    {selectedFile.category.type === 'image' ? (
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-cyan-400/40 bg-black/60 shadow-inner">
                        <img 
                          src={selectedFile.dataUrl} 
                          alt={selectedFile.name} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : selectedFile.category.type === 'video' ? (
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-cyan-400/40 bg-black shadow-inner flex items-center justify-center">
                        <video 
                          src={selectedFile.dataUrl} 
                          className="w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Paperclip className="w-4 h-4 text-cyan-300" />
                        </div>
                      </div>
                    ) : selectedFile.category.type === 'audio' ? (
                      <div className="w-12 h-12 rounded-xl shrink-0 border border-cyan-500/30 bg-cyan-500/15 text-cyan-400 flex items-center justify-center shadow-inner">
                        <Music className="w-6 h-6" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl shrink-0 border border-cyan-500/30 bg-cyan-500/15 text-cyan-400 flex items-center justify-center shadow-inner">
                        <File className="w-6 h-6" />
                      </div>
                    )}

                    {/* File metadata */}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate text-zinc-100 text-xs sm:text-sm">
                        {selectedFile.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                        <span className="bg-cyan-500/20 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold shrink-0 border border-cyan-500/30">
                          {selectedFile.category.extension}
                        </span>
                        <span className="font-mono text-zinc-400 shrink-0">
                          {selectedFile.size}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 rounded-xl transition-colors shrink-0 cursor-pointer"
                    title="Biriktirilgan faylni bekor qilish"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendReply} className="flex items-center gap-2 max-w-4xl w-full mx-auto min-w-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-zinc-400 hover:text-cyan-400 hover:bg-white/[0.06] rounded-xl transition-all shrink-0 cursor-pointer border border-transparent hover:border-white/10"
                  title="Fayl biriktirish (Video, Audio, PDF, Rasm, Doc, ZIP, Code va h.k.)"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <div className="flex-1 relative flex items-center min-w-0">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Xabar yozing..."
                    disabled={sending}
                    className="w-full bg-white/[0.04] text-white placeholder-zinc-500 text-xs sm:text-sm rounded-xl px-4 py-3 border border-white/[0.08] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowInputEmojiPicker(prev => !prev)}
                  className={`p-3 rounded-xl transition-colors shrink-0 border border-transparent hover:border-white/10 cursor-pointer ${
                    showInputEmojiPicker ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                  title="Emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>

                <button
                  type="submit"
                  disabled={sending || (!replyText.trim() && !selectedFile)}
                  className="p-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/20 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                  title="Yuborish"
                >
                  {sending ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  ) : (
                    <Send className="w-4 h-4 stroke-[2.5]" />
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#08090f]">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500/10 via-teal-500/10 to-emerald-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-5 shadow-2xl shadow-cyan-950/30">
              <LogoIcon size={44} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Suhbat tanlanmagan</h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
              Muloqotni boshlash uchun chapdagi ro‘yxatdan suhbatni tanlang yoki yangi chat oching.
            </p>
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Yangi chat boshlash</span>
            </button>
          </div>
        )}
      </div>

      {/* NEW CHAT MODAL */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0e101a] border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative flex flex-col max-h-[90vh] text-white">
            <button
              onClick={() => {
                setIsNewModalOpen(false);
                setSelectedTargetUser(null);
                setUserSearchQuery('');
              }}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold">
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Yangi Chat Boshlash</h3>
                <p className="text-xs text-zinc-400">Platforma foydalanuvchisi bilan muloqot</p>
              </div>
            </div>

            <form onSubmit={handleCreateNewMessage} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Foydalanuvchini Qidirish (Username yoki Email)
                </label>

                {selectedTargetUser ? (
                  <div className="flex items-center justify-between p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <img 
                        src={getUserAvatarUrl(selectedTargetUser.email, selectedTargetUser.displayName, selectedTargetUser.photoURL)} 
                        alt={selectedTargetUser.displayName || 'User'} 
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-cyan-400/40"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{selectedTargetUser.displayName}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{selectedTargetUser.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTargetUser(null)}
                      className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 text-xs"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder="Masalan: @shohjahon yoki email..."
                        className="w-full bg-white/[0.04] text-white placeholder-zinc-500 border border-white/[0.08] rounded-xl pl-10 pr-3 py-3 text-xs focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/[0.05] bg-black/40">
                      {(() => {
                        const searchResults = allProfiles.filter(p => {
                          if (!userSearchQuery.trim()) return true;
                          const q = userSearchQuery.toLowerCase().trim().replace(/^@/, '');
                          return (
                            p.displayName?.toLowerCase().includes(q) ||
                            p.username?.toLowerCase().includes(q) ||
                            p.email?.toLowerCase().includes(q)
                          );
                        });

                        if (searchResults.length === 0) {
                          return (
                            <div className="p-5 text-center">
                              <p className="text-xs text-zinc-400 mb-2">Foydalanuvchi topilmadi</p>
                              {userSearchQuery.trim() && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTargetUser({
                                      id: '',
                                      email: userSearchQuery.trim(),
                                      displayName: userSearchQuery.trim().split('@')[0],
                                      username: userSearchQuery.trim().split('@')[0]
                                    });
                                  }}
                                  className="px-3.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-medium transition"
                                >
                                  "{userSearchQuery.trim()}" ga xabar yuborish
                                </button>
                              )}
                            </div>
                          );
                        }

                        return searchResults.slice(0, 6).map((p) => (
                          <div
                            key={p.id}
                            onClick={() => setSelectedTargetUser(p)}
                            className="p-3 hover:bg-white/[0.05] cursor-pointer flex items-center justify-between transition-colors text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img 
                                src={getUserAvatarUrl(p.email, p.displayName, p.photoURL)} 
                                alt={p.displayName || 'User'} 
                                className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">{p.displayName}</p>
                                <p className="text-[10px] text-zinc-400 truncate">{p.email}</p>
                              </div>
                            </div>
                            <span className="text-[10px] text-cyan-400 font-semibold bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                              Tanlash
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={creatingMsg || (!selectedTargetUser && !userSearchQuery.trim())}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {creatingMsg ? 'Yuborilmoqda...' : 'Chat boshlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Single Chat */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0e101a] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center text-white">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Suhbatni o'chirish</h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Haqiqatan ham ushbu suhbatni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold rounded-xl text-zinc-300 hover:text-white transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={confirmDeleteSingle}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-xs font-bold rounded-xl text-white transition-colors shadow-lg shadow-rose-500/20"
              >
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Single Message */}
      {deleteMessageTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0e101a] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center text-white">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Xabarni o'chirish</h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Ushbu xabarni o'chirishni tasdiqlaysizmi? Xabar barcha suhbatdoshlar uchun butunlay o'chiriladi.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteMessageTarget(null)}
                className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold rounded-xl text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={confirmDeleteMessage}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-xs font-bold rounded-xl text-white transition-colors shadow-lg shadow-rose-500/20 cursor-pointer"
              >
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0e101a] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center text-white">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Barcha suhbatlarni tozalash</h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Barcha chatlar va xabarlar butunlay o'chib ketadi. Davom etishni tasdiqlaysizmi?
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold rounded-xl text-zinc-300 hover:text-white transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={confirmDeleteAll}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-xs font-bold rounded-xl text-white transition-colors shadow-lg shadow-rose-500/20"
              >
                Barchasini o'chirish
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
