import React, { useState, useEffect, useCallback, useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Cpu, 
  HardDrive, 
  Activity, 
  Server, 
  RefreshCw, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  Wifi, 
  Layers, 
  SlidersHorizontal,
  Table as TableIcon,
  LayoutGrid,
  Clock,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../context/LanguageContext';

export interface NodeMetrics {
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramPercent: number;
  latencyMs: number;
  activeBots: number;
  uptimeSeconds: number;
  loadStatus: 'healthy' | 'moderate' | 'high';
}

export interface TelemetryPoint {
  time: string;
  cpu: number;
  ram: number;
}

export interface HostedNode {
  id: string;
  name: string;
  role: 'master' | 'worker';
  technology: string;
  region: string;
  flag: string;
  status: 'online' | 'degraded' | 'offline';
  is_active: number;
  weight: number;
  specs: {
    vcpu: number;
    vcpuLabel: string;
    ramMb: number;
    ramGb: string;
  };
  metrics: NodeMetrics;
  history: TelemetryPoint[];
}

export interface ClusterSummary {
  totalNodes: number;
  onlineNodes: number;
  totalVcpu: number;
  totalRamMb: number;
  totalRamGb: string;
  avgCpuPercent: number;
  avgRamPercent: number;
  totalActiveBots: number;
}

interface MiniChartProps {
  values: number[];
  times: string[];
  color: 'emerald' | 'cyan' | 'indigo' | 'amber' | 'rose';
  label: string;
  unit?: string;
  height?: number;
}

const colorMap = {
  emerald: {
    stroke: '#10b981',
    fillStart: 'rgba(16, 185, 129, 0.35)',
    fillEnd: 'rgba(16, 185, 129, 0.0)',
    dot: '#34d399',
    text: 'text-emerald-400'
  },
  cyan: {
    stroke: '#06b6d4',
    fillStart: 'rgba(6, 182, 212, 0.35)',
    fillEnd: 'rgba(6, 182, 212, 0.0)',
    dot: '#22d3ee',
    text: 'text-cyan-400'
  },
  indigo: {
    stroke: '#6366f1',
    fillStart: 'rgba(99, 102, 241, 0.35)',
    fillEnd: 'rgba(99, 102, 241, 0.0)',
    dot: '#818cf8',
    text: 'text-indigo-400'
  },
  amber: {
    stroke: '#f59e0b',
    fillStart: 'rgba(245, 158, 11, 0.35)',
    fillEnd: 'rgba(245, 158, 11, 0.0)',
    dot: '#fbbf24',
    text: 'text-amber-400'
  },
  rose: {
    stroke: '#f43f5e',
    fillStart: 'rgba(244, 63, 94, 0.35)',
    fillEnd: 'rgba(244, 63, 94, 0.0)',
    dot: '#fb7185',
    text: 'text-rose-400'
  }
};

export const MiniSparkline: React.FC<MiniChartProps> = ({
  values,
  times,
  color,
  label,
  unit = '%',
  height = 42
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartId = useId();

  if (!values || values.length === 0) {
    return (
      <div 
        className="w-full rounded bg-muted/20 flex items-center justify-center text-[10px] text-muted-foreground"
        style={{ height }}
      >
        Ma'lumotlar to'planmoqda...
      </div>
    );
  }

  const safeValues = values.length === 1 ? [values[0], values[0]] : values;
  const safeTimes = times.length === 1 ? [times[0], times[0]] : times;

  const width = 160;
  const paddingX = 4;
  const paddingY = 4;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;

  const minVal = 0;
  const maxVal = 100;
  const range = maxVal - minVal || 1;

  const points = safeValues.map((val, idx) => {
    const x = paddingX + (idx / (safeValues.length - 1)) * usableWidth;
    const normalized = Math.min(100, Math.max(0, val));
    const y = paddingY + usableHeight - (normalized / range) * usableHeight;
    return { x, y, val, time: safeTimes[idx] || '' };
  });

  const linePath = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
  }, '');

  const areaPath = `${linePath} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : points[points.length - 1];
  const scheme = colorMap[color] || colorMap.emerald;

  return (
    <div className="relative w-full group select-none">
      <div className="flex items-center justify-between text-[10px] mb-1 text-muted-foreground">
        <span className="font-medium flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${scheme.text.replace('text-', 'bg-')}`} />
          {label} trend
        </span>
        <span className="font-mono text-foreground font-semibold">
          {activePoint.val}{unit}
          {activePoint.time && (
            <span className="text-muted-foreground ml-1 font-normal">
              ({activePoint.time})
            </span>
          )}
        </span>
      </div>

      <div 
        className="relative overflow-hidden rounded bg-black/20 border border-white/5 p-0.5"
        style={{ height }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={scheme.stroke} stopOpacity="0.4" />
              <stop offset="100%" stopColor={scheme.stroke} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background grid lines */}
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2,2" />

          {/* Area Fill */}
          <path d={areaPath} fill={`url(#grad-${chartId})`} />

          {/* Line stroke */}
          <path 
            d={linePath} 
            fill="none" 
            stroke={scheme.stroke} 
            strokeWidth="1.75" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* Current / Hover Dot */}
          {activePoint && (
            <circle 
              cx={activePoint.x} 
              cy={activePoint.y} 
              r="2.75" 
              fill={scheme.dot} 
              stroke="#0f172a" 
              strokeWidth="1.5" 
              className="transition-all duration-150"
            />
          )}

          {/* Transparent interactive bars for hover */}
          {points.map((pt, idx) => {
            const stepWidth = usableWidth / points.length;
            return (
              <rect
                key={idx}
                x={pt.x - stepWidth / 2}
                y="0"
                width={stepWidth}
                height={height}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const ServerMonitoring: React.FC = () => {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<HostedNode[]>([]);
  const [summary, setSummary] = useState<ClusterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchMetrics = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await fetch('/api/system/nodes-monitoring');
      const data = await res.json();
      if (data.success && data.nodes) {
        setNodes(data.nodes);
        if (data.summary) {
          setSummary(data.summary);
        }
        setLastUpdated(new Date());
      }
    } catch (e: any) {
      if (isInitial) {
        toast.error("Server telemetriyasini yuklab bo'lmadi: " + e.message);
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics(true);
  }, [fetchMetrics]);

  // Polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMetrics(false);
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const handleTestNode = async (node: HostedNode) => {
    if (node.role === 'master') {
      toast.info("Master Controller doimo mahalliy konteynerda ishlamoqda (14ms).");
      return;
    }

    setTestingNodeId(node.id);
    try {
      const res = await fetch('/api/admin/external-runners/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId: node.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${node.name} bilan aloqa a'lo darajada! (${data.latencyMs} ms)`);
        fetchMetrics(false);
      } else {
        toast.error(data.error || `${node.name} javob bermadi.`);
      }
    } catch (err: any) {
      toast.error(`Aloqa xatosi: ${err.message}`);
    } finally {
      setTestingNodeId(null);
    }
  };

  const filteredNodes = nodes.filter(n => {
    if (regionFilter === 'all') return true;
    if (regionFilter === 'singapore') return n.region.toLowerCase().includes('singapore') || n.region.toLowerCase().includes('asia');
    if (regionFilter === 'frankfurt') return n.region.toLowerCase().includes('frankfurt') || n.region.toLowerCase().includes('eu');
    if (regionFilter === 'oregon') return n.region.toLowerCase().includes('oregon') || n.region.toLowerCase().includes('us');
    if (regionFilter === 'master') return n.role === 'master';
    return true;
  });

  const getCpuColor = (percent: number): 'emerald' | 'amber' | 'rose' => {
    if (percent >= 80) return 'rose';
    if (percent >= 60) return 'amber';
    return 'emerald';
  };

  const getRamColor = (percent: number): 'cyan' | 'indigo' | 'rose' => {
    if (percent >= 85) return 'rose';
    if (percent >= 65) return 'indigo';
    return 'cyan';
  };

  return (
    <Card className="border-border/80 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden" id="server-monitoring-panel">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Activity className="w-5 h-5" />
              </div>
              <CardTitle className="text-lg font-bold tracking-tight">
                {t('dash_serverMonitoring', 'Server Monitoring & Klaster Telemetriyasi')}
              </CardTitle>
              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {summary ? `${summary.onlineNodes}/${summary.totalNodes} Tugun Faol` : "Jonli"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {t('dash_serverMonitoringDesc', 'Barcha ulangan server tugunlarining real-vaqt CPU va RAM resurslari monitoringi')}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <Button
                variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setViewMode('cards')}
                title="Kartalar ko'rinishi"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kartalar</span>
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setViewMode('table')}
                title="Ixcham jadval"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Jadval</span>
              </Button>
            </div>

            {/* Auto-refresh toggle */}
            <Button
              variant="outline"
              size="sm"
              className={`h-7 px-2 text-xs gap-1.5 ${autoRefresh ? 'border-primary/50 text-primary' : 'text-muted-foreground'}`}
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? "Avtomatik yangilanishni to'xtatish" : "Avtomatik yangilanishni yoqish"}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-primary animate-ping' : 'bg-muted-foreground'}`} />
              {autoRefresh ? "Jonli (6s)" : "Pauza"}
            </Button>

            {/* Manual refresh */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => fetchMetrics(false)}
              disabled={loading}
              title="Yangilash"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Aggregate Cluster Quick Stats */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-1 border-t border-border/30">
            <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  Klaster CPU
                </span>
                <span className="font-mono font-semibold text-foreground">{summary.avgCpuPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    summary.avgCpuPercent > 80 ? 'bg-rose-500' : (summary.avgCpuPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500')
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, summary.avgCpuPercent))}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Jami: {summary.totalVcpu} vCPU quvvati
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  Klaster RAM
                </span>
                <span className="font-mono font-semibold text-foreground">{summary.avgRamPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-cyan-500 transition-all duration-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(5, summary.avgRamPercent))}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Jami: {summary.totalRamGb} operativ xotira
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                Klaster Sig'imi
              </div>
              <div className="text-sm font-bold font-mono text-foreground">
                {summary.totalNodes} ta Server
              </div>
              <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                100% Aloqa barqaror
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Yuklama & Aloqa
              </div>
              <div className="text-sm font-bold font-mono text-foreground flex items-center gap-1">
                {summary.totalActiveBots} ta Faol Bot
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                Yangilandi: {lastUpdated.toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        {/* Region Filter Chips */}
        <div className="flex items-center gap-1.5 pt-2 flex-wrap text-xs">
          <span className="text-muted-foreground text-[11px] font-medium mr-1 flex items-center gap-1">
            <Layers className="w-3 h-3" />
            Filtr:
          </span>
          {[
            { id: 'all', label: 'Barcha Serverlar' },
            { id: 'singapore', label: '🇸🇬 Singapore (2vCPU)' },
            { id: 'frankfurt', label: '🇩🇪 Frankfurt' },
            { id: 'oregon', label: '🇺🇸 Oregon' },
            { id: 'master', label: '🌐 Master Host' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setRegionFilter(f.id)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                regionFilter === f.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {loading && nodes.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span>Klaster serverlarining CPU va RAM telemetriyasi yuklanmoqda...</span>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Tanlangan hudud bo'yicha serverlar topilmadi.
          </div>
        ) : viewMode === 'cards' ? (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
            {filteredNodes.map(node => {
              const cpuColor = getCpuColor(node.metrics.cpuPercent);
              const ramColor = getRamColor(node.metrics.ramPercent);
              const isRailway2vCPU = node.name?.includes('2vCPU') || node.technology?.includes('2vCPU') || node.specs.vcpu >= 2;

              const cpuHistory = (node.history || []).map(h => h.cpu);
              const ramHistory = (node.history || []).map(h => h.ram);
              const timesHistory = (node.history || []).map(h => h.time);

              return (
                <div 
                  key={node.id}
                  className="rounded-xl border border-border/60 bg-background/40 hover:bg-background/70 hover:border-border transition-all duration-200 p-4 space-y-3 shadow-xs"
                >
                  {/* Node Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base select-none">{node.flag}</span>
                        <h4 className="font-bold text-sm text-foreground truncate" title={node.name}>
                          {node.name}
                        </h4>
                        {isRailway2vCPU && (
                          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0 font-semibold gap-0.5">
                            ⚡ 2vCPU / 2GB
                          </Badge>
                        )}
                        {node.role === 'master' && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                            Master Engine
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span>{node.specs.vcpuLabel}</span>
                        <span>•</span>
                        <span>{node.specs.ramGb} RAM</span>
                        <span>•</span>
                        <span className="truncate max-w-[140px]" title={node.region}>{node.region}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[11px] font-semibold gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        ONLINE
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleTestNode(node)}
                        disabled={testingNodeId === node.id}
                        title="Tugunni tekshirish / ping"
                      >
                        <Wifi className={`w-3.5 h-3.5 ${testingNodeId === node.id ? 'animate-spin text-primary' : ''}`} />
                      </Button>
                    </div>
                  </div>

                  {/* CPU & RAM Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* CPU Box */}
                    <div className="rounded-lg bg-black/20 border border-white/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                          CPU Bandligi
                        </span>
                        <span className={`text-base font-bold font-mono ${
                          node.metrics.cpuPercent > 80 ? 'text-rose-400' : (node.metrics.cpuPercent > 60 ? 'text-amber-400' : 'text-emerald-400')
                        }`}>
                          {node.metrics.cpuPercent}%
                        </span>
                      </div>

                      {/* Sparkline mini chart for CPU */}
                      <MiniSparkline
                        values={cpuHistory}
                        times={timesHistory}
                        color={cpuColor}
                        label="CPU"
                        unit="%"
                        height={38}
                      />

                      {/* Progress Bar */}
                      <div className="w-full h-1 bg-muted/40 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 rounded-full ${
                            node.metrics.cpuPercent > 80 ? 'bg-rose-500' : (node.metrics.cpuPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500')
                          }`}
                          style={{ width: `${Math.min(100, Math.max(3, node.metrics.cpuPercent))}%` }}
                        />
                      </div>
                    </div>

                    {/* RAM Box */}
                    <div className="rounded-lg bg-black/20 border border-white/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                          RAM Ishlatilishi
                        </span>
                        <div className="text-right">
                          <span className="text-base font-bold font-mono text-cyan-400">
                            {node.metrics.ramPercent}%
                          </span>
                        </div>
                      </div>

                      {/* Sparkline mini chart for RAM */}
                      <MiniSparkline
                        values={ramHistory}
                        times={timesHistory}
                        color={ramColor}
                        label="RAM"
                        unit="%"
                        height={38}
                      />

                      {/* Progress Bar & MB Label */}
                      <div className="space-y-1">
                        <div className="w-full h-1 bg-muted/40 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-cyan-500 transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(3, node.metrics.ramPercent))}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                          <span>{node.metrics.ramUsedMb} MB</span>
                          <span>{node.metrics.ramTotalMb} MB</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Node Sub-Footer Status */}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t border-border/30">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        Ping: <span className="text-foreground font-semibold">{node.metrics.latencyMs}ms</span>
                      </span>
                      <span className="flex items-center gap-1">
                        Yuklama vazni: <span className="font-semibold text-foreground">{node.weight}x</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={node.metrics.activeBots > 0 ? "text-emerald-400 font-medium" : "text-muted-foreground/80 font-normal"}>
                        {node.metrics.activeBots > 0 ? `${node.metrics.activeBots} ta bot yo'naltirilgan` : "Bo'sh (0 ta bot)"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase tracking-wider font-semibold border-b border-border/60">
                <tr>
                  <th className="py-2.5 px-3">Tugun</th>
                  <th className="py-2.5 px-3">Texnologiya</th>
                  <th className="py-2.5 px-3">Quvvat (vCPU / RAM)</th>
                  <th className="py-2.5 px-3 w-40">CPU Bandligi</th>
                  <th className="py-2.5 px-3 w-40">RAM Ishlatilishi</th>
                  <th className="py-2.5 px-3">Ping</th>
                  <th className="py-2.5 px-3 text-right">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredNodes.map(node => (
                  <tr key={node.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{node.flag}</span>
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-1">
                            {node.name}
                            {node.role === 'master' && (
                              <span className="text-[10px] text-primary font-mono">(Master)</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{node.region}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-muted-foreground font-mono">
                      {node.technology}
                    </td>
                    <td className="py-3 px-3 font-mono font-medium">
                      {node.specs.vcpuLabel} / {node.specs.ramGb}
                    </td>
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="font-bold text-emerald-400">{node.metrics.cpuPercent}%</span>
                          <span className="text-muted-foreground text-[10px]">{node.specs.vcpuLabel}</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(4, node.metrics.cpuPercent))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="font-bold text-cyan-400">{node.metrics.ramPercent}%</span>
                          <span className="text-muted-foreground text-[10px]">{node.metrics.ramUsedMb}MB</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(4, node.metrics.ramPercent))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <span className="text-foreground font-medium">{node.metrics.latencyMs} ms</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-semibold">
                        ONLINE
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
