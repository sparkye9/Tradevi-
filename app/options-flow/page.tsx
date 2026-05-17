'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  Layers, TrendingUp, TrendingDown, Activity, AlertTriangle,
  RefreshCw, Zap, Shield, Target, BarChart2, Minus,
  CheckCircle, XCircle,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OptionsFlowResult {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  calls: {
    totalVolume: number;
    totalOI: number;
    premiumFlow: number;
    avgIV: number;
    sweepCount: number;
    largeBlockCount: number;
    maxVolStrike: number;
    callWall: number;
  };
  puts: {
    totalVolume: number;
    totalOI: number;
    premiumFlow: number;
    avgIV: number;
    sweepCount: number;
    largeBlockCount: number;
    maxVolStrike: number;
    putWall: number;
  };
  pcRatioVolume: number;
  pcRatioOI: number;
  ivSkew: number;
  maxPain: number;
  callWall: number;
  putWall: number;
  bullishScore: number;
  bearishScore: number;
  flowBias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  phase: 'accumulation' | 'manipulation' | 'expansion' | 'distribution' | 'unknown';
  phaseReason: string;
  sweeps: { type: 'call' | 'put'; strike: number; volume: number; oi: number; premium: number; ratio: number }[];
  largeBlocks: { type: 'call' | 'put'; strike: number; volume: number; premium: number; iv: number }[];
  ivExpanding: boolean;
  unusualActivity: boolean;
  suggestion: 'CALLS' | 'PUTS' | 'WAIT' | 'SCALP';
  aiInterpretation: string;
  nearestExpiry: string;
  expiryDaysAway: number;
  fetchedAt: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TICKERS = ['QQQ', 'SPY', 'TQQQ', 'NVDA', 'TSLA'] as const;
type Ticker = typeof TICKERS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtPremium(p: number): string {
  if (p >= 1_000_000) return `$${(p / 1_000_000).toFixed(2)}M`;
  if (p >= 1_000)     return `$${(p / 1_000).toFixed(0)}K`;
  return `$${p.toFixed(0)}`;
}

function pctColor(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
}

function fmt(n: number, d = 2) {
  return n >= 0 ? `+${n.toFixed(d)}` : n.toFixed(d);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DarkCard({
  children,
  className = '',
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: 'bullish' | 'bearish' | 'neutral' | 'none';
}) {
  const glowClass =
    glow === 'bullish' ? 'shadow-[0_0_20px_rgba(16,185,129,0.25)]' :
    glow === 'bearish' ? 'shadow-[0_0_20px_rgba(239,68,68,0.25)]' :
    glow === 'neutral' ? 'shadow-[0_0_20px_rgba(139,92,246,0.15)]' : '';
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 transition-all duration-500 ${glowClass} ${className}`}>
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

function Badge({
  children,
  color = 'gray',
  size = 'sm',
}: {
  children: React.ReactNode;
  color?: string;
  size?: 'sm' | 'lg';
}) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-950 text-emerald-400 border-emerald-700',
    red:     'bg-red-950 text-red-400 border-red-700',
    amber:   'bg-amber-950 text-amber-400 border-amber-700',
    blue:    'bg-blue-950 text-blue-400 border-blue-700',
    purple:  'bg-purple-950 text-purple-400 border-purple-700',
    gray:    'bg-gray-800 text-gray-400 border-gray-700',
  };
  const sz = size === 'lg' ? 'px-3 py-1 text-sm font-black' : 'px-2 py-0.5 text-xs font-bold';
  return (
    <span className={`inline-flex items-center rounded border ${sz} ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
}

function ScoreBar({
  value,
  color,
  label,
}: {
  value: number;
  color: 'emerald' | 'red' | 'purple';
  label: string;
}) {
  const bg = color === 'emerald' ? 'bg-emerald-500' : color === 'red' ? 'bg-red-500' : 'bg-purple-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="font-bold">{value}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Phase model steps ────────────────────────────────────────────────────────

const PHASES = [
  {
    id: 'accumulation',
    label: 'ACCUMULATION',
    num: 'Phase 1',
    bullets: ['Quiet buying', 'Sideways move', 'High vol absorb'],
    color: 'blue',
  },
  {
    id: 'manipulation',
    label: 'MANIPULATION',
    num: 'Phase 2',
    bullets: ['Liquidity sweep', 'Stop hunt', 'Wick expansion'],
    color: 'amber',
  },
  {
    id: 'expansion',
    label: 'EXPANSION',
    num: 'Phase 3',
    bullets: ['Breakout', 'Volume surge', 'Momentum'],
    color: 'emerald',
  },
  {
    id: 'distribution',
    label: 'DISTRIBUTION',
    num: 'Phase 4',
    bullets: ['Smart exits', 'IV compression', 'Flow weakening'],
    color: 'red',
  },
] as const;

// ─── Checklist items ──────────────────────────────────────────────────────────

type ChecklistData = {
  bullish: { label: string; getValue: (d: OptionsFlowResult) => boolean }[];
  bearish: { label: string; getValue: (d: OptionsFlowResult) => boolean }[];
};

const CHECKLIST: ChecklistData = {
  bullish: [
    { label: 'P/C ratio < 0.8 (bullish flow)', getValue: d => d.pcRatioVolume < 0.8 },
    { label: 'Call premium > put premium',      getValue: d => d.calls.premiumFlow > d.puts.premiumFlow },
    { label: 'Call sweeps detected',             getValue: d => d.calls.sweepCount > 0 },
    { label: 'Bullish score > 60',              getValue: d => d.bullishScore > 60 },
    { label: 'Unusual call activity',           getValue: d => d.unusualActivity && d.calls.sweepCount > 0 },
    { label: 'Low / negative IV skew',          getValue: d => d.ivSkew < 0.02 },
    { label: 'Call wall above current price',   getValue: d => d.callWall > d.price },
  ],
  bearish: [
    { label: 'P/C ratio > 1.2 (bearish flow)', getValue: d => d.pcRatioVolume > 1.2 },
    { label: 'Put premium > call premium',      getValue: d => d.puts.premiumFlow > d.calls.premiumFlow },
    { label: 'Put sweeps detected',             getValue: d => d.puts.sweepCount > 0 },
    { label: 'Bearish score > 60',              getValue: d => d.bearishScore > 60 },
    { label: 'Unusual put activity',            getValue: d => d.unusualActivity && d.puts.sweepCount > 0 },
    { label: 'High positive IV skew',           getValue: d => d.ivSkew > 0.05 },
    { label: 'Put wall below current price',    getValue: d => d.putWall > 0 && d.putWall < d.price },
  ],
};

// ─── Filter type ──────────────────────────────────────────────────────────────

type ActiveFilter = 'all' | 'calls' | 'puts' | 'blocks';

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function OptionsFlowPage() {
  const [selectedTicker, setSelectedTicker] = useState<Ticker>('QQQ');
  const [data, setData]         = useState<OptionsFlowResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [lastUpdated, setLastUpdated] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async (ticker: Ticker = selectedTicker) => {
    setLoading(true);
    setError('');
    try {
      const res = await window.fetch(`/api/options-flow?symbol=${ticker}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Analysis failed');
      setData(json.data as OptionsFlowResult);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [selectedTicker]);

  useEffect(() => {
    if (autoRefresh) {
      doFetch();
      timerRef.current = setInterval(() => doFetch(), 60_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, doFetch]);

  // Derived
  const bias = data?.flowBias ?? 'neutral';
  const glowMode: 'bullish' | 'bearish' | 'neutral' =
    bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'neutral';

  const totalPremium = data ? data.calls.premiumFlow + data.puts.premiumFlow : 0;
  const callPct = totalPremium > 0 ? Math.round((data!.calls.premiumFlow / totalPremium) * 100) : 50;
  const putPct  = 100 - callPct;

  // Setup quality grade
  function setupGrade(): { grade: string; label: string; color: string } {
    if (!data) return { grade: '—', label: '—', color: 'text-gray-500' };
    const c = data.confidence;
    if (c >= 80) return { grade: 'A+', label: 'Strong Setup', color: 'text-emerald-400' };
    if (c >= 65) return { grade: 'A',  label: 'Good Setup',   color: 'text-emerald-300' };
    if (c >= 50) return { grade: 'B',  label: 'Moderate',     color: 'text-yellow-400' };
    if (c >= 35) return { grade: 'C',  label: 'Weak Setup',   color: 'text-orange-400' };
    return { grade: 'AVOID', label: 'No Clear Edge', color: 'text-red-400' };
  }
  const grade = setupGrade();

  // Filtered sweeps/blocks for table
  const tableRows: (OptionsFlowResult['sweeps'][0] | OptionsFlowResult['largeBlocks'][0] & { isSweep?: boolean })[] =
    data ? (() => {
      if (activeFilter === 'calls')  return data.sweeps.filter(s => s.type === 'call');
      if (activeFilter === 'puts')   return data.sweeps.filter(s => s.type === 'put');
      if (activeFilter === 'blocks') return data.largeBlocks;
      return [...data.sweeps, ...data.largeBlocks].sort((a, b) => b.premium - a.premium).slice(0, 20);
    })() : [];

  // Suggestion label
  const suggestionLabel =
    data?.suggestion === 'CALLS' ? 'LOOK FOR CALLS' :
    data?.suggestion === 'PUTS'  ? 'LOOK FOR PUTS'  :
    data?.suggestion === 'SCALP' ? 'SCALP ONLY'     : 'WAIT';
  const suggestionColor =
    data?.suggestion === 'CALLS' ? 'text-emerald-400 border-emerald-700 bg-emerald-950' :
    data?.suggestion === 'PUTS'  ? 'text-red-400 border-red-700 bg-red-950'             :
    data?.suggestion === 'SCALP' ? 'text-amber-400 border-amber-700 bg-amber-950'       :
    'text-gray-400 border-gray-700 bg-gray-800';

  return (
    <AppShell title="Options Order Flow Intelligence">
      <div className="-m-4 lg:-m-6 bg-gray-950 min-h-screen p-4 lg:p-5">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="mb-4">
          <h1 className="text-xl font-black text-gray-100 flex items-center gap-2">
            <Layers size={20} className="text-purple-400" />
            Options Order Flow Intelligence
          </h1>
          <p className="text-gray-500 text-xs mt-0.5">Smart money detection · sweep analysis · phase model · AI interpretation</p>
        </div>

        {/* ── CONTROLS ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Ticker pills */}
            <div className="flex gap-1">
              {TICKERS.map(t => (
                <button key={t} onClick={() => { setSelectedTicker(t); setData(null); setError(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    selectedTicker === t
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-purple-500 hover:text-purple-300'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <button onClick={() => doFetch()} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Analyze
            </button>
            <button onClick={() => setAutoRefresh(a => !a)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                autoRefresh
                  ? 'bg-emerald-900/40 border-emerald-700 text-emerald-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}>
              <Zap size={12} /> {autoRefresh ? 'Live ON' : 'Auto Refresh'}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            {lastUpdated && <span>Updated {lastUpdated}</span>}
            <span>Data: Yahoo Finance (delayed)</span>
          </div>
        </div>

        {/* ── ERROR ──────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-950 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
            <XCircle size={14} />
            <span className="flex-1">{error}</span>
            <button onClick={() => doFetch()} className="text-xs underline">Retry</button>
          </div>
        )}

        {/* ── EMPTY STATE ────────────────────────────────────────────── */}
        {!data && !loading && !error && (
          <div className="text-center py-24">
            <Layers size={52} className="text-purple-800 mx-auto mb-4" />
            <p className="text-gray-300 font-semibold text-lg">Select a ticker and click Analyze</p>
            <p className="text-gray-600 text-sm mt-2">Fetches real options chain · smart money flow · sweep detection · AI interpretation</p>
          </div>
        )}

        {/* ── LOADING ────────────────────────────────────────────────── */}
        {loading && !data && (
          <div className="text-center py-24">
            <div className="w-10 h-10 border-[3px] border-purple-800 border-t-purple-400 rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-4">Analyzing options flow for {selectedTicker}…</p>
          </div>
        )}

        {data && (
          <div className="space-y-4">

            {/* ── SECTION 1: FLOW DIRECTION BANNER ─────────────────── */}
            <div className={`rounded-xl border px-5 py-4 transition-all duration-500 ${
              data.phase === 'manipulation'
                ? 'bg-amber-950/50 border-amber-600 animate-pulse'
                : bias === 'bullish'
                ? 'bg-emerald-950/40 border-emerald-700 shadow-[0_0_30px_rgba(16,185,129,0.2)]'
                : bias === 'bearish'
                ? 'bg-red-950/40 border-red-700 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                : 'bg-purple-950/30 border-purple-800'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    {bias === 'bullish'
                      ? <TrendingUp size={28} className="text-emerald-400" />
                      : bias === 'bearish'
                      ? <TrendingDown size={28} className="text-red-400" />
                      : <Minus size={28} className="text-gray-400" />
                    }
                    <span className={`text-3xl font-black ${
                      bias === 'bullish' ? 'text-emerald-400' :
                      bias === 'bearish' ? 'text-red-400' : 'text-gray-300'
                    }`}>
                      {bias === 'bullish' ? 'BULLISH FLOW' : bias === 'bearish' ? 'BEARISH FLOW' : 'NEUTRAL FLOW'}
                    </span>
                    <Badge
                      color={data.phase === 'accumulation' ? 'blue' : data.phase === 'manipulation' ? 'amber' : data.phase === 'expansion' ? 'emerald' : data.phase === 'distribution' ? 'red' : 'gray'}
                      size="lg"
                    >
                      {data.phase.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-gray-400 text-sm">{data.phaseReason}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Confidence</p>
                    <p className={`text-2xl font-black ${
                      data.confidence >= 70 ? 'text-emerald-400' :
                      data.confidence >= 40 ? 'text-amber-400' : 'text-gray-400'
                    }`}>{data.confidence}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Suggestion</p>
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-sm font-black ${suggestionColor}`}>
                      {suggestionLabel}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">{data.symbol}</p>
                    <p className="text-xl font-black text-gray-100">${data.price.toFixed(2)}</p>
                    <p className={`text-xs font-semibold ${pctColor(data.changePct)}`}>{fmt(data.changePct)}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: MARKET FLOW OVERVIEW ──────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

              {/* Card 1: Smart Money Bias */}
              <DarkCard glow={glowMode}>
                <SectionTitle icon={<Shield size={15} />} title="Smart Money Bias" />
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-3 rounded-xl ${
                    bias === 'bullish' ? 'bg-emerald-900/40' :
                    bias === 'bearish' ? 'bg-red-900/40' : 'bg-gray-800'
                  }`}>
                    {bias === 'bullish'
                      ? <TrendingUp size={24} className="text-emerald-400" />
                      : bias === 'bearish'
                      ? <TrendingDown size={24} className="text-red-400" />
                      : <Minus size={24} className="text-gray-400" />
                    }
                  </div>
                  <div>
                    <p className={`font-black text-2xl ${
                      bias === 'bullish' ? 'text-emerald-400' :
                      bias === 'bearish' ? 'text-red-400' : 'text-gray-300'
                    }`}>{bias.toUpperCase()}</p>
                    <p className="text-gray-500 text-xs">Confidence {data.confidence}%</p>
                  </div>
                </div>
                <ScoreBar value={data.bullishScore} color="emerald" label="Bullish Score" />
                <div className="mt-2">
                  <ScoreBar value={data.bearishScore} color="red" label="Bearish Score" />
                </div>
              </DarkCard>

              {/* Card 2: Options Flow Strength */}
              <DarkCard glow={glowMode}>
                <SectionTitle icon={<BarChart2 size={15} />} title="Flow Strength" />
                <div className="space-y-2 text-xs">
                  {/* Call vs Put volume bars */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-gray-400">
                      <span className="text-emerald-400">Calls {fmtNum(data.calls.totalVolume)}</span>
                      <span className="text-red-400">Puts {fmtNum(data.puts.totalVolume)}</span>
                    </div>
                    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 transition-all duration-700" style={{ width: `${callPct}%` }} />
                      <div className="bg-red-600 flex-1 transition-all duration-700" />
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>{callPct}% calls</span>
                      <span>{putPct}% puts</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <div className="bg-gray-800 rounded-lg p-2">
                      <p className="text-gray-500">P/C Vol</p>
                      <p className={`font-bold text-sm ${
                        data.pcRatioVolume < 0.7 ? 'text-emerald-400' :
                        data.pcRatioVolume > 1.3 ? 'text-red-400' : 'text-gray-300'
                      }`}>{data.pcRatioVolume.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2">
                      <p className="text-gray-500">P/C OI</p>
                      <p className={`font-bold text-sm ${
                        data.pcRatioOI < 0.7 ? 'text-emerald-400' :
                        data.pcRatioOI > 1.3 ? 'text-red-400' : 'text-gray-300'
                      }`}>{data.pcRatioOI.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg p-2">
                    <p className="text-gray-500 mb-0.5">Premium Flow</p>
                    <p className="text-emerald-400 font-semibold">{fmtPremium(data.calls.premiumFlow)} calls</p>
                    <p className="text-red-400 font-semibold">{fmtPremium(data.puts.premiumFlow)} puts</p>
                  </div>
                </div>
              </DarkCard>

              {/* Card 3: Institutional Activity */}
              <DarkCard glow={data.unusualActivity ? glowMode : 'none'}>
                <SectionTitle icon={<Activity size={15} />} title="Institutional Activity" />
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-emerald-950/40 border border-emerald-900 rounded-lg p-2">
                      <p className="text-gray-500">Call Sweeps</p>
                      <p className="text-2xl font-black text-emerald-400">{data.calls.sweepCount}</p>
                    </div>
                    <div className="bg-red-950/40 border border-red-900 rounded-lg p-2">
                      <p className="text-gray-500">Put Sweeps</p>
                      <p className="text-2xl font-black text-red-400">{data.puts.sweepCount}</p>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg p-2">
                      <p className="text-gray-500">Call Blocks</p>
                      <p className="text-xl font-black text-emerald-300">{data.calls.largeBlockCount}</p>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg p-2">
                      <p className="text-gray-500">Put Blocks</p>
                      <p className="text-xl font-black text-red-300">{data.puts.largeBlockCount}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className={`flex-1 rounded-lg p-2 border text-center ${
                      data.unusualActivity ? 'bg-amber-950/40 border-amber-700' : 'bg-gray-800 border-gray-700'
                    }`}>
                      <p className="text-gray-500">Unusual</p>
                      <p className={`font-black text-sm ${data.unusualActivity ? 'text-amber-400' : 'text-gray-500'}`}>
                        {data.unusualActivity ? 'YES' : 'NO'}
                      </p>
                    </div>
                    <div className={`flex-1 rounded-lg p-2 border text-center ${
                      data.ivExpanding ? 'bg-purple-950/40 border-purple-800' : 'bg-gray-800 border-gray-700'
                    }`}>
                      <p className="text-gray-500">IV</p>
                      <p className={`font-black text-sm ${data.ivExpanding ? 'text-purple-400' : 'text-gray-400'}`}>
                        {data.ivExpanding ? 'EXPANDING' : 'STABLE'}
                      </p>
                    </div>
                  </div>
                </div>
              </DarkCard>

              {/* Card 4: Key Levels */}
              <DarkCard glow="neutral">
                <SectionTitle icon={<Target size={15} />} title="Key Levels" />
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: 'Max Pain',  value: data.maxPain,   color: 'text-purple-400' },
                    { label: 'Call Wall', value: data.callWall,  color: 'text-emerald-400' },
                    { label: 'Put Wall',  value: data.putWall,   color: 'text-red-400' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                      <span className="text-gray-400">{row.label}</span>
                      <span className={`font-bold ${row.color}`}>${row.value.toFixed(2)}</span>
                      <span className={`${row.value > data.price ? 'text-emerald-600' : 'text-red-600'} text-[10px]`}>
                        {row.value > data.price ? '↑' : '↓'} {Math.abs(row.value - data.price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                    <span className="text-gray-400">IV Skew</span>
                    <span className={`font-bold ${
                      data.ivSkew > 0.05 ? 'text-red-400' : data.ivSkew < -0.02 ? 'text-emerald-400' : 'text-gray-300'
                    }`}>{(data.ivSkew * 100).toFixed(1)}%</span>
                    <span className={`text-[10px] ${data.ivSkew > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {data.ivSkew > 0.05 ? 'bearish' : data.ivSkew < -0.02 ? 'bullish' : 'neutral'}
                    </span>
                  </div>
                  {data.nearestExpiry && (
                    <div className="flex justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                      <span className="text-gray-400">Expiry</span>
                      <span className="text-gray-300 font-medium">{data.nearestExpiry}</span>
                      <span className="text-gray-500 text-[10px]">{data.expiryDaysAway}d</span>
                    </div>
                  )}
                </div>
              </DarkCard>
            </div>

            {/* ── SECTION 3: SMART MONEY PHASE MODEL ───────────────── */}
            <DarkCard>
              <SectionTitle icon={<Activity size={15} />} title="Smart Money Phase Model" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {PHASES.map((p, i) => {
                  const isActive = data.phase === p.id;
                  const colorMap: Record<string, string> = {
                    blue:    isActive ? 'bg-blue-950/60 border-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-gray-800/40 border-gray-700',
                    amber:   isActive ? 'bg-amber-950/60 border-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-gray-800/40 border-gray-700',
                    emerald: isActive ? 'bg-emerald-950/60 border-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-gray-800/40 border-gray-700',
                    red:     isActive ? 'bg-red-950/60 border-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-gray-800/40 border-gray-700',
                  };
                  const textMap: Record<string, string> = {
                    blue: 'text-blue-400', amber: 'text-amber-400', emerald: 'text-emerald-400', red: 'text-red-400',
                  };
                  return (
                    <div key={p.id} className={`rounded-xl border p-3 transition-all duration-500 ${colorMap[p.color]}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-bold ${isActive ? textMap[p.color] : 'text-gray-600'}`}>
                          {p.num}
                        </span>
                        {isActive && <span className="w-2 h-2 rounded-full bg-current animate-pulse ml-auto" style={{ color: textMap[p.color].replace('text-', '').split('-')[0] }} />}
                      </div>
                      <p className={`font-black text-sm mb-2 ${isActive ? textMap[p.color] : 'text-gray-500'}`}>{p.label}</p>
                      <div className="space-y-1">
                        {p.bullets.map(b => (
                          <p key={b} className={`text-[10px] ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>
                            {isActive ? '▸ ' : '  '}{b}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Arrow connector for md+ */}
              <div className="hidden md:flex items-center justify-center gap-2 text-xs text-gray-600 -mt-2 mb-3">
                {PHASES.slice(0, 3).map((p, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <span className={data.phase === p.id ? 'text-purple-400 font-bold' : 'text-gray-700'}>{p.label}</span>
                    <span className="text-gray-700">→</span>
                  </span>
                ))}
                <span className={data.phase === 'distribution' ? 'text-red-400 font-bold' : 'text-gray-700'}>DISTRIBUTION</span>
              </div>
              <div className={`rounded-lg px-4 py-2.5 border text-center ${
                data.phase === 'manipulation' ? 'bg-amber-950/40 border-amber-700' :
                data.phase === 'expansion'    ? 'bg-emerald-950/40 border-emerald-800' :
                data.phase === 'accumulation' ? 'bg-blue-950/40 border-blue-800' :
                data.phase === 'distribution' ? 'bg-red-950/40 border-red-800' :
                'bg-gray-800/40 border-gray-700'
              }`}>
                <p className="text-gray-300 text-sm">
                  Current Market is in <span className={`font-black ${
                    data.phase === 'accumulation' ? 'text-blue-400' :
                    data.phase === 'manipulation' ? 'text-amber-400' :
                    data.phase === 'expansion'    ? 'text-emerald-400' :
                    data.phase === 'distribution' ? 'text-red-400' : 'text-gray-400'
                  }`}>{data.phase.toUpperCase()}</span> Phase
                </p>
                <p className="text-gray-500 text-xs mt-0.5">{data.phaseReason}</p>
              </div>
            </DarkCard>

            {/* ── SECTION 4: CALL FLOW vs PUT FLOW ─────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* CALL FLOW */}
              <DarkCard glow="bullish">
                <SectionTitle icon={<TrendingUp size={15} />} title="CALL FLOW" />
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Call Volume',    value: fmtNum(data.calls.totalVolume),       color: 'text-emerald-400' },
                      { label: 'Call OI',        value: fmtNum(data.calls.totalOI),           color: 'text-emerald-300' },
                      { label: 'Premium Flow',   value: fmtPremium(data.calls.premiumFlow),   color: 'text-emerald-400' },
                      { label: 'Avg Call IV',    value: `${(data.calls.avgIV * 100).toFixed(1)}%`, color: 'text-emerald-300' },
                      { label: 'Call Sweeps',    value: String(data.calls.sweepCount),        color: data.calls.sweepCount > 0 ? 'text-amber-400' : 'text-gray-500' },
                      { label: 'Large Blocks',   value: String(data.calls.largeBlockCount),   color: data.calls.largeBlockCount > 0 ? 'text-emerald-400' : 'text-gray-500' },
                      { label: 'Max Vol Strike', value: `$${data.calls.maxVolStrike}`,        color: 'text-emerald-300' },
                      { label: 'Call Wall',      value: `$${data.callWall}`,                  color: 'text-emerald-400' },
                    ].map(row => (
                      <div key={row.label} className="bg-emerald-950/20 rounded-lg px-3 py-2">
                        <p className="text-gray-500 text-xs">{row.label}</p>
                        <p className={`font-bold ${row.color}`}>{row.value}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Bullish Pressure</p>
                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${data.bullishScore}%` }} />
                    </div>
                    <p className="text-emerald-400 text-xs mt-0.5 font-bold">{data.bullishScore}/100</p>
                  </div>
                </div>
              </DarkCard>

              {/* PUT FLOW */}
              <DarkCard glow="bearish">
                <SectionTitle icon={<TrendingDown size={15} />} title="PUT FLOW" />
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Put Volume',     value: fmtNum(data.puts.totalVolume),        color: 'text-red-400' },
                      { label: 'Put OI',         value: fmtNum(data.puts.totalOI),            color: 'text-red-300' },
                      { label: 'Premium Flow',   value: fmtPremium(data.puts.premiumFlow),    color: 'text-red-400' },
                      { label: 'Avg Put IV',     value: `${(data.puts.avgIV * 100).toFixed(1)}%`, color: 'text-red-300' },
                      { label: 'Put Sweeps',     value: String(data.puts.sweepCount),         color: data.puts.sweepCount > 0 ? 'text-amber-400' : 'text-gray-500' },
                      { label: 'Large Blocks',   value: String(data.puts.largeBlockCount),    color: data.puts.largeBlockCount > 0 ? 'text-red-400' : 'text-gray-500' },
                      { label: 'Max Vol Strike', value: `$${data.puts.maxVolStrike}`,         color: 'text-red-300' },
                      { label: 'Put Wall',       value: `$${data.putWall}`,                   color: 'text-red-400' },
                    ].map(row => (
                      <div key={row.label} className="bg-red-950/20 rounded-lg px-3 py-2">
                        <p className="text-gray-500 text-xs">{row.label}</p>
                        <p className={`font-bold ${row.color}`}>{row.value}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Bearish Pressure</p>
                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full transition-all duration-700" style={{ width: `${data.bearishScore}%` }} />
                    </div>
                    <p className="text-red-400 text-xs mt-0.5 font-bold">{data.bearishScore}/100</p>
                  </div>
                </div>
              </DarkCard>
            </div>

            {/* ── SECTION 5: FLOW SCORE SYSTEM ─────────────────────── */}
            <DarkCard>
              <SectionTitle icon={<Zap size={15} />} title="Flow Score System" />
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Bullish Score</p>
                  <p className={`text-5xl font-black ${data.bullishScore >= 60 ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {data.bullishScore}
                  </p>
                  <p className="text-gray-600 text-xs">/100</p>
                </div>
                <div className="text-center border-x border-gray-800">
                  <p className="text-xs text-gray-500 mb-1">Reversal Risk</p>
                  <p className="text-5xl font-black text-purple-400">
                    {Math.round(100 - Math.max(data.bullishScore, data.bearishScore))}
                  </p>
                  <p className="text-gray-600 text-xs">%</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Bearish Score</p>
                  <p className={`text-5xl font-black ${data.bearishScore >= 60 ? 'text-red-400' : 'text-gray-500'}`}>
                    {data.bearishScore}
                  </p>
                  <p className="text-gray-600 text-xs">/100</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: 'Trend Continuation',
                    value: Math.round(Math.max(data.bullishScore, data.bearishScore)),
                    color: data.bullishScore > data.bearishScore ? 'emerald' : 'red',
                  },
                  {
                    label: 'Fakeout Probability',
                    value: data.phase === 'manipulation' ? 75 : Math.round(100 - data.confidence),
                    color: 'amber',
                  },
                  {
                    label: 'Reversal Risk',
                    value: Math.round(100 - Math.max(data.bullishScore, data.bearishScore)),
                    color: 'purple',
                  },
                ].map(stat => {
                  const bg =
                    stat.color === 'emerald' ? 'bg-emerald-950/30 border-emerald-900' :
                    stat.color === 'red'     ? 'bg-red-950/30 border-red-900' :
                    stat.color === 'amber'   ? 'bg-amber-950/30 border-amber-900' :
                    'bg-purple-950/30 border-purple-900';
                  const text =
                    stat.color === 'emerald' ? 'text-emerald-400' :
                    stat.color === 'red'     ? 'text-red-400' :
                    stat.color === 'amber'   ? 'text-amber-400' : 'text-purple-400';
                  return (
                    <div key={stat.label} className={`rounded-xl border p-3 text-center ${bg}`}>
                      <p className="text-gray-500 text-xs mb-1">{stat.label}</p>
                      <p className={`text-2xl font-black ${text}`}>{stat.value}%</p>
                    </div>
                  );
                })}
              </div>
            </DarkCard>

            {/* ── SECTION 6: TRADE DECISION ENGINE ─────────────────── */}
            <DarkCard glow={glowMode}>
              <SectionTitle icon={<Target size={15} />} title="Trade Decision Engine" />
              <p className="text-gray-400 text-xs mb-4">What Is Price MOST LIKELY Trying To Do?</p>

              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                {/* Direction */}
                <div className="flex items-center gap-3">
                  {bias === 'bullish'
                    ? <TrendingUp size={40} className="text-emerald-400" />
                    : bias === 'bearish'
                    ? <TrendingDown size={40} className="text-red-400" />
                    : <Minus size={40} className="text-gray-400" />
                  }
                  <div>
                    <p className="text-gray-500 text-xs">Likely Direction</p>
                    <p className={`text-3xl font-black ${
                      bias === 'bullish' ? 'text-emerald-400' :
                      bias === 'bearish' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {bias === 'bullish' ? '↑ BULLISH' : bias === 'bearish' ? '↓ BEARISH' : '→ NEUTRAL'}
                    </p>
                  </div>
                </div>

                {/* Suggestion badge */}
                <div className="text-center">
                  <p className="text-gray-500 text-xs mb-1">Trade Suggestion</p>
                  <span className={`inline-flex items-center px-5 py-2.5 rounded-xl border-2 text-2xl font-black tracking-wider ${suggestionColor}`}>
                    {data.suggestion}
                  </span>
                </div>

                {/* Grade + confidence */}
                <div className="space-y-2 text-center">
                  <div>
                    <p className="text-gray-500 text-xs">Setup Quality</p>
                    <p className={`text-4xl font-black ${grade.color}`}>{grade.grade}</p>
                    <p className={`text-xs ${grade.color}`}>{grade.label}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Confidence</p>
                    <p className="text-lg font-black text-gray-200">{data.confidence}%</p>
                  </div>
                </div>
              </div>

              {/* Key reasoning */}
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Key Reasoning</p>
                {[
                  `P/C Volume ratio: ${data.pcRatioVolume.toFixed(2)} → ${data.pcRatioVolume < 0.7 ? 'Bullish flow dominance' : data.pcRatioVolume > 1.3 ? 'Bearish flow dominance' : 'Balanced / neutral'}`,
                  `${data.calls.sweepCount + data.puts.sweepCount} sweep(s) detected — ${data.calls.sweepCount > data.puts.sweepCount ? 'call' : data.puts.sweepCount > data.calls.sweepCount ? 'put' : 'no'} side dominant`,
                  `Phase: ${data.phase.toUpperCase()} — ${data.phaseReason.slice(0, 80)}${data.phaseReason.length > 80 ? '…' : ''}`,
                ].map((point, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-800/60 rounded-lg px-3 py-2 text-xs text-gray-300">
                    <span className="text-purple-400 shrink-0 mt-0.5">▸</span>
                    {point}
                  </div>
                ))}
              </div>
            </DarkCard>

            {/* ── SECTION 7: ORDER FLOW CHECKLISTS ─────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* BULLISH CHECKLIST */}
              <DarkCard glow="bullish">
                <SectionTitle icon={<CheckCircle size={15} />} title="Bullish Flow Checklist" />
                <div className="space-y-1.5">
                  {CHECKLIST.bullish.map((item, i) => {
                    const checked = item.getValue(data);
                    return (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                        checked ? 'bg-emerald-950/30 text-emerald-300' : 'bg-gray-800/40 text-gray-500'
                      }`}>
                        {checked
                          ? <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                          : <XCircle size={13} className="text-gray-600 shrink-0" />
                        }
                        {item.label}
                      </div>
                    );
                  })}
                  <div className="pt-2">
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                        style={{ width: `${(CHECKLIST.bullish.filter(i => i.getValue(data)).length / CHECKLIST.bullish.length) * 100}%` }} />
                    </div>
                    <p className="text-emerald-400 text-xs mt-1 font-bold">
                      {CHECKLIST.bullish.filter(i => i.getValue(data)).length}/{CHECKLIST.bullish.length} bullish signals
                    </p>
                  </div>
                </div>
              </DarkCard>

              {/* BEARISH CHECKLIST */}
              <DarkCard glow="bearish">
                <SectionTitle icon={<AlertTriangle size={15} />} title="Bearish Flow Checklist" />
                <div className="space-y-1.5">
                  {CHECKLIST.bearish.map((item, i) => {
                    const checked = item.getValue(data);
                    return (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                        checked ? 'bg-red-950/30 text-red-300' : 'bg-gray-800/40 text-gray-500'
                      }`}>
                        {checked
                          ? <CheckCircle size={13} className="text-red-400 shrink-0" />
                          : <XCircle size={13} className="text-gray-600 shrink-0" />
                        }
                        {item.label}
                      </div>
                    );
                  })}
                  <div className="pt-2">
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full transition-all duration-700"
                        style={{ width: `${(CHECKLIST.bearish.filter(i => i.getValue(data)).length / CHECKLIST.bearish.length) * 100}%` }} />
                    </div>
                    <p className="text-red-400 text-xs mt-1 font-bold">
                      {CHECKLIST.bearish.filter(i => i.getValue(data)).length}/{CHECKLIST.bearish.length} bearish signals
                    </p>
                  </div>
                </div>
              </DarkCard>
            </div>

            {/* ── SECTION 8: SWEEPS & LARGE BLOCKS TABLE ───────────── */}
            <DarkCard>
              <SectionTitle
                icon={<BarChart2 size={15} />}
                title="Sweeps & Large Blocks"
                right={
                  <div className="flex gap-1">
                    {(['all', 'calls', 'puts', 'blocks'] as ActiveFilter[]).map(f => (
                      <button key={f} onClick={() => setActiveFilter(f)}
                        className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                          activeFilter === f
                            ? 'bg-purple-600 text-white border-purple-500'
                            : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'
                        }`}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                }
              />

              {tableRows.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <BarChart2 size={32} className="mx-auto mb-2 text-gray-700" />
                  <p className="text-sm">No sweeps detected — market flowing normally</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-600 border-b border-gray-800">
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-right py-2 px-2">Strike</th>
                        <th className="text-right py-2 px-2">Volume</th>
                        {'oi' in (tableRows[0] ?? {}) && <th className="text-right py-2 px-2">OI</th>}
                        {'ratio' in (tableRows[0] ?? {}) && <th className="text-right py-2 px-2">V/OI</th>}
                        {'iv' in (tableRows[0] ?? {}) && <th className="text-right py-2 px-2">IV</th>}
                        <th className="text-right py-2 px-2">Premium</th>
                        <th className="text-center py-2 px-2">Dir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, i) => {
                        const isCall = row.type === 'call';
                        const rowBg = isCall ? 'bg-emerald-950/20 hover:bg-emerald-950/30' : 'bg-red-950/20 hover:bg-red-950/30';
                        const textC = isCall ? 'text-emerald-400' : 'text-red-400';
                        const hasSweepFields = 'oi' in row;
                        return (
                          <tr key={i} className={`border-b border-gray-800/50 transition-colors ${rowBg}`}>
                            <td className={`py-2 px-2 font-bold uppercase ${textC}`}>{row.type}</td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">${row.strike}</td>
                            <td className="py-2 px-2 text-right text-gray-300">{fmtNum(row.volume)}</td>
                            {hasSweepFields && (
                              <td className="py-2 px-2 text-right text-gray-500">{fmtNum((row as { oi: number }).oi)}</td>
                            )}
                            {hasSweepFields && (
                              <td className={`py-2 px-2 text-right font-bold ${textC}`}>{(row as { ratio: number }).ratio.toFixed(1)}x</td>
                            )}
                            {!hasSweepFields && (
                              <td className="py-2 px-2 text-right text-gray-500">{((row as { iv: number }).iv * 100).toFixed(1)}%</td>
                            )}
                            <td className={`py-2 px-2 text-right font-bold ${textC}`}>{fmtPremium(row.premium)}</td>
                            <td className={`py-2 px-2 text-center font-black text-lg ${textC}`}>
                              {isCall ? '↑' : '↓'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </DarkCard>

            {/* ── SECTION 9: AI FLOW INTERPRETATION ────────────────── */}
            <DarkCard glow="neutral">
              <SectionTitle icon={<Activity size={15} />} title="AI Flow Analysis" />

              <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
                <p className="text-gray-300 text-sm leading-relaxed">{data.aiInterpretation}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  {
                    label: 'Smart Money Activity',
                    value: data.unusualActivity || data.sweeps.length > 0 ? 'HIGH' : data.largeBlocks.length > 0 ? 'MODERATE' : 'LOW',
                    color: data.unusualActivity ? 'text-amber-400' : data.largeBlocks.length > 0 ? 'text-blue-400' : 'text-gray-500',
                  },
                  {
                    label: 'Flow Regime',
                    value: data.phase.toUpperCase(),
                    color:
                      data.phase === 'accumulation' ? 'text-blue-400' :
                      data.phase === 'manipulation' ? 'text-amber-400' :
                      data.phase === 'expansion'    ? 'text-emerald-400' :
                      data.phase === 'distribution' ? 'text-red-400' : 'text-gray-400',
                  },
                  {
                    label: 'Risk Level',
                    value: data.ivExpanding && data.phase === 'manipulation' ? 'EXTREME' :
                           data.ivExpanding ? 'HIGH' :
                           data.confidence < 40 ? 'ELEVATED' : 'NORMAL',
                    color: (data.ivExpanding && data.phase === 'manipulation') ? 'text-red-400' :
                           data.ivExpanding ? 'text-amber-400' :
                           data.confidence < 40 ? 'text-yellow-400' : 'text-emerald-400',
                  },
                ].map(item => (
                  <div key={item.label} className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
                    <p className="text-gray-500 text-xs">{item.label}</p>
                    <p className={`font-black text-sm mt-0.5 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-700 text-center">
                Educational analysis only — not financial advice. Options can expire worthless. Options data from Yahoo Finance (delayed).
                Verify all data in your broker platform before trading. Past flow patterns do not guarantee future results.
              </p>
            </DarkCard>

          </div>
        )}
      </div>
    </AppShell>
  );
}
