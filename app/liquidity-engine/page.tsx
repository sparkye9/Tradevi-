'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Minus, Activity, AlertTriangle,
  CheckCircle, Target, Zap, RefreshCw, ShieldAlert,
  Clock, BarChart2, Info, ChevronRight, Flame, Eye,
  Droplets, Brain, Layers, Lock, XCircle, ArrowUp, ArrowDown,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LiquidityLevel {
  price: number;
  type: string;
  color: 'red' | 'green' | 'yellow' | 'purple';
  label: string;
  description: string;
  distanceFromPrice: number;
  distancePct: number;
  isAbove: boolean;
}

interface EmotionalSignal {
  type: string;
  detected: boolean;
  severity: 'low' | 'medium' | 'high';
  label: string;
  description: string;
  confirmation: string;
}

interface ScalpContract {
  strike: number;
  contractType: 'call' | 'put';
  tier: 'safer' | 'aggressive';
  approxDelta: number;
  rationale: string;
  momentumFavored: boolean;
  trapRisk: boolean;
}

interface ConfCheck { label: string; met: boolean; }

interface LEData {
  success: boolean;
  error?: string;
  symbol: string;
  currentPrice: number;
  liquidity: LiquidityLevel[];
  emotional: {
    signals: EmotionalSignal[];
    summary: string[];
    dominantCondition: string;
  };
  continuation: {
    alignmentScore: number;
    continuationPct: number;
    reversalPct: number;
    squeezePct: number;
    chopPct: number;
    lowerVsHigherConflict: boolean;
    conflictWarning: string | null;
    tfScores: { label: string; bias: string; score: number }[];
  };
  forecast: {
    scenario: string;
    scenarioLabel: string;
    scenarioDescription: string;
    windows: { label: string; timeRange: string; description: string }[];
    institutionalClosing: boolean;
    profitTakingRisk: boolean;
    trappedTraderRisk: boolean;
    qqqSpyDivergence: string | null;
  };
  strikes: {
    callWatchlist: ScalpContract[];
    putWatchlist: ScalpContract[];
    dominantSide: string;
    trapRiskSide: string;
    zeroDteWarning: string | null;
  };
  confirmation: {
    bullish: ConfCheck[];
    bearish: ConfCheck[];
    alertStatus: string;
    waitingFor: string;
  };
  orderPlan: {
    direction: 'long' | 'short' | null;
    entryNote: string;
    entry: number;
    invalidation: number;
    tp1: number;
    tp2: number;
    riskPct: number;
    rewardPct: number;
    rr: string;
    suggestedOrderType: string;
    momentumStrength: string;
    trailingStopIdea: string;
  };
  protection: {
    warnings: string[];
    encouragements: string[];
  };
  decision: {
    currentBias: string;
    trendStrength: string;
    liquidityDirection: string;
    trapRisk: 'low' | 'medium' | 'high';
    mostLikelyScenario: string;
    bestSetup: string;
    bestTimeWindow: string;
    confirmationNeeded: string;
    suggestedContractZone: string;
    riskLevel: 'low' | 'medium' | 'high';
    confidenceScore: number;
    alertStatus: string;
  };
  companions: {
    vix: { price: number; changePct: number } | null;
    dxy: { price: number; changePct: number } | null;
    tnx: { price: number; changePct: number } | null;
    companion: { symbol: string; price: number; changePct: number } | null;
  };
  fetchedAt: string;
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

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-950 text-emerald-400 border-emerald-700',
    red:     'bg-red-950 text-red-400 border-red-700',
    amber:   'bg-amber-950 text-amber-400 border-amber-700',
    blue:    'bg-blue-950 text-blue-400 border-blue-700',
    purple:  'bg-purple-950 text-purple-400 border-purple-700',
    gray:    'bg-gray-800 text-gray-400 border-gray-700',
    green:   'bg-green-950 text-green-400 border-green-700',
    yellow:  'bg-yellow-950 text-yellow-400 border-yellow-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
}

function ConfidenceMeter({ value, color = '#a78bfa' }: { value: number; color?: string }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const arc = (value / 100) * circumference;
  return (
    <div className="relative w-14 h-14">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="#1f2937" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={radius} fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${arc} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-200">
        {value}
      </span>
    </div>
  );
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

function levelBorderColor(color: LiquidityLevel['color']): string {
  if (color === 'red')    return 'border-l-red-500';
  if (color === 'green')  return 'border-l-emerald-500';
  if (color === 'yellow') return 'border-l-yellow-500';
  return 'border-l-purple-500';
}

function levelBgColor(color: LiquidityLevel['color']): string {
  if (color === 'red')    return 'bg-red-950/20';
  if (color === 'green')  return 'bg-emerald-950/20';
  if (color === 'yellow') return 'bg-yellow-950/20';
  return 'bg-purple-950/20';
}

function levelBadgeColor(color: LiquidityLevel['color']): string {
  if (color === 'red')    return 'red';
  if (color === 'green')  return 'emerald';
  if (color === 'yellow') return 'yellow';
  return 'purple';
}

function alertStatusColors(status: string): string {
  if (status === 'CONFIRMED')     return 'bg-emerald-950/50 border-emerald-600 text-emerald-300';
  if (status === 'HIGH_MOMENTUM') return 'bg-purple-950/50 border-purple-600 text-purple-300';
  if (status === 'TRAP_RISK')     return 'bg-red-950/50 border-red-600 text-red-300';
  if (status === 'NO_TRADE')      return 'bg-gray-800/50 border-gray-600 text-gray-400';
  return 'bg-amber-950/50 border-amber-600 text-amber-300';
}

function decisionBorder(status: string): string {
  if (status === 'CONFIRMED' || status === 'HIGH_MOMENTUM') return 'border-emerald-700 bg-emerald-950/20';
  if (status === 'TRAP_RISK') return 'border-red-700 bg-red-950/20';
  if (status === 'HIGH_MOMENTUM') return 'border-purple-700 bg-purple-950/20';
  return 'border-gray-700 bg-gray-900';
}

function scenarioBg(scenario: string): string {
  if (scenario === 'late_day_squeeze')    return 'bg-purple-950/60 border-purple-700 text-purple-300';
  if (scenario === 'liquidity_flush')     return 'bg-red-950/60 border-red-700 text-red-300';
  if (scenario === 'high_prob_chop')      return 'bg-gray-800/60 border-gray-600 text-gray-400';
  if (scenario === 'trend_continuation')  return 'bg-emerald-950/60 border-emerald-700 text-emerald-300';
  return 'bg-amber-950/40 border-amber-700 text-amber-300';
}

function pctColor(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
}

function fmt(n: number, d = 2) {
  return n >= 0 ? `+${n.toFixed(d)}` : n.toFixed(d);
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function LiquidityEnginePage() {
  const [symbol, setSymbol]     = useState<'SPY' | 'QQQ'>('SPY');
  const [data, setData]         = useState<LEData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const doFetch = useCallback(async (sym: string) => {
    setLoading(true);
    setError('');
    try {
      const res  = await window.fetch(`/api/liquidity-engine?symbol=${sym}`);
      const json: LEData = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Analysis failed');
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, []);

  // Auto-refresh during 2:30-4:00 PM ET
  useEffect(() => {
    const checkWindow = () => {
      const now = new Date();
      const y = now.getFullYear();
      const mar1 = new Date(y, 2, 1).getDay();
      const nov1 = new Date(y, 10, 1).getDay();
      const dstStart = new Date(y, 2, mar1 === 0 ? 8 : 15 - mar1);
      const dstEnd   = new Date(y, 10, nov1 === 0 ? 1 : 8 - nov1);
      const etOff    = now >= dstStart && now < dstEnd ? -4 : -5;
      const etMs     = now.getTime() + etOff * 3600000;
      const etDate   = new Date(etMs);
      const etMin    = etDate.getUTCHours() * 60 + etDate.getUTCMinutes();
      return etMin >= 870 && etMin < 960; // 2:30-4:00 PM ET
    };
    const interval = setInterval(() => {
      if (checkWindow() && data) doFetch(symbol);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [symbol, data, doFetch]);

  const handleSymbol = (sym: 'SPY' | 'QQQ') => {
    setSymbol(sym);
    doFetch(sym);
  };

  const d = data;

  return (
    <AppShell title="Liquidity &amp; Emotional Exit Engine">
      <div className="-m-4 lg:-m-6 bg-gray-950 min-h-screen p-4 lg:p-5">

        {/* ── HEADER ROW ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-900/40 border border-blue-700">
              <Droplets size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-gray-100 font-black text-lg">Liquidity &amp; Emotional Exit Engine</h1>
              <p className="text-gray-500 text-xs">Liquidity mapping, emotional exits, and smart scalp strikes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-gray-600 flex items-center gap-1">
                <Clock size={10} /> {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* ── SYMBOL SELECTOR ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(['SPY', 'QQQ'] as const).map(sym => (
            <button
              key={sym}
              onClick={() => handleSymbol(sym)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                symbol === sym
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-blue-500 hover:text-blue-300'
              }`}
            >
              {sym}
            </button>
          ))}
          <button
            onClick={() => doFetch(symbol)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            Analyze
          </button>
        </div>

        {/* ── ERROR ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-950 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* ── EMPTY STATE ───────────────────────────────────────────────── */}
        {!d && !loading && !error && (
          <div className="text-center py-24">
            <Droplets size={52} className="text-blue-800 mx-auto mb-4" />
            <p className="text-gray-300 font-semibold text-lg">Select a symbol and click Analyze</p>
            <p className="text-gray-600 text-sm mt-2">
              Maps liquidity levels, detects emotional exits, and generates smart scalp strikes
            </p>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────── */}
        {loading && !d && (
          <div className="text-center py-24">
            <div className="w-10 h-10 border-[3px] border-blue-800 border-t-blue-400 rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-4">Running liquidity analysis for {symbol}...</p>
          </div>
        )}

        {/* ── MAIN CONTENT ──────────────────────────────────────────────── */}
        {d && (
          <div className="space-y-4">

            {/* ── PRICE HEADER ──────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <div>
                <p className="text-gray-500 text-xs font-medium">{d.symbol}</p>
                <p className="text-3xl font-black text-gray-100">${d.currentPrice.toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-bold px-3 py-1 rounded-lg border ${alertStatusColors(d.decision.alertStatus)}`}>
                  {d.decision.alertStatus}
                </span>
                <Badge color={d.decision.riskLevel === 'high' ? 'red' : d.decision.riskLevel === 'medium' ? 'amber' : 'emerald'}>
                  {d.decision.riskLevel.toUpperCase()} RISK
                </Badge>
                <Badge color={d.decision.trapRisk === 'high' ? 'red' : d.decision.trapRisk === 'medium' ? 'amber' : 'emerald'}>
                  TRAP: {d.decision.trapRisk.toUpperCase()}
                </Badge>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <ConfidenceMeter
                  value={d.decision.confidenceScore}
                  color={d.decision.alertStatus === 'CONFIRMED' || d.decision.alertStatus === 'HIGH_MOMENTUM' ? '#10b981' : d.decision.alertStatus === 'TRAP_RISK' ? '#ef4444' : '#6b7280'}
                />
                <div>
                  <p className="text-gray-100 font-bold text-sm">{d.decision.currentBias}</p>
                  <p className="text-gray-500 text-xs">{d.decision.trendStrength}</p>
                </div>
              </div>
            </div>

            {/* ── SECTION 1: LIQUIDITY MAPPING ──────────────────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<Droplets size={15} />}
                title="Liquidity Mapping Engine"
                right={<Badge color="blue">{d.liquidity.length} levels mapped</Badge>}
              />

              {d.liquidity.length === 0 ? (
                <p className="text-gray-600 text-sm">No liquidity levels detected — insufficient candle data</p>
              ) : (
                <div className="space-y-3">
                  {/* Above price */}
                  {d.liquidity.filter(l => l.isAbove).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
                        <ArrowUp size={10} className="text-red-400" /> Above Current Price
                      </p>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto">
                        {d.liquidity.filter(l => l.isAbove).map((lv, i) => (
                          <div key={i} className={`border-l-4 ${levelBorderColor(lv.color)} ${levelBgColor(lv.color)} rounded-r-lg px-3 py-2`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Badge color={levelBadgeColor(lv.color)}>{lv.label}</Badge>
                                <span className="text-gray-200 font-black text-sm">${lv.price.toFixed(2)}</span>
                              </div>
                              <span className="text-xs text-red-400 font-semibold">+{lv.distanceFromPrice.toFixed(2)} pts above ({lv.distancePct.toFixed(2)}%)</span>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">{lv.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Below price */}
                  {d.liquidity.filter(l => !l.isAbove).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
                        <ArrowDown size={10} className="text-emerald-400" /> Below Current Price
                      </p>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto">
                        {d.liquidity.filter(l => !l.isAbove).map((lv, i) => (
                          <div key={i} className={`border-l-4 ${levelBorderColor(lv.color)} ${levelBgColor(lv.color)} rounded-r-lg px-3 py-2`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Badge color={levelBadgeColor(lv.color)}>{lv.label}</Badge>
                                <span className="text-gray-200 font-black text-sm">${lv.price.toFixed(2)}</span>
                              </div>
                              <span className="text-xs text-emerald-400 font-semibold">-{lv.distanceFromPrice.toFixed(2)} pts below ({lv.distancePct.toFixed(2)}%)</span>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">{lv.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DarkCard>

            {/* ── SECTION 2: EMOTIONAL EXIT DETECTOR ───────────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<Brain size={15} />}
                title="Emotional Exit Detector"
                right={<Badge color={d.emotional.signals.filter(s => s.detected).length === 0 ? 'emerald' : 'amber'}>
                  {d.emotional.signals.filter(s => s.detected).length} signals active
                </Badge>}
              />

              {/* Summary pills */}
              {d.emotional.summary.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {d.emotional.summary.map((label, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-700 font-semibold">
                      {label}
                    </span>
                  ))}
                </div>
              )}

              {d.emotional.signals.filter(s => s.detected).length === 0 ? (
                <div className="flex items-center gap-3 bg-emerald-950/30 border border-emerald-800 rounded-xl p-4">
                  <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-emerald-300 font-bold text-sm">Market appears orderly</p>
                    <p className="text-emerald-600 text-xs">No emotional extremes detected — clean technical environment</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {d.emotional.signals.filter(s => s.detected).map((sig, i) => (
                    <div key={i} className={`border rounded-xl p-3 ${
                      sig.severity === 'high'   ? 'border-red-700 bg-red-950/20' :
                      sig.severity === 'medium' ? 'border-amber-700 bg-amber-950/20' :
                      'border-blue-700 bg-blue-950/20'
                    }`}>
                      <div className="flex items-start justify-between mb-1">
                        <p className={`font-bold text-sm ${sig.severity === 'high' ? 'text-red-300' : sig.severity === 'medium' ? 'text-amber-300' : 'text-blue-300'}`}>
                          {sig.label}
                        </p>
                        <Badge color={sig.severity === 'high' ? 'red' : sig.severity === 'medium' ? 'amber' : 'blue'}>
                          {sig.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-gray-400 text-xs mb-2">{sig.description}</p>
                      <div className="flex items-start gap-1">
                        <Info size={10} className="text-gray-600 shrink-0 mt-0.5" />
                        <p className="text-gray-600 text-[10px]">{sig.confirmation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DarkCard>

            {/* ── SECTION 3: TREND CONTINUATION PROBABILITY ────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<Activity size={15} />}
                title="Trend Continuation Probability"
                right={<Badge color="purple">Alignment: {d.continuation.alignmentScore}/100</Badge>}
              />

              {d.continuation.conflictWarning && (
                <div className="mb-3 flex items-start gap-2 bg-amber-950/40 border border-amber-800 rounded-lg p-2 text-xs text-amber-300">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" /> {d.continuation.conflictWarning}
                </div>
              )}

              {/* Probability bars */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Continuation', pct: d.continuation.continuationPct, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
                  { label: 'Reversal',     pct: d.continuation.reversalPct,     color: 'bg-red-500',     textColor: 'text-red-400' },
                  { label: 'Squeeze',      pct: d.continuation.squeezePct,      color: 'bg-purple-500',  textColor: 'text-purple-400' },
                  { label: 'Chop',         pct: d.continuation.chopPct,         color: 'bg-gray-500',    textColor: 'text-gray-400' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className={`text-3xl font-black ${item.textColor}`}>{item.pct}%</p>
                    <p className="text-gray-500 text-xs mt-1 font-semibold">{item.label}</p>
                    <div className="h-1.5 bg-gray-700 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Alignment ring + TF scores */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <ConfidenceMeter value={d.continuation.alignmentScore} color="#a78bfa" />
                  <div>
                    <p className="text-gray-300 font-bold text-sm">Alignment Score</p>
                    <p className="text-gray-600 text-xs">Low std dev = high alignment</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.continuation.tfScores.map(tf => (
                    <div key={tf.label} className={`px-2 py-1 rounded-lg border text-xs font-bold ${
                      tf.bias === 'bullish' ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' :
                      tf.bias === 'bearish' ? 'bg-red-950/40 border-red-800 text-red-400' :
                      'bg-gray-800 border-gray-700 text-gray-400'
                    }`}>
                      {tf.label} <span className="text-gray-500 font-normal">{tf.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </DarkCard>

            {/* ── SECTION 4: POWER HOUR LIQUIDITY FORECAST ─────────────── */}
            <DarkCard>
              <SectionTitle icon={<Clock size={15} />} title="Power Hour Liquidity Forecast" />

              {/* Scenario label */}
              <div className={`rounded-xl border px-4 py-3 mb-4 ${scenarioBg(d.forecast.scenario)}`}>
                <p className="font-black text-lg">{d.forecast.scenarioLabel}</p>
                <p className="text-sm mt-1 opacity-80">{d.forecast.scenarioDescription}</p>
              </div>

              {/* Time windows */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {d.forecast.windows.map((w, i) => (
                  <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock size={11} className="text-purple-400" />
                      <p className="text-purple-400 font-bold text-xs">{w.timeRange}</p>
                    </div>
                    <p className="text-gray-200 font-semibold text-sm mb-1">{w.label}</p>
                    <p className="text-gray-500 text-xs leading-relaxed">{w.description}</p>
                  </div>
                ))}
              </div>

              {/* Risk badges */}
              <div className="flex flex-wrap gap-2">
                {d.forecast.institutionalClosing && (
                  <Badge color="red">Institutional Closing Flow</Badge>
                )}
                {d.forecast.profitTakingRisk && (
                  <Badge color="amber">Profit Taking Risk</Badge>
                )}
                {d.forecast.trappedTraderRisk && (
                  <Badge color="red">Trapped Trader Risk</Badge>
                )}
                {d.forecast.qqqSpyDivergence && (
                  <span className="text-xs px-3 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-700">
                    {d.forecast.qqqSpyDivergence}
                  </span>
                )}
                {!d.forecast.institutionalClosing && !d.forecast.profitTakingRisk && !d.forecast.trappedTraderRisk && !d.forecast.qqqSpyDivergence && (
                  <Badge color="emerald">No major risk flags</Badge>
                )}
              </div>
            </DarkCard>

            {/* ── SECTION 5: SMART SCALP STRIKE SELECTOR ───────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<Target size={15} />}
                title="Smart Scalp Strike Selector"
                right={
                  <Badge color={d.strikes.dominantSide === 'calls' ? 'emerald' : d.strikes.dominantSide === 'puts' ? 'red' : 'gray'}>
                    {d.strikes.dominantSide === 'calls' ? 'CALL DOMINANT' : d.strikes.dominantSide === 'puts' ? 'PUT DOMINANT' : 'NEUTRAL'}
                  </Badge>
                }
              />

              {d.strikes.zeroDteWarning && (
                <div className="mb-3 flex items-start gap-2 bg-amber-950/40 border border-amber-800 rounded-lg p-2 text-xs text-amber-300">
                  <ShieldAlert size={11} className="shrink-0 mt-0.5" /> {d.strikes.zeroDteWarning}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CALL WATCH */}
                <div className={`rounded-xl border p-4 ${d.strikes.dominantSide === 'calls' ? 'bg-emerald-950/30 border-emerald-700' : 'bg-gray-800/30 border-gray-700 opacity-60'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} className="text-emerald-400" />
                    <span className="text-emerald-400 font-bold text-sm">CALL WATCH</span>
                    {d.strikes.trapRiskSide === 'calls' && (
                      <Badge color="red">TRAP RISK</Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {d.strikes.callWatchlist.map((c, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-700/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-gray-200 font-black text-sm">${c.strike}C</span>
                            <Badge color={c.tier === 'safer' ? 'emerald' : 'amber'}>{c.tier.toUpperCase()}</Badge>
                            <span className="text-gray-500 text-xs">delta ~{c.approxDelta.toFixed(2)}</span>
                          </div>
                          <p className="text-gray-500 text-[10px] leading-relaxed">{c.rationale}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {c.momentumFavored && <Badge color="emerald">MOM</Badge>}
                          {c.trapRisk && <Badge color="red">TRAP</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PUT WATCH */}
                <div className={`rounded-xl border p-4 ${d.strikes.dominantSide === 'puts' ? 'bg-red-950/30 border-red-700' : 'bg-gray-800/30 border-gray-700 opacity-60'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown size={16} className="text-red-400" />
                    <span className="text-red-400 font-bold text-sm">PUT WATCH</span>
                    {d.strikes.trapRiskSide === 'puts' && (
                      <Badge color="red">TRAP RISK</Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {d.strikes.putWatchlist.map((c, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-700/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-gray-200 font-black text-sm">${c.strike}P</span>
                            <Badge color={c.tier === 'safer' ? 'emerald' : 'amber'}>{c.tier.toUpperCase()}</Badge>
                            <span className="text-gray-500 text-xs">delta ~{c.approxDelta.toFixed(2)}</span>
                          </div>
                          <p className="text-gray-500 text-[10px] leading-relaxed">{c.rationale}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {c.momentumFavored && <Badge color="emerald">MOM</Badge>}
                          {c.trapRisk && <Badge color="red">TRAP</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DarkCard>

            {/* ── SECTION 6: ENTRY CONFIRMATION LOGIC ──────────────────── */}
            <DarkCard>
              <SectionTitle icon={<CheckCircle size={15} />} title="Entry Confirmation Logic" />

              {/* Alert status */}
              <div className={`rounded-xl border px-4 py-3 mb-4 text-center ${alertStatusColors(d.confirmation.alertStatus)}`}>
                <p className="font-black text-2xl tracking-wide">{d.confirmation.alertStatus.replace('_', ' ')}</p>
                <p className="text-xs mt-1 opacity-70">{d.confirmation.waitingFor}</p>
              </div>

              {/* Checklists */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-emerald-500 font-semibold uppercase tracking-wide mb-2">Bullish Confirmations</p>
                  <div className="space-y-1.5">
                    {d.confirmation.bullish.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {c.met
                          ? <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                          : <XCircle size={13} className="text-gray-600 shrink-0" />
                        }
                        <span className={c.met ? 'text-gray-300' : 'text-gray-600'}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-red-500 font-semibold uppercase tracking-wide mb-2">Bearish Confirmations</p>
                  <div className="space-y-1.5">
                    {d.confirmation.bearish.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {c.met
                          ? <CheckCircle size={13} className="text-red-400 shrink-0" />
                          : <XCircle size={13} className="text-gray-600 shrink-0" />
                        }
                        <span className={c.met ? 'text-gray-300' : 'text-gray-600'}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DarkCard>

            {/* ── SECTION 7 + 8: ORDER BUILDER & PROFIT PROTECTION ─────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Order Builder */}
              <DarkCard>
                <SectionTitle icon={<Layers size={15} />} title="Smart Order Builder" />
                {d.orderPlan.direction === null ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                    <Minus size={16} /> {d.orderPlan.entryNote}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      {d.orderPlan.direction === 'long'
                        ? <TrendingUp size={16} className="text-emerald-400" />
                        : <TrendingDown size={16} className="text-red-400" />
                      }
                      <span className={`font-bold text-sm ${d.orderPlan.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {d.orderPlan.direction.toUpperCase()} — {d.orderPlan.momentumStrength.replace('_', ' ').toUpperCase()} MOMENTUM
                      </span>
                    </div>
                    <div className="space-y-2 text-xs font-mono mb-3">
                      {[
                        { label: 'Entry', val: `$${d.orderPlan.entry.toFixed(2)}`, color: 'text-gray-200' },
                        { label: 'Stop',  val: `$${d.orderPlan.invalidation.toFixed(2)}`, color: 'text-red-400' },
                        { label: 'TP1',   val: `$${d.orderPlan.tp1.toFixed(2)}`, color: 'text-emerald-400' },
                        { label: 'TP2',   val: `$${d.orderPlan.tp2.toFixed(2)}`, color: 'text-emerald-300' },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                          <span className="text-gray-500 w-16">{row.label}</span>
                          <span className={`font-bold ${row.color}`}>{row.val}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-gray-500">R:R</span>
                        <span className="text-purple-400 font-black">{d.orderPlan.rr}</span>
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs">{d.orderPlan.suggestedOrderType}</p>
                    <div className="mt-2 flex items-start gap-1.5 bg-gray-800/50 rounded-lg px-2 py-1.5">
                      <Lock size={10} className="text-purple-400 shrink-0 mt-0.5" />
                      <p className="text-gray-500 text-[10px]">{d.orderPlan.trailingStopIdea}</p>
                    </div>
                  </>
                )}
              </DarkCard>

              {/* Profit Protection */}
              <DarkCard>
                <SectionTitle icon={<ShieldAlert size={15} />} title="Profit Protection" />
                {d.protection.warnings.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {d.protection.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 px-2 py-1.5 bg-amber-950/20 border border-amber-900 rounded-lg text-xs text-amber-300">
                        <AlertTriangle size={10} className="shrink-0 mt-0.5" /> {w}
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  {d.protection.encouragements.map((enc, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                      <ChevronRight size={12} className="text-emerald-600 shrink-0 mt-0.5" /> {enc}
                    </div>
                  ))}
                </div>
              </DarkCard>
            </div>

            {/* ── COMPANIONS ────────────────────────────────────────────── */}
            {(d.companions.vix || d.companions.dxy || d.companions.tnx || d.companions.companion) && (
              <DarkCard>
                <SectionTitle icon={<BarChart2 size={15} />} title="Market Context" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'VIX', data: d.companions.vix },
                    { label: 'DXY', data: d.companions.dxy },
                    { label: '10Y', data: d.companions.tnx },
                    { label: d.companions.companion?.symbol ?? 'Companion', data: d.companions.companion },
                  ].map(item => item.data ? (
                    <div key={item.label} className={`px-3 py-2 rounded-lg border text-xs ${
                      item.data.changePct > 1 ? 'bg-emerald-950/20 border-emerald-900' :
                      item.data.changePct < -1 ? 'bg-red-950/20 border-red-900' :
                      'bg-gray-800/40 border-gray-700'
                    }`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-gray-400 font-semibold">{item.label}</span>
                        <span className="text-gray-100 font-mono">${item.data.price.toFixed(2)}</span>
                      </div>
                      <span className={`font-bold ${pctColor(item.data.changePct)}`}>{fmt(item.data.changePct)}%</span>
                    </div>
                  ) : null)}
                </div>
              </DarkCard>
            )}

            {/* ── SECTION 10: FINAL DECISION BOX ───────────────────────── */}
            <div className={`rounded-xl border-2 p-5 ${decisionBorder(d.decision.alertStatus)}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    d.decision.alertStatus === 'CONFIRMED' || d.decision.alertStatus === 'HIGH_MOMENTUM' ? 'bg-emerald-900/50' :
                    d.decision.alertStatus === 'TRAP_RISK' ? 'bg-red-900/50' : 'bg-gray-800'
                  }`}>
                    {d.decision.alertStatus === 'CONFIRMED' || d.decision.alertStatus === 'HIGH_MOMENTUM' ? (
                      <TrendingUp size={20} className="text-emerald-400" />
                    ) : d.decision.alertStatus === 'TRAP_RISK' ? (
                      <AlertTriangle size={20} className="text-red-400" />
                    ) : (
                      <Eye size={20} className="text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Final Decision</p>
                    <p className={`font-black text-xl ${
                      d.decision.alertStatus === 'CONFIRMED' || d.decision.alertStatus === 'HIGH_MOMENTUM' ? 'text-emerald-400' :
                      d.decision.alertStatus === 'TRAP_RISK' ? 'text-red-400' : 'text-gray-300'
                    }`}>
                      {d.decision.alertStatus.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <ConfidenceMeter
                  value={d.decision.confidenceScore}
                  color={d.decision.alertStatus === 'CONFIRMED' || d.decision.alertStatus === 'HIGH_MOMENTUM' ? '#10b981' : d.decision.alertStatus === 'TRAP_RISK' ? '#ef4444' : '#6b7280'}
                />
              </div>

              {/* 3x3 grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Current Bias</p>
                  <p className="text-gray-200 text-sm font-bold">{d.decision.currentBias}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Trend Strength</p>
                  <p className="text-gray-300 text-xs leading-relaxed">{d.decision.trendStrength}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Liquidity Direction</p>
                  <p className="text-gray-200 text-xs font-bold leading-relaxed">{d.decision.liquidityDirection}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Most Likely Scenario</p>
                  <p className="text-gray-300 text-xs leading-relaxed">{d.decision.mostLikelyScenario}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Best Setup</p>
                  <p className="text-gray-200 text-sm font-bold">{d.decision.bestSetup}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Best Time Window</p>
                  <p className="text-purple-400 text-sm font-bold">{d.decision.bestTimeWindow}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Confirmation Needed</p>
                  <p className="text-amber-400 text-xs leading-relaxed">{d.decision.confirmationNeeded}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Contract Zone</p>
                  <p className="text-gray-300 text-xs leading-relaxed">{d.decision.suggestedContractZone}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3 flex items-center gap-3">
                  <ConfidenceMeter
                    value={d.decision.confidenceScore}
                    color={d.decision.alertStatus === 'CONFIRMED' || d.decision.alertStatus === 'HIGH_MOMENTUM' ? '#10b981' : d.decision.alertStatus === 'TRAP_RISK' ? '#ef4444' : '#6b7280'}
                  />
                  <div>
                    <p className="text-gray-200 font-bold text-sm">Confidence</p>
                    <p className="text-gray-500 text-xs">{d.decision.confidenceScore}/100</p>
                  </div>
                </div>
              </div>

              {/* Trap risk row */}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <Badge color={d.decision.trapRisk === 'high' ? 'red' : d.decision.trapRisk === 'medium' ? 'amber' : 'emerald'}>
                  TRAP RISK: {d.decision.trapRisk.toUpperCase()}
                </Badge>
                <Badge color={d.decision.riskLevel === 'high' ? 'red' : d.decision.riskLevel === 'medium' ? 'amber' : 'emerald'}>
                  RISK: {d.decision.riskLevel.toUpperCase()}
                </Badge>
                {d.forecast.qqqSpyDivergence && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={10} /> {d.forecast.qqqSpyDivergence}
                  </span>
                )}
              </div>
            </div>

            {/* ── DISCLAIMER ────────────────────────────────────────────── */}
            <p className="text-xs text-gray-700 text-center pb-2">
              Educational analysis only. Not financial advice. Options trading involves significant risk of loss.
              Data may be delayed. Verify all levels in your brokerage platform before trading.
            </p>

          </div>
        )}

      </div>
    </AppShell>
  );
}
