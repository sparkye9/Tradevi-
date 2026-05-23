'use client';

import { useState, useCallback, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Zap, BarChart2, Activity, Target, Shield, Flame, Search,
  ChevronUp, ChevronDown, CheckCircle, XCircle, Info, Radio,
  Layers, Clock, Eye, Crosshair,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BiasResult { bias: 'bullish' | 'bearish' | 'neutral'; strength: number; ema9: number | null; ema21: number | null; rsi: number; atr: number; priceVsEma21: 'above' | 'below'; ema9AboveEma21: boolean; notes: string[]; }
interface FVGLevel { symbol: string; timeframe: string; type: 'bullish' | 'bearish'; high: number; low: number; mid: number; ageCandles: number; strength: 'strong' | 'moderate' | 'weak'; }
interface StructureEvent { event: 'BOS_UP' | 'BOS_DOWN' | 'CHoCH_UP' | 'CHoCH_DOWN'; level: number; ageCandles: number; significance: 'major' | 'minor'; description: string; timeframe: string; }
interface LiquiditySweep { type: 'bullish_sweep' | 'bearish_sweep'; level: number; ageCandles: number; timeframe: string; description: string; }
interface VolumeProfile { poc: number; vahigh: number; valow: number; levels: { price: number; volume: number; pct: number }[]; }
interface IntradayRegime { type: string; label: string; description: string; approach: string; }
interface Scenario { direction: 'bullish' | 'bearish'; title: string; entryCondition: string; entryLevel: number | null; target1: number | null; target2: number | null; target3: number | null; stopLevel: number | null; invalidation: string; probability: 'high' | 'medium' | 'low'; }
interface IntradayScoredOption { contractSymbol: string; type: 'call' | 'put'; strike: number; expiration: number; dte: number; bid: number; ask: number; mid: number; spreadPct: number; volume: number; openInterest: number; delta: number; gamma: number; theta: number; vega: number; ivPct: number; inTheMoney: boolean; institutionalActivity: boolean; scalp0DTE: boolean; category: 'aggressive' | 'balanced' | 'conservative'; entryMid: number; target1: number; target2: number; stopLoss: number; rrRatio: number; score: number; grade: 'A+' | 'A' | 'B' | 'C'; rationale: string; }

interface IntradayData {
  success: boolean; error?: string;
  symbol: string; price: number; changePct: number;
  vwap: number; priceVsVwap: 'above' | 'below' | 'at';
  prevDayHigh: number; prevDayLow: number; weeklyHigh: number; weeklyLow: number;
  equil: number; zone: 'premium' | 'discount' | 'equilibrium';
  resistanceLevels: number[]; supportLevels: number[];
  volumeProfile: VolumeProfile; volumeRatio: number;
  futures: { es: number; esChange: number; nq: number; nqChange: number };
  vix: number; vixChange: number; vixRegime: 'low' | 'normal' | 'elevated' | 'extreme';
  weeklyBias: BiasResult; dailyBias: BiasResult; fourHBias: BiasResult; oneHBias: BiasResult; fif15mBias: BiasResult;
  fvgLevels: FVGLevel[]; structureEvents: StructureEvent[]; liquiditySweeps: LiquiditySweep[];
  regime: IntradayRegime; overallBias: 'bullish' | 'bearish' | 'neutral'; biasStrength: number; biasReason: string;
  bullishScenario: Scenario; bearishScenario: Scenario;
  topCalls: IntradayScoredOption[]; topPuts: IntradayScoredOption[]; bestRR: IntradayScoredOption | null;
  entryTriggers: { long: string[]; short: string[] };
  stopLoss: { long: number | null; short: number | null };
  targets: { long: number[]; short: number[] };
  noTradeConditions: string[]; confidenceScore: number; fetchedAt: string;
}

interface ScanEntry { symbol: string; price: number; changePct: number; gapPct: number; bias: 'bullish' | 'bearish' | 'neutral'; biasStrength: number; regime: string; vwap: number; priceVsVwap: string; fvgCount: number; bosEvent: string; confidenceScore: number; reason: string; }
interface DiscoveredTicker { symbol: string; price: number; changePct: number; gapPct: number; volumeRatio: number; reason: string; }
interface ScanData { success: boolean; error?: string; scanResults: ScanEntry[]; discoveredTickers: DiscoveredTicker[]; futures: { es: number; esChange: number; nq: number; nqChange: number }; vix: number; vixChange: number; fetchedAt: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'META', 'AMZN', 'GOOGL', 'TSLA', 'NFLX', 'AVGO', 'PLTR', 'COIN', 'MSTR'];

const biasColor  = (b: string) => b === 'bullish' ? 'text-emerald-400' : b === 'bearish' ? 'text-red-400' : 'text-gray-400';
const biasBg     = (b: string) => b === 'bullish' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : b === 'bearish' ? 'bg-red-950 border-red-700 text-red-300' : 'bg-gray-800 border-gray-600 text-gray-300';
const pctColor   = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
const scoreColor = (s: number) => s >= 75 ? 'text-emerald-400' : s >= 58 ? 'text-yellow-400' : s >= 42 ? 'text-orange-400' : 'text-red-400';
const scoreBg    = (s: number) => s >= 75 ? 'bg-emerald-950 border-emerald-700' : s >= 58 ? 'bg-yellow-950 border-yellow-700' : 'bg-gray-800 border-gray-700';
const gradeColor = (g: string) => ({'A+': 'text-emerald-400 bg-emerald-950 border-emerald-700', A: 'text-emerald-300 bg-emerald-950 border-emerald-800', B: 'text-yellow-400 bg-yellow-950 border-yellow-700', C: 'text-orange-400 bg-orange-950 border-orange-700'} as Record<string,string>)[g] ?? 'text-gray-400';
const vixBadge   = (r: string) => ({'low': 'bg-emerald-950 text-emerald-400 border-emerald-700', 'normal': 'bg-blue-950 text-blue-400 border-blue-700', 'elevated': 'bg-amber-950 text-amber-400 border-amber-700', 'extreme': 'bg-red-950 text-red-400 border-red-700'} as Record<string,string>)[r] ?? 'bg-gray-800 text-gray-400';
const probColor  = (p: string) => p === 'high' ? 'text-emerald-400' : p === 'medium' ? 'text-yellow-400' : 'text-gray-500';
const fmt2       = (n: number) => n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
const expLabel   = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── UI Primitives ─────────────────────────────────────────────────────────────

function Card({ children, className = '', accent, id }: { children: React.ReactNode; className?: string; accent?: string; id?: string }) {
  return <div id={id} className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${accent ? `border-l-4 ${accent}` : ''} ${className}`}>{children}</div>;
}

function Sec({ icon, title, right, id }: { icon: React.ReactNode; title: string; right?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex items-center justify-between mb-3 scroll-mt-14">
      <div className="flex items-center gap-2 text-gray-300 font-semibold text-sm">
        <span className="text-purple-400">{icon}</span>{title}
      </div>
      {right}
    </div>
  );
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${className}`}>{children}</span>;
}

function BiasBar({ strength, bias }: { strength: number; bias: string }) {
  const col = bias === 'bullish' ? 'bg-emerald-500' : bias === 'bearish' ? 'bg-red-500' : 'bg-gray-600';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-gray-500"><span>Bear</span><span className={`font-bold ${biasColor(bias)}`}>{strength}%</span><span>Bull</span></div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className={`h-full ${col} rounded-full`} style={{ width: `${strength}%` }} /></div>
    </div>
  );
}

function TFBiasCard({ label, data }: { label: string; data: BiasResult }) {
  return (
    <div className={`rounded-lg border p-3 ${data.bias === 'bullish' ? 'bg-emerald-950/20 border-emerald-800/40' : data.bias === 'bearish' ? 'bg-red-950/20 border-red-800/40' : 'bg-gray-800/20 border-gray-700/40'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">{label}</span>
        <Badge className={biasBg(data.bias)}>{data.bias.toUpperCase()}</Badge>
      </div>
      <BiasBar strength={data.strength} bias={data.bias} />
      <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
        <div className="bg-gray-800/60 rounded p-1 text-center"><div className="text-gray-600">RSI</div><div className={`font-bold ${data.rsi > 70 ? 'text-red-400' : data.rsi < 30 ? 'text-emerald-400' : 'text-gray-300'}`}>{data.rsi}</div></div>
        <div className="bg-gray-800/60 rounded p-1 text-center"><div className="text-gray-600">ATR</div><div className="text-gray-300 font-bold">{data.atr > 0 ? data.atr.toFixed(1) : '—'}</div></div>
        <div className="bg-gray-800/60 rounded p-1 text-center"><div className="text-gray-600">EMA</div><div className={`font-bold ${data.ema9AboveEma21 ? 'text-emerald-400' : 'text-red-400'}`}>{data.ema9AboveEma21 ? '↑' : '↓'}</div></div>
      </div>
    </div>
  );
}

function GreeksTable({ contracts, type }: { contracts: IntradayScoredOption[]; type: 'call' | 'put' }) {
  if (!contracts.length) return <div className="text-xs text-gray-600 italic py-4 text-center">No qualifying contracts (0–7 DTE)</div>;
  const accent = type === 'call' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-800 text-gray-600">
            <th className="text-left py-1.5 pr-2">Strike</th>
            <th className="text-left py-1.5 pr-2">Exp</th>
            <th className="text-right py-1.5 pr-2">DTE</th>
            <th className="text-right py-1.5 pr-2">Mid</th>
            <th className="text-right py-1.5 pr-2">IV%</th>
            <th className="text-right py-1.5 pr-2">Δ</th>
            <th className="text-right py-1.5 pr-2">Γ</th>
            <th className="text-right py-1.5 pr-2">Θ/d</th>
            <th className="text-right py-1.5 pr-2">Vega</th>
            <th className="text-right py-1.5 pr-2">OI</th>
            <th className="text-right py-1.5 pr-2">Vol</th>
            <th className="text-right py-1.5 pr-2">Sprd</th>
            <th className="text-right py-1.5 pr-2">T1</th>
            <th className="text-right py-1.5 pr-2">Stop</th>
            <th className="text-right py-1.5">Grade</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => (
            <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${i === 0 ? 'bg-gray-800/20' : ''}`}>
              <td className="py-1.5 pr-2 font-semibold text-gray-200">
                {c.strike.toFixed(c.strike < 50 ? 2 : 0)}
                {c.inTheMoney && <span className="ml-1 text-purple-400 text-[9px]">ITM</span>}
                {c.scalp0DTE && <span className="ml-1 text-amber-400 text-[9px]">0D</span>}
                {c.institutionalActivity && <span className="ml-1 text-cyan-400 text-[9px]">★</span>}
              </td>
              <td className="py-1.5 pr-2 text-gray-500">{expLabel(c.expiration)}</td>
              <td className="py-1.5 pr-2 text-right text-gray-400">{c.dte}d</td>
              <td className={`py-1.5 pr-2 text-right font-semibold ${accent}`}>${c.mid.toFixed(2)}</td>
              <td className={`py-1.5 pr-2 text-right ${c.ivPct > 80 ? 'text-amber-400' : 'text-gray-400'}`}>{c.ivPct.toFixed(0)}%</td>
              <td className="py-1.5 pr-2 text-right text-sky-300">{c.delta.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right text-violet-300">{c.gamma.toFixed(4)}</td>
              <td className={`py-1.5 pr-2 text-right ${c.theta < -0.05 ? 'text-red-400' : 'text-gray-400'}`}>{c.theta.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right text-blue-300">{c.vega.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right text-gray-500">{c.openInterest > 999 ? `${(c.openInterest / 1000).toFixed(1)}k` : c.openInterest}</td>
              <td className="py-1.5 pr-2 text-right text-gray-500">{c.volume > 999 ? `${(c.volume / 1000).toFixed(1)}k` : c.volume}</td>
              <td className={`py-1.5 pr-2 text-right ${c.spreadPct > 15 ? 'text-amber-400' : 'text-gray-500'}`}>{c.spreadPct.toFixed(1)}%</td>
              <td className="py-1.5 pr-2 text-right text-emerald-400">${c.target1.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right text-red-400">${c.stopLoss.toFixed(2)}</td>
              <td className="py-1.5 text-right"><Badge className={gradeColor(c.grade)}>{c.grade}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] text-gray-700 flex gap-4">
        <span>★ = institutional activity</span><span>0D = 0DTE scalp</span>
        <span>ITM = in the money</span><span>Θ = daily decay</span><span>Γ = gamma (fast-move potential)</span>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const bull = scenario.direction === 'bullish';
  return (
    <div className={`rounded-xl border p-4 ${bull ? 'bg-emerald-950/15 border-emerald-800/40' : 'bg-red-950/15 border-red-800/40'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {bull ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
          <span className={`font-bold text-sm ${bull ? 'text-emerald-300' : 'text-red-300'}`}>{scenario.title}</span>
        </div>
        <Badge className={scenario.probability === 'high' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : scenario.probability === 'medium' ? 'bg-yellow-950 text-yellow-400 border-yellow-700' : 'bg-gray-800 text-gray-500 border-gray-700'}>
          {scenario.probability.toUpperCase()} PROB
        </Badge>
      </div>
      <p className="text-xs text-gray-400 mb-3 leading-relaxed">{scenario.entryCondition}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1.5">
          {scenario.entryLevel && <div className="flex justify-between"><span className="text-gray-600">Entry</span><span className="text-gray-200 font-semibold">${scenario.entryLevel}</span></div>}
          {scenario.target1 && <div className="flex justify-between"><span className="text-gray-600">T1</span><span className="text-emerald-400 font-semibold">${scenario.target1}</span></div>}
          {scenario.target2 && <div className="flex justify-between"><span className="text-gray-600">T2</span><span className="text-emerald-300 font-semibold">${scenario.target2}</span></div>}
          {scenario.target3 && <div className="flex justify-between"><span className="text-gray-600">Runner</span><span className="text-emerald-200 font-semibold">${scenario.target3}</span></div>}
        </div>
        <div className="space-y-1.5">
          {scenario.stopLevel && <div className="flex justify-between"><span className="text-gray-600">Stop</span><span className="text-red-400 font-semibold">${scenario.stopLevel}</span></div>}
          <div className="flex justify-between"><span className="text-gray-600">Invalidation</span><span className="text-gray-400 text-right leading-tight">{scenario.invalidation.slice(0, 40)}</span></div>
        </div>
      </div>
    </div>
  );
}

function VolProfileBar({ poc, vahigh, valow, price }: { poc: number; vahigh: number; valow: number; price: number }) {
  if (!poc) return null;
  const range = vahigh - valow || 1;
  const pocPct  = Math.min(100, Math.max(0, (poc   - valow) / range * 100));
  const pricePct = Math.min(100, Math.max(0, (price - valow) / range * 100));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>VA Low <span className="text-gray-300 font-semibold">${valow.toFixed(2)}</span></span>
        <span>POC <span className="text-amber-400 font-semibold">${poc.toFixed(2)}</span></span>
        <span>VA High <span className="text-gray-300 font-semibold">${vahigh.toFixed(2)}</span></span>
      </div>
      <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/30 via-blue-700/40 to-blue-900/30 rounded-full" />
        <div className="absolute h-full w-1 bg-amber-400 rounded-full" style={{ left: `${pocPct}%`, transform: 'translateX(-50%)' }} />
        <div className="absolute h-full w-0.5 bg-white rounded-full" style={{ left: `${pricePct}%`, transform: 'translateX(-50%)' }} />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-600">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 bg-amber-400 rounded" />POC</span>
        <span className="flex items-center gap-1"><span className="inline-block w-1 h-2 bg-white rounded" />Price</span>
        <span className="ml-auto">Price {price > poc ? 'above' : price < poc ? 'below' : 'at'} POC</span>
      </div>
    </div>
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const color = score >= 75 ? '#34d399' : score >= 55 ? '#fbbf24' : '#f87171';
  const r = 36, cx = 44, cy = 44, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ * 0.75, gap = circ * 0.25 + circ * 0.75 * (1 - score / 100);
  return (
    <svg width={88} height={66} viewBox="0 0 88 66">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={8} strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" />
      <text x={cx} y={cy + 5} textAnchor="middle" fill={color} fontSize={16} fontWeight="bold">{score}</text>
    </svg>
  );
}

// ─── Sticky nav for analysis sections ─────────────────────────────────────────

const SECTIONS = [
  { id: 's1',  label: 'Bias' },
  { id: 's2',  label: 'Structure' },
  { id: 's3',  label: 'FVGs' },
  { id: 's4',  label: 'Sweeps' },
  { id: 's5',  label: 'Levels' },
  { id: 's6',  label: 'Scenarios' },
  { id: 's7',  label: 'Calls' },
  { id: 's8',  label: 'Puts' },
  { id: 's9',  label: 'Best R:R' },
  { id: 's10', label: 'Plan' },
  { id: 's11', label: 'No-Trade' },
  { id: 's12', label: 'Score' },
];

function StickyNav() {
  return (
    <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 -mx-4 px-4 py-2 mb-5 flex gap-4 overflow-x-auto">
      {SECTIONS.map(s => (
        <a key={s.id} href={`#${s.id}`} className="text-xs font-semibold whitespace-nowrap text-gray-500 hover:text-purple-300 transition-colors">{s.label}</a>
      ))}
    </div>
  );
}

// ─── Market conditions bar ─────────────────────────────────────────────────────

function MarketBar({ d }: { d: IntradayData }) {
  const vwapColor = d.priceVsVwap === 'above' ? 'text-emerald-400' : d.priceVsVwap === 'below' ? 'text-red-400' : 'text-gray-400';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 bg-gray-900 border border-gray-800 rounded-xl mb-5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">ES</span>
        <span className="font-semibold text-white">{d.futures.es > 0 ? d.futures.es.toLocaleString() : '—'}</span>
        <span className={pctColor(d.futures.esChange)}>{fmt2(d.futures.esChange)}%</span>
      </div>
      <div className="h-3 w-px bg-gray-700" />
      <div className="flex items-center gap-2">
        <span className="text-gray-500">NQ</span>
        <span className="font-semibold text-white">{d.futures.nq > 0 ? d.futures.nq.toLocaleString() : '—'}</span>
        <span className={pctColor(d.futures.nqChange)}>{fmt2(d.futures.nqChange)}%</span>
      </div>
      <div className="h-3 w-px bg-gray-700" />
      <div className="flex items-center gap-2">
        <span className="text-gray-500">VIX</span>
        <span className={`font-semibold ${d.vix > 25 ? 'text-red-400' : d.vix > 18 ? 'text-amber-400' : 'text-white'}`}>{d.vix.toFixed(1)}</span>
        <Badge className={vixBadge(d.vixRegime)}>{d.vixRegime.toUpperCase()}</Badge>
      </div>
      <div className="h-3 w-px bg-gray-700" />
      <div className="flex items-center gap-2">
        <span className="text-gray-500">VWAP</span>
        <span className="text-gray-300 font-semibold">${d.vwap}</span>
        <span className={`font-semibold ${vwapColor}`}>{d.priceVsVwap.toUpperCase()}</span>
      </div>
      <div className="h-3 w-px bg-gray-700" />
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Zone</span>
        <Badge className={d.zone === 'premium' ? 'bg-red-950 text-red-400 border-red-700' : d.zone === 'discount' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-gray-800 text-gray-400 border-gray-700'}>{d.zone.toUpperCase()}</Badge>
      </div>
      <div className="h-3 w-px bg-gray-700" />
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Vol</span>
        <span className={`font-semibold ${d.volumeRatio >= 1.5 ? 'text-amber-400' : d.volumeRatio < 0.7 ? 'text-red-400' : 'text-gray-300'}`}>{d.volumeRatio.toFixed(2)}x</span>
      </div>
      <div className="ml-auto text-gray-700">{d.fetchedAt ? new Date(d.fetchedAt).toLocaleTimeString() : ''}</div>
    </div>
  );
}

// ─── Single analysis view ──────────────────────────────────────────────────────

function AnalysisView({ d }: { d: IntradayData }) {
  return (
    <div className="space-y-5">
      <MarketBar d={d} />
      <StickyNav />

      {/* S1: Overall bias */}
      <Card id="s1" accent={d.overallBias === 'bullish' ? 'border-emerald-600' : d.overallBias === 'bearish' ? 'border-red-600' : 'border-gray-600'}>
        <Sec icon={<Target size={14} />} title="1. Overall Market Bias" />
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`flex items-center gap-2 text-3xl font-black ${biasColor(d.overallBias)}`}>
            {d.overallBias === 'bullish' ? <TrendingUp size={28} /> : d.overallBias === 'bearish' ? <TrendingDown size={28} /> : <Minus size={28} />}
            {d.overallBias.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-1">
              <div className={`h-full rounded-full ${d.overallBias === 'bullish' ? 'bg-emerald-500' : d.overallBias === 'bearish' ? 'bg-red-500' : 'bg-gray-600'}`} style={{ width: `${d.biasStrength}%` }} />
            </div>
            <p className="text-xs text-gray-400">{d.biasReason}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge className={d.regime.type === 'trending_up' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : d.regime.type === 'trending_down' ? 'bg-red-950 text-red-400 border-red-700' : d.regime.type === 'panic' ? 'bg-red-950 text-red-300 border-red-600' : d.regime.type === 'expansion' ? 'bg-blue-950 text-blue-400 border-blue-700' : 'bg-amber-950 text-amber-400 border-amber-700'}>{d.regime.label}</Badge>
            <Badge className={vixBadge(d.vixRegime)}>VIX {d.vixRegime.toUpperCase()}</Badge>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2 italic">{d.regime.approach}</p>
      </Card>

      {/* S2: Multi-TF structure */}
      <div id="s2">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2 pl-1 flex items-center gap-2"><Activity size={12} className="text-purple-400" />2. Multi-Timeframe Structure</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[['Weekly', d.weeklyBias], ['Daily', d.dailyBias], ['4H', d.fourHBias], ['1H', d.oneHBias], ['15m', d.fif15mBias]].map(([label, bias]) => (
            <TFBiasCard key={label as string} label={label as string} data={bias as BiasResult} />
          ))}
        </div>
      </div>

      {/* S3: FVG levels */}
      <Card id="s3">
        <Sec icon={<BarChart2 size={14} />} title="3. Fair Value Gaps" right={<Badge className="bg-gray-800 border-gray-700 text-gray-400">{d.fvgLevels.length} active</Badge>} />
        {d.fvgLevels.length === 0
          ? <p className="text-xs text-gray-600 italic py-3 text-center">No FVGs within 8% of price</p>
          : <div className="space-y-1.5">
              {d.fvgLevels.slice(0, 10).map((f, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded text-xs border ${f.type === 'bullish' ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-red-950/20 border-red-800/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${f.type === 'bullish' ? 'text-emerald-400' : 'text-red-400'}`}>{f.type === 'bullish' ? '▲FVG' : '▼FVG'}</span>
                    <span className="text-gray-500 uppercase">{f.timeframe}</span>
                    <span className={f.strength === 'strong' ? 'text-amber-400' : f.strength === 'moderate' ? 'text-gray-400' : 'text-gray-600'}>{f.strength}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-200 font-semibold">{f.low.toFixed(2)} – {f.high.toFixed(2)}</span>
                    <span className="text-gray-600 ml-2">mid ${f.mid.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>}
      </Card>

      {/* S4: BOS/CHoCH + Liquidity sweeps */}
      <div id="s4" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <Sec icon={<Zap size={14} />} title="4a. BOS / CHoCH" />
          {d.structureEvents.length === 0
            ? <p className="text-xs text-gray-600 italic py-3 text-center">No structure events detected</p>
            : <div className="space-y-2">
                {d.structureEvents.map((e, i) => {
                  const bull = e.event === 'BOS_UP' || e.event === 'CHoCH_UP';
                  return (
                    <div key={i} className={`p-2.5 rounded border ${bull ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-red-950/20 border-red-800/40'}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <Badge className={bull ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'} >{e.event.replace('_', ' ')}</Badge>
                          <span className="text-[10px] text-gray-600 uppercase">{e.timeframe}</span>
                          {e.significance === 'major' && <Badge className="bg-amber-950 text-amber-400 border-amber-700">MAJOR</Badge>}
                        </div>
                        <span className="text-xs text-gray-400 font-semibold">${e.level}</span>
                      </div>
                      <p className="text-[11px] text-gray-500">{e.description}</p>
                    </div>
                  );
                })}
              </div>}
        </Card>
        <Card>
          <Sec icon={<Crosshair size={14} />} title="4b. Liquidity Sweeps" />
          {d.liquiditySweeps.length === 0
            ? <p className="text-xs text-gray-600 italic py-3 text-center">No recent liquidity sweeps detected</p>
            : <div className="space-y-2">
                {d.liquiditySweeps.map((s, i) => {
                  const bull = s.type === 'bullish_sweep';
                  return (
                    <div key={i} className={`p-2.5 rounded border ${bull ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-red-950/20 border-red-800/40'}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <Badge className={bull ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>{bull ? 'BULL SWEEP' : 'BEAR SWEEP'}</Badge>
                        <span className="text-xs text-gray-400 font-semibold">${s.level}</span>
                      </div>
                      <p className="text-[11px] text-gray-500">{s.description}</p>
                      <div className="text-[10px] text-gray-700 mt-0.5">{s.ageCandles} candles ago · {s.timeframe}</div>
                    </div>
                  );
                })}
              </div>}
        </Card>
      </div>

      {/* S5: Key levels */}
      <Card id="s5">
        <Sec icon={<Layers size={14} />} title="5. Key Levels & Liquidity Targets" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
          {[
            { label: 'Prev Day High', val: d.prevDayHigh, color: 'text-emerald-400' },
            { label: 'Prev Day Low',  val: d.prevDayLow,  color: 'text-red-400' },
            { label: 'Weekly High',   val: d.weeklyHigh,  color: 'text-emerald-300' },
            { label: 'Weekly Low',    val: d.weeklyLow,   color: 'text-red-300' },
            { label: 'VWAP',          val: d.vwap,        color: 'text-sky-400' },
            { label: 'Equilibrium',   val: d.equil,       color: 'text-gray-300' },
            { label: 'POC',           val: d.volumeProfile.poc, color: 'text-amber-400' },
            { label: 'VA High/Low',   val: null,          color: 'text-gray-400', custom: `${d.volumeProfile.vahigh} / ${d.volumeProfile.valow}` },
          ].map(({ label, val, color, custom }) => (
            <div key={label} className="bg-gray-800 rounded p-2">
              <div className="text-gray-600">{label}</div>
              <div className={`font-semibold mt-0.5 ${color}`}>{custom ?? (val ? `$${val.toFixed(2)}` : '—')}</div>
            </div>
          ))}
        </div>
        <VolProfileBar poc={d.volumeProfile.poc} vahigh={d.volumeProfile.vahigh} valow={d.volumeProfile.valow} price={d.price} />
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
          <div>
            <div className="text-gray-600 mb-1">Resistance Zones</div>
            {d.resistanceLevels.slice(0, 3).map((l, i) => <div key={i} className="flex items-center gap-1.5"><span className="text-red-400 text-[10px]">▲</span><span className="text-gray-300 font-semibold">${l}</span></div>)}
            {!d.resistanceLevels.length && <span className="text-gray-700 italic">None detected above</span>}
          </div>
          <div>
            <div className="text-gray-600 mb-1">Support Zones</div>
            {d.supportLevels.slice(0, 3).map((l, i) => <div key={i} className="flex items-center gap-1.5"><span className="text-emerald-400 text-[10px]">▼</span><span className="text-gray-300 font-semibold">${l}</span></div>)}
            {!d.supportLevels.length && <span className="text-gray-700 italic">None detected below</span>}
          </div>
        </div>
      </Card>

      {/* S6: Scenarios */}
      <div id="s6">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2 pl-1 flex items-center gap-2"><Flame size={12} className="text-purple-400" />6. Trade Scenarios</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScenarioCard scenario={d.bullishScenario} />
          <ScenarioCard scenario={d.bearishScenario} />
        </div>
      </div>

      {/* S7: Calls */}
      <Card id="s7">
        <Sec icon={<ChevronUp size={14} className="text-emerald-400" />} title="7. Top 5 Call Contracts" right={<div className="flex gap-2"><Badge className="bg-emerald-950 text-emerald-400 border-emerald-700">0–7 DTE</Badge><Badge className="bg-gray-800 border-gray-700 text-gray-400">{d.topCalls.length} found</Badge></div>} />
        <GreeksTable contracts={d.topCalls} type="call" />
      </Card>

      {/* S8: Puts */}
      <Card id="s8">
        <Sec icon={<ChevronDown size={14} className="text-red-400" />} title="8. Top 5 Put Contracts" right={<div className="flex gap-2"><Badge className="bg-red-950 text-red-400 border-red-700">0–7 DTE</Badge><Badge className="bg-gray-800 border-gray-700 text-gray-400">{d.topPuts.length} found</Badge></div>} />
        <GreeksTable contracts={d.topPuts} type="put" />
      </Card>

      {/* S9: Best R:R */}
      <Card id="s9" accent={d.bestRR?.type === 'call' ? 'border-emerald-600' : d.bestRR?.type === 'put' ? 'border-red-600' : 'border-gray-700'}>
        <Sec icon={<Star14 />} title="9. Best Risk / Reward Trade" />
        {d.bestRR ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-white font-black text-xl">{d.symbol}</span>
                <Badge className={d.bestRR.type === 'call' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>{d.bestRR.type.toUpperCase()}</Badge>
                <Badge className={gradeColor(d.bestRR.grade)}>{d.bestRR.grade}</Badge>
                <Badge className={d.bestRR.category === 'aggressive' ? 'bg-red-950 text-red-400 border-red-700' : d.bestRR.category === 'balanced' ? 'bg-blue-950 text-blue-400 border-blue-700' : 'bg-gray-800 text-gray-400 border-gray-700'}>{d.bestRR.category.toUpperCase()}</Badge>
                {d.bestRR.institutionalActivity && <Badge className="bg-cyan-950 text-cyan-400 border-cyan-700">INST. ACTIVITY</Badge>}
              </div>
              <div className="text-sm text-gray-400 mb-3">${d.bestRR.strike} · {expLabel(d.bestRR.expiration)} · {d.bestRR.dte}DTE</div>
              <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-xs">
                {[['Entry', `$${d.bestRR.entryMid.toFixed(2)}`, 'text-white'], ['Target 1', `$${d.bestRR.target1.toFixed(2)}`, 'text-emerald-400'], ['Runner', `$${d.bestRR.target2.toFixed(2)}`, 'text-emerald-300'], ['Stop', `$${d.bestRR.stopLoss.toFixed(2)}`, 'text-red-400'], ['R:R', `${d.bestRR.rrRatio.toFixed(1)}:1`, 'text-purple-400']].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between"><span className="text-gray-500">{l}</span><span className={`font-semibold ${c}`}>{v}</span></div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-xs space-y-1.5">
              <div className="text-gray-600 mb-2 font-semibold">Full Greeks</div>
              {[['Delta', d.bestRR.delta.toFixed(3), 'text-sky-300'], ['Gamma', d.bestRR.gamma.toFixed(5), 'text-violet-300'], ['Theta/day', `$${d.bestRR.theta.toFixed(3)}`, 'text-red-400'], ['Vega', `$${d.bestRR.vega.toFixed(3)}`, 'text-blue-300'], ['IV', `${d.bestRR.ivPct.toFixed(1)}%`, 'text-gray-200'], ['OI', d.bestRR.openInterest.toLocaleString(), 'text-gray-200'], ['Volume', d.bestRR.volume.toLocaleString(), 'text-gray-200'], ['Spread', `${d.bestRR.spreadPct.toFixed(1)}%`, 'text-gray-200']].map(([l, v, c]) => (
                <div key={l} className="flex justify-between"><span className="text-gray-500">{l}</span><span className={`font-semibold ${c}`}>{v}</span></div>
              ))}
            </div>
          </div>
        ) : <p className="text-sm text-gray-600 text-center py-4 italic">No qualifying contract meets minimum R:R threshold today.</p>}
      </Card>

      {/* S10: Trade plan */}
      <div id="s10" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <Sec icon={<ChevronUp size={14} className="text-emerald-400" />} title="10a. Long Entry Triggers" />
          {d.entryTriggers.long.length === 0
            ? <p className="text-xs text-gray-600 italic py-3">No clear long triggers at current levels</p>
            : <ul className="space-y-2">{d.entryTriggers.long.map((t, i) => (<li key={i} className="flex items-start gap-2 text-xs"><CheckCircle size={12} className="text-emerald-400 mt-0.5 shrink-0" /><span className="text-gray-300">{t}</span></li>))}</ul>}
          {d.stopLoss.long && <div className="mt-3 flex items-center gap-2 text-xs bg-red-950/20 border border-red-800/30 rounded p-2"><Shield size={12} className="text-red-400" /><span className="text-gray-400">Stop: <span className="text-red-400 font-semibold">${d.stopLoss.long}</span></span></div>}
        </Card>
        <Card>
          <Sec icon={<ChevronDown size={14} className="text-red-400" />} title="10b. Short Entry Triggers" />
          {d.entryTriggers.short.length === 0
            ? <p className="text-xs text-gray-600 italic py-3">No clear short triggers at current levels</p>
            : <ul className="space-y-2">{d.entryTriggers.short.map((t, i) => (<li key={i} className="flex items-start gap-2 text-xs"><XCircle size={12} className="text-red-400 mt-0.5 shrink-0" /><span className="text-gray-300">{t}</span></li>))}</ul>}
          {d.stopLoss.short && <div className="mt-3 flex items-center gap-2 text-xs bg-red-950/20 border border-red-800/30 rounded p-2"><Shield size={12} className="text-red-400" /><span className="text-gray-400">Stop: <span className="text-red-400 font-semibold">${d.stopLoss.short}</span></span></div>}
        </Card>
      </div>

      {/* S11: No-trade conditions */}
      <Card id="s11" accent={d.noTradeConditions.length > 0 ? 'border-amber-600' : 'border-gray-700'}>
        <Sec icon={<AlertTriangle size={14} />} title="11. No-Trade Conditions" right={<Badge className={d.noTradeConditions.length > 0 ? 'bg-amber-950 text-amber-400 border-amber-700' : 'bg-gray-800 text-gray-500 border-gray-700'}>{d.noTradeConditions.length > 0 ? `${d.noTradeConditions.length} ACTIVE` : 'CLEAR'}</Badge>} />
        {d.noTradeConditions.length === 0
          ? <div className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle size={16} />No active no-trade conditions — conditions currently favorable.</div>
          : <ul className="space-y-2">{d.noTradeConditions.map((c, i) => (<li key={i} className="flex items-start gap-2 text-xs"><AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" /><span className="text-gray-300">{c}</span></li>))}</ul>}
        <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-500">
          <span>· 0DTE: strong momentum required</span>
          <span>· Avoid mid-range without direction</span>
          <span>· Never hold through high-impact events</span>
        </div>
      </Card>

      {/* S12: Confidence */}
      <Card id="s12">
        <Sec icon={<Target size={14} />} title="12. Confidence Score" />
        <div className="flex flex-col md:flex-row items-center gap-5">
          <ConfidenceRing score={d.confidenceScore} />
          <div className="flex-1 space-y-1.5 text-sm">
            {[
              { label: '4+ timeframes aligned',   pass: [d.weeklyBias.bias, d.dailyBias.bias, d.fourHBias.bias, d.oneHBias.bias].filter(b => b !== 'neutral').length >= 3 },
              { label: 'Major structure event',   pass: d.structureEvents.some(e => e.significance === 'major') },
              { label: 'Strong FVG present',      pass: d.fvgLevels.some(f => f.strength === 'strong') },
              { label: 'Normal volatility',       pass: d.vixRegime === 'normal' || d.vixRegime === 'low' },
              { label: 'Above-avg volume',        pass: d.volumeRatio >= 1.2 },
              { label: 'A/A+ contracts found',    pass: d.topCalls.some(c => c.grade === 'A+' || c.grade === 'A') || d.topPuts.some(c => c.grade === 'A+' || c.grade === 'A') },
              { label: 'No-trade conditions clear', pass: d.noTradeConditions.length === 0 },
            ].map(({ label, pass }) => (
              <div key={label} className="flex items-center gap-2">
                {pass ? <CheckCircle size={13} className="text-emerald-400 shrink-0" /> : <XCircle size={13} className="text-gray-700 shrink-0" />}
                <span className={pass ? 'text-gray-300' : 'text-gray-600'}>{label}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <div className={`text-4xl font-black ${d.confidenceScore >= 75 ? 'text-emerald-400' : d.confidenceScore >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>{Math.round(d.confidenceScore / 10)}/10</div>
            <div className="text-xs text-gray-500 mt-1">{d.confidenceScore >= 80 ? 'High conviction' : d.confidenceScore >= 60 ? 'Moderate setup' : d.confidenceScore >= 45 ? 'Low conviction' : 'Avoid'}</div>
          </div>
        </div>
      </Card>

      <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-xl text-xs text-gray-700 flex items-start gap-2">
        <Info size={11} className="mt-0.5 shrink-0" />
        Intraday scanner only. Options scalping carries significant risk. Greeks are approximated via Black-Scholes. 0DTE theta decay accelerates after 2pm ET. Never risk more than 1% per scalp. Educational use only.
      </div>
    </div>
  );
}

// ─── Scanner view ─────────────────────────────────────────────────────────────

function ScannerView({ data, onSelect }: { data: ScanData; onSelect: (s: string) => void }) {
  const bullish = data.scanResults.filter(r => r.bias === 'bullish' && r.confidenceScore >= 60).slice(0, 5);
  const bearish = data.scanResults.filter(r => r.bias === 'bearish' && r.confidenceScore >= 60).slice(0, 5);
  const neutral = data.scanResults.filter(r => r.bias === 'neutral' || r.confidenceScore < 60);

  return (
    <div className="space-y-5">
      {/* Macro strip */}
      <div className="flex flex-wrap gap-3 items-center p-3 bg-gray-900 border border-gray-800 rounded-xl text-xs">
        <div className="flex items-center gap-2"><Radio size={10} className="text-emerald-400 animate-pulse" /><span className="text-gray-500">Live Scan</span></div>
        <div className="h-3 w-px bg-gray-700" />
        {[['ES', data.futures.es, data.futures.esChange], ['NQ', data.futures.nq, data.futures.nqChange]].map(([l, p, c]) => (
          <div key={l as string} className="flex items-center gap-1"><span className="text-gray-500">{l}</span><span className="text-white font-semibold">{(p as number) > 0 ? (p as number).toLocaleString() : '—'}</span><span className={pctColor(c as number)}>{fmt2(c as number)}%</span></div>
        ))}
        <div className="flex items-center gap-1"><span className="text-gray-500">VIX</span><span className={`font-semibold ${data.vix > 25 ? 'text-red-400' : data.vix > 18 ? 'text-amber-400' : 'text-white'}`}>{data.vix.toFixed(1)}</span><span className={pctColor(data.vixChange)}>{fmt2(data.vixChange)}%</span></div>
        <div className="ml-auto text-gray-700">{data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : ''}</div>
      </div>

      {/* Full ranked table */}
      <Card>
        <Sec icon={<Activity size={14} />} title="All Symbols — Ranked by Confidence" right={<Badge className="bg-gray-800 border-gray-700 text-gray-400">{data.scanResults.length} symbols</Badge>} />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-600 text-[10px] uppercase tracking-wide">
                <th className="text-left py-2 pr-3">Symbol</th><th className="text-right py-2 pr-3">Price</th><th className="text-right py-2 pr-3">Chg%</th><th className="text-right py-2 pr-3">Gap%</th>
                <th className="text-center py-2 pr-3">Bias</th><th className="text-center py-2 pr-3">Regime</th><th className="text-center py-2 pr-3">vs VWAP</th>
                <th className="text-center py-2 pr-3">BOS/CHoCH</th><th className="text-center py-2 pr-3">FVGs</th>
                <th className="text-right py-2 pr-3">Score</th><th className="text-left py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.scanResults.map((r, i) => (
                <tr key={r.symbol} className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors ${i < 3 ? 'bg-gray-800/10' : ''}`} onClick={() => onSelect(r.symbol)}>
                  <td className="py-2 pr-3 font-black text-gray-100">{r.symbol}</td>
                  <td className="py-2 pr-3 text-right text-gray-300 font-semibold">${r.price.toFixed(2)}</td>
                  <td className={`py-2 pr-3 text-right font-semibold ${pctColor(r.changePct)}`}>{r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%</td>
                  <td className={`py-2 pr-3 text-right ${Math.abs(r.gapPct) > 1.5 ? 'text-amber-400 font-semibold' : 'text-gray-600'}`}>{r.gapPct !== 0 ? `${r.gapPct > 0 ? '+' : ''}${r.gapPct.toFixed(1)}%` : '—'}</td>
                  <td className="py-2 pr-3 text-center"><Badge className={biasBg(r.bias)}>{r.bias.slice(0, 4).toUpperCase()}</Badge></td>
                  <td className="py-2 pr-3 text-center text-gray-500 text-[10px]">{r.regime}</td>
                  <td className={`py-2 pr-3 text-center font-semibold text-[10px] ${r.priceVsVwap === 'above' ? 'text-emerald-400' : 'text-red-400'}`}>{r.priceVsVwap.toUpperCase()}</td>
                  <td className="py-2 pr-3 text-center text-[10px]">
                    {r.bosEvent ? <Badge className={r.bosEvent.includes('UP') || r.bosEvent.includes('CHoCH_UP') ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-red-950 text-red-400 border-red-800'}>{r.bosEvent.replace('_', ' ')}</Badge> : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-center text-gray-400">{r.fvgCount > 0 ? r.fvgCount : '—'}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-black text-sm ${scoreBg(r.confidenceScore)} ${scoreColor(r.confidenceScore)}`}>{r.confidenceScore}</div>
                  </td>
                  <td className="py-2 text-gray-600 max-w-xs truncate">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Discovery */}
      {data.discoveredTickers.length > 0 && (
        <Card>
          <Sec icon={<Radio size={14} />} title="Dynamic Discovery — Gap-ups / Movers" right={<Badge className="bg-fuchsia-950 text-fuchsia-400 border-fuchsia-700">AUTO-FOUND</Badge>} />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {data.discoveredTickers.map(t => (
              <button key={t.symbol} onClick={() => onSelect(t.symbol)}
                className="bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-purple-700 rounded-lg p-3 text-left transition-all">
                <div className="text-white font-black">{t.symbol}</div>
                <div className={`text-sm font-semibold ${pctColor(t.changePct)}`}>{t.changePct >= 0 ? '+' : ''}{t.changePct.toFixed(2)}%</div>
                {t.gapPct !== 0 && <div className={`text-xs mt-0.5 ${Math.abs(t.gapPct) > 2 ? 'text-amber-400' : 'text-gray-500'}`}>Gap {t.gapPct > 0 ? '+' : ''}{t.gapPct.toFixed(1)}%</div>}
                <div className="text-[10px] text-gray-600 mt-1 leading-tight">{t.reason}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[{ title: 'Top Bullish Setups', results: bullish, dir: 'bullish' }, { title: 'Top Bearish Setups', results: bearish, dir: 'bearish' }].map(({ title, results, dir }) => (
          <Card key={dir}>
            <Sec icon={dir === 'bullish' ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />} title={title} />
            {results.length === 0 ? <p className="text-xs text-gray-600 italic py-3">No clean setups currently</p> : (
              <div className="space-y-2">
                {results.map(r => (
                  <button key={r.symbol} onClick={() => onSelect(r.symbol)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 hover:border-purple-700/50 transition-all text-left">
                    <span className="font-black text-gray-100 w-12">{r.symbol}</span>
                    <span className={`font-semibold text-sm ${pctColor(r.changePct)}`}>{r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%</span>
                    <div className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-black text-xs ml-auto ${scoreBg(r.confidenceScore)} ${scoreColor(r.confidenceScore)}`}>{r.confidenceScore}</div>
                    <span className="text-[10px] text-gray-600 truncate max-w-[120px]">{r.regime}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// tiny star icon inline
function Star14() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Mode = 'single' | 'scan';

export default function IntradayScannerPage() {
  const [mode, setMode]           = useState<Mode>('single');
  const [symbol, setSymbol]       = useState('SPY');
  const [data,   setData]         = useState<IntradayData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState('');
  const [scanData, setScanData]   = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError,   setScanError]   = useState('');
  const loadedRef = useRef(false);

  const loadSingle = useCallback(async (sym = symbol) => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/intraday-scanner?symbol=${encodeURIComponent(sym)}`);
      const json = await res.json() as IntradayData;
      if (!json.success) throw new Error(json.error ?? 'Failed');
      setData(json); setSymbol(sym);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    setLoading(false);
  }, [symbol]);

  const loadScan = useCallback(async () => {
    setScanLoading(true); setScanError('');
    try {
      const res  = await fetch('/api/intraday-scanner?mode=scan');
      const json = await res.json() as ScanData;
      if (!json.success) throw new Error(json.error ?? 'Scan failed');
      setScanData(json);
    } catch (e) { setScanError(e instanceof Error ? e.message : 'Scan failed'); }
    setScanLoading(false);
  }, []);

  const handleMode = (m: Mode) => {
    setMode(m);
    if (m === 'single' && !loadedRef.current) { loadedRef.current = true; loadSingle(); }
  };

  if (!loadedRef.current && mode === 'single') {
    loadedRef.current = true;
    setTimeout(() => loadSingle(), 0);
  }

  const handleScanSelect = (sym: string) => {
    setMode('single');
    loadSingle(sym);
  };

  return (
    <AppShell title="Intraday Scanner">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Intraday Market Structure & Options Flow</h1>
          <p className="text-xs text-gray-500 mt-0.5">Institutional-grade · Full greeks · 0–7 DTE · FVG/BOS/CHoCH · VWAP · Volume profile</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => handleMode('single')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${mode === 'single' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'}`}>
            <Crosshair size={14} />Deep Analysis
          </button>
          <button onClick={() => handleMode('scan')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${mode === 'scan' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'}`}>
            <Search size={14} />Market Scan
          </button>
        </div>
      </div>

      {/* Single analysis mode */}
      {mode === 'single' && (
        <>
          {/* Symbol selector */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {WATCHLIST.map(s => (
              <button key={s} onClick={() => loadSingle(s)}
                className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${symbol === s && data ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'}`}>
                {s}
              </button>
            ))}
            <button onClick={() => loadSingle()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-all ml-auto">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />{loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg flex items-center gap-2 text-red-300 text-sm"><AlertTriangle size={14} />{error}</div>}

          {loading && !data && (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-gray-900 rounded-xl animate-pulse border border-gray-800" />)}
            </div>
          )}

          {data && !loading && (
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-2xl font-black text-white">{data.symbol}</span>
                <span className="text-xl font-bold text-gray-200">${data.price.toLocaleString()}</span>
                <span className={`text-lg font-bold ${pctColor(data.changePct)}`}>{data.changePct >= 0 ? '+' : ''}{data.changePct.toFixed(2)}%</span>
              </div>
              <AnalysisView d={data} />
            </div>
          )}

          {data && loading && (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
              <RefreshCw size={12} className="animate-spin" />Refreshing analysis…
            </div>
          )}
        </>
      )}

      {/* Scanner mode */}
      {mode === 'scan' && (
        <>
          {!scanData && !scanLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="w-16 h-16 rounded-full bg-purple-950 border border-purple-700 flex items-center justify-center">
                <Search size={24} className="text-purple-400" />
              </div>
              <div className="text-center">
                <h2 className="text-white font-bold text-lg mb-1">Intraday Market Scan</h2>
                <p className="text-gray-500 text-sm max-w-md">Scans {WATCHLIST.length} symbols + dynamic discovery. Ranks by intraday confidence score using structure, VWAP, FVGs, BOS/CHoCH.</p>
                <p className="text-gray-600 text-xs mt-1">~10 seconds to complete</p>
              </div>
              {scanError && <div className="p-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm flex items-center gap-2"><AlertTriangle size={14} />{scanError}</div>}
              <button onClick={loadScan}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 border border-purple-500 text-white font-bold transition-all">
                <Search size={16} />Run Intraday Scan
              </button>
            </div>
          )}

          {scanLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 rounded-full border-4 border-gray-800" />
                <div className="absolute inset-0 rounded-full border-4 border-t-purple-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center"><Search size={16} className="text-purple-400" /></div>
              </div>
              <p className="text-white font-semibold">Scanning {WATCHLIST.length} symbols…</p>
              <p className="text-gray-500 text-sm">Fetching quotes · Computing structure · Analyzing VWAP</p>
              <div className="flex gap-1.5">{[...Array(4)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
            </div>
          )}

          {scanData && !scanLoading && (
            <>
              <div className="flex justify-end mb-4">
                <button onClick={loadScan}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs font-semibold hover:bg-gray-700 transition-all">
                  <RefreshCw size={12} />Re-scan
                </button>
              </div>
              <ScannerView data={scanData} onSelect={handleScanSelect} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
