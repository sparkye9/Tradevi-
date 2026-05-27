'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle,
  CheckCircle, XCircle, Clock, Zap, RefreshCw,
  ShieldAlert, Bell, Target, BarChart2,
  Minus, Info, Lock, ChevronRight, Eye, EyeOff,
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

const EMOTIONAL_STATES: { id: SessionState['emotionalState']; label: string; riskColor: string; description: string }[] = [
  { id: 'calm',       label: 'Calm',       riskColor: '#00ff88', description: 'Ideal state' },
  { id: 'confident',  label: 'Confident',  riskColor: '#3b82f6', description: 'Good — stay humble' },
  { id: 'excited',    label: 'Excited',    riskColor: '#f59e0b', description: 'Caution — reduce size' },
  { id: 'anxious',    label: 'Anxious',    riskColor: '#f97316', description: 'Reduce size now' },
  { id: 'frustrated', label: 'Frustrated', riskColor: '#ff3b3b', description: 'Stop trading now' },
];

const ECONOMIC_EVENTS = [
  { name: 'Jobless Claims',    dayOfWeek: 4, riskLevel: 'MEDIUM' as const, description: 'Every Thursday 8:30 AM ET' },
  { name: 'CPI Release',       dayOfWeek: 2, riskLevel: 'HIGH'   as const, description: '2nd/3rd Tue of month 8:30 AM ET' },
  { name: 'NFP',               dayOfWeek: 5, riskLevel: 'HIGH'   as const, description: 'First Friday 8:30 AM ET' },
  { name: 'PCE Inflation',     dayOfWeek: 5, riskLevel: 'HIGH'   as const, description: 'Last Friday of month 8:30 AM ET' },
  { name: 'FOMC Decision',     dayOfWeek: null, riskLevel: 'HIGH' as const, description: 'Check FOMC calendar — 2:00 PM ET' },
  { name: 'Fed Speaker',       dayOfWeek: null, riskLevel: 'MEDIUM' as const, description: 'Variable — check FOMC calendar' },
  { name: 'ISM Manufacturing', dayOfWeek: null, riskLevel: 'MEDIUM' as const, description: '1st business day of month 10 AM ET' },
  { name: 'GDP Release',       dayOfWeek: null, riskLevel: 'HIGH' as const, description: 'Quarterly 8:30 AM ET' },
];

// ─── Color helpers ─────────────────────────────────────────────────────────────

const G = '#00ff88';
const R = '#ff3b3b';
const A = '#f59e0b';

function fmt(n: number, d = 2) { return n >= 0 ? `+${n.toFixed(d)}` : n.toFixed(d); }
function pctColor(v: number) { return v > 0 ? G : v < 0 ? R : '#6b7280'; }
function biasColor(b: 'bullish' | 'bearish' | 'neutral') { return b === 'bullish' ? G : b === 'bearish' ? R : '#6b7280'; }
function signalColor(s: 'bullish' | 'bearish' | 'neutral') { return s === 'bullish' ? G : s === 'bearish' ? R : '#6b7280'; }

function gradeStyle(g: string): { color: string; bg: string; border: string } {
  if (g === 'A+')  return { color: G,        bg: 'rgba(0,255,136,0.1)',   border: 'rgba(0,255,136,0.35)' };
  if (g === 'A')   return { color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.25)' };
  if (g === 'B')   return { color: A,        bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' };
  if (g === 'C')   return { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)' };
  return               { color: R,        bg: 'rgba(255,59,59,0.12)',  border: 'rgba(255,59,59,0.4)' };
}

function regimeStyle(color: string) {
  if (color === 'emerald') return { text: G,        bg: 'rgba(0,255,136,0.07)', border: 'rgba(0,255,136,0.25)' };
  if (color === 'amber')   return { text: A,        bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' };
  if (color === 'blue')    return { text: '#60a5fa', bg: 'rgba(96,165,250,0.07)', border: 'rgba(96,165,250,0.2)' };
  if (color === 'red')     return { text: R,        bg: 'rgba(255,59,59,0.07)',  border: 'rgba(255,59,59,0.25)' };
  if (color === 'purple')  return { text: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.2)' };
  return                          { text: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)' };
}

// ─── Countdown to next Thursday (Jobless Claims) ──────────────────────────────

function useThursdayCountdown() {
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    function calc() {
      const now = new Date();
      const d = now.getDay();
      const daysUntil = (4 - d + 7) % 7 || 7;
      const next = new Date(now);
      next.setDate(now.getDate() + daysUntil);
      next.setHours(8, 30, 0, 0);
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

function MNQChart({ data, orb, vwap, liquidity }: {
  data: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  orb: MNQData['orb'];
  vwap: number;
  ema9: number | null;
  ema21: number | null;
  liquidity: MNQData['liquidity'];
}) {
  const closes   = data.map(c => c.close);
  const ema9Line  = buildEMALine(closes, 9);
  const ema21Line = buildEMALine(closes, 21);

  const chartData = data.map((c, i) => ({
    t:      new Date(c.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    close:  c.close,
    volume: c.volume / 1000,
    vwap,
    ema9:   ema9Line[i],
    ema21:  ema21Line[i],
  }));

  const prices = data.map(d => d.close);
  const minP = Math.min(...prices) - 15;
  const maxP = Math.max(...prices) + 15;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 70, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#374151' }} interval={11} />
        <YAxis yAxisId="price" domain={[minP, maxP]} tick={{ fontSize: 9, fill: '#374151' }}
          tickFormatter={v => v.toFixed(0)} width={58} />
        <YAxis yAxisId="vol" orientation="right" tick={false} width={0} />
        <Tooltip
          contentStyle={{ background: '#111318', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#e5e7eb' }}
          formatter={(v: unknown, name: string): [string, string] => [
            typeof v === 'number'
              ? name === 'volume' ? `${(v as number).toFixed(0)}K` : (v as number).toFixed(2)
              : String(v),
            name,
          ]}
        />
        <ReferenceArea yAxisId="price" y1={orb.low} y2={orb.high} fill="#00ff88" fillOpacity={0.03} />
        {liquidity?.overnightHigh != null && liquidity.overnightHigh > 0 && (
          <ReferenceLine yAxisId="price" y={liquidity.overnightHigh} stroke={A} strokeDasharray="5 3" strokeWidth={1}
            label={{ value: `ONH ${liquidity.overnightHigh.toFixed(0)}`, position: 'right', fontSize: 8, fill: A }} />
        )}
        {liquidity?.overnightLow != null && liquidity.overnightLow > 0 && (
          <ReferenceLine yAxisId="price" y={liquidity.overnightLow} stroke={A} strokeDasharray="5 3" strokeWidth={1}
            label={{ value: `ONL ${liquidity.overnightLow.toFixed(0)}`, position: 'right', fontSize: 8, fill: A }} />
        )}
        {liquidity?.asiaHigh != null && (
          <ReferenceLine yAxisId="price" y={liquidity.asiaHigh} stroke="#60a5fa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `AsiaH ${liquidity.asiaHigh.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#60a5fa' }} />
        )}
        {liquidity?.asiaLow != null && (
          <ReferenceLine yAxisId="price" y={liquidity.asiaLow} stroke="#60a5fa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `AsiaL ${liquidity.asiaLow.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#60a5fa' }} />
        )}
        {liquidity?.londonHigh != null && (
          <ReferenceLine yAxisId="price" y={liquidity.londonHigh} stroke="#a78bfa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `LdnH ${liquidity.londonHigh.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#a78bfa' }} />
        )}
        {liquidity?.londonLow != null && (
          <ReferenceLine yAxisId="price" y={liquidity.londonLow} stroke="#a78bfa" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: `LdnL ${liquidity.londonLow.toFixed(0)}`, position: 'right', fontSize: 8, fill: '#a78bfa' }} />
        )}
        <ReferenceLine yAxisId="price" y={orb.high} stroke={G} strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `ORB H ${orb.high.toFixed(0)}`, position: 'insideTopRight', fontSize: 9, fill: G }} />
        <ReferenceLine yAxisId="price" y={orb.low} stroke={R} strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `ORB L ${orb.low.toFixed(0)}`, position: 'insideBottomRight', fontSize: 9, fill: R }} />
        <ReferenceLine yAxisId="price" y={vwap} stroke="#a78bfa" strokeDasharray="6 3" strokeWidth={1.5}
          label={{ value: `VWAP ${vwap.toFixed(0)}`, position: 'right', fontSize: 9, fill: '#a78bfa' }} />
        <Bar yAxisId="vol" dataKey="volume" fill="rgba(255,255,255,0.07)" radius={[1, 1, 0, 0]} />
        <Area yAxisId="price" type="monotone" dataKey="close" stroke={G} fill="rgba(0,255,136,0.06)"
          strokeWidth={2} dot={false} activeDot={{ r: 3, fill: G }} />
        <Line yAxisId="price" type="monotone" dataKey="ema9"  stroke={A}        strokeWidth={1.5} dot={false} connectNulls />
        <Line yAxisId="price" type="monotone" dataKey="ema21" stroke="#60a5fa"  strokeWidth={1.5} dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── HTF Panel ────────────────────────────────────────────────────────────────

function HTFPanel() {
  const [htf, setHtf] = useState<HTFData | null>(null);
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

  const biasC = (b: string) => b === 'bullish' ? G : b === 'bearish' ? R : '#6b7280';

  return (
    <div className="cp-card">
      <div className="flex items-center justify-between mb-3">
        <p className="sec-label">HTF Alignment</p>
        <button onClick={load} style={{ color: '#374151' }}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !htf && (
        <div className="space-y-2">
          {['Daily', '1H', '15m'].map(l => (
            <div key={l} className="h-9 rounded-lg animate-pulse" style={{ background: '#13161d' }} />
          ))}
        </div>
      )}

      {!htf && !loading && (
        <div className="text-center py-6">
          <p className="text-xs" style={{ color: '#374151' }}>HTF data not loaded</p>
          <button onClick={load} className="mt-2 text-xs font-semibold" style={{ color: G }}>Load HTF</button>
        </div>
      )}

      {htf && (
        <>
          <div
            className="text-center py-2.5 rounded-xl mb-3"
            style={{
              background: htf.tradingBias === 'bullish' ? 'rgba(0,255,136,0.07)' : htf.tradingBias === 'bearish' ? 'rgba(255,59,59,0.07)' : 'rgba(107,114,128,0.07)',
              border: `1px solid ${biasC(htf.tradingBias)}33`,
            }}
          >
            <p className="font-black text-sm" style={{ color: biasC(htf.tradingBias) }}>{htf.alignmentLabel}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#6b7280' }}>{htf.alignmentScore}/100</p>
          </div>

          <div className="space-y-1.5 mb-3">
            {htf.timeframes.map(tf => (
              <div key={tf.label} className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: '#13161d' }}>
                <span className="text-xs font-medium w-14" style={{ color: '#9ca3af' }}>{tf.label}</span>
                <span className="text-xs font-bold" style={{ color: biasC(tf.bias) }}>{tf.bias.toUpperCase()}</span>
                <span className="text-xs font-mono" style={{ color: '#6b7280' }}>{tf.score}/100</span>
                <span className="text-xs" style={{ color: tf.priceVsEma21 === 'above' ? G : R }}>
                  {tf.priceVsEma21 === 'above' ? '↑' : '↓'} EMA21
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>{htf.recommendation}</p>
        </>
      )}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, color = '#6b7280', bg = 'rgba(107,114,128,0.1)' }: { label: string; color?: string; bg?: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
      style={{ color, background: bg, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, right, accent = G }: { title: string; right?: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-4 rounded-full" style={{ background: accent }} />
        <p className="sec-label" style={{ margin: 0 }}>{title}</p>
      </div>
      {right}
    </div>
  );
}

// ─── RSI bar ──────────────────────────────────────────────────────────────────

function RsiBar({ rsi }: { rsi: number | null }) {
  if (rsi == null) return <span style={{ color: '#374151' }}>—</span>;
  const color = rsi > 70 ? R : rsi < 30 ? G : rsi > 55 ? G : rsi < 45 ? R : '#6b7280';
  const zone  = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : rsi > 55 ? 'Bullish' : rsi < 45 ? 'Bearish' : 'Neutral';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
        <span className="font-mono">{rsi.toFixed(1)}</span>
        <span style={{ color: '#6b7280' }}>{zone}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1d26' }}>
        <div className="h-full rounded-full" style={{ width: `${rsi}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function MNQDashboard() {
  const [timeframe, setTimeframe]         = useState<TF>(5);
  const [data, setData]                   = useState<MNQData | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [lastUpdated, setLastUpdated]     = useState('');
  const [autoRefresh, setAutoRefresh]     = useState(false);
  const [focusMode, setFocusMode]         = useState(false);
  const [maxTrades, setMaxTrades]         = useState(3);
  const [maxDailyLoss, setMaxDailyLoss]   = useState(200);
  const [accountSize, setAccountSize]     = useState(10000);
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
  const emotionalState = EMOTIONAL_STATES.find(e => e.id === session.emotionalState) ?? EMOTIONAL_STATES[0];

  // ── Derived session phase label ─────────────────────────────────────────────
  const sessionPhaseLabel = data?.session
    ? data.session.shouldAvoid
      ? { label: 'AVOID SESSION', color: A }
      : data.session.id?.includes('rth')
        ? { label: 'EXECUTION MODE', color: G }
        : data.session.id?.includes('lunch')
          ? { label: 'MUTED — LOW PRIORITY', color: '#6b7280' }
          : data.session.id?.includes('pre')
            ? { label: 'PREPARATION MODE', color: '#60a5fa' }
            : { label: 'ACTIVE SESSION', color: G }
    : null;

  return (
    <AppShell title="Mini Futures — Decision Engine">

      {/* ── SECTION 1: SESSION HEADER (sticky) ──────────────────────────── */}
      <div
        className="sticky top-0 z-10 -mx-4 lg:-mx-5 px-4 lg:px-5 py-3 mb-5"
        style={{
          background: 'rgba(13,15,20,0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Session info */}
          <div className="flex items-center gap-4">
            {data?.session ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{data.session.emoji}</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: '#f0f0f0' }}>{data.session.label}</p>
                    {sessionPhaseLabel && (
                      <p className="text-xs font-mono" style={{ color: sessionPhaseLabel.color, fontSize: '10px' }}>
                        {sessionPhaseLabel.label}
                      </p>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p style={{ color: '#374151', fontSize: '10px' }}>TIME LEFT</p>
                    <p className="font-mono font-bold" style={{ color: '#f0f0f0' }}>{data.session.minutesRemaining}m</p>
                  </div>
                  <div className="text-center">
                    <p style={{ color: '#374151', fontSize: '10px' }}>S.HIGH</p>
                    <p className="font-mono font-bold" style={{ color: G }}>{data.session.sessionHigh.toFixed(0)}</p>
                  </div>
                  <div className="text-center">
                    <p style={{ color: '#374151', fontSize: '10px' }}>S.LOW</p>
                    <p className="font-mono font-bold" style={{ color: R }}>{data.session.sessionLow.toFixed(0)}</p>
                  </div>
                  <div className="text-center">
                    <p style={{ color: '#374151', fontSize: '10px' }}>RANGE</p>
                    <p className="font-mono font-bold" style={{ color: '#9ca3af' }}>{data.session.sessionRange.toFixed(0)}pt</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs font-mono" style={{ color: '#374151' }}>Awaiting analysis…</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} className={`tf-btn ${timeframe === tf ? 'active' : ''}`}>
                  {tf}m
                </button>
              ))}
            </div>

            <button
              onClick={doFetch}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              style={{
                background: 'rgba(0,255,136,0.12)',
                border: '1px solid rgba(0,255,136,0.35)',
                color: G,
              }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Analyze
            </button>

            <button
              onClick={() => setAutoRefresh(a => !a)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: autoRefresh ? 'rgba(0,255,136,0.1)' : '#13161d',
                border: `1px solid ${autoRefresh ? 'rgba(0,255,136,0.35)' : 'rgba(255,255,255,0.07)'}`,
                color: autoRefresh ? G : '#6b7280',
              }}
            >
              <Zap size={11} /> {autoRefresh ? 'Live' : 'Auto'}
            </button>

            <button
              onClick={() => setFocusMode(f => !f)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: focusMode ? 'rgba(245,158,11,0.1)' : '#13161d',
                border: `1px solid ${focusMode ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.07)'}`,
                color: focusMode ? A : '#6b7280',
              }}
            >
              {focusMode ? <EyeOff size={11} /> : <Eye size={11} />}
              Focus
            </button>

            {lastUpdated && (
              <span className="text-xs font-mono" style={{ color: '#374151' }}>
                {lastUpdated}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── NO-TRADE ZONE ──────────────────────────────────────────────────── */}
      {noTradeActive && data?.noTrade && (
        <div
          className="mb-4 rounded-xl p-4"
          style={{ background: 'rgba(255,59,59,0.1)', border: '2px solid rgba(255,59,59,0.5)', boxShadow: '0 0 24px rgba(255,59,59,0.2)' }}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} style={{ color: R, flexShrink: 0 }} />
            <div className="flex-1">
              <p className="font-black text-base mb-1" style={{ color: R }}>NO-TRADE ZONE — STAND ASIDE</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {data.noTrade.reasons.map((r, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded font-semibold"
                    style={{ color: R, background: 'rgba(255,59,59,0.15)', border: '1px solid rgba(255,59,59,0.3)' }}>
                    {r}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,59,59,0.2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${data.noTrade.score}%`, background: R }} />
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: R }}>{data.noTrade.score}/100</span>
              </div>
            </div>
            <button
              onMouseDown={startOverrideHold}
              onMouseUp={cancelOverrideHold}
              onMouseLeave={cancelOverrideHold}
              onTouchStart={startOverrideHold}
              onTouchEnd={cancelOverrideHold}
              className="relative text-xs rounded-lg px-3 py-1.5 overflow-hidden select-none"
              style={{ color: R, border: '1px solid rgba(255,59,59,0.4)', background: 'transparent' }}
            >
              <div className="absolute inset-0" style={{ width: `${(overrideHoldMs / 3000) * 100}%`, background: 'rgba(255,59,59,0.25)' }} />
              <span className="relative">Hold 3s Override</span>
            </button>
          </div>
        </div>
      )}

      {/* ── SESSION STOPPED ──────────────────────────────────────────────────── */}
      {session.stopped && (
        <div
          className="mb-4 flex items-center gap-3 rounded-xl p-3"
          style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.4)' }}
        >
          <Lock size={16} style={{ color: R, flexShrink: 0 }} />
          <div>
            <p className="font-bold text-sm" style={{ color: R }}>TRADING LOCKED FOR TODAY</p>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{session.stopReason}</p>
          </div>
          <button
            onClick={() => saveSession({ ...session, stopped: false, stopReason: '' })}
            className="ml-auto text-xs underline"
            style={{ color: '#6b7280' }}
          >
            Unlock
          </button>
        </div>
      )}

      {/* ── ERROR ──────────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="mb-4 flex items-center gap-2 rounded-xl p-3 text-sm"
          style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)', color: R }}
        >
          <XCircle size={14} /> {error}
        </div>
      )}

      {/* ── EMPTY STATE ────────────────────────────────────────────────────── */}
      {!data && !loading && !error && (
        <div className="text-center py-24">
          <BarChart2 size={48} style={{ color: '#1a1d26', margin: '0 auto 16px' }} />
          <p className="font-semibold text-lg" style={{ color: '#9ca3af' }}>Select a timeframe and click Analyze</p>
          <p className="text-sm mt-2" style={{ color: '#374151' }}>
            Live NQ futures data · Bias engine · ORB · Session · Liquidity · Risk
          </p>
          <button
            onClick={doFetch}
            className="mt-6 px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
            style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)', color: G }}
          >
            Run Analysis
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-24">
          <div className="w-10 h-10 rounded-full border-2 animate-spin mx-auto mb-4"
            style={{ borderColor: '#1a1d26', borderTopColor: G }} />
          <p className="text-sm" style={{ color: '#6b7280' }}>Fetching NQ futures data…</p>
        </div>
      )}

      {data && (
        <div className={focusMode ? 'space-y-4' : 'space-y-4'}>

          {/* ── INSTRUMENT SWITCHER ──────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold tracking-widest" style={{ color: '#374151', fontSize: '10px' }}>CONTRACT</span>
            {[
              { label: 'NQ / MNQ', href: '/mnq-dashboard', active: true },
              { label: 'ES / MES', href: '/esm6-dashboard', active: false },
            ].map(({ label, href, active }) => (
              <Link key={href} href={href}
                className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: active ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? G : '#6b7280',
                }}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* ── TICKER STRIP ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2">
            {data.nq && (
              <div
                className="flex flex-col items-center px-5 py-3 rounded-xl"
                style={{
                  background: 'rgba(0,255,136,0.07)',
                  border: '1px solid rgba(0,255,136,0.2)',
                  boxShadow: '0 0 16px rgba(0,255,136,0.1)',
                }}
              >
                <span className="text-xs font-bold tracking-wider" style={{ color: '#6b7280' }}>NQ / MNQ</span>
                <span className="text-2xl font-black font-mono" style={{ color: '#f0f0f0' }}>
                  {data.nq.price.toLocaleString()}
                </span>
                <span className="text-xs font-mono font-bold" style={{ color: pctColor(data.nq.changePct) }}>
                  {fmt(data.nq.changePct, 2)}%
                </span>
              </div>
            )}
            {[
              { label: 'ES / MES', q: data.es,   href: '/esm6-dashboard' },
              { label: 'VIX',      q: data.vix,  href: '/market-analysis' },
              { label: 'QQQ',      q: data.qqq,  href: '/charts' },
            ].map(({ label, q, href }) => q ? (
              <Link key={label} href={href}
                className="flex flex-col items-center px-4 py-2.5 rounded-xl transition-all hover:scale-[1.02]"
                style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-xs font-bold" style={{ color: '#6b7280' }}>{label}</span>
                <span className="text-lg font-black font-mono" style={{ color: '#f0f0f0' }}>{q.price.toLocaleString()}</span>
                <span className="text-xs font-mono" style={{ color: pctColor(q.changePct) }}>{fmt(q.changePct, 2)}%</span>
                <span style={{ color: '#374151', fontSize: '8px', marginTop: 2 }}>VIEW →</span>
              </Link>
            ) : null)}
            {data.internals?.dxy && (
              <div className="flex flex-col items-center px-4 py-2.5 rounded-xl"
                style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-xs font-bold" style={{ color: '#6b7280' }}>DXY</span>
                <span className="text-lg font-black font-mono" style={{ color: '#f0f0f0' }}>{data.internals.dxy.price.toFixed(2)}</span>
                <span className="text-xs font-mono" style={{ color: pctColor(data.internals.dxy.changePct) }}>{fmt(data.internals.dxy.changePct, 2)}%</span>
              </div>
            )}
            {data.internals?.nvda && (
              <div className="flex flex-col items-center px-4 py-2.5 rounded-xl"
                style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-xs font-bold" style={{ color: '#6b7280' }}>NVDA</span>
                <span className="text-lg font-black font-mono" style={{ color: '#f0f0f0' }}>{data.internals.nvda.price.toFixed(2)}</span>
                <span className="text-xs font-mono" style={{ color: pctColor(data.internals.nvda.changePct) }}>{fmt(data.internals.nvda.changePct, 2)}%</span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2 self-center">
              <span
                className="text-xs px-2 py-1 rounded font-mono font-bold"
                style={{
                  color: data.dataSource === 'twelve_data' ? G : A,
                  background: data.dataSource === 'twelve_data' ? 'rgba(0,255,136,0.1)' : 'rgba(245,158,11,0.1)',
                  border: `1px solid ${data.dataSource === 'twelve_data' ? 'rgba(0,255,136,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}
              >
                {data.dataSource === 'twelve_data' ? '⚡ Live' : '⏱ Delayed'}
              </span>
            </div>
          </div>

          {/* ── SECTIONS 3–5: REGIME · BIAS · GRADE ─────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* SECTION 3 — REGIME DETECTION */}
            <div className="cp-card">
              <SectionHeader title="Regime Detection" />
              {data.regimeDetail ? (() => {
                const rs = regimeStyle(data.regimeDetail.color);
                return (
                  <>
                    <div className="rounded-xl p-4 mb-3 text-center"
                      style={{ background: rs.bg, border: `1px solid ${rs.border}` }}>
                      <p className="text-xl font-black tracking-wider mb-1" style={{ color: rs.text }}>
                        {data.regimeDetail.label}
                      </p>
                      <div className="flex flex-wrap justify-center gap-1">
                        {data.regimeDetail.badges.map(b => (
                          <Chip key={b} label={b} color={rs.text} bg={rs.bg} />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="rounded-lg p-2.5" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.1)' }}>
                        <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: G, fontSize: '9px' }}>APPROACH</p>
                        <p style={{ color: '#d1d5db' }}>{data.regimeDetail.approach}</p>
                      </div>
                      <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,59,59,0.05)', border: '1px solid rgba(255,59,59,0.1)' }}>
                        <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: R, fontSize: '9px' }}>AVOID</p>
                        <p style={{ color: '#d1d5db' }}>{data.regimeDetail.avoid}</p>
                      </div>
                    </div>
                  </>
                );
              })() : (
                <div className="rounded-xl p-3 text-center" style={{ background: '#13161d' }}>
                  <p className="font-bold" style={{ color: '#9ca3af' }}>{data.regime.replace(/_/g, ' ').toUpperCase()}</p>
                </div>
              )}
            </div>

            {/* SECTION 4 — BIAS ENGINE */}
            <div className="cp-card">
              <SectionHeader title="Bias Engine" accent={biasColor(data.bias)} />
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1">
                  <p className="text-3xl font-black font-mono" style={{ color: biasColor(data.bias) }}>
                    {data.bias.toUpperCase()}
                  </p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: '#6b7280' }}>{data.biasScore}/100</p>
                </div>
                <div className="relative w-14 h-14">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#1a1d26" strokeWidth="3" />
                    <circle cx="18" cy="18" r="14" fill="none"
                      stroke={biasColor(data.bias)}
                      strokeWidth="3"
                      strokeDasharray={`${(data.biasScore / 100) * 88} 88`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold font-mono"
                    style={{ color: biasColor(data.bias) }}>
                    {data.biasScore}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {data.biasFactors.map(f => (
                  <div key={f.label} className="flex items-center justify-between text-xs py-1"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="w-16 font-medium" style={{ color: '#6b7280' }}>{f.label}</span>
                    <span className="font-bold font-mono w-20 text-center" style={{ color: signalColor(f.signal) }}>{f.detail}</span>
                    <span className="font-mono w-10 text-right" style={{ color: f.pts > 10 ? G : f.pts < 7 ? R : '#6b7280' }}>
                      {f.pts}pt
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 5 — TRADE QUALITY GRADE */}
            <div className="cp-card">
              <SectionHeader title="Trade Quality Engine" />
              {(() => {
                const gs = gradeStyle(data.tradeGrade);
                return (
                  <>
                    <div className="text-center py-4 mb-3 rounded-xl"
                      style={{ background: gs.bg, border: `1px solid ${gs.border}` }}>
                      <p className="text-5xl font-black font-mono" style={{ color: gs.color }}>
                        {data.tradeGrade}
                      </p>
                      <p className="text-2xl font-black font-mono mt-1" style={{ color: gs.color }}>
                        {data.tradeScore}/100
                      </p>
                      <p className="text-xs mt-1.5" style={{ color: '#9ca3af' }}>{data.gradeLabel}</p>
                    </div>

                    <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: '#1a1d26' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${data.tradeScore}%`,
                          background: data.tradeScore >= 85 ? G : data.tradeScore >= 70 ? '#4ade80' :
                            data.tradeScore >= 55 ? A : data.tradeScore >= 40 ? '#f97316' : R,
                        }} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { label: 'VWAP',   value: `${data.vwap.toFixed(0)} ${data.mnqPrice >= data.vwap ? '↑' : '↓'}`,  color: data.mnqPrice >= data.vwap ? G : R },
                        { label: 'RSI',    value: data.rsi?.toFixed(1) ?? '—',  color: data.rsi && data.rsi > 50 ? G : R  },
                        { label: 'ORB',    value: data.orb.status === 'above' ? '▲ ABOVE' : data.orb.status === 'below' ? '▼ BELOW' : '◆ INSIDE',
                                           color: data.orb.status === 'above' ? G : data.orb.status === 'below' ? R : A },
                        { label: 'ATR',    value: `${data.atr.toFixed(1)}pt`,  color: data.atr >= 8 ? G : A },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-lg p-2" style={{ background: '#13161d' }}>
                          <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#374151', fontSize: '9px' }}>{label}</p>
                          <p className="font-bold font-mono" style={{ color }}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {data.isChop && data.chopReasons.length > 0 && (
                      <div className="mt-3 rounded-lg p-2.5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <p className="text-xs font-bold mb-1" style={{ color: A }}>CHOP DETECTED</p>
                        {data.chopReasons.map((r, i) => (
                          <p key={i} className="text-xs" style={{ color: '#9ca3af' }}>· {r}</p>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* ── SECTION 6 — BEHAVIOR + STRATEGY ─────────────────────────── */}
          {!focusMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Suggested behavior */}
              <div className="cp-card">
                <SectionHeader title="Suggested Trader Behavior" />
                {(() => {
                  const gs = gradeStyle(data.tradeGrade);
                  const behavior =
                    data.tradeGrade === 'A+' ? 'High probability environment. Trend continuation favored. Execute your plan with conviction.' :
                    data.tradeGrade === 'A'  ? 'Strong conditions. Follow the plan, manage size appropriately.' :
                    data.tradeGrade === 'B'  ? 'Moderate quality. Reduce size. Require clear confirmation before entry.' :
                    data.tradeGrade === 'C'  ? 'Low-quality conditions. Reduce frequency. Only A+ setups.' :
                    data.tradeGrade === 'CHOP' ? 'Market is in chop. Sit on hands. Wait for expansion.' :
                    'Capital preservation mode. Avoid trading. Protect your account.';

                  return (
                    <div className="rounded-xl p-4"
                      style={{ background: gs.bg, border: `1px solid ${gs.border}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl font-black font-mono" style={{ color: gs.color }}>{data.tradeGrade}</span>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: gs.color }}>Grade</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>{behavior}</p>
                    </div>
                  );
                })()}

                {/* Best strategy */}
                <div className="mt-3 rounded-xl p-4" style={{ background: '#13161d', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="sec-label mb-2">Best Strategy Right Now</p>
                  {(() => {
                    const strategy =
                      data.tradeScore >= 80 && data.bias !== 'neutral' ? { name: data.bias === 'bullish' ? 'Trend Continuation Long' : 'Trend Continuation Short', rationale: `Regime: ${data.regimeDetail?.label ?? data.regime}. Bias aligned. High quality.` } :
                      data.orb.status === 'above' && data.bias === 'bullish' ? { name: 'ORB Breakout Long', rationale: 'Price above ORB high. Bullish bias confirmed. Volume check required.' } :
                      data.orb.status === 'below' && data.bias === 'bearish' ? { name: 'ORB Breakdown Short', rationale: 'Price below ORB low. Bearish bias confirmed.' } :
                      data.tradeScore < 45 ? { name: 'NO TRADE', rationale: 'Conditions do not meet minimum quality threshold.' } :
                      { name: 'Pullback Entry', rationale: 'Wait for retrace to VWAP or key level with confirmation.' };

                    const noTrade = strategy.name === 'NO TRADE';
                    return (
                      <>
                        <p className="text-sm font-black" style={{ color: noTrade ? R : G }}>{strategy.name}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#9ca3af' }}>{strategy.rationale}</p>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* SECTION 8 — Emotional protection layer */}
              <div className="cp-card">
                <SectionHeader title="Emotional Protection Layer" accent={R} />

                {/* Warnings */}
                {data.aiWarnings.length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    {data.aiWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
                        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <AlertTriangle size={11} style={{ color: A, flexShrink: 0, marginTop: 1 }} />
                        <span style={{ color: '#d1d5db' }}>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Emotional state */}
                <p className="text-xs mb-2" style={{ color: '#6b7280' }}>How are you feeling right now?</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {EMOTIONAL_STATES.map(e => (
                    <button
                      key={e.id}
                      onClick={() => saveSession({ ...session, emotionalState: e.id })}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: session.emotionalState === e.id ? `${e.riskColor}18` : 'rgba(0,0,0,0.3)',
                        border: `1px solid ${session.emotionalState === e.id ? e.riskColor + '55' : 'rgba(255,255,255,0.07)'}`,
                        color: session.emotionalState === e.id ? e.riskColor : '#6b7280',
                      }}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>

                {(emotionalState.id === 'frustrated') && (
                  <div className="rounded-lg p-2.5 mb-3" style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)' }}>
                    <p className="text-xs font-bold" style={{ color: R }}>Stop trading now — emotional state compromised.</p>
                  </div>
                )}
                {(emotionalState.id === 'excited' || emotionalState.id === 'anxious') && (
                  <div className="rounded-lg p-2.5 mb-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p className="text-xs font-bold" style={{ color: A }}>{emotionalState.description}</p>
                  </div>
                )}

                {/* No-trade active zone */}
                {!noTradeActive && data.noTrade && !data.noTrade.active && (
                  <div className="rounded-lg p-2.5" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)' }}>
                    <p className="text-xs font-semibold" style={{ color: G }}>No-trade conditions clear. Environment looks tradeable.</p>
                  </div>
                )}

                {/* Session avoidance */}
                {data.session?.shouldAvoid && (
                  <div className="mt-2 rounded-lg p-2.5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p className="text-xs font-bold" style={{ color: A }}>{data.session.avoidReason}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHART ──────────────────────────────────────────────────────── */}
          <div className="cp-card">
            <SectionHeader
              title={`NQ Futures — ${data.orb.timeframe}m Chart`}
              right={
                <div className="flex items-center gap-3 text-xs">
                  {[
                    { color: G,        label: 'Price' },
                    { color: '#a78bfa', label: 'VWAP' },
                    { color: A,        label: 'EMA9' },
                    { color: '#60a5fa', label: 'EMA21' },
                  ].map(({ color, label }) => (
                    <span key={label} className="flex items-center gap-1" style={{ color: '#374151' }}>
                      <span className="inline-block w-4 h-0.5" style={{ background: color }} />
                      {label}
                    </span>
                  ))}
                </div>
              }
            />
            <MNQChart
              data={data.candles}
              orb={data.orb}
              vwap={data.vwap}
              ema9={data.ema9}
              ema21={data.ema21}
              liquidity={data.liquidity}
            />
          </div>

          {/* ── ORB + LIQUIDITY | HTF ──────────────────────────────────────── */}
          {!focusMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* ORB Module */}
              <div className="cp-card">
                <SectionHeader
                  title={`ORB — ${data.orb.timeframe}m`}
                  right={
                    <span className="text-xs font-bold px-2 py-0.5 rounded font-mono"
                      style={{
                        color: data.orb.status === 'above' ? G : data.orb.status === 'below' ? R : A,
                        background: data.orb.status === 'above' ? 'rgba(0,255,136,0.1)' : data.orb.status === 'below' ? 'rgba(255,59,59,0.1)' : 'rgba(245,158,11,0.1)',
                        border: `1px solid ${data.orb.status === 'above' ? 'rgba(0,255,136,0.3)' : data.orb.status === 'below' ? 'rgba(255,59,59,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      }}>
                      {data.orb.status === 'above' ? '▲ ABOVE' : data.orb.status === 'below' ? '▼ BELOW' : '◆ INSIDE'}
                    </span>
                  }
                />

                <div className="space-y-0.5 text-xs mb-4">
                  {[
                    { label: 'T3 Up 2×', price: data.orb.t3Up, color: G,        highlight: data.mnqPrice >= data.orb.t3Up },
                    { label: 'T2 Up 1×', price: data.orb.t2Up, color: '#4ade80', highlight: data.mnqPrice >= data.orb.t2Up },
                    { label: 'T1 Up ½×', price: data.orb.t1Up, color: '#86efac', highlight: data.mnqPrice >= data.orb.t1Up },
                    { label: 'ORB HIGH', price: data.orb.high, color: G,         highlight: data.mnqPrice >= data.orb.high, bold: true },
                  ].map(row => (
                    <div key={row.label}
                      className="flex justify-between px-3 py-1.5 rounded-lg"
                      style={{ background: row.highlight ? 'rgba(0,255,136,0.07)' : '#13161d' }}>
                      <span style={{ color: row.color, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                      <span className="font-mono" style={{ color: row.color }}>{row.price.toFixed(0)}</span>
                      <span style={{ color: '#374151' }}>{row.highlight ? '✓' : `+${(row.price - data.mnqPrice).toFixed(0)}pt`}</span>
                    </div>
                  ))}

                  <div className="flex justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
                    <span className="font-bold" style={{ color: G }}>CURRENT</span>
                    <span className="font-mono font-black" style={{ color: '#f0f0f0' }}>{data.mnqPrice.toFixed(0)}</span>
                    <span className="font-bold text-xs" style={{ color: G }}>NOW</span>
                  </div>
                  <div className="flex justify-between px-3 py-1.5 rounded-lg" style={{ background: '#13161d' }}>
                    <span style={{ color: '#6b7280' }}>ORB MID</span>
                    <span className="font-mono" style={{ color: '#9ca3af' }}>{data.orb.mid.toFixed(0)}</span>
                    <span style={{ color: data.mnqPrice >= data.orb.mid ? G : R }}>
                      {data.mnqPrice >= data.orb.mid ? 'Above' : 'Below'}
                    </span>
                  </div>

                  {[
                    { label: 'ORB LOW',  price: data.orb.low,  color: R,        highlight: data.mnqPrice <= data.orb.low,  bold: true },
                    { label: 'T1 Dn ½×', price: data.orb.t1Dn, color: '#f87171', highlight: data.mnqPrice <= data.orb.t1Dn },
                    { label: 'T2 Dn 1×', price: data.orb.t2Dn, color: R,        highlight: data.mnqPrice <= data.orb.t2Dn },
                    { label: 'T3 Dn 2×', price: data.orb.t3Dn, color: '#fca5a5', highlight: data.mnqPrice <= data.orb.t3Dn },
                  ].map(row => (
                    <div key={row.label}
                      className="flex justify-between px-3 py-1.5 rounded-lg"
                      style={{ background: row.highlight ? 'rgba(255,59,59,0.07)' : '#13161d' }}>
                      <span style={{ color: row.color, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                      <span className="font-mono" style={{ color: row.color }}>{row.price.toFixed(0)}</span>
                      <span style={{ color: '#374151' }}>{row.highlight ? '✓' : `-${(data.mnqPrice - row.price).toFixed(0)}pt`}</span>
                    </div>
                  ))}
                </div>

                {/* Liquidity levels */}
                {data.liquidity && (
                  <>
                    <SectionHeader title="Liquidity Levels" />
                    <div className="space-y-0.5 text-xs mb-2">
                      {[
                        { label: 'Overnight High', val: data.liquidity.overnightHigh, color: A },
                        { label: 'Overnight Low',  val: data.liquidity.overnightLow,  color: A },
                        { label: 'Asia High',      val: data.liquidity.asiaHigh,      color: '#60a5fa' },
                        { label: 'Asia Low',       val: data.liquidity.asiaLow,       color: '#60a5fa' },
                        { label: 'London High',    val: data.liquidity.londonHigh,    color: '#a78bfa' },
                        { label: 'London Low',     val: data.liquidity.londonLow,     color: '#a78bfa' },
                      ].filter(l => l.val != null && l.val > 0).map(l => (
                        <div key={l.label} className="flex justify-between px-3 py-1.5 rounded-lg" style={{ background: '#13161d' }}>
                          <span style={{ color: l.color }}>{l.label}</span>
                          <span className="font-mono" style={{ color: l.color }}>{(l.val as number).toFixed(0)}</span>
                          <span style={{ color: '#374151' }}>{Math.abs((l.val as number) - data.mnqPrice).toFixed(0)}pt</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* HTF Alignment */}
              <HTFPanel />
            </div>
          )}

          {/* ── AI MENTOR + RISK ENGINE ──────────────────────────────────── */}
          {!focusMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* AI Mentor */}
              <div className="cp-card" style={{ borderLeft: '2px solid rgba(0,255,136,0.3)' }}>
                <SectionHeader title="AI Trade Mentor" />

                {data.session && (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs"
                    style={{ background: '#13161d' }}>
                    <span>{data.session.emoji}</span>
                    <span style={{ color: '#9ca3af' }}>
                      {data.session.label} · {data.session.badge} · {data.session.minutesRemaining}m remaining
                    </span>
                    {data.regimeDetail && (
                      <>
                        <ChevronRight size={10} style={{ color: '#374151' }} />
                        <span className="font-bold" style={{ color: regimeStyle(data.regimeDetail.color).text }}>
                          {data.regimeDetail.label}
                        </span>
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {[
                    { label: 'Situation',    content: data.aiSummary,      accent: '#9ca3af' },
                    { label: 'Ideal Entry',  content: data.aiEntry,        accent: G },
                    { label: 'Invalidation', content: data.aiInvalidation, accent: R },
                    { label: 'Targets',      content: data.aiTargets,      accent: '#a78bfa' },
                  ].map(({ label, content, accent }) => (
                    <div key={label} className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: accent, fontSize: '9px' }}>
                        {label}
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: '#d1d5db' }}>{content}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Engine */}
              <div className="cp-card" style={{ borderLeft: '2px solid rgba(255,59,59,0.3)' }}>
                <SectionHeader title="Risk Engine" accent={R} />

                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: 'Account', value: accountSize, setter: setAccountSize },
                    { label: 'Max Loss $', value: maxDailyLoss, setter: setMaxDailyLoss },
                    { label: 'Max Trades', value: maxTrades, setter: setMaxTrades },
                  ].map(({ label, value, setter }) => (
                    <div key={label}>
                      <p className="text-xs mb-1 uppercase tracking-wider" style={{ color: '#374151', fontSize: '9px' }}>{label}</p>
                      <input
                        type="number"
                        value={value}
                        onChange={e => setter(Number(e.target.value))}
                        className="w-full rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none transition-colors"
                        style={{
                          background: '#13161d',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: '#f0f0f0',
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 mb-4">
                  <p className="sec-label">ATR Levels · {data.risk.rr1} / {data.risk.rr2}</p>
                  {[
                    { label: 'STOP', price: data.risk.stopDir, pts: data.risk.stopPts, color: R,        bg: 'rgba(255,59,59,0.07)'   },
                    { label: 'T1',   price: data.risk.t1,      pts: data.risk.t1Pts,   color: '#4ade80', bg: 'rgba(74,222,128,0.07)' },
                    { label: 'T2',   price: data.risk.t2,      pts: data.risk.t2Pts,   color: G,         bg: 'rgba(0,255,136,0.07)'  },
                    { label: 'T3',   price: data.risk.t3,      pts: data.risk.t3Pts,   color: G,         bg: 'rgba(0,255,136,0.1)'   },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                      style={{ background: row.bg, border: `1px solid ${row.color}22` }}>
                      <span className="font-bold w-10" style={{ color: row.color }}>{row.label}</span>
                      <span className="font-mono font-bold" style={{ color: row.color }}>{row.price.toFixed(0)}</span>
                      <span style={{ color: '#9ca3af' }}>{row.label === 'STOP' ? `-${row.pts}` : `+${row.pts}`}pt</span>
                      <span style={{ color: '#6b7280' }}>${row.pts * 2}/MNQ</span>
                    </div>
                  ))}
                </div>

                <p className="sec-label">Contract Sizing</p>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 5].map(contracts => {
                    const riskUSD = data.risk.stopPts * 2 * contracts;
                    const riskPct = (riskUSD / accountSize) * 100;
                    const safe    = riskPct <= 1.5;
                    return (
                      <div key={contracts} className="rounded-lg p-2.5 text-xs"
                        style={{
                          background: safe ? 'rgba(0,255,136,0.06)' : 'rgba(255,59,59,0.06)',
                          border: `1px solid ${safe ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,59,0.2)'}`,
                        }}>
                        <p className="font-bold font-mono" style={{ color: safe ? G : R }}>{contracts} MNQ</p>
                        <p style={{ color: '#9ca3af' }}>${riskUSD.toLocaleString()} risk</p>
                        <p className="font-mono" style={{ color: safe ? G : R }}>{riskPct.toFixed(1)}% {safe ? '✓' : '✗'}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── PRE-TRADE CHECKLIST + ECONOMIC EVENTS ───────────────────── */}
          {!focusMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Pre-trade checklist */}
              <div className="cp-card">
                <SectionHeader
                  title="Pre-Trade Checklist"
                  right={
                    <span className="text-xs font-bold font-mono px-2 py-0.5 rounded"
                      style={{
                        color: criticalOk && checklistPct >= 80 ? G : criticalOk ? A : R,
                        background: criticalOk && checklistPct >= 80 ? 'rgba(0,255,136,0.1)' : criticalOk ? 'rgba(245,158,11,0.1)' : 'rgba(255,59,59,0.1)',
                      }}>
                      {checkedCount}/{CHECKLIST.length}
                    </span>
                  }
                />

                <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: '#1a1d26' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${checklistPct}%`,
                      background: criticalOk && checklistPct === 100 ? G : criticalOk ? A : R,
                    }} />
                </div>

                <div className="space-y-0.5">
                  {CHECKLIST.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-xs transition-all"
                      style={{
                        background: session.checklist[item.id] ? 'rgba(0,255,136,0.06)' : item.critical ? 'rgba(255,59,59,0.04)' : '#13161d',
                        border: `1px solid ${session.checklist[item.id] ? 'rgba(0,255,136,0.2)' : item.critical ? 'rgba(255,59,59,0.1)' : 'rgba(255,255,255,0.04)'}`,
                      }}
                    >
                      <span style={{ color: session.checklist[item.id] ? G : item.critical ? R : '#374151', flexShrink: 0 }}>
                        {session.checklist[item.id] ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      </span>
                      <span style={{ color: session.checklist[item.id] ? '#d1d5db' : '#6b7280', fontWeight: item.critical ? 600 : 400 }}>
                        {item.label}
                      </span>
                      {item.critical && !session.checklist[item.id] && (
                        <span className="ml-auto text-xs font-bold" style={{ color: R, fontSize: '9px' }}>CRITICAL</span>
                      )}
                    </button>
                  ))}
                </div>

                {!criticalOk && (
                  <div className="mt-3 rounded-lg p-2.5 text-center"
                    style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)' }}>
                    <p className="text-xs font-bold" style={{ color: R }}>
                      {criticalTotal - criticalChecked} critical item(s) unchecked — do not trade
                    </p>
                  </div>
                )}
              </div>

              {/* Economic Calendar */}
              <div className="cp-card">
                <SectionHeader title="Economic Calendar" accent={A} />
                <div className="space-y-1.5">
                  {ECONOMIC_EVENTS.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                      style={{
                        background: ev.riskLevel === 'HIGH' ? 'rgba(255,59,59,0.06)' : '#13161d',
                        border: `1px solid ${ev.riskLevel === 'HIGH' ? 'rgba(255,59,59,0.2)' : 'rgba(255,255,255,0.04)'}`,
                      }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold" style={{ color: '#f0f0f0' }}>{ev.name}</span>
                          <Chip
                            label={ev.riskLevel}
                            color={ev.riskLevel === 'HIGH' ? R : A}
                            bg={ev.riskLevel === 'HIGH' ? 'rgba(255,59,59,0.1)' : 'rgba(245,158,11,0.1)'}
                          />
                        </div>
                        <p className="mt-0.5" style={{ color: '#374151' }}>{ev.description}</p>
                      </div>
                      {ev.name === 'Jobless Claims' && thursdayCountdown && (
                        <span className="font-mono font-bold shrink-0" style={{ color: A }}>{thursdayCountdown}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
