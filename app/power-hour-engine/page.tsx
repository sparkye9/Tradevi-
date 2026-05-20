'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Minus, Activity, AlertTriangle,
  CheckCircle, Target, Zap, RefreshCw, ShieldAlert,
  Clock, BarChart2, Info, ChevronRight, Flame, Eye,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TFResult {
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  rsi: number | null;
  vwap: number | null;
}

interface Pattern {
  name: string;
  detected: boolean;
  confidence: number;
  confirms: string[];
  invalidates: string[];
  bestWindow: string;
  confidenceScore: number;
}

interface PHEngineData {
  success: boolean;
  error?: string;
  symbol: string;
  currentPrice: number;
  mtf: {
    timeframes: TFResult[];
    overallBias: 'bullish' | 'bearish' | 'neutral';
    trendScore: number;
    htfAgreement: boolean;
    htfWarning: string | null;
    vwapPosition: 'above' | 'below' | 'at';
    vwap: number;
  };
  patterns: Pattern[];
  catalysts: {
    vix:   { price: number; changePct: number; label: string };
    dxy:   { price: number; changePct: number; signal: 'bullish' | 'bearish' | 'neutral' };
    tnx:   { price: number; changePct: number; signal: 'bullish' | 'bearish' | 'neutral' };
    nvda:  { price: number; changePct: number };
    aapl:  { price: number; changePct: number };
    msft:  { price: number; changePct: number };
    tsla:  { price: number; changePct: number };
    companionLabel: string;
    companionQuote: { price: number; changePct: number } | null;
    bullishSignals: number;
    bearishSignals: number;
    newsRisk: 'low' | 'medium' | 'high';
    directionalPressure: 'bullish' | 'bearish' | 'mixed';
    powerHourImplication: string;
  };
  windows: {
    scenario: string;
    dumpWindow: string | null;
    buyWindow: string | null;
    noTradeWarning: string | null;
    signals: string[];
  };
  options: {
    bias: 'calls' | 'puts' | 'wait';
    saferStrike: number;
    aggressiveCallStrike: number;
    aggressivePutStrike: number;
    callWatch: string;
    putWatch: string;
    zeroDteWarning: string | null;
    minimumConfirmation: string;
  };
  orderPlan: {
    direction: 'long' | 'short' | null;
    entryTrigger: string;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    invalidationLevel: number;
    suggestedOrderType: string;
  };
  decision: {
    bias: 'bullish' | 'bearish' | 'neutral';
    bestSetup: string;
    waitFor: string;
    entryZone: string;
    invalidation: string;
    likelyTarget: string;
    suggestedOrderType: string;
    riskLevel: 'low' | 'medium' | 'high';
    confidence: number;
    confidenceLabel: string;
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

function biasColor(b: 'bullish' | 'bearish' | 'neutral') {
  return b === 'bullish' ? 'text-emerald-400' : b === 'bearish' ? 'text-red-400' : 'text-gray-400';
}

function biasBadgeColor(b: 'bullish' | 'bearish' | 'neutral') {
  return b === 'bullish' ? 'emerald' : b === 'bearish' ? 'red' : 'gray';
}

function pctColor(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
}

function fmt(n: number, d = 2) {
  return n >= 0 ? `+${n.toFixed(d)}` : n.toFixed(d);
}

function patternBorderColor(p: Pattern): string {
  if (!p.detected) return 'border-gray-800';
  if (p.name.includes('Bull') || p.name.includes('Drop Then')) return 'border-emerald-700';
  if (p.name.includes('Bear') || p.name.includes('Rise Then')) return 'border-red-700';
  if (p.name.includes('Liquidity') || p.name.includes('Failed')) return 'border-amber-700';
  if (p.name.includes('Chop')) return 'border-gray-600';
  return 'border-purple-700';
}

function patternBgColor(p: Pattern): string {
  if (!p.detected) return 'bg-gray-900/30';
  if (p.name.includes('Bull') || p.name.includes('Drop Then')) return 'bg-emerald-950/20';
  if (p.name.includes('Bear') || p.name.includes('Rise Then')) return 'bg-red-950/20';
  if (p.name.includes('Liquidity') || p.name.includes('Failed')) return 'bg-amber-950/20';
  if (p.name.includes('Chop')) return 'bg-gray-800/40';
  return 'bg-purple-950/20';
}

function confColor(score: number): string {
  if (score >= 70) return '#10b981';
  if (score >= 55) return '#f59e0b';
  return '#6b7280';
}

// ─── Static Risk Guardrails ────────────────────────────────────────────────────

const RISK_GUARDRAILS = [
  { text: 'Do not enter in the middle of the range — wait for a clear level', color: 'amber' },
  { text: 'Do not chase after a full candle move — you missed it, wait for the next setup', color: 'amber' },
  { text: 'Do not hold a scalp if confirmation fails — cut immediately', color: 'red' },
  { text: 'Avoid trading if spread is wide — enter only on tight spreads', color: 'amber' },
  { text: 'Avoid oversized 0DTE positions — limit to 1-2 contracts max per trade', color: 'red' },
  { text: 'Take base hits, not home runs — consistent small wins beat one lucky trade', color: 'amber' },
  { text: 'Stop after 2 losses — protect the account and walk away', color: 'red' },
];

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PowerHourEnginePage() {
  const [symbol, setSymbol]       = useState<'SPY' | 'QQQ' | 'ES=F'>('SPY');
  const [data, setData]           = useState<PHEngineData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const doFetch = useCallback(async (sym: string) => {
    setLoading(true);
    setError('');
    try {
      const res  = await window.fetch(`/api/power-hour-engine?symbol=${sym}`);
      const json: PHEngineData = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Analysis failed');
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, []);

  // Auto-refresh every 5 minutes during power hour (3:00-4:00 PM ET)
  useEffect(() => {
    const checkPowerHour = () => {
      const now = new Date();
      const etOff = (() => {
        const y = now.getFullYear();
        const mar1 = new Date(y, 2, 1).getDay();
        const nov1 = new Date(y, 10, 1).getDay();
        const dstStart = new Date(y, 2, mar1 === 0 ? 8 : 15 - mar1);
        const dstEnd   = new Date(y, 10, nov1 === 0 ? 1 : 8 - nov1);
        return now >= dstStart && now < dstEnd ? -4 : -5;
      })();
      const etMs   = now.getTime() + etOff * 3600000;
      const etDate = new Date(etMs);
      const etMin  = etDate.getUTCHours() * 60 + etDate.getUTCMinutes();
      return etMin >= 900 && etMin < 960; // 3:00-4:00 PM ET
    };

    const interval = setInterval(() => {
      if (checkPowerHour() && data) {
        doFetch(symbol);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [symbol, data, doFetch]);

  const handleSymbol = (sym: 'SPY' | 'QQQ' | 'ES=F') => {
    setSymbol(sym);
    doFetch(sym);
  };

  const d = data;

  return (
    <AppShell title="Power Hour Prediction Engine">
      <div className="-m-4 lg:-m-6 bg-gray-950 min-h-screen p-4 lg:p-5">

        {/* ── HEADER ROW ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-900/40 border border-purple-700">
              <Flame size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-gray-100 font-black text-lg">Power Hour Prediction Engine</h1>
              <p className="text-gray-500 text-xs">Multi-timeframe analysis for 3:00-4:00 PM ET setups</p>
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

        {/* ── SYMBOL SELECTOR + ANALYZE ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(['SPY', 'QQQ', 'ES=F'] as const).map(sym => (
            <button
              key={sym}
              onClick={() => handleSymbol(sym)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                symbol === sym
                  ? 'bg-purple-600 text-white border-purple-500'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-purple-500 hover:text-purple-300'
              }`}
            >
              {sym}
            </button>
          ))}
          <button
            onClick={() => doFetch(symbol)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
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
            <Flame size={52} className="text-purple-800 mx-auto mb-4" />
            <p className="text-gray-300 font-semibold text-lg">Select a symbol and click Analyze</p>
            <p className="text-gray-600 text-sm mt-2">
              Fetches multi-timeframe data, detects power hour patterns, and generates a full trade plan
            </p>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────── */}
        {loading && !d && (
          <div className="text-center py-24">
            <div className="w-10 h-10 border-[3px] border-purple-800 border-t-purple-400 rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm mt-4">Running power hour analysis for {symbol}...</p>
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
              <div className="flex items-center gap-2">
                <Badge color={biasBadgeColor(d.decision.bias)}>
                  {d.decision.bias.toUpperCase()}
                </Badge>
                <Badge color={d.decision.riskLevel === 'high' ? 'red' : d.decision.riskLevel === 'medium' ? 'amber' : 'emerald'}>
                  {d.decision.riskLevel.toUpperCase()} RISK
                </Badge>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <ConfidenceMeter
                  value={d.decision.confidence}
                  color={d.decision.bias === 'bullish' ? '#10b981' : d.decision.bias === 'bearish' ? '#ef4444' : '#6b7280'}
                />
                <div>
                  <p className="text-gray-100 font-bold text-sm">{d.decision.confidenceLabel}</p>
                  <p className="text-gray-500 text-xs">{d.decision.confidence}% confidence</p>
                </div>
              </div>
            </div>

            {/* ── SECTION 1: MTF TREND SCAN ─────────────────────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<BarChart2 size={15} />}
                title="Multi-Timeframe Trend Scan"
                right={
                  <div className="flex items-center gap-2">
                    <Badge color={biasBadgeColor(d.mtf.overallBias)}>
                      {d.mtf.overallBias.toUpperCase()}
                    </Badge>
                    <Badge color={d.mtf.htfAgreement ? 'emerald' : 'amber'}>
                      HTF {d.mtf.htfAgreement ? 'ALIGNED' : 'MIXED'}
                    </Badge>
                  </div>
                }
              />

              {/* HTF warning */}
              {d.mtf.htfWarning && (
                <div className="mb-3 flex items-start gap-2 bg-amber-950/40 border border-amber-800 rounded-lg p-2 text-xs text-amber-300">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" /> {d.mtf.htfWarning}
                </div>
              )}

              {/* Timeframe table */}
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2 pr-3">Timeframe</th>
                      <th className="text-left py-2 pr-3">Bias</th>
                      <th className="text-left py-2 pr-3 min-w-[80px]">Score</th>
                      <th className="text-right py-2 pr-3">EMA9</th>
                      <th className="text-right py-2 pr-3">EMA21</th>
                      <th className="text-right py-2">RSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {d.mtf.timeframes.map(tf => (
                      <tr key={tf.label} className="hover:bg-gray-800/30">
                        <td className="py-2 pr-3 text-gray-300 font-medium">{tf.label}</td>
                        <td className="py-2 pr-3">
                          <Badge color={biasBadgeColor(tf.bias)}>
                            {tf.bias.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden w-16">
                              <div
                                className={`h-full rounded-full ${tf.score >= 62 ? 'bg-emerald-500' : tf.score <= 38 ? 'bg-red-500' : 'bg-gray-600'}`}
                                style={{ width: `${tf.score}%` }}
                              />
                            </div>
                            <span className="text-gray-400 w-8">{tf.score}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-gray-300">
                          {tf.ema9 != null ? tf.ema9.toFixed(2) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-gray-300">
                          {tf.ema21 != null ? tf.ema21.toFixed(2) : '—'}
                        </td>
                        <td className="py-2 text-right">
                          {tf.rsi != null ? (
                            <span className={`font-mono ${tf.rsi > 70 ? 'text-red-400' : tf.rsi < 30 ? 'text-emerald-400' : tf.rsi > 55 ? 'text-emerald-500' : tf.rsi < 45 ? 'text-red-500' : 'text-gray-400'}`}>
                              {tf.rsi.toFixed(1)}
                            </span>
                          ) : <span className="text-gray-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <p className="text-gray-500 mb-0.5">Overall Bias</p>
                  <p className={`font-black text-sm ${biasColor(d.mtf.overallBias)}`}>{d.mtf.overallBias.toUpperCase()}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <p className="text-gray-500 mb-0.5">Trend Score</p>
                  <p className="font-bold text-gray-200">{d.mtf.trendScore}/100</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <p className="text-gray-500 mb-0.5">VWAP Position</p>
                  <p className={`font-bold ${d.mtf.vwapPosition === 'above' ? 'text-emerald-400' : d.mtf.vwapPosition === 'below' ? 'text-red-400' : 'text-gray-400'}`}>
                    {d.mtf.vwapPosition.toUpperCase()} ${d.mtf.vwap.toFixed(2)}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <p className="text-gray-500 mb-0.5">HTF Agreement</p>
                  <p className={`font-bold ${d.mtf.htfAgreement ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {d.mtf.htfAgreement ? 'YES — ALIGNED' : 'NO — MIXED'}
                  </p>
                </div>
              </div>
            </DarkCard>

            {/* ── SECTION 2: PATTERN DETECTOR ───────────────────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<Eye size={15} />}
                title="Power Hour Pattern Detector"
                right={
                  <Badge color="purple">
                    {d.patterns.filter(p => p.detected).length} of 8 detected
                  </Badge>
                }
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {d.patterns.map(p => (
                  <div
                    key={p.name}
                    className={`border rounded-xl p-3 transition-opacity ${patternBorderColor(p)} ${patternBgColor(p)} ${!p.detected ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className={`text-xs font-bold leading-tight ${p.detected ? 'text-gray-200' : 'text-gray-500'}`}>
                        {p.name}
                      </p>
                      {p.detected && (
                        <CheckCircle size={14} className="text-emerald-400 shrink-0 ml-1" />
                      )}
                    </div>

                    {p.detected && (
                      <>
                        {/* Confidence bar */}
                        <div className="mb-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">Confidence</span>
                            <span className="font-bold" style={{ color: confColor(p.confidenceScore) }}>
                              {p.confidenceScore}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${p.confidenceScore}%`, backgroundColor: confColor(p.confidenceScore) }}
                            />
                          </div>
                        </div>

                        {/* Confirms */}
                        <div className="mb-2">
                          <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-1">Confirms</p>
                          <ul className="space-y-0.5">
                            {p.confirms.map((c, i) => (
                              <li key={i} className="flex items-start gap-1 text-[10px] text-gray-400">
                                <span className="text-emerald-500 shrink-0 mt-0.5">+</span>{c}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Invalidates */}
                        <div className="mb-2">
                          <p className="text-[10px] text-red-600 font-semibold uppercase tracking-wide mb-1">Invalidates</p>
                          <ul className="space-y-0.5">
                            {p.invalidates.map((inv, i) => (
                              <li key={i} className="flex items-start gap-1 text-[10px] text-gray-400">
                                <span className="text-red-500 shrink-0 mt-0.5">-</span>{inv}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Best window */}
                        <div className="flex items-center gap-1 mt-2">
                          <Clock size={9} className="text-purple-400" />
                          <span className="text-[10px] text-purple-400 font-semibold">{p.bestWindow}</span>
                        </div>
                      </>
                    )}

                    {!p.detected && (
                      <p className="text-[10px] text-gray-600 mt-1">Not detected</p>
                    )}
                  </div>
                ))}
              </div>
            </DarkCard>

            {/* ── SECTION 3: CATALYST FILTER ────────────────────────────── */}
            <DarkCard>
              <SectionTitle icon={<Activity size={15} />} title="Catalyst Filter" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Left: Macro */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Macro Signals</p>

                  {/* VIX */}
                  <div className={`px-3 py-2 rounded-lg border text-xs ${
                    d.catalysts.vix.price > 22 ? 'bg-red-950/30 border-red-800' :
                    d.catalysts.vix.price > 18 ? 'bg-amber-950/30 border-amber-800' :
                    'bg-gray-800/40 border-gray-700'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 font-semibold">VIX</span>
                      <span className={`font-bold ${d.catalysts.vix.price > 22 ? 'text-red-400' : d.catalysts.vix.price > 18 ? 'text-amber-400' : 'text-gray-300'}`}>
                        {d.catalysts.vix.price.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-gray-500">{d.catalysts.vix.label}</span>
                      <span className={pctColor(d.catalysts.vix.changePct)}>{fmt(d.catalysts.vix.changePct)}%</span>
                    </div>
                  </div>

                  {/* DXY */}
                  <div className={`px-3 py-2 rounded-lg border text-xs ${
                    d.catalysts.dxy.signal === 'bearish' ? 'bg-red-950/20 border-red-900' :
                    d.catalysts.dxy.signal === 'bullish' ? 'bg-emerald-950/20 border-emerald-900' :
                    'bg-gray-800/40 border-gray-700'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 font-semibold">DXY (Dollar)</span>
                      <span className="text-gray-100 font-bold">{d.catalysts.dxy.price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-gray-500">{d.catalysts.dxy.signal === 'bearish' ? 'Headwind equities' : d.catalysts.dxy.signal === 'bullish' ? 'Tailwind equities' : 'Neutral'}</span>
                      <span className={pctColor(d.catalysts.dxy.changePct)}>{fmt(d.catalysts.dxy.changePct)}%</span>
                    </div>
                  </div>

                  {/* TNX */}
                  <div className={`px-3 py-2 rounded-lg border text-xs ${
                    d.catalysts.tnx.signal === 'bearish' ? 'bg-red-950/20 border-red-900' :
                    d.catalysts.tnx.signal === 'bullish' ? 'bg-emerald-950/20 border-emerald-900' :
                    'bg-gray-800/40 border-gray-700'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 font-semibold">10Y Yield</span>
                      <span className="text-gray-100 font-bold">{d.catalysts.tnx.price.toFixed(3)}%</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-gray-500">{d.catalysts.tnx.signal === 'bearish' ? 'Rising rates — tech headwind' : d.catalysts.tnx.signal === 'bullish' ? 'Falling rates — tailwind' : 'Stable'}</span>
                      <span className={pctColor(d.catalysts.tnx.changePct)}>{fmt(d.catalysts.tnx.changePct)}%</span>
                    </div>
                  </div>
                </div>

                {/* Middle: Mega-cap leaders */}
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Mega-Cap Leaders</p>
                  <div className="space-y-2">
                    {[
                      { label: 'NVDA', data: d.catalysts.nvda },
                      { label: 'AAPL', data: d.catalysts.aapl },
                      { label: 'MSFT', data: d.catalysts.msft },
                      { label: 'TSLA', data: d.catalysts.tsla },
                      { label: d.catalysts.companionLabel, data: d.catalysts.companionQuote },
                    ].map(item => item.data ? (
                      <div key={item.label} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                        item.data.changePct > 1.5 ? 'bg-emerald-950/20 border-emerald-900' :
                        item.data.changePct < -1.5 ? 'bg-red-950/20 border-red-900' :
                        'bg-gray-800/40 border-gray-700'
                      }`}>
                        <span className="text-gray-300 font-semibold w-12">{item.label}</span>
                        <span className="text-gray-100 font-mono">${item.data.price.toFixed(2)}</span>
                        <span className={`font-bold ${pctColor(item.data.changePct)}`}>{fmt(item.data.changePct)}%</span>
                        {item.data.changePct > 1.5 ? (
                          <TrendingUp size={11} className="text-emerald-400" />
                        ) : item.data.changePct < -1.5 ? (
                          <TrendingDown size={11} className="text-red-400" />
                        ) : (
                          <Minus size={11} className="text-gray-600" />
                        )}
                      </div>
                    ) : (
                      <div key={item.label} className="flex items-center justify-between px-3 py-2 rounded-lg border text-xs bg-gray-800/40 border-gray-700">
                        <span className="text-gray-500">{item.label} — no data</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Summary */}
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Summary</p>

                  <div className={`px-3 py-2 rounded-lg border text-xs ${
                    d.catalysts.newsRisk === 'high' ? 'bg-red-950/30 border-red-800' :
                    d.catalysts.newsRisk === 'medium' ? 'bg-amber-950/30 border-amber-800' :
                    'bg-emerald-950/20 border-emerald-900'
                  }`}>
                    <p className="text-gray-500 mb-1">News Risk</p>
                    <Badge color={d.catalysts.newsRisk === 'high' ? 'red' : d.catalysts.newsRisk === 'medium' ? 'amber' : 'emerald'}>
                      {d.catalysts.newsRisk.toUpperCase()}
                    </Badge>
                  </div>

                  <div className={`px-3 py-2 rounded-lg border text-xs ${
                    d.catalysts.directionalPressure === 'bullish' ? 'bg-emerald-950/20 border-emerald-900' :
                    d.catalysts.directionalPressure === 'bearish' ? 'bg-red-950/20 border-red-900' :
                    'bg-gray-800/40 border-gray-700'
                  }`}>
                    <p className="text-gray-500 mb-1">Directional Pressure</p>
                    <Badge color={biasBadgeColor(d.catalysts.directionalPressure === 'mixed' ? 'neutral' : d.catalysts.directionalPressure)}>
                      {d.catalysts.directionalPressure.toUpperCase()}
                    </Badge>
                    <p className="text-gray-500 mt-1">{d.catalysts.bullishSignals} bull / {d.catalysts.bearishSignals} bear signals</p>
                  </div>

                  <div className="px-3 py-3 rounded-lg border bg-gray-800/40 border-gray-700 text-xs">
                    <p className="text-gray-500 font-semibold mb-1 flex items-center gap-1">
                      <Flame size={10} className="text-purple-400" /> Power Hour Implication
                    </p>
                    <p className="text-gray-300 leading-relaxed">{d.catalysts.powerHourImplication}</p>
                  </div>
                </div>
              </div>
            </DarkCard>

            {/* ── SECTION 4: DUMP / BUY WINDOW ─────────────────────────── */}
            <DarkCard>
              <SectionTitle icon={<Clock size={15} />} title="Dump or Buy Window Calculator" />

              {/* No-trade warning */}
              {d.windows.noTradeWarning && (
                <div className="mb-4 flex items-start gap-3 bg-amber-950/50 border border-amber-700 rounded-xl p-3">
                  <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-300 text-sm font-semibold">{d.windows.noTradeWarning}</p>
                </div>
              )}

              {/* Scenario */}
              <div className="mb-4 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl">
                <p className="text-gray-300 text-sm leading-relaxed">{d.windows.scenario}</p>
              </div>

              {/* Window badges */}
              <div className="flex flex-wrap gap-3 mb-4">
                {d.windows.buyWindow && (
                  <div className="flex items-center gap-2 bg-emerald-950/50 border border-emerald-700 rounded-xl px-4 py-2">
                    <TrendingUp size={16} className="text-emerald-400" />
                    <div>
                      <p className="text-emerald-300 text-xs font-bold uppercase tracking-wide">BUY WINDOW</p>
                      <p className="text-emerald-200 text-base font-black">{d.windows.buyWindow}</p>
                    </div>
                  </div>
                )}
                {d.windows.dumpWindow && (
                  <div className="flex items-center gap-2 bg-red-950/50 border border-red-700 rounded-xl px-4 py-2">
                    <TrendingDown size={16} className="text-red-400" />
                    <div>
                      <p className="text-red-300 text-xs font-bold uppercase tracking-wide">DUMP WINDOW</p>
                      <p className="text-red-200 text-base font-black">{d.windows.dumpWindow}</p>
                    </div>
                  </div>
                )}
                {!d.windows.buyWindow && !d.windows.dumpWindow && !d.windows.noTradeWarning && (
                  <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2">
                    <Minus size={16} className="text-gray-500" />
                    <p className="text-gray-400 text-sm font-semibold">No clear directional window — wait for confirmation</p>
                  </div>
                )}
              </div>

              {/* Signals */}
              <div className="space-y-1.5">
                {d.windows.signals.map((sig, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <ChevronRight size={12} className="text-purple-500 shrink-0 mt-0.5" />
                    {sig}
                  </div>
                ))}
              </div>
            </DarkCard>

            {/* ── SECTION 5: OPTIONS SCALP PLANNER ─────────────────────── */}
            <DarkCard>
              <SectionTitle
                icon={<Target size={15} />}
                title="Options Scalp Planner"
                right={
                  <Badge color={d.options.bias === 'calls' ? 'emerald' : d.options.bias === 'puts' ? 'red' : 'gray'}>
                    {d.options.bias === 'calls' ? 'CALL WATCH' : d.options.bias === 'puts' ? 'PUT WATCH' : 'WAIT'}
                  </Badge>
                }
              />

              {/* 0DTE warning */}
              {d.options.zeroDteWarning && (
                <div className="mb-3 flex items-start gap-2 bg-amber-950/40 border border-amber-800 rounded-lg p-2 text-xs text-amber-300">
                  <ShieldAlert size={11} className="shrink-0 mt-0.5" /> {d.options.zeroDteWarning}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                {/* CALL WATCH */}
                <div className={`p-4 rounded-xl border ${d.options.bias === 'calls' ? 'bg-emerald-950/30 border-emerald-700' : 'bg-gray-800/30 border-gray-700 opacity-60'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} className="text-emerald-400" />
                    <span className="text-emerald-400 font-bold text-sm">CALL WATCH</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Safer Strike (ATM)</span>
                      <span className="text-gray-200 font-mono font-bold">${d.options.saferStrike}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Aggressive Strike (OTM)</span>
                      <span className="text-emerald-400 font-mono font-bold">${d.options.aggressiveCallStrike}</span>
                    </div>
                  </div>
                  <p className="text-gray-500 text-[10px] mt-3 leading-relaxed">{d.options.callWatch}</p>
                </div>

                {/* PUT WATCH */}
                <div className={`p-4 rounded-xl border ${d.options.bias === 'puts' ? 'bg-red-950/30 border-red-700' : 'bg-gray-800/30 border-gray-700 opacity-60'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown size={16} className="text-red-400" />
                    <span className="text-red-400 font-bold text-sm">PUT WATCH</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Safer Strike (ATM)</span>
                      <span className="text-gray-200 font-mono font-bold">${d.options.saferStrike}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Aggressive Strike (OTM)</span>
                      <span className="text-red-400 font-mono font-bold">${d.options.aggressivePutStrike}</span>
                    </div>
                  </div>
                  <p className="text-gray-500 text-[10px] mt-3 leading-relaxed">{d.options.putWatch}</p>
                </div>
              </div>

              {/* Minimum confirmation */}
              <div className="px-3 py-2 bg-gray-800/40 border border-gray-700 rounded-lg">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Info size={10} /> Minimum Confirmation
                </p>
                <p className="text-gray-300 text-xs leading-relaxed">{d.options.minimumConfirmation}</p>
              </div>
            </DarkCard>

            {/* ── SECTION 6: ORDER PLAN ─────────────────────────────────── */}
            <DarkCard>
              <SectionTitle icon={<Zap size={15} />} title="Order Planning" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Order plan box */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3">Concrete Order Plan</p>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-start gap-3">
                      <span className="text-gray-500 w-28 shrink-0">Entry Trigger</span>
                      <span className="text-gray-200 font-sans leading-relaxed">{d.orderPlan.entryTrigger}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 w-28 shrink-0">Stop Loss</span>
                      <span className="text-red-400 font-bold">${d.orderPlan.stopLoss.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 w-28 shrink-0">Take Profit 1</span>
                      <span className="text-emerald-400 font-bold">${d.orderPlan.takeProfit1.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 w-28 shrink-0">Take Profit 2</span>
                      <span className="text-emerald-300 font-bold">${d.orderPlan.takeProfit2.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 w-28 shrink-0">Invalidation</span>
                      <span className="text-amber-400 font-bold">${d.orderPlan.invalidationLevel.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3 border-t border-gray-700 pt-2 mt-2">
                      <span className="text-gray-500 w-28 shrink-0">Order Type</span>
                      <span className="text-purple-400 font-sans">{d.orderPlan.suggestedOrderType}</span>
                    </div>
                  </div>
                </div>

                {/* Risk Guardrails */}
                <div>
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-1">
                    <ShieldAlert size={11} /> Risk Guardrails
                  </p>
                  <div className="space-y-1.5">
                    {RISK_GUARDRAILS.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 px-2 py-1.5 rounded-lg border text-xs ${
                          r.color === 'red'
                            ? 'bg-red-950/20 border-red-900 text-red-300'
                            : 'bg-amber-950/20 border-amber-900 text-amber-300'
                        }`}
                      >
                        <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                        {r.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DarkCard>

            {/* ── SECTION 9: FINAL DECISION BOX ────────────────────────── */}
            <div className={`rounded-xl border-2 p-5 ${
              d.decision.bias === 'bullish'
                ? 'bg-emerald-950/30 border-emerald-700'
                : d.decision.bias === 'bearish'
                ? 'bg-red-950/30 border-red-700'
                : 'bg-gray-900 border-gray-700'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    d.decision.bias === 'bullish' ? 'bg-emerald-900/50' :
                    d.decision.bias === 'bearish' ? 'bg-red-900/50' : 'bg-gray-800'
                  }`}>
                    {d.decision.bias === 'bullish' ? (
                      <TrendingUp size={20} className="text-emerald-400" />
                    ) : d.decision.bias === 'bearish' ? (
                      <TrendingDown size={20} className="text-red-400" />
                    ) : (
                      <Minus size={20} className="text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Final Decision</p>
                    <p className={`font-black text-2xl ${biasColor(d.decision.bias)}`}>
                      {d.decision.bias.toUpperCase()}
                    </p>
                  </div>
                </div>
                <ConfidenceMeter
                  value={d.decision.confidence}
                  color={d.decision.bias === 'bullish' ? '#10b981' : d.decision.bias === 'bearish' ? '#ef4444' : '#6b7280'}
                />
              </div>

              {/* 3x3 grid of fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Best Setup</p>
                  <p className="text-gray-200 text-sm font-bold">{d.decision.bestSetup}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Wait For</p>
                  <p className="text-gray-300 text-xs leading-relaxed">{d.decision.waitFor}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Entry Zone</p>
                  <p className="text-gray-200 text-sm font-bold">{d.decision.entryZone}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Invalidation</p>
                  <p className="text-red-400 text-sm font-bold">{d.decision.invalidation}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Likely Target</p>
                  <p className="text-emerald-400 text-sm font-bold">{d.decision.likelyTarget}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Order Type</p>
                  <p className="text-purple-400 text-xs font-semibold">{d.decision.suggestedOrderType}</p>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Risk Level</p>
                  <Badge color={d.decision.riskLevel === 'high' ? 'red' : d.decision.riskLevel === 'medium' ? 'amber' : 'emerald'}>
                    {d.decision.riskLevel.toUpperCase()}
                  </Badge>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Power Hour Bias</p>
                  <Badge color={biasBadgeColor(d.decision.bias)}>
                    {d.decision.bias.toUpperCase()}
                  </Badge>
                </div>
                <div className="bg-gray-900/60 rounded-xl p-3 flex items-center gap-3">
                  <ConfidenceMeter
                    value={d.decision.confidence}
                    color={d.decision.bias === 'bullish' ? '#10b981' : d.decision.bias === 'bearish' ? '#ef4444' : '#6b7280'}
                  />
                  <div>
                    <p className="text-gray-200 font-bold text-sm">{d.decision.confidenceLabel}</p>
                    <p className="text-gray-500 text-xs">{d.decision.confidence}/100</p>
                  </div>
                </div>
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
