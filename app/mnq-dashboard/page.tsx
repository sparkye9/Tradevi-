'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle,
  CheckCircle, XCircle, Clock, Zap, RefreshCw,
  ShieldAlert, BookOpen, Bell, Target, BarChart2,
  ChevronUp, ChevronDown, Minus, Info,
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
  vwap: number; ema9: number | null; ema21: number | null;
  ema50: number | null; rsi: number | null; atr: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  biasScore: number;
  biasFactors: { label: string; signal: 'bullish' | 'bearish' | 'neutral'; detail: string; pts: number }[];
  tradeScore: number;
  tradeGrade: 'A+' | 'A' | 'B' | 'C' | 'AVOID' | 'CHOP';
  gradeLabel: string;
  isChop: boolean;
  chopReasons: string[];
  regime: string;
  risk: {
    stopPts: number; t1Pts: number; t2Pts: number; t3Pts: number;
    stopDir: number; t1: number; t2: number; t3: number;
    mnqPerStop: number; rr1: string; rr2: string;
  };
  aiSummary: string; aiEntry: string; aiInvalidation: string;
  aiTargets: string; aiWarnings: string[];
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  dataSource: string;
  fetchedAt: string;
}

interface SessionState {
  tradesCount: number;
  dailyPnL: number;
  stopped: boolean;
  stopReason: string;
  checklist: Record<string, boolean>;
  notes: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TIMEFRAMES = [1, 5, 10, 15, 30] as const;
type TF = typeof TIMEFRAMES[number];

const CHECKLIST_ITEMS = [
  { id: 'vwap',    label: 'Price on correct side of VWAP' },
  { id: 'orb',     label: 'ORB broken in bias direction' },
  { id: 'rsi',     label: 'RSI confirming (not extreme)' },
  { id: 'volume',  label: 'Volume expanding on move' },
  { id: 'htf',     label: 'Higher timeframe aligned' },
  { id: 'stop',    label: 'Stop loss defined before entry' },
  { id: 'rr',      label: 'R:R ≥ 1:2 confirmed' },
  { id: 'news',    label: 'No major news in next 30 min' },
  { id: 'limits',  label: 'Daily loss limit not reached' },
  { id: 'chop',    label: 'Not in chop / low-edge zone' },
];

const DAILY_RULES = [
  'Max 3 trades per session — quality over quantity',
  'No trading first 5 min of RTH (9:30–9:35 AM ET)',
  'Stop after 2 consecutive losses — reset mindset',
  'Never risk more than 1% of account per trade',
  'No revenge trades — if you feel emotional, step away',
  'Journal every trade: entry, exit, reason, emotion',
  'Be patient — the setup must come to you, not the other way',
];

// ─── Color helpers ─────────────────────────────────────────────────────────────

function c(n: number, decimals = 2) {
  return n >= 0 ? `+${n.toFixed(decimals)}` : n.toFixed(decimals);
}

function pctColor(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
}

function signalColor(s: 'bullish' | 'bearish' | 'neutral') {
  return s === 'bullish' ? 'text-emerald-400' : s === 'bearish' ? 'text-red-400' : 'text-gray-400';
}

function gradeColor(g: string) {
  if (g === 'A+') return 'text-emerald-400 border-emerald-500';
  if (g === 'A')  return 'text-emerald-300 border-emerald-600';
  if (g === 'B')  return 'text-yellow-400 border-yellow-600';
  if (g === 'C')  return 'text-orange-400 border-orange-600';
  return 'text-red-400 border-red-700';
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DarkCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${className}`}>
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

function TickerPill({ label, price, changePct, highlight = false }: {
  label: string; price: number; changePct: number; highlight?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${
      highlight ? 'bg-purple-900/30 border-purple-700' : 'bg-gray-900 border-gray-800'
    }`}>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <span className="text-lg font-bold text-gray-100">{price.toLocaleString()}</span>
      <span className={`text-xs font-semibold ${pctColor(changePct)}`}>{c(changePct, 2)}%</span>
    </div>
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
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${rsi}%` }} />
      </div>
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function MNQChart({ data, orb, vwap, ema9, ema21 }: {
  data: { time: number; close: number; volume: number }[];
  orb: MNQData['orb'];
  vwap: number;
  ema9: number | null;
  ema21: number | null;
}) {
  const chartData = data.map(c => ({
    t: new Date(c.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    close: c.close,
    volume: c.volume / 1000,
    vwap,
    ema9:  ema9,
    ema21: ema21,
  }));

  const prices = data.map(d => d.close);
  const minP = Math.min(...prices) - 10;
  const maxP = Math.max(...prices) + 10;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#6b7280' }} interval={11} />
        <YAxis yAxisId="price" domain={[minP, maxP]} tick={{ fontSize: 9, fill: '#6b7280' }}
          tickFormatter={v => v.toFixed(0)} width={60} />
        <YAxis yAxisId="vol" orientation="right" tick={false} width={0} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#e5e7eb' }}
          formatter={(v: unknown, name: string) => [
            typeof v === 'number' ? name === 'volume' ? `${(v as number).toFixed(0)}K` : (v as number).toFixed(2) : String(v),
            name,
          ] as [string, string]}
        />

        {/* ORB zone */}
        <ReferenceArea yAxisId="price" y1={orb.low} y2={orb.high} fill="#7c3aed" fillOpacity={0.06} />

        {/* ORB lines */}
        <ReferenceLine yAxisId="price" y={orb.high} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `ORB H ${orb.high.toFixed(0)}`, position: 'right', fontSize: 9, fill: '#10b981' }} />
        <ReferenceLine yAxisId="price" y={orb.low} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `ORB L ${orb.low.toFixed(0)}`, position: 'right', fontSize: 9, fill: '#ef4444' }} />
        <ReferenceLine yAxisId="price" y={vwap} stroke="#a78bfa" strokeDasharray="6 3" strokeWidth={1.5}
          label={{ value: `VWAP ${vwap.toFixed(0)}`, position: 'right', fontSize: 9, fill: '#a78bfa' }} />

        {/* Volume bars */}
        <Bar yAxisId="vol" dataKey="volume" fill="#374151" opacity={0.6} radius={[1, 1, 0, 0]} />

        {/* Price area */}
        <Area yAxisId="price" type="monotone" dataKey="close" stroke="#6366f1" fill="#6366f120"
          strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#818cf8' }} />

        {/* EMA lines */}
        {ema9  && <Line yAxisId="price" type="monotone" dataKey="ema9"  stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
        {ema21 && <Line yAxisId="price" type="monotone" dataKey="ema21" stroke="#3b82f6" strokeWidth={1.5} dot={false} />}
      </ComposedChart>
    </ResponsiveContainer>
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session state persisted in localStorage
  const [session, setSession] = useState<SessionState>(() => {
    if (typeof window === 'undefined') return {
      tradesCount: 0, dailyPnL: 0, stopped: false,
      stopReason: '', checklist: {}, notes: '',
    };
    const today = new Date().toDateString();
    const saved = localStorage.getItem('mnq-session');
    if (saved) {
      const p = JSON.parse(saved);
      if (p.date === today) return p;
    }
    return { tradesCount: 0, dailyPnL: 0, stopped: false, stopReason: '', checklist: {}, notes: '', date: today };
  });

  const saveSession = useCallback((s: SessionState) => {
    setSession(s);
    localStorage.setItem('mnq-session', JSON.stringify({ ...s, date: new Date().toDateString() }));
  }, []);

  const fetch = useCallback(async () => {
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
      fetch();
      timerRef.current = setInterval(fetch, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetch]);

  const toggleChecklist = (id: string) => {
    saveSession({ ...session, checklist: { ...session.checklist, [id]: !session.checklist[id] } });
  };

  const checkedCount = CHECKLIST_ITEMS.filter(i => session.checklist[i.id]).length;
  const checklistPct = Math.round((checkedCount / CHECKLIST_ITEMS.length) * 100);

  const isRiskSafe =
    !session.stopped &&
    session.tradesCount < maxTrades &&
    session.dailyPnL > -Math.abs(maxDailyLoss);

  // ─── Bias colours & icons ────────────────────────────────────────────────
  const biasBg =
    data?.bias === 'bullish' ? 'bg-emerald-950 border-emerald-800' :
    data?.bias === 'bearish' ? 'bg-red-950 border-red-900' :
    'bg-gray-900 border-gray-800';
  const biasText = data?.bias === 'bullish' ? 'text-emerald-400' : data?.bias === 'bearish' ? 'text-red-400' : 'text-gray-400';
  const BiasIcon = data?.bias === 'bullish' ? TrendingUp : data?.bias === 'bearish' ? TrendingDown : Minus;

  return (
    <AppShell title="MNQ / NQ Futures Dashboard">
      {/* Dark terminal wrapper — bleeds to edges */}
      <div className="-m-4 lg:-m-6 bg-gray-950 min-h-screen p-4 lg:p-5">

        {/* ── CHOP WARNING BANNER ─────────────────────────────────────────── */}
        {data?.isChop && (
          <div className="mb-4 flex items-center gap-3 bg-yellow-950 border border-yellow-700 rounded-xl p-3 text-yellow-300">
            <AlertTriangle size={18} className="shrink-0 text-yellow-400" />
            <div>
              <p className="font-bold text-sm">⚠ AVOID TRADING — LOW EDGE ENVIRONMENT</p>
              <p className="text-xs text-yellow-400 mt-0.5">{data.chopReasons.join(' · ')}</p>
            </div>
          </div>
        )}

        {/* ── SESSION STOPPED BANNER ────────────────────────────────────── */}
        {session.stopped && (
          <div className="mb-4 flex items-center gap-3 bg-red-950 border border-red-700 rounded-xl p-3 text-red-300">
            <ShieldAlert size={18} className="shrink-0" />
            <div>
              <p className="font-bold text-sm">TRADING STOPPED FOR TODAY</p>
              <p className="text-xs text-red-400 mt-0.5">{session.stopReason}</p>
            </div>
            <button onClick={() => saveSession({ ...session, stopped: false, stopReason: '' })}
              className="ml-auto text-xs text-red-400 hover:text-red-200 underline">Reset</button>
          </div>
        )}

        {/* ── TICKER STRIP ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {data?.nq  && <TickerPill label="NQ / MNQ" price={data.nq.price} changePct={data.nq.changePct} highlight />}
            {data?.es  && <TickerPill label="ES" price={data.es.price} changePct={data.es.changePct} />}
            {data?.vix && <TickerPill label="VIX" price={data.vix.price} changePct={data.vix.changePct} />}
            {data?.qqq && <TickerPill label="QQQ" price={data.qqq.price} changePct={data.qqq.changePct} />}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Timeframe selector */}
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
            <button onClick={fetch} disabled={loading}
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
            {lastUpdated && <span className="text-xs text-gray-600">Updated {lastUpdated}</span>}
          </div>
        </div>

        {/* ── ERROR ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-950 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
            <XCircle size={14} />{error}
          </div>
        )}

        {/* ── EMPTY STATE ───────────────────────────────────────────────────── */}
        {!data && !loading && !error && (
          <div className="text-center py-24">
            <BarChart2 size={52} className="text-purple-800 mx-auto mb-4" />
            <p className="text-gray-300 font-semibold text-lg">Select a timeframe and click Analyze</p>
            <p className="text-gray-600 text-sm mt-2">Fetches live NQ futures data · bias engine · ORB levels · options picks</p>
          </div>
        )}

        {/* ── LOADING ──────────────────────────────────────────────────────── */}
        {loading && !data && (
          <div className="text-center py-24">
            <div className="w-10 h-10 border-[3px] border-purple-800 border-t-purple-400 rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-4">Fetching NQ futures data…</p>
          </div>
        )}

        {data && (
          <div className="space-y-4">

            {/* ── ROW 1: BIAS · ORB · TRADE SCORE ─────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* BIAS ENGINE */}
              <DarkCard className={`border ${biasBg} md:col-span-1`}>
                <SectionTitle icon={<Activity size={15} />} title="Market Bias Engine" />
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-3 rounded-xl ${data.bias === 'bullish' ? 'bg-emerald-900/40' : data.bias === 'bearish' ? 'bg-red-900/40' : 'bg-gray-800'}`}>
                    <BiasIcon size={24} className={biasText} />
                  </div>
                  <div>
                    <p className={`font-black text-2xl ${biasText}`}>{data.bias.toUpperCase()}</p>
                    <p className="text-gray-400 text-xs">{data.biasScore}/100 confidence</p>
                  </div>
                  <div className="ml-auto">
                    <div className="w-14 h-14 relative">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2937" strokeWidth="3" />
                        <circle cx="18" cy="18" r="14" fill="none"
                          stroke={data.bias === 'bullish' ? '#10b981' : data.bias === 'bearish' ? '#ef4444' : '#6b7280'}
                          strokeWidth="3" strokeDasharray={`${(data.biasScore / 100) * 88} 88`} strokeLinecap="round" />
                      </svg>
                      <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${biasText}`}>
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

              {/* ORB MODULE */}
              <DarkCard>
                <SectionTitle icon={<Target size={15} />}
                  title={`ORB Module — ${data.orb.timeframe}m`}
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
                {/* Level table */}
                <div className="space-y-1 text-xs">
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
                  {/* Current price */}
                  <div className="flex justify-between px-2 py-1.5 rounded bg-purple-900/30 border border-purple-800">
                    <span className="text-purple-300 font-bold">CURRENT</span>
                    <span className="text-purple-200 font-bold">{data.mnqPrice.toFixed(0)}</span>
                    <span className="text-purple-400 text-xs">NOW</span>
                  </div>
                  {/* ORB Mid */}
                  <div className="flex justify-between px-2 py-1 rounded bg-gray-800/60">
                    <span className="text-gray-400 font-semibold">ORB MID</span>
                    <span className="text-gray-300">{data.orb.mid.toFixed(0)}</span>
                    <span className={data.mnqPrice >= data.orb.mid ? 'text-emerald-500' : 'text-red-500'}>
                      {data.mnqPrice >= data.orb.mid ? 'Above' : 'Below'}
                    </span>
                  </div>
                  {/* ORB Low + downside */}
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
              </DarkCard>

              {/* TRADE SCORE */}
              <DarkCard>
                <SectionTitle icon={<Zap size={15} />} title="Trade Quality Score" />
                <div className="text-center mb-4">
                  <span className={`text-6xl font-black ${gradeColor(data.tradeGrade).split(' ')[0]}`}>
                    {data.tradeGrade}
                  </span>
                  <div className={`text-4xl font-black ${gradeColor(data.tradeGrade).split(' ')[0]} mt-1`}>
                    {data.tradeScore}/100
                  </div>
                  <p className="text-gray-400 text-xs mt-1">{data.gradeLabel}</p>
                </div>
                {/* Score bar */}
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
                  <div className={`h-full rounded-full transition-all ${
                    data.tradeScore >= 85 ? 'bg-emerald-500' : data.tradeScore >= 70 ? 'bg-emerald-700' :
                    data.tradeScore >= 55 ? 'bg-yellow-500' : data.tradeScore >= 40 ? 'bg-orange-500' : 'bg-red-600'
                  }`} style={{ width: `${data.tradeScore}%` }} />
                </div>
                {/* Indicators quick view */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-gray-500">VWAP</p>
                    <p className={`font-bold ${data.mnqPrice >= data.vwap ? 'text-emerald-400' : 'text-red-400'}`}>
                      {data.vwap.toFixed(0)}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-gray-500">EMA 9 / 21</p>
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
                    <p className="font-bold text-amber-400">{data.atr.toFixed(1)} pts</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <p className="text-gray-500">Regime</p>
                    <p className={`font-bold text-xs ${
                      data.regime === 'trending_up' ? 'text-emerald-400' : data.regime === 'trending_down' ? 'text-red-400' :
                      data.regime === 'volatile' ? 'text-orange-400' : 'text-yellow-400'
                    }`}>{data.regime.replace(/_/g, ' ').toUpperCase()}</p>
                  </div>
                </div>
              </DarkCard>
            </div>

            {/* ── ROW 2: CHART ─────────────────────────────────────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<BarChart2 size={15} />}
                title={`NQ Futures — 5m Intraday · ${data.dataSource === 'twelve_data' ? '⚡ Live (TwelveData)' : '⏱ Delayed (Yahoo)'}`}
                right={<span className="text-xs text-gray-600">{data.fetchedAt.slice(11, 19)} UTC</span>}
              />
              {/* Chart legend */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-2">
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-indigo-400 inline-block" /> Price</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-400 inline-block" /> VWAP</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-400 inline-block" /> EMA9</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-blue-400 inline-block" /> EMA21</span>
                <span className="flex items-center gap-1"><span className="w-4 h-1 bg-purple-800 opacity-50 inline-block rounded" /> ORB Zone</span>
              </div>
              <MNQChart data={data.candles} orb={data.orb} vwap={data.vwap} ema9={data.ema9} ema21={data.ema21} />
            </DarkCard>

            {/* ── ROW 3: AI ASSISTANT + RISK ENGINE ───────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* AI TRADE ASSISTANT */}
              <DarkCard>
                <SectionTitle icon={<Info size={15} />} title="AI Trade Assistant" />

                {/* Warnings first — ADHD priority */}
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
                    <p className="text-gray-300 leading-relaxed">{data.aiSummary}</p>
                  </div>
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                      <span className="text-emerald-400">▶ </span>Ideal Entry
                    </p>
                    <p className="text-gray-300 leading-relaxed">{data.aiEntry}</p>
                  </div>
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                      <span className="text-red-400">✕ </span>Invalidation
                    </p>
                    <p className="text-gray-300 leading-relaxed">{data.aiInvalidation}</p>
                  </div>
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                      <span className="text-purple-400">⦿ </span>Targets
                    </p>
                    <p className="text-gray-300 leading-relaxed">{data.aiTargets}</p>
                  </div>
                </div>
              </DarkCard>

              {/* RISK ENGINE */}
              <DarkCard>
                <SectionTitle icon={<ShieldAlert size={15} />} title="Risk Management Engine" />

                {/* Account settings */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div>
                    <label className="text-gray-500 block mb-1">Account Size ($)</label>
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

                {/* Risk levels */}
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">ATR-Based Levels · {data.risk.rr1} / {data.risk.rr2}</p>
                  {[
                    { label: 'STOP',   price: data.risk.stopDir, pts: data.risk.stopPts, color: 'text-red-400 bg-red-950/40 border-red-900' },
                    { label: 'T1',     price: data.risk.t1,      pts: data.risk.t1Pts,   color: 'text-emerald-400 bg-emerald-950/40 border-emerald-900' },
                    { label: 'T2',     price: data.risk.t2,      pts: data.risk.t2Pts,   color: 'text-emerald-300 bg-emerald-950/30 border-emerald-800' },
                    { label: 'T3',     price: data.risk.t3,      pts: data.risk.t3Pts,   color: 'text-emerald-200 bg-emerald-950/20 border-emerald-700' },
                  ].map(row => (
                    <div key={row.label} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${row.color}`}>
                      <span className="font-bold w-10">{row.label}</span>
                      <span className="font-mono font-bold">{row.price.toFixed(0)}</span>
                      <span>{row.label === 'STOP' ? `-${row.pts}` : `+${row.pts}`} pts</span>
                      <span>${row.pts * 2} / MNQ</span>
                    </div>
                  ))}
                </div>

                {/* Position sizing */}
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Prop Firm Safe Sizing</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[1, 2, 3, 5].map(contracts => {
                      const riskUSD = data.risk.stopPts * 2 * contracts;
                      const riskPct = (riskUSD / accountSize) * 100;
                      const safe    = riskPct <= 1.5;
                      return (
                        <div key={contracts} className={`rounded-lg p-2 border ${safe ? 'border-emerald-800 bg-emerald-950/20' : 'border-red-800 bg-red-950/20'}`}>
                          <p className={`font-bold ${safe ? 'text-emerald-400' : 'text-red-400'}`}>{contracts} MNQ</p>
                          <p className="text-gray-300">${riskUSD} risk</p>
                          <p className={safe ? 'text-emerald-500' : 'text-red-500'}>{riskPct.toFixed(1)}% acct {safe ? '✓' : '✗'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </DarkCard>
            </div>

            {/* ── ROW 4: CHECKLIST · DAILY RULES · SESSION ─────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* SETUP CHECKLIST */}
              <DarkCard>
                <SectionTitle
                  icon={<CheckCircle size={15} />}
                  title="Pre-Trade Checklist"
                  right={
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      checklistPct === 100 ? 'bg-emerald-900 text-emerald-400' :
                      checklistPct >= 70  ? 'bg-yellow-900 text-yellow-400' : 'bg-red-900 text-red-400'
                    }`}>{checkedCount}/{CHECKLIST_ITEMS.length}</span>
                  }
                />
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full transition-all ${
                    checklistPct === 100 ? 'bg-emerald-500' : checklistPct >= 70 ? 'bg-yellow-500' : 'bg-red-600'
                  }`} style={{ width: `${checklistPct}%` }} />
                </div>
                <div className="space-y-1.5">
                  {CHECKLIST_ITEMS.map(item => (
                    <button key={item.id} onClick={() => toggleChecklist(item.id)}
                      className={`w-full flex items-center gap-2.5 text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        session.checklist[item.id]
                          ? 'bg-emerald-950/30 text-emerald-300'
                          : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800'
                      }`}>
                      <span className={`shrink-0 ${session.checklist[item.id] ? 'text-emerald-400' : 'text-gray-600'}`}>
                        {session.checklist[item.id] ? <CheckCircle size={13} /> : <XCircle size={13} />}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
                {checklistPct < 80 && (
                  <p className="mt-2 text-xs text-red-400 font-medium text-center">
                    Complete checklist before entering any trade
                  </p>
                )}
              </DarkCard>

              {/* DAILY RULES */}
              <DarkCard>
                <SectionTitle icon={<BookOpen size={15} />} title="Daily Rules" />
                <div className="space-y-2 mb-4">
                  {DAILY_RULES.map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                      <span className="shrink-0 text-purple-500 font-bold mt-0.5">{i + 1}.</span>
                      {rule}
                    </div>
                  ))}
                </div>
                {/* Lockout button */}
                {!session.stopped && (
                  <button onClick={() => saveSession({ ...session, stopped: true, stopReason: 'Manually locked out for today' })}
                    className="w-full py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-400 text-xs font-semibold rounded-lg transition-colors">
                    🔒 Lock Out — I'm Done Trading Today
                  </button>
                )}
              </DarkCard>

              {/* SESSION TRACKER */}
              <DarkCard>
                <SectionTitle icon={<Clock size={15} />} title="Session Tracker" />

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Max Trades/Day</label>
                    <input type="number" value={maxTrades} min={1} max={10}
                      onChange={e => setMaxTrades(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-purple-600" />
                  </div>
                  <div className="flex items-end">
                    <div className={`w-full rounded-lg p-2 text-center ${
                      session.tradesCount >= maxTrades ? 'bg-red-950/40 border border-red-800' : 'bg-gray-800 border border-gray-700'
                    }`}>
                      <p className="text-xs text-gray-500">Trades</p>
                      <p className={`text-xl font-black ${session.tradesCount >= maxTrades ? 'text-red-400' : 'text-gray-200'}`}>
                        {session.tradesCount}/{maxTrades}
                      </p>
                    </div>
                  </div>
                </div>

                {/* P&L tracker */}
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-xs text-gray-500 mb-1">Today's P&L (pts)</p>
                  <div className="flex gap-2">
                    <input type="number" value={session.dailyPnL}
                      onChange={e => saveSession({ ...session, dailyPnL: Number(e.target.value) })}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-200 text-sm font-bold focus:outline-none focus:border-purple-600" />
                    <span className={`text-sm font-bold self-center ${session.dailyPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {session.dailyPnL >= 0 ? '+' : ''}{(session.dailyPnL * 2).toFixed(0)} $ MNQ
                    </span>
                  </div>
                  {session.dailyPnL <= -Math.abs(maxDailyLoss) / 2 && (
                    <p className="text-xs text-amber-400 mt-1">⚠ Approaching daily loss limit</p>
                  )}
                </div>

                {/* Trade count buttons */}
                <div className="flex gap-2">
                  <button onClick={() => saveSession({ ...session, tradesCount: session.tradesCount + 1 })}
                    className="flex-1 py-2 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-800 text-purple-400 text-xs font-semibold rounded-lg">
                    + Log Trade
                  </button>
                  <button onClick={() => saveSession({ ...session, tradesCount: 0, dailyPnL: 0, checklist: {} })}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-xs rounded-lg">
                    Reset
                  </button>
                </div>

                {/* Risk status */}
                <div className={`mt-3 text-center py-2 rounded-lg text-xs font-bold ${
                  isRiskSafe
                    ? 'bg-emerald-950/30 border border-emerald-900 text-emerald-400'
                    : 'bg-red-950/40 border border-red-800 text-red-400'
                }`}>
                  {isRiskSafe ? '✓ Within Risk Parameters' : '✗ LIMITS REACHED — STOP TRADING'}
                </div>
              </DarkCard>
            </div>

            {/* ── ROW 5: NOTES ─────────────────────────────────────────────── */}
            <DarkCard>
              <SectionTitle icon={<Bell size={15} />} title="Session Notes" />
              <textarea
                value={session.notes}
                onChange={e => saveSession({ ...session, notes: e.target.value })}
                placeholder="Quick notes: levels to watch, plan for the day, emotional check-in…"
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-sm placeholder-gray-600 focus:outline-none focus:border-purple-600 resize-none"
              />
            </DarkCard>

            {/* ── DISCLAIMER ───────────────────────────────────────────────── */}
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
