import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Minimize2, Maximize2, ShieldAlert, Sparkles } from 'lucide-react';

interface VoiceCallModalProps {
  partnerName: string;
  partnerAvatar?: string;
  partnerEmail?: string;
  isSupport?: boolean;
  isOpen: boolean;
  onClose: (durationSeconds: number) => void;
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  partnerName,
  partnerAvatar,
  partnerEmail,
  isSupport,
  isOpen,
  onClose,
}) => {
  const [callState, setCallState] = useState<'calling' | 'ringing' | 'connected' | 'ended'>('calling');
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(15);

  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Play outgoing ringing tone using Web Audio API
  const playRingtone = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, ctx.currentTime); // Standard European/Asian dial tone frequency

      // Pulse pattern for ringback tone: 1s sound, 2s silence
      gain.gain.setValueAtTime(0, ctx.currentTime);
      
      const now = ctx.currentTime;
      for (let i = 0; i < 15; i++) {
        const start = now + i * 3;
        gain.gain.setValueAtTime(0.08, start);
        gain.gain.setValueAtTime(0, start + 1.2);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      oscillatorRef.current = osc;
      gainNodeRef.current = gain;
    } catch (e) {
      console.warn("Web Audio not supported or allowed yet", e);
    }
  };

  const stopRingtone = () => {
    try {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
        oscillatorRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    } catch (e) {
      console.warn("Error stopping audio", e);
    }
  };

  // Start Mic stream for visualizer
  const startMicCapture = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!streamRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.max(10, Math.min(100, avg * 1.6)));
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }
    } catch (e) {
      console.log("Mic access not granted or unavailable, using simulated wave", e);
      // Fallback pulse interval
      const interval = setInterval(() => {
        setAudioLevel(Math.floor(20 + Math.random() * 60));
      }, 200);
      return () => clearInterval(interval);
    }
  };

  const stopMicCapture = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Call Lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopRingtone();
      stopMicCapture();
      return;
    }

    setCallState('calling');
    setDuration(0);
    setIsMinimized(false);
    playRingtone();

    // After 1.5s -> ringing
    const t1 = setTimeout(() => {
      setCallState('ringing');
    }, 1500);

    // After 4.5s -> connected (answered)
    const t2 = setTimeout(() => {
      stopRingtone();
      setCallState('connected');
      startMicCapture();
    }, 4200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      stopRingtone();
      stopMicCapture();
    };
  }, [isOpen]);

  // Duration Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const handleEndCall = () => {
    setCallState('ended');
    stopRingtone();
    stopMicCapture();
    setTimeout(() => {
      onClose(duration);
    }, 800);
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
    }
    setIsMuted(prev => !prev);
  };

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Minimized Floating Bar
  if (isMinimized) {
    return (
      <div 
        id="minimized-voice-call"
        className="fixed bottom-20 right-6 z-50 flex items-center gap-3 bg-[#0d101c]/95 border border-cyan-500/50 p-3 rounded-2xl shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-4 duration-200"
      >
        <div className="relative">
          {partnerAvatar ? (
            <img src={partnerAvatar} alt={partnerName} className="w-10 h-10 rounded-xl object-cover border border-cyan-400/40" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center font-bold text-white text-sm">
              {partnerName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-[#0d101c] animate-pulse" />
        </div>

        <div className="min-w-0 pr-2">
          <p className="text-xs font-bold text-white truncate max-w-[120px]">{partnerName}</p>
          <p className="text-[10px] font-mono text-cyan-300">
            {callState === 'connected' ? formatTime(duration) : 'Qo\'ng\'iroq...'}
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
          onClick={handleEndCall}
          className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-lg shadow-rose-950/50 cursor-pointer"
          title="Yakunlash"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Full Screen Modal
  return (
    <div 
      id="voice-call-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#101426] via-[#0c0e1a] to-[#07080f] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_80px_rgba(6,182,212,0.15)] flex flex-col items-center justify-between min-h-[460px] overflow-hidden">
        
        {/* Top Header */}
        <div className="w-full flex items-center justify-between text-zinc-400">
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/30">
            <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
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
          {/* Animated Avatar Rings */}
          <div className="relative mb-6">
            {callState === 'connected' ? (
              <div 
                className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping"
                style={{
                  transform: `scale(${1 + audioLevel / 150})`,
                  opacity: isMuted ? 0.1 : 0.4
                }}
              />
            ) : (
              <div className="absolute inset-0 rounded-full bg-cyan-500/25 animate-ping" />
            )}
            
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-tr from-cyan-500 via-teal-400 to-emerald-500 shadow-[0_0_30px_rgba(6,182,212,0.4)]">
              {partnerAvatar ? (
                <img 
                  src={partnerAvatar} 
                  alt={partnerName} 
                  className="w-full h-full rounded-full object-cover bg-slate-900 border-2 border-black" 
                />
              ) : (
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-black text-white border-2 border-black">
                  {partnerName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* User Name & Status */}
          <div className="flex items-center justify-center gap-2 mb-1">
            <h3 className="text-xl font-black text-white tracking-tight">{partnerName}</h3>
            {isSupport && (
              <ShieldAlert className="w-4 h-4 text-amber-400" title="Rasmiy Support" />
            )}
          </div>

          <p className="text-xs text-zinc-400 font-mono mb-4">
            {partnerEmail || 'CloudBot Cloud Member'}
          </p>

          {/* Call Status Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs">
            {callState === 'calling' && (
              <span className="text-cyan-300 font-medium animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                Qo'ng'iroq qilinmoqda...
              </span>
            )}
            {callState === 'ringing' && (
              <span className="text-teal-300 font-medium animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                Gudok ketmoqda...
              </span>
            )}
            {callState === 'connected' && (
              <span className="text-emerald-400 font-mono font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {formatTime(duration)}
              </span>
            )}
            {callState === 'ended' && (
              <span className="text-rose-400 font-medium">
                Qo'ng'iroq yakunlandi
              </span>
            )}
          </div>

          {/* Live Audio Waveform visualizer when connected */}
          {callState === 'connected' && (
            <div className="flex items-center justify-center gap-1 mt-6 h-8">
              {[40, 70, 90, 60, 100, 75, 45, 85, 55, 95, 65, 35].map((h, i) => {
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
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="w-full flex items-center justify-around pt-4 border-t border-white/[0.08] mt-4">
          {/* Mute Mic */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={callState !== 'connected'}
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
            onClick={handleEndCall}
            className="p-4 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-xl shadow-rose-950/70 hover:scale-110 active:scale-95 transition-all cursor-pointer border border-rose-400/50"
            title="Qo'ng'iroqni yakunlash"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          {/* Speaker Button */}
          <button
            type="button"
            onClick={() => setIsSpeakerOn(prev => !prev)}
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
  );
};
