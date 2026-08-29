import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/firebase';
import { 
  collection, doc, onSnapshot, query, where, 
  serverTimestamp, getDoc, updateDoc, setDoc 
} from 'firebase/firestore';
import { safeSetDoc, safeUpdateDoc, safeAddDoc } from '../lib/safeFirestore';
import { toast } from 'sonner';
import { 
  Phone, PhoneOff, PhoneCall, PhoneIncoming, Mic, MicOff, 
  Volume2, VolumeX, Minimize2, Maximize2, Sparkles, ShieldAlert, X, Radio
} from 'lucide-react';

export interface ActiveCallData {
  id: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerEmail: string;
  callerAvatar?: string;
  receiverId?: string;
  receiverEmail: string;
  receiverName: string;
  receiverAvatar?: string;
  status: 'ringing' | 'connected' | 'rejected' | 'ended' | 'missed' | 'cancelled';
  createdAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  duration?: number;
}

interface CallContextType {
  startCall: (params: {
    chatId: string;
    receiverEmail: string;
    receiverName: string;
    receiverId?: string;
    receiverAvatar?: string;
    isSupport?: boolean;
  }) => Promise<void>;
  endCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  currentCall: ActiveCallData | null;
  callRole: 'caller' | 'receiver' | null;
  isCallModalOpen: boolean;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const [currentCall, setCurrentCall] = useState<ActiveCallData | null>(null);
  const [callRole, setCallRole] = useState<'caller' | 'receiver' | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(15);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState<number>(15);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');

  // Audio tone refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRefs = useRef<OscillatorNode[]>([]);
  const ringIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Media & WebRTC refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);

  // WebRTC STUN/TURN Servers for global peer-to-peer NAT traversal
  const RTC_SERVERS: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.counterpath.net:3478' }
    ],
    iceCandidatePoolSize: 10
  };

  // Cleanup WebRTC & Streams
  const cleanupWebRTC = () => {
    unsubsRef.current.forEach(unsub => {
      try { unsub(); } catch (e) {}
    });
    unsubsRef.current = [];

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.close();
      } catch (e) {}
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {}
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  // Start Visualizer for active audio stream
  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!localStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.max(12, Math.min(100, avg * 2.2)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.warn("Visualizer init notice:", e);
    }
  };

  // Helper to attach remote audio stream and trigger autoplay
  const setupRemoteAudio = (stream: MediaStream) => {
    if (!remoteAudioRef.current) return;
    try {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.muted = !isSpeakerOn;
      remoteAudioRef.current.volume = 1.0;
      const playPromise = remoteAudioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn("Remote audio play awaiting user gesture:", err);
        });
      }
    } catch (err) {
      console.warn("Remote audio stream attach error:", err);
    }
  };

  // Initialize Caller WebRTC
  const initCallerWebRTC = async (callId: string) => {
    cleanupWebRTC();
    try {
      // 1. Get high quality microphone audio stream with noise suppression & echo cancellation
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false
      });
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
      startVisualizer(stream);

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection(RTC_SERVERS);
      peerConnectionRef.current = pc;

      let isRemoteDescSet = false;
      const candidatesQueue: RTCIceCandidateInit[] = [];

      // Add local audio tracks to peer connection
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 3. Receive remote audio stream from recipient
      pc.ontrack = (event) => {
        console.log("Caller received remote track:", event);
        const remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        setupRemoteAudio(remoteStream);
      };

      pc.onconnectionstatechange = () => {
        console.log("Caller connection state:", pc.connectionState);
        setConnectionStatus(pc.connectionState);
        if (pc.connectionState === 'connected' && remoteAudioRef.current) {
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // 4. Send local ICE candidates to Firestore
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          safeAddDoc(collection(db, 'active_calls', callId, 'callerCandidates'), event.candidate.toJSON());
        }
      };

      // 5. Create Offer and store in Firestore
      const offerDescription = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offerDescription);

      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type
      };

      await safeSetDoc(doc(db, 'active_calls', callId, 'webrtc', 'offer'), offer);

      // 6. Listen for Receiver's Answer
      const unsubAnswer = onSnapshot(doc(db, 'active_calls', callId, 'webrtc', 'answer'), async (snapshot) => {
        if (snapshot.exists() && peerConnectionRef.current && !peerConnectionRef.current.currentRemoteDescription) {
          const data = snapshot.data();
          if (data && data.sdp && data.type) {
            try {
              const answerDescription = new RTCSessionDescription({ sdp: data.sdp, type: data.type });
              await peerConnectionRef.current.setRemoteDescription(answerDescription);
              isRemoteDescSet = true;

              // Process any queued candidates that arrived before the answer
              while (candidatesQueue.length > 0) {
                const cand = candidatesQueue.shift();
                if (cand && peerConnectionRef.current) {
                  await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn("Drain ICE cand error:", e));
                }
              }
            } catch (e) {
              console.warn("Set remote desc error:", e);
            }
          }
        }
      }, (err) => {
        console.warn("Call answer listen notice:", err?.message || err);
      });
      unsubsRef.current.push(unsubAnswer);

      // 7. Listen for Receiver ICE Candidates with safe queueing
      const unsubRecCand = onSnapshot(collection(db, 'active_calls', callId, 'receiverCandidates'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candData = change.doc.data() as RTCIceCandidateInit;
            if (peerConnectionRef.current && isRemoteDescSet && peerConnectionRef.current.remoteDescription) {
              peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candData)).catch(() => {});
            } else {
              candidatesQueue.push(candData);
            }
          }
        });
      }, (err) => {
        console.warn("Receiver candidates listen notice:", err?.message || err);
      });
      unsubsRef.current.push(unsubRecCand);

    } catch (err) {
      console.error("Caller WebRTC init error:", err);
      toast.error("Mikrofonni ulashda xatolik yuz berdi. Brauzerda mikrofonga ruxsat bering.");
    }
  };

  // Initialize Receiver WebRTC
  const initReceiverWebRTC = async (callId: string) => {
    cleanupWebRTC();
    try {
      // 1. Get high quality microphone audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false
      });
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
      startVisualizer(stream);

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection(RTC_SERVERS);
      peerConnectionRef.current = pc;

      let isRemoteDescSet = false;
      const candidatesQueue: RTCIceCandidateInit[] = [];

      // Add local audio track
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 3. Receive remote audio stream from caller
      pc.ontrack = (event) => {
        console.log("Receiver received remote track:", event);
        const remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        setupRemoteAudio(remoteStream);
      };

      pc.onconnectionstatechange = () => {
        console.log("Receiver connection state:", pc.connectionState);
        setConnectionStatus(pc.connectionState);
        if (pc.connectionState === 'connected' && remoteAudioRef.current) {
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // 4. Send receiver ICE candidates to Firestore
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          safeAddDoc(collection(db, 'active_calls', callId, 'receiverCandidates'), event.candidate.toJSON());
        }
      };

      // 5. Listen for Caller Candidates with queueing until remote description is set
      const unsubCallerCand = onSnapshot(collection(db, 'active_calls', callId, 'callerCandidates'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candData = change.doc.data() as RTCIceCandidateInit;
            if (peerConnectionRef.current && isRemoteDescSet && peerConnectionRef.current.remoteDescription) {
              peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candData)).catch(() => {});
            } else {
              candidatesQueue.push(candData);
            }
          }
        });
      }, (err) => {
        console.warn("Caller candidates listen notice:", err?.message || err);
      });
      unsubsRef.current.push(unsubCallerCand);

      // 6. Fetch SDP Offer from Caller and Create Answer
      const processOffer = async (offerData: any) => {
        if (!offerData || !offerData.sdp || !offerData.type) return;
        if (pc.currentRemoteDescription) return;

        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ sdp: offerData.sdp, type: offerData.type }));
          isRemoteDescSet = true;

          // Drain queued candidates
          while (candidatesQueue.length > 0) {
            const cand = candidatesQueue.shift();
            if (cand && peerConnectionRef.current) {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }

          const answerDescription = await pc.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          await pc.setLocalDescription(answerDescription);

          const answer = {
            sdp: answerDescription.sdp,
            type: answerDescription.type
          };

          await safeSetDoc(doc(db, 'active_calls', callId, 'webrtc', 'answer'), answer);
        } catch (e) {
          console.warn("Receiver process offer error:", e);
        }
      };

      // Read offer directly or listen via snapshot
      const offerDocRef = doc(db, 'active_calls', callId, 'webrtc', 'offer');
      const offerSnap = await getDoc(offerDocRef);
      if (offerSnap.exists()) {
        await processOffer(offerSnap.data());
      } else {
        const unsubOffer = onSnapshot(offerDocRef, (snap) => {
          if (snap.exists()) {
            processOffer(snap.data());
          }
        }, (err) => {
          console.warn("Offer snapshot notice:", err?.message || err);
        });
        unsubsRef.current.push(unsubOffer);
      }

    } catch (err) {
      console.error("Receiver WebRTC init error:", err);
      toast.error("Mikrofonni ulashda xatolik yuz berdi. Brauzerda mikrofonga ruxsat bering.");
    }
  };

  // Stop any active audio tones
  const stopAllTones = () => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    try {
      oscillatorRefs.current.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {}
      });
      oscillatorRefs.current = [];

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    } catch (e) {
      console.warn("Audio tone stop warning:", e);
    }
  };

  // Play outgoing ringback tone (dial tone: beep-pause)
  const playOutgoingTone = () => {
    stopAllTones();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      const now = ctx.currentTime;
      for (let i = 0; i < 20; i++) {
        const start = now + i * 3.5;
        gain.gain.setValueAtTime(0.06, start);
        gain.gain.setValueAtTime(0, start + 1.2);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      oscillatorRefs.current.push(osc);
    } catch (e) {
      console.warn("Could not play outgoing tone:", e);
    }
  };

  // Play incoming ringtone (melodic telephone ring)
  const playIncomingRingtone = () => {
    stopAllTones();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const unlockAudio = () => {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
      window.addEventListener('click', unlockAudio);
      window.addEventListener('touchstart', unlockAudio);

      const playRingPattern = () => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
        try {
          const now = ctx.currentTime;
          [480, 520].forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.7);

            gain.gain.linearRampToValueAtTime(0.08, now + 0.9);
            gain.gain.linearRampToValueAtTime(0, now + 1.6);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.8);
            oscillatorRefs.current.push(osc);
          });
        } catch (e) {}
      };

      playRingPattern();
      ringIntervalRef.current = setInterval(playRingPattern, 3000);
    } catch (e) {
      console.warn("Could not play incoming ringtone:", e);
    }
  };

  // Real-time Firestore Listener for active calls
  useEffect(() => {
    if (!user) {
      setCurrentCall(null);
      setCallRole(null);
      stopAllTones();
      cleanupWebRTC();
      return;
    }

    const myUid = user.uid;
    const myEmailClean = (user.email || '').toLowerCase().trim();

    const callsCol = collection(db, 'active_calls');
    const unsub = onSnapshot(callsCol, (snapshot) => {
      let activeCallFound: ActiveCallData | null = null;
      let roleFound: 'caller' | 'receiver' | null = null;

      snapshot.forEach(docSnap => {
        const data = docSnap.data() as ActiveCallData;
        const callDoc: ActiveCallData = {
          ...data,
          id: docSnap.id
        };

        const callerEmailClean = (callDoc.callerEmail || '').toLowerCase().trim();
        const receiverEmailClean = (callDoc.receiverEmail || '').toLowerCase().trim();

        const isCaller = callDoc.callerId === myUid || (callerEmailClean && callerEmailClean === myEmailClean);
        const isReceiver = 
          (callDoc.receiverId && callDoc.receiverId === myUid) || 
          (receiverEmailClean && receiverEmailClean === myEmailClean) ||
          (callDoc.receiverId === 'support_admin' && isAdmin) ||
          ((receiverEmailClean === 'admin@cloudbot.uz' || receiverEmailClean === 'admin@botforge.uz') && isAdmin) ||
          (isAdmin && (receiverEmailClean.includes('admin') || callDoc.receiverId === 'admin'));

        if ((isCaller || isReceiver) && (callDoc.status === 'ringing' || callDoc.status === 'connected')) {
          activeCallFound = callDoc;
          roleFound = isCaller ? 'caller' : 'receiver';
        }
      });

      if (activeCallFound) {
        setCurrentCall(activeCallFound);
        setCallRole(roleFound);
      } else {
        if (currentCall && (currentCall.status === 'ringing' || currentCall.status === 'connected')) {
          stopAllTones();
          cleanupWebRTC();
        }
        setCurrentCall(null);
        setCallRole(null);
      }
    }, (err) => {
      console.warn("Active calls listener notice:", err);
    });

    return () => unsub();
  }, [user, isAdmin]);

  // Handle Call Sound and Media Lifecycle
  useEffect(() => {
    if (!currentCall) {
      stopAllTones();
      cleanupWebRTC();
      setDuration(0);
      return;
    }

    if (currentCall.status === 'ringing') {
      if (callRole === 'caller') {
        playOutgoingTone();
      } else if (callRole === 'receiver') {
        playIncomingRingtone();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([400, 200, 400, 200, 400]);
        }
        toast.info(`📞 Kiruvchi qo'ng'iroq: ${currentCall.callerName}`, {
          duration: 35000,
          id: 'incoming-call-alert-toast',
          description: "Javob berish uchun ekrandagi tugmani bosing"
        });
      }
    } else if (currentCall.status === 'connected') {
      toast.dismiss('incoming-call-alert-toast');
      stopAllTones();
      if (remoteAudioRef.current) {
        remoteAudioRef.current.play().catch(() => {});
      }
    } else {
      toast.dismiss('incoming-call-alert-toast');
      stopAllTones();
      cleanupWebRTC();
    }

    return () => {
      stopAllTones();
    };
  }, [currentCall?.status, callRole]);

  // Duration Timer when connected
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentCall?.status === 'connected') {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentCall?.status]);

  // Auto-timeout after 40 seconds if not answered
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (currentCall?.status === 'ringing' && callRole === 'caller') {
      timeout = setTimeout(() => {
        handleAutoMissed();
      }, 40000);
    }
    return () => clearTimeout(timeout);
  }, [currentCall?.status, callRole]);

  const handleAutoMissed = async () => {
    if (!currentCall) return;
    try {
      const callRef = doc(db, 'active_calls', currentCall.id);
      await safeUpdateDoc(callRef, {
        status: 'missed',
        endedAt: new Date().toISOString()
      });
      await recordCallInChat(currentCall.chatId, "📞 Javobsiz qolgan ovozli qo'ng'iroq");
      toast.info("Foydalanuvchi javob bermadi");
    } catch (e) {
      console.warn(e);
    }
  };

  const recordCallInChat = async (chatId: string, text: string) => {
    if (!chatId || !user) return;
    try {
      const msgRef = doc(db, 'contact_messages', chatId);
      const msgSnap = await getDoc(msgRef);
      if (msgSnap.exists()) {
        const data = msgSnap.data();
        const existingReplies = data.replies || [];
        const callReply = {
          sender: isAdmin ? 'admin' : 'user',
          senderId: user.uid,
          senderEmail: user.email || '',
          text: text,
          createdAt: new Date().toISOString(),
          senderName: user.displayName || user.email?.split('@')[0] || (isAdmin ? 'Admin' : 'Foydalanuvchi')
        };
        await safeUpdateDoc(msgRef, {
          replies: [...existingReplies, callReply],
          updatedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn("Could not record call in chat:", e);
    }
  };

  // Start outgoing call
  const startCall = async ({
    chatId,
    receiverEmail,
    receiverName,
    receiverId,
    receiverAvatar,
    isSupport
  }: {
    chatId: string;
    receiverEmail: string;
    receiverName: string;
    receiverId?: string;
    receiverAvatar?: string;
    isSupport?: boolean;
  }) => {
    if (!user) {
      toast.error("Qo'ng'iroq qilish uchun tizimga kiring");
      return;
    }

    const myUid = user.uid;
    const myName = user.displayName || user.email?.split('@')[0] || 'Foydalanuvchi';
    const myEmail = user.email || '';
    const myPhoto = user.photoURL || '';

    const callDocId = `call_${chatId}_${Date.now()}`;
    const callData: ActiveCallData = {
      id: callDocId,
      chatId,
      callerId: myUid,
      callerName: myName,
      callerEmail: myEmail,
      callerAvatar: myPhoto,
      receiverId: isSupport ? 'support_admin' : (receiverId || ''),
      receiverEmail: receiverEmail,
      receiverName: receiverName,
      receiverAvatar: receiverAvatar || '',
      status: 'ringing',
      createdAt: new Date().toISOString(),
      answeredAt: null,
      endedAt: null,
      duration: 0
    };

    try {
      const callRef = doc(db, 'active_calls', callDocId);
      await safeSetDoc(callRef, callData);

      // Create instant notification record for recipient
      try {
        await safeAddDoc(collection(db, 'notifications'), {
          userId: isSupport ? 'support_admin' : (receiverId || ''),
          userEmail: (receiverEmail || '').toLowerCase().trim(),
          title: "📞 Kiruvchi Ovozli Qo'ng'iroq",
          message: `${myName} sizga ovozli qo'ng'iroq qilmoqda...`,
          chatId: chatId,
          type: 'call',
          callId: callDocId,
          read: false,
          createdAt: new Date().toISOString()
        });
      } catch (ne) {
        console.warn("Notification add warning:", ne);
      }

      setCurrentCall(callData);
      setCallRole('caller');
      setDuration(0);
      setIsMinimized(false);
      
      // Initialize WebRTC for caller
      await initCallerWebRTC(callDocId);

      toast.success(`${receiverName} bilan ovozli qo'ng'iroq boshlandi...`);
    } catch (e: any) {
      console.error("Call start error:", e);
      toast.error("Qo'ng'iroqni boshlashda xatolik yuz berdi");
    }
  };

  // Accept incoming call
  const acceptCall = async () => {
    if (!currentCall) return;
    try {
      stopAllTones();
      const callRef = doc(db, 'active_calls', currentCall.id);
      await safeUpdateDoc(callRef, {
        status: 'connected',
        answeredAt: new Date().toISOString()
      });
      setCurrentCall(prev => prev ? { ...prev, status: 'connected' } : null);

      // Initialize WebRTC for receiver
      await initReceiverWebRTC(currentCall.id);

      toast.success("Ovozli qo'ng'iroqqa ulandingiz");
    } catch (e) {
      console.error("Accept call error:", e);
    }
  };

  // Reject incoming call
  const rejectCall = async () => {
    if (!currentCall) return;
    try {
      stopAllTones();
      cleanupWebRTC();
      const callRef = doc(db, 'active_calls', currentCall.id);
      await safeUpdateDoc(callRef, {
        status: 'rejected',
        endedAt: new Date().toISOString()
      });
      await recordCallInChat(currentCall.chatId, "📞 Rad etilgan ovozli qo'ng'iroq");
      setCurrentCall(null);
      setCallRole(null);
      toast.info("Qo'ng'iroq rad etildi");
    } catch (e) {
      console.error("Reject call error:", e);
    }
  };

  // End active call or cancel outgoing
  const endCall = async () => {
    if (!currentCall) return;
    stopAllTones();
    cleanupWebRTC();

    const wasConnected = currentCall.status === 'connected';
    const finalSecs = duration;
    const newStatus = wasConnected ? 'ended' : 'cancelled';

    try {
      const callRef = doc(db, 'active_calls', currentCall.id);
      await safeUpdateDoc(callRef, {
        status: newStatus,
        endedAt: new Date().toISOString(),
        duration: finalSecs
      });

      if (wasConnected && finalSecs > 0) {
        const mins = Math.floor(finalSecs / 60);
        const secs = finalSecs % 60;
        const durStr = `${mins > 0 ? `${mins} daq ` : ''}${secs} soniya`;
        await recordCallInChat(currentCall.chatId, `📞 Ovozli qo'ng'iroq yakunlandi (${durStr})`);
        toast.success(`Qo'ng'iroq yakunlandi (${durStr})`);
      } else if (!wasConnected) {
        await recordCallInChat(currentCall.chatId, "📞 Bekor qilingan qo'ng'iroq");
        toast.info("Qo'ng'iroq bekor qilindi");
      }

      setCurrentCall(null);
      setCallRole(null);
      setDuration(0);
    } catch (e) {
      console.error("End call error:", e);
      setCurrentCall(null);
      setCallRole(null);
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMute;
      });
    }
    setIsMuted(nextMute);
    if (nextMute) {
      toast.info("Mikrofon o'chirildi (Mute)");
    } else {
      toast.success("Mikrofon yoqildi");
    }
  };

  const toggleSpeaker = () => {
    const nextSpeaker = !isSpeakerOn;
    setIsSpeakerOn(nextSpeaker);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !nextSpeaker;
      if (nextSpeaker) {
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.play().catch(() => {});
      }
    }
    if (nextSpeaker) {
      toast.success("Karnay yoqildi");
    } else {
      toast.info("Karnay o'chirildi");
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const partnerInfo = currentCall ? (
    callRole === 'caller' 
      ? { name: currentCall.receiverName, email: currentCall.receiverEmail, avatar: currentCall.receiverAvatar }
      : { name: currentCall.callerName, email: currentCall.callerEmail, avatar: currentCall.callerAvatar }
  ) : null;

  return (
    <CallContext.Provider value={{
      startCall,
      endCall,
      acceptCall,
      rejectCall,
      currentCall,
      callRole,
      isCallModalOpen: !!currentCall
    }}>
      {/* Hidden audio element to continuously play remote peer voice stream */}
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline 
        controls={false}
        className="fixed -top-96 -left-96 opacity-0 pointer-events-none w-0 h-0"
      />

      {children}

      {/* ================= INCOMING CALL PROMINENT POPUP ================= */}
      {currentCall && currentCall.status === 'ringing' && callRole === 'receiver' && (
        <div 
          id="incoming-call-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl p-4 animate-in fade-in duration-300"
        >
          <div className="relative w-full max-w-sm bg-gradient-to-b from-[#12172e] via-[#0d1020] to-[#080911] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_90px_rgba(6,182,212,0.25)] flex flex-col items-center justify-between min-h-[460px] text-center overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header Badge */}
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 bg-cyan-500/10 px-3.5 py-1.5 rounded-full border border-cyan-500/30 animate-pulse">
              <PhoneIncoming className="w-4 h-4" />
              <span>KIRUVCHI OVOZLI QO'NG'IROQ</span>
            </div>

            {/* Avatar with Sound Ripple Wave */}
            <div className="relative my-6">
              <div className="absolute inset-0 rounded-full bg-cyan-400/30 animate-ping" style={{ animationDuration: '1.5s' }} />
              <div className="absolute -inset-3 rounded-full bg-teal-500/20 animate-pulse" />
              
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-tr from-cyan-400 via-teal-400 to-emerald-400 shadow-[0_0_35px_rgba(6,182,212,0.5)]">
                {partnerInfo?.avatar ? (
                  <img 
                    src={partnerInfo.avatar} 
                    alt={partnerInfo.name} 
                    className="w-full h-full rounded-full object-cover bg-slate-900 border-2 border-black" 
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-black text-white border-2 border-black">
                    {partnerInfo?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </div>
            </div>

            {/* Caller Name and Email */}
            <div className="mb-6">
              <h3 className="text-2xl font-black text-white tracking-tight mb-1">
                {partnerInfo?.name}
              </h3>
              <p className="text-xs text-zinc-400 font-mono">
                {partnerInfo?.email || 'CloudBot Cloud Member'}
              </p>
              <p className="text-xs text-cyan-300 font-medium mt-3 animate-pulse">
                Sizga ovozli qo'ng'iroq qilmoqda...
              </p>
            </div>

            {/* Action Buttons: Accept or Decline */}
            <div className="w-full flex items-center justify-around pt-4 border-t border-white/[0.08]">
              {/* Decline button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={rejectCall}
                  className="p-4 rounded-full bg-gradient-to-tr from-rose-600 to-red-600 text-white shadow-xl shadow-rose-950/70 hover:scale-110 active:scale-95 transition-all cursor-pointer border border-rose-400/50"
                  title="Rad etish"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <span className="text-[11px] font-semibold text-rose-300">Rad etish</span>
              </div>

              {/* Accept button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={acceptCall}
                  className="p-5 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-[0_0_35px_rgba(16,185,129,0.5)] hover:scale-110 active:scale-95 transition-all cursor-pointer border border-emerald-300 animate-bounce"
                  style={{ animationDuration: '2s' }}
                  title="Javob berish"
                >
                  <Phone className="w-7 h-7" />
                </button>
                <span className="text-[11px] font-semibold text-emerald-300">Javob berish</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= OUTGOING & CONNECTED CALL SCREEN ================= */}
      {currentCall && (currentCall.status === 'connected' || (currentCall.status === 'ringing' && callRole === 'caller')) && (
        <>
          {/* Minimized Floating Bar */}
          {isMinimized ? (
            <div 
              id="minimized-voice-call"
              className="fixed bottom-20 right-6 z-50 flex items-center gap-3 bg-[#0d101c]/95 border border-cyan-500/50 p-3 rounded-2xl shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-4 duration-200"
            >
              <div className="relative">
                {partnerInfo?.avatar ? (
                  <img src={partnerInfo.avatar} alt={partnerInfo.name} className="w-10 h-10 rounded-xl object-cover border border-cyan-400/40" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center font-bold text-white text-sm">
                    {partnerInfo?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-[#0d101c] animate-pulse" />
              </div>

              <div className="min-w-0 pr-2">
                <p className="text-xs font-bold text-white truncate max-w-[120px]">{partnerInfo?.name}</p>
                <p className="text-[10px] font-mono text-cyan-300">
                  {currentCall.status === 'connected' ? formatTime(duration) : 'Gudok ketmoqda...'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Kengaytirish"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={endCall}
                className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-lg shadow-rose-950/50 cursor-pointer"
                title="Yakunlash"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Full Call Screen */
            <div 
              id="voice-call-overlay"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl p-4 animate-in fade-in duration-200"
            >
              <div className="relative w-full max-w-sm bg-gradient-to-b from-[#101426] via-[#0c0e1a] to-[#07080f] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_90px_rgba(6,182,212,0.18)] flex flex-col items-center justify-between min-h-[490px] overflow-hidden">
                
                {/* Top Header */}
                <div className="w-full flex items-center justify-between text-zinc-400">
                  <div className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/30">
                    <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span className="font-semibold tracking-wide">HD Voice Link</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMinimized(true)}
                    className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                    title="Kichraytirish"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Center: Avatar & Calling Info */}
                <div className="flex flex-col items-center text-center my-auto w-full">
                  <div className="relative mb-5">
                    {currentCall.status === 'connected' ? (
                      <div 
                        className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping"
                        style={{
                          transform: `scale(${1 + audioLevel / 130})`,
                          opacity: isMuted ? 0.1 : 0.4
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 rounded-full bg-cyan-500/25 animate-ping" />
                    )}
                    
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-tr from-cyan-500 via-teal-400 to-emerald-500 shadow-[0_0_30px_rgba(6,182,212,0.4)]">
                      {partnerInfo?.avatar ? (
                        <img 
                          src={partnerInfo.avatar} 
                          alt={partnerInfo.name} 
                          className="w-full h-full rounded-full object-cover bg-slate-900 border-2 border-black" 
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-black text-white border-2 border-black">
                          {partnerInfo?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-white tracking-tight mb-1">{partnerInfo?.name}</h3>
                  <p className="text-xs text-zinc-400 font-mono mb-3">
                    {partnerInfo?.email || 'CloudBot Cloud Member'}
                  </p>

                  {/* Call Status Badge */}
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs mb-3">
                    {currentCall.status === 'ringing' && (
                      <span className="text-teal-300 font-medium animate-pulse flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                        Gudok ketmoqda...
                      </span>
                    )}
                    {currentCall.status === 'connected' && (
                      <span className="text-emerald-400 font-mono font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        {formatTime(duration)}
                      </span>
                    )}
                  </div>

                  {/* Live Audio Waveform visualizer when connected */}
                  {currentCall.status === 'connected' && (
                    <div className="flex flex-col items-center gap-1.5 mt-2">
                      <div className="flex items-center justify-center gap-1 h-8">
                        {[35, 65, 85, 55, 95, 70, 40, 80, 50, 90, 60, 30].map((h, i) => {
                          const heightPercent = isMuted ? 15 : Math.max(15, Math.min(100, (audioLevel / 100) * h));
                          return (
                            <div
                              key={i}
                              className="w-1 rounded-full bg-gradient-to-t from-cyan-500 to-emerald-400 transition-all duration-75"
                              style={{ height: `${heightPercent}%` }}
                            />
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {isMuted ? "🔇 Mikrofon o'chirilgan" : "🎙️ Mikrofon faol (Ovoz uzatilmoqda)"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Controls Bar */}
                <div className="w-full flex items-center justify-around pt-4 border-t border-white/[0.08] mt-4">
                  {/* Mute Mic */}
                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={currentCall.status !== 'connected'}
                    className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
                      isMuted 
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' 
                        : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                    title={isMuted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  {/* End Call Button */}
                  <button
                    type="button"
                    onClick={endCall}
                    className="p-4 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-xl shadow-rose-950/70 hover:scale-110 active:scale-95 transition-all cursor-pointer border border-rose-400/50"
                    title="Qo'ng'iroqni yakunlash"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>

                  {/* Speaker Button */}
                  <button
                    type="button"
                    onClick={toggleSpeaker}
                    className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
                      !isSpeakerOn 
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                        : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                    }`}
                    title={isSpeakerOn ? "Karnayni o'chirish" : "Karnayni yoqish"}
                  >
                    {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </button>
                </div>

              </div>
            </div>
          )}
        </>
      )}

    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
