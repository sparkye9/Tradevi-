'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle,
  CheckCircle, XCircle, Clock, Zap, RefreshCw,
  ShieldAlert, BookOpen, Bell, Target, BarChart2,
  Minus, Info, Lock, ChevronRight,
} from 'lucide-react';
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MNQData {
  success: boolean;
  error?: string;
  nq:  { price: number; change: number; changePct: number; high?: number; low?: number } | null;
  es:  { price: number; change: number; changePct: number } | null;
  vix: { price: number; change: number; changePct: number } | null;
  qqq: { price: number; change: number; changePct: number } | null;
  mnqPrice: number;
  orb: {
    high: number; low: number; mid: number; range: number; timeframe: number;
    status: 'above' | 'below' | 'inside';
    t1Up: number; t2Up: number; t3Up: number;
    t1Dn: number; t2Dn: number; t3Dn: number;
  };
  vwap: number; ema9: number | null; ema21: number | null; ema50: number | null;
  rsi: number | null; atr: number;
  bias: 'bullish' | 'bearish' | 'neutral'; biasScore: number;
  biasFactors: { label: string; signal: 'bullish' | 'bearish' | 'neutral'; detail: string; pts: number }[];
  tradeScore: number; tradeGrade: 'A+' | 'A' | 'B' | 'C' | 'AVOID' | 'CHOP';
  gradeLabel: string; isChop: boolean; chopReasons: string[];
  regime: string;
  regimeDetail: {
    type: string; label: string; color: string;
    approach: string; avoid: string; badges: string[];
  } | null;
  session: {
    id: string; label: string; emoji: string; shouldAvoid: boolean; avoidReason: string | null;
    color: string; etMinutes: number; minutesRemaining: number;
    sessionHigh: number; sessionLow: number; sessionRange: number;
    character: string; badge: string; priceVsSessionVwap: string; candleCount: number;
  } | null;
  liquidity: {
    overnightHigh: number; overnightLow: number;
    asiaHigh: number | null; asiaLow: number | null;
    londonHigh: number | null; londonLow: number | null;
    sweeps: { label: string; level: number; direction: 'up' | 'down'; status: 'reclaimed' | 'rejected' | 'unresolved'; sweepTime: string }[];
    nearestLevel: string | null;
  } | null;
  noTrade: { active: boolean; score: number; reasons: string[] } | null;
  internals: {
    dxy:  { price: number; changePct: number; interpretation: string } | null;
    tnx:  { price: number; changePct: number; interpretation: string } | null;
    nvda: { price: number; changePct: number; interpretation: string } | null;
  } | null;
  risk: {
    stopPts: number; t1Pts: number; t2Pts: number; t3Pts: number;
    stopDir: number; t1: number; t2: number; t3: number;
    mnqPerStop: number; rr1: string; rr2: string;
  };
  aiSummary: string; aiEntry: string; aiInvalidation: string;
  aiTargets: string; aiWarnings: string[];
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  dataSource: string; fetchedAt: string;
}

interface HTFData {
  success: boolean;
  timeframes: {
    label: string; bias: 'bullish' | 'bearish' | 'neutral';
    ema9: number | null; ema21: number | null; ema50: number | null;
    alignment: string; priceVsEma21: 'above' | 'below';
    trendStrength: string; score: number;
  }[];
  alignmentScore: number; alignmentLabel: string;
  tradingBias: 'bullish' | 'bearish' | 'neutral'; recommendation: string;
}

interface SessionState {
  tradesCount: number; dailyPnL: number; stopped: boolean; stopReason: string;
  checklist: Record<string, boolean>; notes: string;
  emotionalState: 'calm' | 'anxious' | 'frustrated' | 'excited' | 'confident';
  trades: { time: string; direction: 'long' | 'short'; result: 'win' | 'loss' | 'scratch'; pnl: number; notes: string }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TIMEFRAMES = [1, 5, 10, 15, 30] as const;
type TF = typeof TIMEFRAMES[number];

const CHECKLIST = [
  { id: 'htf',     label: 'HTF bias aligned with trade direction',   critical: true  },
  { id: 'orb',     label: 'ORB broken with close confirmation',      critical: true  },
  { id: 'vwap',    label: 'Price on correct side of VWAP',           critical: true  },
  { id: 'volume',  label: 'Volume expanding on the move',            critical: true  },
  { id: 'rr',      label: 'R:R >= 1:2 confirmed before entry',      critical: true  },
  { id: 'stop',    label: 'Stop loss level defined and sized',       critical: false },
  { id: 'chop',    label: 'NOT in chop / lunch / no-trade zone',    critical: false },
  { id: 'revenge', label: 'NOT a revenge trade after a loss',       critical: false },
  { id: 'emotion', label: 'Emotional state is calm and focused',    critical: false },
  { id: 'limit',   label: 'Within daily trade/loss limits',         critical: false },
];

const DAILY_RULES = [
  'Max 3 trades per session — quality over frequency',
  'No trading during lunch (12–2 PM ET)',
  'Stop after 2 consecutive losses — walk away',
  'Never risk more than 1% of account per trade',
  'No trades in the first 5 minutes after RTH open',
  'Journal every trade before opening the next',
  'The best traders sit on their hands most of the day',
];

const EMOTIONAL_STATES: { id: SessionState['emotionalState']; label: string; color: string; description: string }[] = [
  { id: 'calm',       label: 'Calm',       color: 'emerald', description: 'Ideal state' },
  { id: 'confident',  label: 'Confident',  color: 'blue',    description: 'Good — stay humble' },
  { id: 'excited',    label: 'Excited',    color: 'amber',   description: 'Caution — overtrading risk' },
  { id: 'anxious',    label: 'Anxious',    color: 'amber',   description: 'Reduce size' },
  { id: 'frustrated', label: 'Frustrated', color: 'red',     description: 'Stop trading now' },
];

const ECONOMIC_EVENTS = [
  { name: 'Jobless Claims',   dayOfWeek: 4, recurring: 'weekly',   riskLevel: 'MEDIUM' as const, description: 'Every Thursday, 8:30 AM ET' },
  { name: 'CPI Release',      dayOfWeek: 2, recurring: 'monthly',  riskLevel: 'HIGH'   as const, description: '2nd or 3rd Tue/Wed of month, 8:30 AM ET' },
  { name: 'NFP',              dayOfWeek: 5, recurring: 'monthly',  riskLevel: 'HIGH'   as const, description: 'First Friday of month, 8:30 AM ET' },
  { name: 'PCE Inflation',    dayOfWeek: 5, recurring: 'monthly',  riskLevel: 'HIGH'   as const, description: 'Last Friday of month, 8:30 AM ET' },
  { name: 'GDP Release',      dayOfWeek: null, recurring: 'quarterly', riskLevel: 'HIGH' as const, description: 'Quarterly, 8:30 AM ET' },
  { name: 'ISM Manufacturing',dayOfWeek: null, recurring: 'monthly',  riskLevel: 'MEDIUM' as const, description: 'First business day of month, 10:00 AM ET' },
  { name: 'FOMC Decision',    dayOfWeek: null, recurring: 'bimonthly',riskLevel: 'HIGH'   as const, description: 'Check FOMC calendar — 2:00 PM ET' },
  { name: 'Fed Speaker',      dayOfWeek: null, recurring: 'irregular',riskLevel: 'MEDIUM' as const, description: 'Variable schedule — check FOMC calendar' },
];

// ─── Color helpers ─────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n >= 0 ? `+${n.toFixed(d)}` : n.toFixed(d);
}

function pctColor(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
}

function signalColor(s: 'bullish' | 'bearish' | 'neutral') {
  return s === 'bullish' ? 'text-emerald-400' : s === 'bearish' ? 'text-red-400' : 'text-gray-400';
}

function biasColor(b: 'bullish' | 'bearish' | 'neutral') {
  return b === 'bullish' ? 'text-emerald-400' : b === 'bearish' ? 'text-red-400' : 'text-gray-400';
}

function gradeTextColor(g: string) {
  if (g === 'A+') return 'text-emerald-400';
  if (g === 'A')  return 'text-emerald-300';
  if (g === 'B')  return 'text-yellow-400';
  if (g === 'C')  return 'text-orange-400';
  return 'text-red-400';
}

function regimeColorClass(color: string) {
  if (color === 'emerald') return { text: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800' };
  if (color === 'amber')   return { text: 'text-amber-400',   bg: 'bg-amber-950/40',   border: 'border-amber-800' };
  if (color === 'blue')    return { text: 'text-blue-400',    bg: 'bg-blue-950/40',    border: 'border-blue-800' };
  if (color === 'red')     return { text: 'text-red-400',     bg: 'bg-red-950/40',     border: 'border-red-800' };
  if (color === 'purple')  return { text: 'text-purple-400',  bg: 'bg-purple-950/40',  border: 'border-purple-800' };
  return { text: 'text-gray-400', bg: 'bg-gray-800/40', border: 'border-gray-700' };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DarkCard({ children, className = '', accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${accent ? `border-l-2 ${accent}` : ''} ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-gray-300 font-semibold text-sm">
        <span className="text-purple-400">{icon}</span>
        {title}
      </div>
      {right}
    </div>
  );
}

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-950 text-emerald-400 border-emerald-700',
    red:     'bg-red-950 text-red-400 border-red-700',
    amber:   'bg-amber-950 text-amber-400 border-amber-700',
    blue:    'bg-blue-950 text-blue-400 border-blue-700',
    purple:  'bg-purple-950 text-purple-400 border-purple-700',
    gray:    'bg-gray-800 text-gray-400 border-gray-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
}

function RsiBar({ rsi }: { rsi: number | null }) {
  if (rsi == null) return <span className="text-gray-500">—</span>;
  const color = rsi > 70 ? 'bg-red-500' : rsi < 30 ? 'bg-emerald-500' : rsi > 55 ? 'bg-emerald-700' : rsi < 45 ? 'bg-red-700' : 'bg-gray-600';
  const zone  = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : rsi > 55 ? 'Bullish' : rsi < 45 ? 'Bearish' : 'Neutral';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{rsi.toFixed(1)}</span><span className="text-gray-500">{zone}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${rsi}%` }} />
      </div>
    </div>
  );
}

// ─── Countdown to next Thursday (Jobless Claims) ──────────────────────────────

function useThursdayCountdown() {
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    function calc() {
      const now = new Date();
      const d = now.getDay(); // 0=Sun, 4=Thu
      const daysUntil = (4 - d + 7) % 7 || 7;
      const next = new Date(now);
      next.setDate(now.getDate() + daysUntil);
      next.setHours(8, 30, 0, 0); // 8:30 AM local (approx ET)
      const diffMs = next.getTime() - now.getTime();
      if (diffMs < 0) { setCountdown('Released'); return; }
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      setCountdown(h > 48 ? `${Math.ceil(h / 24)}d` : h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    calc();
    const t = setInterval(calc, 60000);
    return () => clearInterval(t);
  }, []);
  return countdown;
}

// ─── Chart ────────────────────────────────────────────────────────────────────

// Per-candle EMA (simple inline, not using lib)
function buildEMALine(closes: number[], period: number): (number | null)[] {
  if (closes.length < period) return closes.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(closes.length).fill(null);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

function MNQChart({ data, orb, vwap, ema9, ema21, liquidity }: {
  data: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  orb: MNQData['orb'];
  vwap: number;
  ema9: number | null;
  ema21: number | null;
  liquidity: MNQData['liquidity'];
}) {
  const closes = data.map(c => c.close);
  const ema9Line  = buildEMALine(closes, 9);
  const ema21Line = buildEMALine(closes, 21);

  const chartData = data.map((c, i) => ({
    t: new Date(c.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    close: c.close,
    volume: c.volume / 1000,
    vwap,
    ema9:  ema9Line[i],
    ema21: ema21Line[i],
  }));

  const prices = data.map(d => d.close);
  const minP = Math.min(...prices) - 15;
  const maxP = Math.max(...prices) + 15;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#6b7280' }} interval={11} />
        <YAxis yAxisId="price" domain={[minP, maxP]} tick={{ fontSize: 9, fill: '#6b7280' }}
          tickFormatter={v => v.toFixed(0)} width={60} />
        <YAxis yAxisId="vol" orientation="right" tick={false} width={0} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#e5e7eb' }}
          formatter={(v: unknown, name: string): [string, string] => [
            typeof v === 'number'
              ? name === 'volume' ? `${(v as number).toFixed(0)}K` : (v as number).toFixed(2)
              : String(v),
            name,
          ]}
        />

        {/* ORB zone */}
        <ReferenceArea yAxisId="price" y1={orb.low} y2={orb.high} fill="#7c3aed" fillOpacity={0.05} />

        {/* Liquidity levels */}
        {liquidity != null && liquidity.overnightHigh > 0 && (
          <ReferenceLine yAxisId="price" y={liquidity.overnightHigh} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1}
            label={{ value: `ONH ${liquidity.overnightHigh.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#f59e0b' }} />
        )}
        {liquidity != null && liquidity.overnightLow > 0 && (
          <ReferenceLine yAxisId="price" y={liquidity.overnightLow} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1}
            label={{ value: `ONL ${liquidity.overnightLow.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#f59e0b' }} />
        )}
        {liquidity != null && liquidity.asiaHigh != null && (
          <ReferenceLine yAxisId="price" y={liquidity.asiaHigh} stroke="#60a5fa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `AsiaH ${liquidity.asiaHigh.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#60a5fa' }} />
        )}
        {liquidity != null && liquidity.asiaLow != null && (
          <ReferenceLine yAxisId="price" y={liquidity.asiaLow} stroke="#60a5fa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `AsiaL ${liquidity.asiaLow.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#60a5fa' }} />
        )}
        {liquidity != null && liquidity.londonHigh != null && (
          <ReferenceLine yAxisId="price" y={liquidity.londonHigh} stroke="#a78bfa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `LdnH ${liquidity.londonHigh.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#a78bfa' }} />
        )}
        {liquidity != null && liquidity.londonLow != null && (
          <ReferenceLine yAxisId="price" y={liquidity.londonLow} stroke="#a78bfa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `LdnL ${liquidity.londonLow.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#a78bfa' }} />
        )}

        {/* ORB lines */}
        <ReferenceLine yAxisId="price" y={orb.high} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `ORB H ${orb.high.toFixed(0)}`, position: 'insideTopRight', fontSize: 9, fill: '#10b981' }} />
        <ReferenceLine yAxisId="price" y={orb.low} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `ORB L ${orb.low.toFixed(0)}`, position: 'insideBottomRight', fontSize: 9, fill: '#ef4444' }} />
        <ReferenceLine yAxisId="price" y={vwap} stroke="#a78bfa" strokeDasharray="6 3" strokeWidth={1.5}
          label={{ value: `VWAP ${vwap.toFixed(0)}`, position: 'right', fontSize: 9, fill: '#a78bfa' }} />

        {/* Volume bars */}
        <Bar yAxisId="vol" dataKey="volume" fill="#374151" opacity={0.5} radius={[1, 1, 0, 0]} />

        {/* Price area */}
        <Area yAxisId="price" type="monotone" dataKey="close" stroke="#6366f1" fill="#6366f115"
          strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#818cf8' }} />

        {/* EMA lines */}
        <Line yAxisId="price" type="monotone" dataKey="ema9"  stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
        <Line yAxisId="price" type="monotone" dataKey="ema21" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── HTF Panel ────────────────────────────────────────────────────────────────

function HTFPanel() {
  const [htf, setHtf]     = useState<HTFData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await window.fetch('/api/htf');
      const json: HTFData = await res.json();
      if (json.success) setHtf(json);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !htf) {
    return (
      <DarkCard accent="border-l-blue-700">
        <SectionTitle icon={<BarChart2 size={15} />} title="HTF Alignment" />
        <div className="space-y-2">
          {['Daily', '1 Hour', '15 Min'].map(l => (
            <div key={l} className="h-10 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </DarkCard>
    );
  }

  if (!htf) {
    return (
      <DarkCard accent="border-l-gray-700">
        <SectionTitle icon={<BarChart2 size={15} />} title="HTF Alignment"
          right={<button onClick={load} className="text-xs text-purple-400 hover:text-purple-300">Load</button>} />
        <p className="text-gray-600 text-xs text-center py-4">HTF data not loaded</p>
      </DarkCard>
    );
  }

  const biasColors = { bullish: 'emerald', bearish: 'red', neutral: 'gray' };

  return (
    <DarkCard accent={htf.tradingBias === 'bullish' ? 'border-l-emerald-700' : htf.tradingBias === 'bearish' ? 'border-l-red-700' : 'border-l-gray-700'}>
      <SectionTitle icon={<BarChart2 size={15} />} title="HTF Alignment"
        right={<button onClick={load} className="text-xs text-gray-500 hover:text-gray-300"><RefreshCw size={11} /></button>} />

      {/* Alignment Label */}
      <div className={`mb-3 px-3 py-2 rounded-lg text-center ${htf.tradingBias === 'bullish' ? 'bg-emerald-950/50 border border-emerald-800' : htf.tradingBias === 'bearish' ? 'bg-red-950/50 border border-red-800' : 'bg-gray-800/50 border border-gray-700'}`}>
        <p className={`font-black text-sm ${biasColor(htf.tradingBias)}`}>{htf.alignmentLabel}</p>
        <p className="text-gray-500 text-xs">{htf.alignmentScore}/100</p>
      </div>

      {/* Timeframe rows */}
      <div className="space-y-2 mb-3">
        {htf.timeframes.map(tf => (
          <div key={tf.label} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
            <span className="text-gray-400 text-xs font-medium w-14">{tf.label}</span>
            <Badge color={biasColors[tf.bias]}>{tf.bias.toUpperCase()}</Badge>
            <span className="text-gray-500 text-xs">{tf.score}/100</span>
            <span className={`text-xs ${tf.priceVsEma21 === 'above' ? 'text-emerald-500' : 'text-red-500'}`}>
              {tf.priceVsEma21 === 'above' ? '↑ EMA21' : '↓ EMA21'}
            </span>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <p className="text-xs text-gray-400 leading-relaxed">{htf.recommendation}</p>
    </DarkCard>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function MNQDashboard() {
  const [timeframe, setTimeframe] = useState<TF>(5);
  const [data, setData]           = useState<MNQData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [maxTrades, setMaxTrades]     = useState(3);
  const [maxDailyLoss, setMaxDailyLoss] = useState(200);
  const [accountSize, setAccountSize]   = useState(10000);
  const [overrideNoTrade, setOverrideNoTrade] = useState(false);
  const [overrideHoldMs, setOverrideHoldMs]   = useState(0);
  const overrideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thursdayCountdown = useThursdayCountdown();

  const [session, setSession] = useState<SessionState>(() => {
    if (typeof window === 'undefined') return {
      tradesCount: 0, dailyPnL: 0, stopped: false, stopReason: '',
      checklist: {}, notes: '', emotionalState: 'calm', trades: [],
    };
    const today = new Date().toDateString();
    const saved = localStorage.getItem('mnq-session-v2');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.date === today) return p;
      } catch { /* ignore */ }
    }
    return { tradesCount: 0, dailyPnL: 0, stopped: false, stopReason: '', checklist: {}, notes: '', emotionalState: 'calm', trades: [] };
  });

  const saveSession = useCallback((s: SessionState) => {
    setSession(s);
    localStorage.setItem('mnq-session-v2', JSON.stringify({ ...s, date: new Date().toDateString() }));
  }, []);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await window.fetch(`/api/mnq?timeframe=${timeframe}`);
      const json: MNQData = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Analysis failed');
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [timeframe]);

  useEffect(() => {
    if (autoRefresh) {
      doFetch();
      timerRef.current = setInterval(doFetch, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, doFetch]);

  const toggleChecklist = (id: string) => {
    saveSession({ ...session, checklist: { ...session.checklist, [id]: !session.checklist[id] } });
  };

  const checkedCount    = CHECKLIST.filter(i => session.checklist[i.id]).length;
  const criticalChecked = CHECKLIST.filter(i => i.critical && session.checklist[i.id]).length;
  const criticalTotal   = CHECKLIST.filter(i => i.critical).length;
  const checklistPct    = Math.round((checkedCount / CHECKLIST.length) * 100);
  const criticalOk      = criticalChecked === criticalTotal;

  const isRiskSafe =
    !session.stopped &&
    session.tradesCount < maxTrades &&
    session.dailyPnL > -Math.abs(maxDailyLoss);

  // Override button: hold 3 seconds
  const startOverrideHold = () => {
    setOverrideHoldMs(0);
    if (overrideTimerRef.current) clearInterval(overrideTimerRef.current);
    overrideTimerRef.current = setInterval(() => {
      setOverrideHoldMs(prev => {
        if (prev >= 3000) {
          clearInterval(overrideTimerRef.current!);
          setOverrideNoTrade(true);
          return 3000;
        }
        return prev + 100;
      });
    }, 100);
  };
  const cancelOverrideHold = () => {
    if (overrideTimerRef.current) clearInterval(overrideTimerRef.current);
    setOverrideHoldMs(0);
  };

  const noTradeActive = data?.noTrade?.active && !overrideNoTrade;

  const BiasIcon = data?.bias === 'bullish' ? TrendingUp : data?.bias === 'bearish' ? TrendingDown : Minus;
  const biasBg   =
    data?.bias === 'bullish' ? 'bg-emerald-950/20 border-emerald-800' :
    data?.bias === 'bearish' ? 'bg-red-950/20 border-red-900' :
    'bg-gray-900 border-gray-800';

  const emotionalState = EMOTIONAL_STATES.find(e => e.id === session.emotionalState) ?? EMOTIONAL_STATES[0];

  return (
    <AppShell title="MNQ / NQ Futures Dashboard">
      <div className="-m-4 lg:-m-6 bg-gray-950 min-h-screen p-4 lg:p-5">

        {/* ── ROW 0: SESSION BANNER ─────────────────────────────────────── */}
        {data?.session && (
          <div className={`mb-3 rounded-xl border px-4 py-3 ${
            data.session.shouldAvoid
              ? 'bg-amber-950/40 border-amber-700'
              : data.session.color === 'emerald'
              ? 'bg-emerald-950/30 border-emerald-800'
              : data.session.color === 'blue'
              ? 'bg-blue-950/30 border-blue-800'
              : data.session.color === 'purple'
              ? 'bg-purple-950/30 border-purple-800'
              : 'bg-gray-900 border-gray-800'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{data.session.emoji}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-100 text-base">{data.session.label}</span>
                    <Badge color={data.session.color === 'emerald' ? 'emerald' : data.session.color === 'blue' ? 'blue' : data.session.color === 'purple' ? 'purple' : data.session.color === 'amber' ? 'amber' : 'gray'}>
                      {data.session.badge}
                    </Badge>
                  </div>
                  {data.session.shouldAvoid && (
                    <p className="text-xs text-amber-400 mt-0.5">{data.session.avoidReason}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-center">
                  <p className="text-gray-500">Time Left</p>
                  <p className="font-bold text-gray-200">{data.session.minutesRemaining}m</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Session H</p>
                  <p className="font-bold text-emerald-400">{data.session.sessionHigh.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Session L</p>
                  <p className="font-bold text-red-400">{data.session.sessionLow.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Range</p>
                  <p className="font-bold text-gray-300">{data.session.sessionRange.toFixed(0)}pts</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ROW 1: NO-TRADE FILTER ────────────────────────────────────── */}
        {noTradeActive && data?.noTrade && (
          <div className="mb-3 bg-red-950/80 border border-red-600 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-black text-red-300 text-base mb-1">NO-TRADE ZONE ACTIVE — STAND ASIDE</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {data.noTrade.reasons.map((r, i) => (
                    <span key={i} className="bg-red-900/50 text-red-300 border border-red-700 text-xs px-2 py-0.5 rounded">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 bg-red-900 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${data.noTrade.score}%` }} />
                  </div>
                  <span className="text-red-400 text-xs font-bold">{data.noTrade.score}/100</span>
                </div>
              </div>
              <div className="text-right">
                <button
                  onMouseDown={startOverrideHold}
                  onMouseUp={cancelOverrideHold}
                  onMouseLeave={cancelOverrideHold}
                  onTouchStart={startOverrideHold}
                  onTouchEnd={cancelOverrideHold}
                  className="relative text-xs text-red-500 border border-red-700 rounded-lg px-3 py-1.5 overflow-hidden select-none"
                >
                  <div className="absolute inset-0 bg-red-700/30" style={{ width: `${(overrideHoldMs / 3000) * 100}%` }} />
                  <span className="relative">Hold to Override</span>
                </button>
                <p className="text-xs text-red-700 mt-1">Hold 3s to override</p>
              </div>
            </div>
          </div>
        )}

        {/* ── SESSION STOPPED BANNER ────────────────────────────────────── */}
        {session.stopped && (
          <div className="mb-3 flex items-center gap-3 bg-red-950 border border-red-700 rounded-xl p-3 text-red-300">
            <Lock size={16} className="shrink-0" />
            <div>
              <p className="font-bold text-sm">TRADING LOCKED FOR TODAY</p>
              <p className="text-xs text-red-400 mt-0.5">{session.stopReason}</p>
            </div>
            <button onClick={() => saveSession({ ...session, stopped: false, stopReason: '' })}
              className="ml-auto text-xs text-red-400 hover:text-red-200 underline">Unlock</button>
          </div>
        )}

        {/* ── ROW 2: CONTROLS ROW ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    timeframe === tf
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-purple-500 hover:text-purple-300'
                  }`}>
                  {tf}m
                </button>
              ))}
            </div>
            <button onClick={doFetch} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Analyze
            </button>
            <button onClick={() => setAutoRefresh(a => !a)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                autoRefresh ? 'bg-emerald-900/40 border-emerald-700 text-emerald-400' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
              <Zap size={12} /> {autoRefresh ? 'Live ON' : 'Auto'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-xs text-gray-600">Updated {lastUpdated}</span>}
            {data && (
              <span className={`text-xs px-2 py-0.5 rounded border ${
                data.dataSource === 'twelve_data'
                  ? 'text-emerald-400 border-emerald-800 bg-emerald-950/30'
                  : 'text-yellow-400 border-yellow-800 bg-yellow-950/30'
              }`}>
                {data.dataSource === 'twelve_data' ? '⚡ Live' : '⏱ Delayed'}
              </span>
            )}
          </div>
        </div>

        {/* ── ERROR ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-950 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
            <XCircle size={14} />{error}
          </div>
        )}

        {/* ── EMPTY STATE ─────────────────────────────────────────────── */}
        {!data && !loading && !error && (
          <div className="text-center py-24">
            <BarChart2 size={52} className="text-purple-800 mx-auto mb-4" />
            <p className="text-gray-300 font-semibold text-lg">Select a timeframe and click Analyze</p>
            <p className="text-gray-600 text-sm mt-2">Fetches live NQ futures data · bias engine · ORB · session · liquidity</p>
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-24">
            <div className="w-10 h-10 border-[3px] border-purple-800 border-t-purple-400 rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-4">Fetching NQ futures data…</p>
          </div>
        )}

        {data && (
          <div className="space-y-4">

            {/* ── ROW 3: TICKER STRIP ───────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              {data.nq && (
                <div className="flex flex-col items-center px-4 py-2 rounded-xl border bg-purple-900/20 border-purple-700">
                  <span className="text-xs text-gray-400 font-medium">NQ / MNQ</span>
                  <span className="text-xl font-black text-gray-100">{data.nq.price.toLocaleString()}</span>
                  <span className={`text-xs font-semibold ${pctColor(data.nq.changePct)}`}>{fmt(data.nq.changePct, 2)}%</span>
                </div>
              )}
              {[
                { label: 'ES', q: data.es },
                { label: 'VIX', q: data.vix },
                { label: 'QQQ', q: data.qqq },
              ].map(({ label, q }) => q ? (
                <div key={label} className="flex flex-col items-center px-3 py-2 rounded-xl border bg-gray-900 border-gray-800">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-base font-bold text-gray-100">{q.price.toLocaleString()}</span>
                  <span className={`text-xs font-semibold ${pctColor(q.changePct)}`}>{fmt(q.changePct, 2)}%</span>
                </div>
              ) : null)}
              {data.internals?.dxy && (
                <div className="flex flex-col items-center px-3 py-2 rounded-xl border bg-gray-900 border-gray-800">
                  <span className="text-xs text-gray-400">DXY</span>
                  <span className="text-base font-bold text-gray-100">{data.internals.dxy.price.toFixed(2)}</span>
                  <span className={`text-xs font-semibold ${pctColor(data.internals.dxy.changePct)}`}>{fmt(data.internals.dxy.changePct, 2)}%</span>
                </div>
              )}
              {data.internals?.nvda && (
                <div className="flex flex-col items-center px-3 py-2 rounded-xl border bg-gray-900 border-gray-800">
                  <span className="text-xs text-gray-400">NVDA</span>
                  <span className="text-base font-bold text-gray-100">{data.internals.nvda.price.toFixed(2)}</span>
                  <span className={`text-xs font-semibold ${pctColor(data.internals.nvda.changePct)}`}>{fmt(data.internals.nvda.changePct, 2)}%</span>
                </div>
              )}
            </div>

            {/* ── ROW 4: REGIME · BIAS · TRADE SCORE ───────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* REGIME DETECTION */}
              {data.regimeDetail ? (() => {
                const rc = regimeColorClass(data.regimeDetail.color);
                return (
                  <DarkCard accent={`border-l-${data.regimeDetail.color === 'emerald' ? 'emerald' : data.regimeDetail.color === 'amber' ? 'amber' : data.regimeDetail.color === 'blue' ? 'blue' : 'gray'}-700`}>
                    <SectionTitle icon={<Activity size={15} />} title="Regime Detection" />
                    <div className={`rounded-lg px-3 py-2 mb-3 border ${rc.bg} ${rc.border}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-black text-lg ${rc.text}`}>{data.regimeDetail.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {data.regimeDetail.badges.map(b => (
                          <Badge key={b} color={data.regimeDetail!.color === 'emerald' ? 'emerald' : data.regimeDetail!.color === 'amber' ? 'amber' : data.regimeDetail!.color === 'blue' ? 'blue' : 'gray'}>{b}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-gray-500 font-semibold uppercase tracking-wide mb-0.5">Approach</p>
                        <p className="text-gray-300">{data.regimeDetail.approach}</p>
                      </div>
                      <div>
                        <p className="text-red-500 font-semibold uppercase tracking-wide mb-0.5">Avoid</p>
                        <p className="text-gray-400">{data.regimeDetail.avoid}</p>
                      </div>
                    </div>
                  </DarkCard>
                );
              })() : (
                <DarkCard>
                  <SectionTitle icon={<Activity size={15} />} title="Regime Detection" />
                  <div className="bg-gray-800 rounded-lg px-3 py-2 text-gray-400 text-sm">
                    {data.regime.replace(/_/g, ' ').toUpperCase()}
                  </div>
                </DarkCard>
              )}

              {/* BIAS ENGINE */}
              <DarkCard className={`border ${biasBg}`}>
                <SectionTitle icon={<TrendingUp size={15} />} title="Bias Engine" />
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-3 rounded-xl ${data.bias === 'bullish' ? 'bg-emerald-900/40' : data.bias === 'bearish' ? 'bg-red-900/40' : 'bg-gray-800'}`}>
                    <BiasIcon size={24} className={biasColor(data.bias)} />
                  </div>
                  <div>
                    <p className={`font-black text-2xl ${biasColor(data.bias)}`}>{data.bias.toUpperCase()}</p>
                    <p className="text-gray-400 text-xs">{data.biasScore}/100</p>
                  </div>
                  <div className="ml-auto">
                    <div className="w-14 h-14 relative">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2937" strokeWidth="3" />
                        <circle cx="18" cy="18" r="14" fill="none"
                          stroke={data.bias === 'bullish' ? '#10b981' : data.bias === 'bearish' ? '#ef4444' : '#6b7280'}
                          strokeWidth="3" strokeDasharray={`${(data.biasScore / 100) * 88} 88`} strokeLinecap="round" />
                      </svg>
                      <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${biasColor(data.bias)}`}>
                        {data.biasScore}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  {data.biasFactors.map(f => (
                    <div key={f.label} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 w-20">{f.label}</span>
                      <span className={`${signalColor(f.signal)} font-medium w-16 text-right`}>{f.detail}</span>
                      <span className={`${f.pts > 10 ? 'text-emerald-500' : f.pts < 7 ? 'text-red-500' : 'text-gray-500'} w-8 text-right font-mono`}>
                        {f.pts}pt
                      </span>
                    </div>
                  ))}
                </div>
              </DarkCard>

              {/* TRADE QUALITY SCORE */}
              <DarkCard>
                <SectionTitle icon={<Zap size={15} />} title="Trade Quality" />
                <div className="text-center mb-3">
                  <span className={`text-6xl font-black ${gradeTextColor(data.tradeGrade)}`}>
                    {data.tradeGrade}
                  </span>
                  <div className={`text-3xl font-black ${gradeTextColor(data.tradeGrade)} mt-1`}>
                    {data.tradeScore}/100
                  </div>
                  <p className="text-gray-400 text-xs mt-1">{data.gradeLabel}</p>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${
                    data.tradeScore >= 85 ? 'bg-emerald-500' : data.tradeScore >= 70 ? 'bg-emerald-700' :
                    data.tradeScore >= 55 ? 'bg-yellow-500' : data.tradeScore >= 40 ? 'bg-orange-500' : 'bg-red-600'
                  }`} style={{ width: `${data.tradeScore}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-gray-500">VWAP</p>
                    <p className={`font-bold ${data.mnqPrice >= data.vwap ? 'text-emerald-400' : 'text-red-400'}`}>
                      {data.vwap.toFixed(0)} {data.mnqPrice >= data.vwap ? '↑' : '↓'}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-gray-500">EMA 9/21</p>
                    <p className="font-bold text-indigo-400">
                      {data.ema9?.toFixed(0) ?? '—'} / {data.ema21?.toFixed(0) ?? '—'}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2 col-span-2">
                    <p className="text-gray-500 mb-1">RSI (14)</p>
                    <RsiBar rsi={data.rsi} />
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-gray-500">ATR</p>
                    <p className={`font-bold ${data.atr >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>{data.atr.toFixed(1)} pts</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-gray-500">ORB</p>
                    <p className={`font-bold text-xs ${data.orb.status === 'above' ? 'text-emerald-400' : data.orb.status === 'below' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {data.orb.status === 'above' ? '▲ ABOVE' : data.orb.status === 'below' ? '▼ BELOW' : '◆ INSIDE'}
                    </p>
                  </div>
                </div>
              </DarkCard>
            </div>

            {/* ── ROW 5: CHART ──────────────────────────────────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<BarChart2 size={15} />}
                title={`NQ Futures — ${data.orb.timeframe}m Chart`}
                right={<span className="text-xs text-gray-600">{data.fetchedAt.slice(11, 19)} UTC</span>}
              />
              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-2">
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-indigo-400 inline-block" /> Price</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-400 inline-block" /> VWAP</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-400 inline-block" /> EMA9</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-blue-400 inline-block" /> EMA21</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500 opacity-60 inline-block border-b border-dashed" /> Overnight H/L</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-blue-400 opacity-60 inline-block border-b border-dashed" /> Asia H/L</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-400 opacity-60 inline-block border-b border-dashed" /> London H/L</span>
              </div>
              <MNQChart
                data={data.candles}
                orb={data.orb}
                vwap={data.vwap}
                ema9={data.ema9}
                ema21={data.ema21}
                liquidity={data.liquidity}
              />
            </DarkCard>

            {/* ── ROW 6: ORB + LIQUIDITY | HTF ──────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* ORB MODULE + LIQUIDITY LEVELS */}
              <DarkCard>
                <SectionTitle icon={<Target size={15} />}
                  title={`ORB — ${data.orb.timeframe}m`}
                  right={
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      data.orb.status === 'above' ? 'text-emerald-400 border-emerald-700 bg-emerald-950' :
                      data.orb.status === 'below' ? 'text-red-400 border-red-700 bg-red-950' :
                      'text-yellow-400 border-yellow-700 bg-yellow-950'
                    }`}>
                      {data.orb.status === 'above' ? '▲ ABOVE HIGH' : data.orb.status === 'below' ? '▼ BELOW LOW' : '◆ INSIDE'}
                    </span>
                  }
                />
                <div className="space-y-1 text-xs mb-4">
                  {[
                    { label: 'T3 Up 2.0×', price: data.orb.t3Up, color: 'text-emerald-300', active: data.mnqPrice >= data.orb.t3Up },
                    { label: 'T2 Up 1.0×', price: data.orb.t2Up, color: 'text-emerald-400', active: data.mnqPrice >= data.orb.t2Up },
                    { label: 'T1 Up 0.5×', price: data.orb.t1Up, color: 'text-emerald-500', active: data.mnqPrice >= data.orb.t1Up },
                    { label: 'ORB HIGH',   price: data.orb.high, color: 'text-emerald-400 font-bold', active: data.mnqPrice >= data.orb.high, border: true },
                  ].map(row => (
                    <div key={row.label} className={`flex justify-between px-2 py-1 rounded ${row.active ? 'bg-emerald-950/40' : ''} ${row.border ? 'border-b border-gray-800 pb-2 mb-1' : ''}`}>
                      <span className={row.color}>{row.label}</span>
                      <span className={row.color}>{row.price.toFixed(0)}</span>
                      <span className="text-gray-500">{row.active ? '✓' : `+${(row.price - data.mnqPrice).toFixed(0)}pt`}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-2 py-1.5 rounded bg-purple-900/30 border border-purple-800">
                    <span className="text-purple-300 font-bold">CURRENT</span>
                    <span className="text-purple-200 font-bold">{data.mnqPrice.toFixed(0)}</span>
                    <span className="text-purple-400 text-xs">NOW</span>
                  </div>
                  <div className="flex justify-between px-2 py-1 rounded bg-gray-800/60">
                    <span className="text-gray-400 font-semibold">ORB MID</span>
                    <span className="text-gray-300">{data.orb.mid.toFixed(0)}</span>
                    <span className={data.mnqPrice >= data.orb.mid ? 'text-emerald-500' : 'text-red-500'}>
                      {data.mnqPrice >= data.orb.mid ? 'Above' : 'Below'}
                    </span>
                  </div>
                  {[
                    { label: 'ORB LOW',    price: data.orb.low,  color: 'text-red-400 font-bold', active: data.mnqPrice <= data.orb.low,  border: true },
                    { label: 'T1 Dn 0.5×', price: data.orb.t1Dn, color: 'text-red-500', active: data.mnqPrice <= data.orb.t1Dn },
                    { label: 'T2 Dn 1.0×', price: data.orb.t2Dn, color: 'text-red-400', active: data.mnqPrice <= data.orb.t2Dn },
                    { label: 'T3 Dn 2.0×', price: data.orb.t3Dn, color: 'text-red-300', active: data.mnqPrice <= data.orb.t3Dn },
                  ].map(row => (
                    <div key={row.label} className={`flex justify-between px-2 py-1 rounded ${row.active ? 'bg-red-950/40' : ''} ${row.border ? 'border-t border-gray-800 pt-2 mt-1' : ''}`}>
                      <span className={row.color}>{row.label}</span>
                      <span className={row.color}>{row.price.toFixed(0)}</span>
                      <span className="text-gray-500">{row.active ? '✓' : `-${(data.mnqPrice - row.price).toFixed(0)}pt`}</span>
                    </div>
                  ))}
                </div>

                {/* Liquidity Levels */}
                {data.liquidity && (
                  <>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Liquidity Levels</p>
                    <div className="space-y-1 text-xs mb-3">
                      {[
                        { label: 'Overnight High', val: data.liquidity.overnightHigh, color: 'text-amber-400' },
                        { label: 'Overnight Low',  val: data.liquidity.overnightLow,  color: 'text-amber-500' },
                        { label: 'Asia High',      val: data.liquidity.asiaHigh,      color: 'text-blue-400' },
                        { label: 'Asia Low',       val: data.liquidity.asiaLow,       color: 'text-blue-500' },
                        { label: 'London High',    val: data.liquidity.londonHigh,    color: 'text-purple-400' },
                        { label: 'London Low',     val: data.liquidity.londonLow,     color: 'text-purple-500' },
                      ].filter(l => l.val != null && l.val > 0).map(l => (
                        <div key={l.label} className="flex justify-between px-2 py-1 rounded bg-gray-800/40">
                          <span className={l.color}>{l.label}</span>
                          <span className={l.color}>{(l.val as number).toFixed(0)}</span>
                          <span className="text-gray-500">{Math.abs((l.val as number) - data.mnqPrice).toFixed(0)}pts</span>
                        </div>
                      ))}
                    </div>

                    {/* Sweeps */}
                    {data.liquidity.sweeps.length > 0 && (
                      <>
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Sweep Events</p>
                        <div className="space-y-1">
                          {data.liquidity.sweeps.map((s, i) => (
                            <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                              s.status === 'reclaimed' ? 'bg-emerald-950/40 text-emerald-400' :
                              s.status === 'rejected'  ? 'bg-red-950/40 text-red-400' :
                              'bg-amber-950/40 text-amber-400'
                            }`}>
                              <span className="font-bold">{s.direction === 'up' ? '↑' : '↓'}</span>
                              <span className="flex-1">{s.label} @ {s.level.toFixed(0)}</span>
                              <span className="font-semibold">{s.status.toUpperCase()}</span>
                              <span className="text-gray-500">{s.sweepTime}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </DarkCard>

              {/* HTF ALIGNMENT */}
              <HTFPanel />
            </div>

            {/* ── ROW 7: AI MENTOR + RISK ENGINE ───────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* AI MENTOR V2 */}
              <DarkCard accent="border-l-purple-700">
                <SectionTitle icon={<Info size={15} />} title="AI Trade Mentor" />

                {/* Session context pill */}
                {data.session && (
                  <div className="mb-3 flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-1.5">
                    <span>{data.session.emoji}</span>
                    <span className="text-xs text-gray-400">
                      {data.session.label} · {data.session.badge} · {data.session.minutesRemaining}min remaining
                    </span>
                    {data.regimeDetail && (
                      <>
                        <ChevronRight size={10} className="text-gray-600" />
                        <span className={`text-xs font-bold ${regimeColorClass(data.regimeDetail.color).text}`}>
                          {data.regimeDetail.label}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Warnings — ADHD priority */}
                {data.aiWarnings.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {data.aiWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 bg-amber-950/40 border border-amber-800 rounded-lg p-2 text-xs text-amber-300">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" /> {w}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Situation</p>
                    <p className="text-gray-300 leading-relaxed text-xs">{data.aiSummary}</p>
                  </div>
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                      <span className="text-emerald-400">▶ </span>Ideal Entry
                    </p>
                    <p className="text-gray-300 leading-relaxed text-xs">{data.aiEntry}</p>
                  </div>
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                      <span className="text-red-400">✕ </span>Invalidation
                    </p>
                    <p className="text-gray-300 leading-relaxed text-xs">{data.aiInvalidation}</p>
                  </div>
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                      <span className="text-purple-400">⦿ </span>Targets
                    </p>
                    <p className="text-gray-300 leading-relaxed text-xs">{data.aiTargets}</p>
                  </div>
                </div>
              </DarkCard>

              {/* RISK ENGINE */}
              <DarkCard accent="border-l-red-800">
                <SectionTitle icon={<ShieldAlert size={15} />} title="Risk Engine" />

                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div>
                    <label className="text-gray-500 block mb-1">Account ($)</label>
                    <input type="number" value={accountSize}
                      onChange={e => setAccountSize(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-1">Max Daily Loss ($)</label>
                    <input type="number" value={maxDailyLoss}
                      onChange={e => setMaxDailyLoss(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">ATR Levels · {data.risk.rr1} / {data.risk.rr2}</p>
                  {[
                    { label: 'STOP',  price: data.risk.stopDir, pts: data.risk.stopPts,  color: 'text-red-400 bg-red-950/40 border-red-900' },
                    { label: 'T1',    price: data.risk.t1,      pts: data.risk.t1Pts,    color: 'text-emerald-400 bg-emerald-950/40 border-emerald-900' },
                    { label: 'T2',    price: data.risk.t2,      pts: data.risk.t2Pts,    color: 'text-emerald-300 bg-emerald-950/30 border-emerald-800' },
                    { label: 'T3',    price: data.risk.t3,      pts: data.risk.t3Pts,    color: 'text-emerald-200 bg-emerald-950/20 border-emerald-700' },
                  ].map(row => (
                    <div key={row.label} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${row.color}`}>
                      <span className="font-bold w-10">{row.label}</span>
                      <span className="font-mono font-bold">{row.price.toFixed(0)}</span>
                      <span>{row.label === 'STOP' ? `-${row.pts}` : `+${row.pts}`}pts</span>
                      <span>${row.pts * 2}/MNQ</span>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Contract Sizing</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[1, 2, 3, 5].map(contracts => {
                      const riskUSD = data.risk.stopPts * 2 * contracts;
                      const riskPct = (riskUSD / accountSize) * 100;
                      const safe    = riskPct <= 1.5;
                      return (
                        <div key={contracts} className={`rounded-lg p-2 border ${safe ? 'border-emerald-800 bg-emerald-950/20' : 'border-red-800 bg-red-950/20'}`}>
                          <p className={`font-bold ${safe ? 'text-emerald-400' : 'text-red-400'}`}>{contracts} MNQ</p>
                          <p className="text-gray-300">${riskUSD} risk</p>
                          <p className={safe ? 'text-emerald-500' : 'text-red-500'}>{riskPct.toFixed(1)}% {safe ? '✓' : '✗'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </DarkCard>
            </div>

            {/* ── ROW 8: PSYCHOLOGY · ECONOMIC EVENTS · MARKET INTERNALS ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* PSYCHOLOGY & CHECKLIST */}
              <DarkCard>
                <SectionTitle
                  icon={<CheckCircle size={15} />}
                  title="Pre-Trade Checklist"
                  right={
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      criticalOk && checklistPct >= 80 ? 'bg-emerald-900 text-emerald-400' :
                      criticalOk ? 'bg-yellow-900 text-yellow-400' : 'bg-red-900 text-red-400'
                    }`}>{checkedCount}/{CHECKLIST.length}</span>
                  }
                />

                {/* Emotional state */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5">How are you feeling?</p>
                  <div className="flex flex-wrap gap-1">
                    {EMOTIONAL_STATES.map(e => (
                      <button key={e.id} onClick={() => saveSession({ ...session, emotionalState: e.id })}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${
                          session.emotionalState === e.id
                            ? e.color === 'emerald' ? 'bg-emerald-900/50 border-emerald-700 text-emerald-400 font-bold'
                            : e.color === 'blue'    ? 'bg-blue-900/50 border-blue-700 text-blue-400 font-bold'
                            : e.color === 'amber'   ? 'bg-amber-900/50 border-amber-700 text-amber-400 font-bold'
                            : 'bg-red-900/50 border-red-700 text-red-400 font-bold'
                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'
                        }`}>
                        {e.label}
                      </button>
                    ))}
                  </div>
                  {(emotionalState.color === 'red' || session.emotionalState === 'frustrated') && (
                    <p className="mt-1.5 text-xs text-red-400 font-semibold">Stop trading now — emotional state compromised</p>
                  )}
                  {session.emotionalState === 'excited' && (
                    <p className="mt-1.5 text-xs text-amber-400">Reduce position size — excitement leads to overtrading</p>
                  )}
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${
                    criticalOk && checklistPct === 100 ? 'bg-emerald-500' :
                    criticalOk ? 'bg-yellow-500' : 'bg-red-600'
                  }`} style={{ width: `${checklistPct}%` }} />
                </div>

                <div className="space-y-1">
                  {CHECKLIST.map(item => (
                    <button key={item.id} onClick={() => toggleChecklist(item.id)}
                      className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        session.checklist[item.id]
                          ? 'bg-emerald-950/30 text-emerald-300'
                          : item.critical
                          ? 'bg-red-950/20 text-gray-400 hover:bg-gray-800'
                          : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800'
                      }`}>
                      <span className={`shrink-0 ${session.checklist[item.id] ? 'text-emerald-400' : item.critical ? 'text-red-600' : 'text-gray-600'}`}>
                        {session.checklist[item.id] ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      </span>
                      <span className={item.critical ? 'font-medium' : ''}>{item.label}</span>
                      {item.critical && !session.checklist[item.id] && (
                        <span className="ml-auto text-red-600 text-[10px] font-bold">CRITICAL</span>
                      )}
                    </button>
                  ))}
                </div>

                {!criticalOk && (
                  <p className="mt-2 text-xs text-red-400 font-semibold text-center">
                    {criticalTotal - criticalChecked} critical item(s) unchecked — do not trade
                  </p>
                )}
              </DarkCard>

              {/* ECONOMIC EVENTS */}
              <DarkCard>
                <SectionTitle icon={<Bell size={15} />} title="Economic Calendar" />
                <div className="space-y-2">
                  {ECONOMIC_EVENTS.map((ev, i) => (
                    <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg border text-xs ${
                      ev.riskLevel === 'HIGH'
                        ? 'bg-red-950/20 border-red-900 text-gray-300'
                        : 'bg-gray-800/50 border-gray-800 text-gray-400'
                    }`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{ev.name}</span>
                          <Badge color={ev.riskLevel === 'HIGH' ? 'red' : 'amber'}>{ev.riskLevel}</Badge>
                        </div>
                        <p className="text-gray-500 mt-0.5">{ev.description}</p>
                      </div>
                      {ev.name === 'Jobless Claims' && thursdayCountdown && (
                        <span className="text-amber-400 font-bold shrink-0">{thursdayCountdown}</span>
                      )}
                    </div>
                  ))}
                </div>
              </DarkCard>

              {/* MARKET INTERNALS */}
              <DarkCard>
                <SectionTitle icon={<Activity size={15} />} title="Market Internals" />
                {data.internals ? (
                  <div className="space-y-3">
                    {[
                      {
                        label: 'DXY (Dollar)',
                        data: data.internals.dxy,
                        desc: 'Rising DXY = headwind for NQ',
                        bearish: (data.internals.dxy?.changePct ?? 0) > 0.3,
                        bullish: (data.internals.dxy?.changePct ?? 0) < -0.3,
                      },
                      {
                        label: '10Y Yield (TNX)',
                        data: data.internals.tnx,
                        desc: 'Rising yields = tech pressure',
                        bearish: (data.internals.tnx?.changePct ?? 0) > 2,
                        bullish: (data.internals.tnx?.changePct ?? 0) < -2,
                      },
                      {
                        label: 'NVDA',
                        data: data.internals.nvda,
                        desc: 'NVDA leads NQ / tech sector',
                        bullish: (data.internals.nvda?.changePct ?? 0) > 1.5,
                        bearish: (data.internals.nvda?.changePct ?? 0) < -1.5,
                      },
                    ].map(item => item.data ? (
                      <div key={item.label} className={`px-3 py-2 rounded-lg border ${
                        item.bearish ? 'bg-red-950/20 border-red-900' :
                        item.bullish ? 'bg-emerald-950/20 border-emerald-900' :
                        'bg-gray-800/40 border-gray-800'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-300">{item.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-100">
                              {item.data.price < 10 ? item.data.price.toFixed(3) : item.data.price.toFixed(2)}
                            </span>
                            <span className={`text-xs font-semibold ${pctColor(item.data.changePct)}`}>
                              {fmt(item.data.changePct, 2)}%
                            </span>
                          </div>
                        </div>
                        <p className={`text-xs ${
                          item.bearish ? 'text-red-400' : item.bullish ? 'text-emerald-400' : 'text-gray-500'
                        }`}>{item.data.interpretation}</p>
                      </div>
                    ) : (
                      <div key={item.label} className="px-3 py-2 rounded-lg border bg-gray-800/40 border-gray-800">
                        <p className="text-xs text-gray-500">{item.label} — no data</p>
                        <p className="text-xs text-gray-600">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs text-center py-4">Load data to see market internals</p>
                )}
              </DarkCard>
            </div>

            {/* ── ROW 9: SESSION TRACKER ────────────────────────────────── */}
            <DarkCard>
              <SectionTitle icon={<Clock size={15} />} title="Session Tracker" />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                {/* Trade counter / P&L */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Max Trades</label>
                      <input type="number" value={maxTrades} min={1} max={10}
                        onChange={e => setMaxTrades(Number(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-purple-600" />
                    </div>
                    <div className={`rounded-lg p-2 text-center border ${
                      session.tradesCount >= maxTrades ? 'bg-red-950/40 border-red-800' : 'bg-gray-800 border-gray-700'
                    }`}>
                      <p className="text-xs text-gray-500">Trades</p>
                      <p className={`text-2xl font-black ${session.tradesCount >= maxTrades ? 'text-red-400' : 'text-gray-200'}`}>
                        {session.tradesCount}/{maxTrades}
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-xs text-gray-500 mb-1">Today P&L (pts)</p>
                    <div className="flex gap-2">
                      <input type="number" value={session.dailyPnL}
                        onChange={e => saveSession({ ...session, dailyPnL: Number(e.target.value) })}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-gray-200 text-sm font-bold focus:outline-none focus:border-purple-600" />
                      <span className={`text-sm font-bold self-center ${session.dailyPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${(session.dailyPnL * 2).toFixed(0)}
                      </span>
                    </div>
                    {session.dailyPnL <= -Math.abs(maxDailyLoss) / 2 && (
                      <p className="text-xs text-amber-400 mt-1">Approaching daily limit</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveSession({ ...session, tradesCount: session.tradesCount + 1 })}
                      className="flex-1 py-2 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-800 text-purple-400 text-xs font-semibold rounded-lg">
                      + Log Trade
                    </button>
                    <button onClick={() => saveSession({ ...session, tradesCount: 0, dailyPnL: 0, checklist: {}, trades: [] })}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-xs rounded-lg">
                      Reset
                    </button>
                  </div>
                </div>

                {/* Daily Rules */}
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Daily Rules</p>
                  <div className="space-y-1.5">
                    {DAILY_RULES.map((rule, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                        <span className="shrink-0 text-purple-500 font-bold mt-0.5">{i + 1}.</span>
                        {rule}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    {!session.stopped && (
                      <button onClick={() => saveSession({ ...session, stopped: true, stopReason: 'Manually locked out for today' })}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-400 text-xs font-semibold rounded-lg">
                        <Lock size={12} /> Lock Out Today
                      </button>
                    )}
                  </div>
                </div>

                {/* Risk status + notes */}
                <div className="space-y-3">
                  <div className={`text-center py-3 rounded-lg text-xs font-bold ${
                    isRiskSafe
                      ? 'bg-emerald-950/30 border border-emerald-900 text-emerald-400'
                      : 'bg-red-950/40 border border-red-800 text-red-400'
                  }`}>
                    {isRiskSafe ? '✓ Within Risk Parameters' : '✗ LIMITS REACHED — STOP'}
                  </div>
                  <textarea
                    value={session.notes}
                    onChange={e => saveSession({ ...session, notes: e.target.value })}
                    placeholder="Session notes: levels, plan, emotions…"
                    rows={5}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-xs placeholder-gray-600 focus:outline-none focus:border-purple-600 resize-none"
                  />
                </div>
              </div>
            </DarkCard>

            {/* ── DISCLAIMER ────────────────────────────────────────────── */}
            <p className="text-xs text-gray-700 text-center pb-2">
              Educational analysis only. Not financial advice. Futures trading involves significant risk of loss.
              Data may be delayed. Verify all levels in your prop firm platform before trading.
            </p>

          </div>
        )}
      </div>
    </AppShell>
  );
}
