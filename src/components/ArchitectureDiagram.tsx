import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Users, 
  Globe, 
  ShieldCheck, 
  Network, 
  Cpu, 
  Server, 
  Bot, 
  Activity, 
  ArrowDown, 
  ArrowRight, 
  Zap, 
  CheckCircle2, 
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ArchitectureDiagramProps {
  onlineNodesCount?: number;
  totalNodesCount?: number;
}

export const ArchitectureDiagram: React.FC<ArchitectureDiagramProps> = ({
  onlineNodesCount = 3,
  totalNodesCount = 3,
}) => {
  const [showFullExplanation, setShowFullExplanation] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const steps = [
    {
      id: 1,
      title: "1. Foydalanuvchilar va Kirish Nuqtasi (Cloudflare DNS & Edge)",
      badge: "Xavfsizlik & Tezlik",
      desc: "Mijozlarning (Telegram / Web) so'rovlari birinchi navbatda Cloudflare DDoS himoyasi va eng yaqin Edge tarmoq orqali qabul qilinadi.",
      color: "from-blue-500/20 to-cyan-500/20 border-cyan-500/30 text-cyan-400"
    },
    {
      id: 2,
      title: "2. CloudBot Load Balancer (Yuklama Balanseri)",
      badge: "Single Entry Point",
      desc: "NGINX / HAProxy mexanizmi orqali so'rovlar qabul qilinadi va Health Checker orqali faqat sog'lom (ONLINE) serverlarga taqsimlanadi.",
      color: "from-cyan-500/20 to-teal-500/20 border-teal-500/30 text-teal-400"
    },
    {
      id: 3,
      title: "3. Master Controller (Control Plane & Telemetriya)",
      badge: "Tizim Miyaasi",
      desc: "CPU/RAM yuklamasini doimiy o'lchaydi, botlarni avtomatik tegishli tugunga deploy qiladi va klaster salomatligini tekshiradi.",
      color: "from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400"
    },
    {
      id: 4,
      title: "4. Worker Nodes (Botlarni Yurgizuvchi Serverlar)",
      badge: "Weighted Round-Robin",
      desc: "SG HighPerf (3x yuklama vazni, 2 vCPU / 2048 MB RAM), US Bot1 (1x vazn) hamda GB London Express Render (1x vazn) tugunlari botlarni 24/7 uzluksiz yurgizadi.",
      color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400"
    }
  ];

  return (
    <Card className="border-cyan-500/30 shadow-xl bg-gradient-to-br from-card/90 via-card/70 to-card/90 backdrop-blur-md overflow-hidden" id="architecture-diagram-card">
      <CardHeader className="border-b border-border/50 pb-4 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400 shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 flex-wrap text-foreground">
                <span>CloudBot Infratuzilmasi: Botlarni Boshqarish Tizimi</span>
                <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 text-[10px] font-mono font-bold tracking-wider">
                  Klaster Arxitekturasi
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Foydalanuvchi so'rovlaridan tortib, uzoq serverlarda botlarning yurgizilishigacha bo'lgan to'liq yo'l xaritasi
              </CardDescription>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFullExplanation(!showFullExplanation)}
            className="text-xs gap-1.5 h-8 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 self-start sm:self-auto shrink-0"
            id="btn-toggle-architecture-guide"
          >
            <Info className="w-3.5 h-3.5" />
            {showFullExplanation ? "Tushuntirishni yashirish" : "Sxema tushuntirishi"}
            {showFullExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* INTERACTIVE VISUAL ARCHITECTURE SCHEME */}
        <div className="relative rounded-2xl border border-border/70 bg-black/40 p-4 sm:p-6 overflow-x-auto shadow-inner" id="visual-architecture-map">
          
          {/* Background grid accents */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/5 via-transparent to-transparent pointer-events-none" />

          <div className="min-w-[700px] flex flex-col items-center space-y-5 relative z-10">

            {/* LEVEL 1: CLIENTS & INTERNET */}
            <div className="w-full flex flex-col items-center">
              {/* Users Box */}
              <div 
                onClick={() => setActiveStep(activeStep === 1 ? null : 1)}
                className={`cursor-pointer transition-all duration-200 px-6 py-2.5 rounded-2xl bg-card border ${activeStep === 1 ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-lg' : 'border-border/70 hover:border-blue-500/50'} flex items-center gap-3`}
              >
                <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Mijozlar / Userlar</span>
                  <span className="text-[11px] text-muted-foreground ml-2">(Telegram / Web so'rovlar)</span>
                </div>
              </div>

              {/* Connecting arrows */}
              <div className="flex justify-center my-2 text-cyan-400/80 animate-pulse">
                <ArrowDown className="w-4 h-4" />
              </div>

              {/* Cloudflare Edge Box */}
              <div 
                onClick={() => setActiveStep(activeStep === 1 ? null : 1)}
                className={`cursor-pointer transition-all duration-200 w-full max-w-xl p-3 rounded-xl bg-gradient-to-r from-blue-950/40 via-card/80 to-blue-950/40 border ${activeStep === 1 ? 'border-cyan-400 ring-2 ring-cyan-500/30 shadow-lg' : 'border-blue-500/30 hover:border-cyan-400/60'} flex items-center justify-between gap-4`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                      <span>INTERNET (Cloudflare DNS / Edge Network)</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      DDoS himoyasi, TLS/SSL shifrlash va global eng yaqin nuqtadan tezkor yetkazib berish
                    </p>
                  </div>
                </div>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40 text-[10px] shrink-0 font-mono">
                  DDoS Protected
                </Badge>
              </div>

              {/* Connecting arrow */}
              <div className="flex justify-center my-2 text-cyan-400">
                <ArrowDown className="w-4 h-4" />
              </div>
            </div>

            {/* LEVEL 2 & 3 & 4: LOAD BALANCER -> MASTER CONTROLLER + WORKER NODES */}
            <div className="w-full grid grid-cols-12 gap-5 items-stretch">
              
              {/* LEFT & CENTER: LOAD BALANCER & MASTER CONTROLLER */}
              <div className="col-span-7 flex flex-col space-y-4">
                
                {/* LOAD BALANCER BOX */}
                <div 
                  onClick={() => setActiveStep(activeStep === 2 ? null : 2)}
                  className={`cursor-pointer transition-all duration-200 p-4 rounded-xl bg-card border ${activeStep === 2 ? 'border-teal-400 ring-2 ring-teal-500/30 shadow-lg' : 'border-teal-500/30 hover:border-teal-400/60'} relative`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400 shrink-0">
                        <Network className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span>[CLOUDBOT LOAD BALANCER]</span>
                          <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                        </h4>
                        <span className="text-[11px] text-muted-foreground">Trafik yo'naltiruvchi & Yuklama muvozanatchisi</span>
                      </div>
                    </div>
                    <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/40 text-[10px] font-mono">
                      Weighted Round-Robin
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground border-t border-border/50 pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                      <span>Single Entry Point (NGINX/HAProxy)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                      <span>Traffic Manager & Health Checker</span>
                    </div>
                  </div>
                </div>

                {/* Arrow from LB to Controller */}
                <div className="flex items-center justify-center text-amber-400">
                  <ArrowDown className="w-4 h-4" />
                </div>

                {/* MASTER CONTROLLER BOX */}
                <div 
                  onClick={() => setActiveStep(activeStep === 3 ? null : 3)}
                  className={`cursor-pointer transition-all duration-200 p-4 rounded-xl bg-card border ${activeStep === 3 ? 'border-amber-400 ring-2 ring-amber-500/30 shadow-lg' : 'border-amber-500/30 hover:border-amber-400/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span>[MASTER CONTROLLER]</span>
                          <span className="text-[10px] text-amber-400 font-mono font-normal">(Tizim Miyaasi)</span>
                        </h4>
                        <span className="text-[11px] text-muted-foreground">Control Plane & Telemetry Engine</span>
                      </div>
                    </div>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px] font-mono">
                      Auto-Deploy
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground border-t border-border/50 pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      <span>CPU / RAM Telemetriya & Jonli resurs nazorati</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-amber-400" />
                      <span>Botlarni avto-deploy qilish va taqsimlash</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Node Health Monitoring & Failover boshqaruvi</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT: WORKER NODES */}
              <div 
                onClick={() => setActiveStep(activeStep === 4 ? null : 4)}
                className={`col-span-5 cursor-pointer transition-all duration-200 p-4 rounded-xl bg-card border ${activeStep === 4 ? 'border-emerald-400 ring-2 ring-emerald-500/30 shadow-lg' : 'border-emerald-500/30 hover:border-emerald-400/60'} flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                          <span>[WORKER NODES]</span>
                          <span className="text-xs">🤖🤖</span>
                        </h4>
                        <span className="text-[10px] text-muted-foreground">Botlarni yurgizuvchi serverlar</span>
                      </div>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                      {onlineNodesCount} / {totalNodesCount} ONLINE
                    </Badge>
                  </div>

                  {/* Worker Node 1: SG HighPerf */}
                  <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-500/60 transition-all space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">🇸🇬</span>
                        <span className="text-xs font-bold text-foreground">SG HighPerf</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[9px] py-0">
                        ONLINE
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>2 vCPU / 2048 MB RAM</span>
                      <span className="font-bold text-cyan-400">Yuklama vazni: 3x</span>
                    </div>
                  </div>

                  {/* Worker Node 2: US Bot1 */}
                  <div className="mt-2 p-2.5 rounded-lg bg-black/20 border border-border/60 hover:border-border transition-all space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">🇺🇸</span>
                        <span className="text-xs font-bold text-foreground">US Bot1</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[9px] py-0">
                        ONLINE
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>0.1 vCPU / 512 MB RAM</span>
                      <span className="text-muted-foreground font-medium">Yuklama vazni: 1x</span>
                    </div>
                  </div>

                  {/* Worker Node 3: GB London Express (Render) */}
                  <div className="mt-2 p-2.5 rounded-lg bg-blue-950/20 border border-cyan-500/30 hover:border-cyan-500/60 transition-all space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">🇬🇧</span>
                        <span className="text-xs font-bold text-foreground">GB London (Render Express)</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[9px] py-0">
                        ONLINE
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-mono text-cyan-300">cloudsrv-in3u.onrender.com</span>
                      <span className="text-cyan-400 font-medium">Yuklama vazni: 1x</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/40 text-[10px] text-emerald-400/90 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Kuchli serverlarga ko'proq yuklama taqsimlanadi</span>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* DETAILED ACCORDION / EXPLANATION STEPS */}
        {showFullExplanation && (
          <div className="space-y-3 pt-2 animate-in fade-in-50 duration-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Infratuzilma Bo'g'inlarining Batafsil Vazifalari
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {steps.map((step) => (
                <div 
                  key={step.id} 
                  className={`p-3.5 rounded-xl border bg-gradient-to-br ${step.color} transition-all space-y-1.5`}
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-foreground">{step.title}</h5>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {step.badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 leading-relaxed flex items-start gap-2.5">
              <Zap className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                <strong>Xulosa:</strong> Ushbu infratuzilma yuqori samaradorlik va ishonchlilikni ta'minlaydi. Load Balancer yuklamani taqsimlaydi, Master Controller tizimning sog'lig'ini va botlarni deploy qilishni nazorat qiladi, Worker Node'lar esa botlarning o'zini uzluksiz yurgizadi.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
