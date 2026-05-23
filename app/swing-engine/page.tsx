'use client';

import { useState, useCallback, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle,
  Target, Shield, Zap, BarChart2, Activity, Clock,
  ChevronUp, ChevronDown, CheckCircle, XCircle, Info,
  Flame, Search, Crosshair, Layers, Star, Eye, Radio,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BiasResult {
  bias: 'bullish' | 'bearish' | 'neutral'; strength: number;
  ema9: number | null; ema21: number | null; ema50: number | null;
  rsi: number; atr: number;
  priceVsEma21: 'above' | 'below'; ema9AboveEma21: boolean; notes: string[];
}

interface FVGLevel {
  symbol: string; timeframe: 'weekly' | 'daily' | '4h';
  type: 'bullish' | 'bearish'; high: number; low: number; mid: number;
  filled: boolean; ageCandles: number; strength: 'strong' | 'moderate' | 'weak';
}

interface StructureEvent {
  symbol: string; timeframe: 'weekly' | 'daily' | '4h';
  event: 'BOS_UP' | 'BOS_DOWN' | 'CHoCH_UP' | 'CHoCH_DOWN';
  level: number; ageCandles: number; significance: 'major' | 'minor'; description: string;
}

interface ScoredOption {
  contractSymbol: string; symbol: string; type: 'call' | 'put';
  strike: number; expiration: number; dte: number;
  bid: number; ask: number; mid: number; spreadPct: number;
  volume: number; openInterest: number; iv: number; ivPct: number;
  inTheMoney: boolean; moneyness: number; deltaApprox: number;
  expectedMoveByExp: number; probabilityOtm: number;
  entryMid: number; target1: number; target2: number; stopLoss: number;
  rrRatio: number; holdDays: number; thetaEstDailyPct: number;
  swingScore: number; grade: 'A+' | 'A' | 'B' | 'C' | 'D'; rationale: string;
}

type SetupCategory = 'bullish' | 'bearish' | 'breakout' | 'pullback-fvg' | 'high-conviction' | 'avoid';

interface ScanResult {
  symbol: string; price: number; changePct: number; volume: number;
  weeklyBias: BiasResult; dailyBias: BiasResult;
  fvgLevels: FVGLevel[]; structureEvents: StructureEvent[];
  relStrengthVsSPY: number; relStrengthVsQQQ: number; volumeRatio: number;
  confidenceScore: number; setupTypes: SetupCategory[];
  bestCall?: ScoredOption; bestPut?: ScoredOption;
  reason: string; invalidation: string; riskWarning: string;
  discovered: boolean;
}

interface ScanOutput {
  success: boolean; error?: string;
  vixPrice: number; macroTrend: 'bullish' | 'bearish' | 'neutral';
  spyChangePct: number; qqqChangePct: number;
  allResults: ScanResult[];
  bullishSetups: ScanResult[]; bearishSetups: ScanResult[];
  breakoutSetups: ScanResult[]; pullbackFVGSetups: ScanResult[];
  highConvictionOptions: ScanResult[]; avoidList: ScanResult[];
  top5Today: ScanResult[]; discoveredSymbols: ScanResult[];
  sectorRotation: { name: string; etf: string; changePct1d: number; relStrength: number; trend: 'bullish' | 'bearish' | 'neutral'; rank: number }[];
  fetchedAt: string;
}

interface SingleData {
  success: boolean; error?: string;
  symbol: string; currentPrice: number;
  macroOutlook: {
    trend: 'bullish' | 'bearish' | 'neutral'; riskEnv: 'risk-on' | 'risk-off' | 'mixed';
    vix: number; vixChange: number; vixRegime: 'low' | 'normal' | 'elevated' | 'extreme';
    spyAboveEma200: boolean; dxy: number; dxyTrend: 'rising' | 'falling' | 'flat';
    yields: number; yieldsTrend: 'rising' | 'falling' | 'flat'; hyg: number; gld: number;
    breadth: 'strong' | 'neutral' | 'weak'; fedSentiment: 'dovish' | 'neutral' | 'hawkish';
    summary: string; keyRisks: string[];
  };
  weeklyBias: BiasResult; dailyBias: BiasResult; fourHourBias: BiasResult;
  fvgLevels: FVGLevel[]; structureEvents: StructureEvent[];
  marketRegime: { phase: string; description: string; tradingApproach: string; avoidList: string[] };
  sectorRotation: { name: string; etf: string; price: number; changePct1d: number; relStrength: number; trend: 'bullish' | 'bearish' | 'neutral'; rank: number }[];
  scoredCalls: ScoredOption[]; scoredPuts: ScoredOption[];
  highestConviction: ScoredOption | null; confidenceScore: number;
  volatilityData: { vix: number; vixChangePct: number; ivExpanding: boolean; regime: string; thetaFriendly: boolean; recommendation: string };
  quotes: { spy: { price: number; changePct: number } | null; qqq: { price: number; changePct: number } | null; iwm: { price: number; changePct: number } | null };
  fetchedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'NVDA', 'AAPL', 'TSLA', 'META', 'MSFT', 'AMZN', 'GOOGL', 'AMD'] as const;

// ─── Color helpers ────────────────────────────────────────────────────────────

const biasColor = (b: string) => b === 'bullish' ? 'text-emerald-400' : b === 'bearish' ? 'text-red-400' : 'text-gray-400';
const biasBg    = (b: string) => b === 'bullish' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : b === 'bearish' ? 'bg-red-950 border-red-700 text-red-300' : 'bg-gray-800 border-gray-600 text-gray-300';
const pctColor  = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
const fmt2      = (n: number) => n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
const scoreColor = (s: number) => s >= 75 ? 'text-emerald-400' : s >= 58 ? 'text-yellow-400' : s >= 42 ? 'text-orange-400' : 'text-red-400';
const scoreBg   = (s: number) => s >= 75 ? 'bg-emerald-950 border-emerald-700' : s >= 58 ? 'bg-yellow-950 border-yellow-700' : s >= 42 ? 'bg-orange-950 border-orange-700' : 'bg-red-950 border-red-700';

const gradeColor = (g: string) => ({
  'A+': 'text-emerald-400 bg-emerald-950 border-emerald-700',
  'A':  'text-emerald-300 bg-emerald-950 border-emerald-800',
  'B':  'text-yellow-400  bg-yellow-950  border-yellow-700',
  'C':  'text-orange-400  bg-orange-950  border-orange-700',
  'D':  'text-red-400     bg-red-950     border-red-700',
} as Record<string, string>)[g] ?? 'text-gray-400';

const vixRegimeBadge = (r: string) => ({
  low:      'bg-emerald-950 text-emerald-400 border-emerald-700',
  normal:   'bg-blue-950   text-blue-400   border-blue-700',
  elevated: 'bg-amber-950  text-amber-400  border-amber-700',
  extreme:  'bg-red-950    text-red-400    border-red-700',
} as Record<string, string>)[r] ?? 'bg-gray-800 text-gray-400';

const regimeColor = (p: string) => ({ expansion: 'text-emerald-400', accumulation: 'text-blue-400', distribution: 'text-red-400', reversal: 'text-amber-400', ranging: 'text-gray-400' } as Record<string, string>)[p] ?? 'text-gray-400';

const expiryLabel = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function DarkCard({ children, className = '', accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${accent ? `border-l-4 ${accent}` : ''} ${className}`}>{children}</div>;
}

function SectionTitle({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
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
  const color = bias === 'bullish' ? 'bg-emerald-500' : bias === 'bearish' ? 'bg-red-500' : 'bg-gray-600';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>Bear</span><span className={`font-semibold ${biasColor(bias)}`}>{strength}%</span><span>Bull</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${strength}%` }} />
      </div>
    </div>
  );
}

function BiasCard({ label, data }: { label: string; data: BiasResult }) {
  return (
    <DarkCard accent={data.bias === 'bullish' ? 'border-emerald-600' : data.bias === 'bearish' ? 'border-red-600' : 'border-gray-600'}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
        <Badge className={biasBg(data.bias)}>{data.bias.toUpperCase()}</Badge>
      </div>
      <BiasBar strength={data.strength} bias={data.bias} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="bg-gray-800 rounded p-1.5 text-center">
          <div className="text-gray-500">RSI</div>
          <div className={`font-semibold ${data.rsi > 70 ? 'text-red-400' : data.rsi < 30 ? 'text-emerald-400' : data.rsi > 55 ? 'text-emerald-300' : data.rsi < 45 ? 'text-red-300' : 'text-gray-300'}`}>{data.rsi}</div>
        </div>
        <div className="bg-gray-800 rounded p-1.5 text-center">
          <div className="text-gray-500">ATR</div>
          <div className="text-gray-300 font-semibold">{data.atr > 0 ? data.atr.toFixed(1) : '—'}</div>
        </div>
        <div className="bg-gray-800 rounded p-1.5 text-center">
          <div className="text-gray-500">EMA</div>
          <div className={`font-semibold ${data.ema9AboveEma21 ? 'text-emerald-400' : 'text-red-400'}`}>{data.ema9AboveEma21 ? '9>21 ↑' : '9<21 ↓'}</div>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5">
        {data.notes.slice(0, 3).map((n, i) => (
          <li key={i} className="text-xs text-gray-500 flex items-center gap-1">
            <span className={biasColor(data.bias)}>·</span> {n}
          </li>
        ))}
      </ul>
    </DarkCard>
  );
}

function OptionsTable({ contracts, type, currentPrice }: { contracts: ScoredOption[]; type: 'call' | 'put'; currentPrice: number }) {
  if (!contracts.length) return <div className="text-xs text-gray-500 italic py-4 text-center">No qualifying contracts found for this symbol / DTE range</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800 text-gray-500">
            <th className="text-left py-2 pr-3">Strike</th><th className="text-left py-2 pr-3">Exp</th>
            <th className="text-right py-2 pr-3">DTE</th><th className="text-right py-2 pr-3">Mid</th>
            <th className="text-right py-2 pr-3">IV%</th><th className="text-right py-2 pr-3">OI</th>
            <th className="text-right py-2 pr-3">Sprd%</th><th className="text-right py-2 pr-3">T1</th>
            <th className="text-right py-2 pr-3">Stop</th><th className="text-right py-2 pr-3">R:R</th>
            <th className="text-right py-2">Grade</th>
          </tr>
        </thead>
        <tbody>
          {contracts.slice(0, 8).map((c, i) => (
            <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${i === 0 ? 'bg-gray-800/20' : ''}`}>
              <td className="py-1.5 pr-3 font-semibold text-gray-200">
                {c.strike.toFixed(c.strike < 50 ? 2 : 0)}{c.inTheMoney && <span className="ml-1 text-purple-400 text-[10px]">ITM</span>}
              </td>
              <td className="py-1.5 pr-3 text-gray-400">{expiryLabel(c.expiration)}</td>
              <td className="py-1.5 pr-3 text-right text-gray-300">{c.dte}d</td>
              <td className={`py-1.5 pr-3 text-right font-semibold ${type === 'call' ? 'text-emerald-400' : 'text-red-400'}`}>${c.mid.toFixed(2)}</td>
              <td className={`py-1.5 pr-3 text-right ${c.ivPct > 80 ? 'text-amber-400' : 'text-gray-300'}`}>{c.ivPct.toFixed(0)}%</td>
              <td className="py-1.5 pr-3 text-right text-gray-400">{c.openInterest.toLocaleString()}</td>
              <td className={`py-1.5 pr-3 text-right ${c.spreadPct > 15 ? 'text-amber-400' : 'text-gray-400'}`}>{c.spreadPct.toFixed(1)}%</td>
              <td className="py-1.5 pr-3 text-right text-emerald-400">${c.target1.toFixed(2)}</td>
              <td className="py-1.5 pr-3 text-right text-red-400">${c.stopLoss.toFixed(2)}</td>
              <td className="py-1.5 pr-3 text-right text-gray-300">{c.rrRatio.toFixed(1)}x</td>
              <td className="py-1.5 text-right"><Badge className={gradeColor(c.grade)}>{c.grade}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConvictionCard({ c }: { c: ScoredOption }) {
  const isCall = c.type === 'call';
  return (
    <DarkCard accent={isCall ? 'border-emerald-600' : 'border-red-600'} className="relative overflow-hidden">
      <div className="absolute top-3 right-4 text-4xl font-black opacity-5 text-white">{isCall ? '↑' : '↓'}</div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Highest Conviction</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-black text-white">{c.symbol}</span>
            <Badge className={isCall ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>{c.type.toUpperCase()}</Badge>
            <Badge className={gradeColor(c.grade)}>{c.grade}</Badge>
          </div>
          <div className="text-sm text-gray-400 mt-1">${c.strike.toFixed(c.strike < 50 ? 2 : 0)} · {expiryLabel(c.expiration)} · {c.dte}DTE</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Score</div>
          <div className={`text-3xl font-black ${c.swingScore >= 80 ? 'text-emerald-400' : c.swingScore >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>{c.swingScore}</div>
          <div className="text-xs text-gray-500">/ 100</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Trade Parameters</div>
          <div className="space-y-1 text-sm">
            {[['Entry', `$${c.entryMid.toFixed(2)}`, 'text-white'], ['Target 1', `$${c.target1.toFixed(2)}`, 'text-emerald-400'], ['Target 2', `$${c.target2.toFixed(2)}`, 'text-emerald-300'], ['Stop Loss', `$${c.stopLoss.toFixed(2)}`, 'text-red-400'], ['R:R', `${c.rrRatio.toFixed(1)}:1`, 'text-purple-400']].map(([l, v, cls]) => (
              <div key={l} className="flex justify-between"><span className="text-gray-400">{l}</span><span className={`font-semibold ${cls}`}>{v}</span></div>
            ))}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Contract Metrics</div>
          <div className="space-y-1 text-sm">
            {[['IV', `${c.ivPct.toFixed(0)}%`, c.ivPct > 80 ? 'text-amber-400' : 'text-gray-200'], ['Open Interest', c.openInterest.toLocaleString(), 'text-gray-200'], ['Spread', `${c.spreadPct.toFixed(1)}%`, c.spreadPct > 15 ? 'text-amber-400' : 'text-gray-200'], ['Delta ~', c.deltaApprox.toFixed(2), 'text-gray-200'], ['Hold', `${c.holdDays}d`, 'text-gray-200']].map(([l, v, cls]) => (
              <div key={l} className="flex justify-between"><span className="text-gray-400">{l}</span><span className={`font-semibold ${cls}`}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400">
        <span className="text-gray-500 font-medium">Rationale: </span>{c.rationale}
      </div>
    </DarkCard>
  );
}

function ConfidenceGauge({ score }: { score: number }) {
  const norm = score / 100, color = score >= 75 ? '#34d399' : score >= 55 ? '#fbbf24' : '#f87171';
  const r = 44, cx = 52, cy = 52, circ = 2 * Math.PI * r;
  const dash = norm * circ * 0.75, gap = circ * 0.25 + circ * 0.75 * (1 - norm);
  return (
    <div className="flex flex-col items-center">
      <svg width={104} height={80} viewBox="0 0 104 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={10} strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize={20} fontWeight="bold">{score}</text>
      </svg>
      <div className="text-xs text-gray-500 -mt-2">Confidence / 100</div>
    </div>
  );
}

// ─── Scanner UI components ─────────────────────────────────────────────────────

function SetupTypeBadges({ types }: { types: SetupCategory[] }) {
  const map: Record<SetupCategory, string> = {
    bullish:          'bg-emerald-950 text-emerald-400 border-emerald-700',
    bearish:          'bg-red-950 text-red-400 border-red-700',
    breakout:         'bg-blue-950 text-blue-400 border-blue-700',
    'pullback-fvg':   'bg-purple-950 text-purple-400 border-purple-700',
    'high-conviction':'bg-amber-950 text-amber-400 border-amber-700',
    avoid:            'bg-gray-800 text-gray-500 border-gray-700',
  };
  const labels: Record<SetupCategory, string> = {
    bullish: 'BULL', bearish: 'BEAR', breakout: 'BREAK',
    'pullback-fvg': 'FVG', 'high-conviction': 'HOT', avoid: 'AVOID',
  };
  return (
    <div className="flex flex-wrap gap-1">
      {types.filter(t => t !== 'avoid' || types.length === 1).map(t => (
        <Badge key={t} className={map[t]}>{labels[t]}</Badge>
      ))}
    </div>
  );
}

function MiniOption({ opt, label }: { opt: ScoredOption; label: string }) {
  const isCall = opt.type === 'call';
  return (
    <div className="bg-gray-800/80 rounded-lg p-2.5 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-gray-500 font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <Badge className={isCall ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>
            {opt.type.toUpperCase()}
          </Badge>
          <Badge className={gradeColor(opt.grade)}>{opt.grade}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-300">
        <span>Strike <span className="font-semibold text-white">${opt.strike.toFixed(opt.strike < 50 ? 2 : 0)}</span></span>
        <span>Exp <span className="font-semibold text-white">{expiryLabel(opt.expiration)}</span></span>
        <span>DTE <span className="font-semibold text-white">{opt.dte}d</span></span>
        <span>Entry <span className={`font-semibold ${isCall ? 'text-emerald-400' : 'text-red-400'}`}>${opt.entryMid.toFixed(2)}</span></span>
        <span>T1 <span className="font-semibold text-emerald-400">${opt.target1.toFixed(2)}</span></span>
        <span>Runner <span className="font-semibold text-emerald-300">${opt.target2.toFixed(2)}</span></span>
        <span>Stop <span className="font-semibold text-red-400">${opt.stopLoss.toFixed(2)}</span></span>
        <span>R:R <span className="font-semibold text-purple-400">{opt.rrRatio.toFixed(1)}x</span></span>
      </div>
    </div>
  );
}

function SetupCard({ result, rank, compact = false }: { result: ScanResult; rank?: number; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isAvoid = result.setupTypes.every(t => t === 'avoid');
  const accent  = isAvoid ? 'border-gray-700'
    : result.setupTypes.includes('bullish') ? 'border-emerald-600'
    : result.setupTypes.includes('bearish') ? 'border-red-600'
    : result.setupTypes.includes('breakout') ? 'border-blue-600'
    : 'border-purple-600';

  const bestOption = result.setupTypes.includes('bearish') ? result.bestPut : result.bestCall;
  const noOption   = !result.bestCall && !result.bestPut;

  return (
    <div className={`bg-gray-900 border border-gray-800 border-l-4 ${accent} rounded-xl p-4 flex flex-col gap-3`}>
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {rank && <span className="text-xs font-black text-amber-400 bg-amber-950 border border-amber-800 rounded px-1.5 py-0.5">#{rank}</span>}
          <span className="text-white font-black text-lg leading-none">{result.symbol}</span>
          {result.discovered && <span className="text-[10px] text-purple-400 border border-purple-800 bg-purple-950/50 rounded px-1.5 py-0.5 font-semibold">DISCOVERED</span>}
          <SetupTypeBadges types={result.setupTypes} />
        </div>
        <div className={`flex flex-col items-center justify-center rounded-lg border px-2 py-1 min-w-[46px] ${scoreBg(result.confidenceScore)}`}>
          <span className={`text-lg font-black leading-none ${scoreColor(result.confidenceScore)}`}>{result.confidenceScore}</span>
          <span className="text-[9px] text-gray-600 mt-0.5">score</span>
        </div>
      </div>

      {/* Price + RS row */}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="text-white font-semibold">${result.price >= 1000 ? result.price.toLocaleString() : result.price.toFixed(2)}</span>
        <span className={`font-medium ${pctColor(result.changePct)}`}>{result.changePct >= 0 ? '+' : ''}{result.changePct.toFixed(2)}%</span>
        <span className={`text-xs px-1.5 py-0.5 rounded border ${result.relStrengthVsSPY > 0 ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400' : 'bg-red-950/50 border-red-800 text-red-400'}`}>
          RS {result.relStrengthVsSPY >= 0 ? '+' : ''}{result.relStrengthVsSPY.toFixed(1)}% vs SPY
        </span>
        {result.volumeRatio > 1.5 && (
          <span className="text-xs text-amber-400 border border-amber-800 bg-amber-950/50 rounded px-1.5 py-0.5">{result.volumeRatio.toFixed(1)}x vol</span>
        )}
      </div>

      {/* Bias pills */}
      <div className="flex gap-2 text-xs flex-wrap">
        <span className={`px-2 py-1 rounded border font-semibold ${biasBg(result.weeklyBias.bias)}`}>W: {result.weeklyBias.bias.slice(0, 4).toUpperCase()}</span>
        <span className={`px-2 py-1 rounded border font-semibold ${biasBg(result.dailyBias.bias)}`}>D: {result.dailyBias.bias.slice(0, 4).toUpperCase()}</span>
        <span className="px-2 py-1 rounded border bg-gray-800 border-gray-700 text-gray-400">RSI {result.dailyBias.rsi}</span>
        <span className={`px-2 py-1 rounded border bg-gray-800 border-gray-700 ${result.dailyBias.ema9AboveEma21 ? 'text-emerald-400' : 'text-red-400'}`}>{result.dailyBias.ema9AboveEma21 ? 'EMA ↑' : 'EMA ↓'}</span>
      </div>

      {/* Best option */}
      {!compact && bestOption && <MiniOption opt={bestOption} label="Best Contract" />}
      {!compact && noOption && !isAvoid && (
        <div className="bg-gray-800/40 rounded-lg p-2.5 text-xs text-gray-500 italic text-center">No qualifying contract found — check liquidity or widen DTE range</div>
      )}

      {/* Reason */}
      {!compact && (
        <div className="space-y-1.5 text-xs border-t border-gray-800/60 pt-2.5">
          <div><span className="text-gray-600">Reason: </span><span className="text-gray-300">{result.reason}</span></div>
          <div><span className="text-gray-600">Invalidation: </span><span className="text-gray-400">{result.invalidation}</span></div>
          <div className="flex items-start gap-1 text-amber-400/80">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
            <span>{result.riskWarning}</span>
          </div>
        </div>
      )}

      {/* Compact expand toggle */}
      {compact && (
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Less' : 'Details'}
        </button>
      )}
      {compact && expanded && (
        <div className="space-y-1.5 text-xs border-t border-gray-800/60 pt-2">
          {bestOption && <MiniOption opt={bestOption} label="Best Contract" />}
          <div><span className="text-gray-600">Reason: </span><span className="text-gray-300">{result.reason}</span></div>
          <div><span className="text-gray-600">Invalidation: </span><span className="text-gray-400">{result.invalidation}</span></div>
          <div className="flex items-start gap-1 text-amber-400/80"><AlertTriangle size={10} className="mt-0.5 shrink-0" /><span>{result.riskWarning}</span></div>
        </div>
      )}
    </div>
  );
}

function Top5Today({ results }: { results: ScanResult[] }) {
  if (!results.length) return null;
  return (
    <div id="top5" className="scroll-mt-16 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Flame size={16} className="text-amber-400" />
        <h2 className="text-white font-bold text-base">Top 5 Today</h2>
        <Badge className="bg-amber-950 text-amber-400 border-amber-700">BEST SETUPS</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {results.map((r, i) => <SetupCard key={r.symbol} result={r} rank={i + 1} compact />)}
      </div>
    </div>
  );
}

function ScannerSection({ id, title, icon, results, emptyMsg, accent }: {
  id: string; title: string; icon: React.ReactNode; results: ScanResult[];
  emptyMsg: string; accent?: string;
}) {
  return (
    <div id={id} className="scroll-mt-16 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={accent ?? 'text-purple-400'}>{icon}</span>
        <h2 className="text-white font-bold text-base">{title}</h2>
        <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-gray-800 border-gray-700 text-gray-400">{results.length}</span>
      </div>
      {results.length === 0 ? (
        <DarkCard><p className="text-gray-500 text-sm text-center py-6 italic">{emptyMsg}</p></DarkCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map(r => <SetupCard key={r.symbol} result={r} />)}
        </div>
      )}
    </div>
  );
}

function ScannerNav({ counts }: { counts: Record<string, number> }) {
  const sections = [
    { id: 'top5',      label: 'Top 5',                       color: 'text-amber-400   hover:text-amber-300' },
    { id: 'bullish',   label: `Bullish (${counts.bullish})`,  color: 'text-emerald-400 hover:text-emerald-300' },
    { id: 'bearish',   label: `Bearish (${counts.bearish})`,  color: 'text-red-400     hover:text-red-300' },
    { id: 'breakout',  label: `Breakout (${counts.breakout})`,color: 'text-blue-400    hover:text-blue-300' },
    { id: 'pullback',  label: `FVG Pull (${counts.pullback})`,color: 'text-purple-400  hover:text-purple-300' },
    { id: 'options',   label: `Hot Options (${counts.options})`,color:'text-yellow-400  hover:text-yellow-300' },
    { id: 'avoid',     label: `Avoid (${counts.avoid})`,      color: 'text-gray-500    hover:text-gray-400' },
    { id: 'discovery', label: `Discovery (${counts.discovery})`,color:'text-fuchsia-400 hover:text-fuchsia-300' },
  ];
  return (
    <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 -mx-4 px-4 py-2 mb-6 flex gap-5 overflow-x-auto">
      {sections.map(s => (
        <a key={s.id} href={`#${s.id}`} className={`text-xs font-semibold whitespace-nowrap transition-colors ${s.color}`}>
          {s.label}
        </a>
      ))}
    </div>
  );
}

function ScanMacroBar({ data }: { data: ScanOutput }) {
  const macroColor = data.macroTrend === 'bullish' ? 'text-emerald-400' : data.macroTrend === 'bearish' ? 'text-red-400' : 'text-gray-400';
  return (
    <div className="flex flex-wrap gap-3 items-center mb-4 p-3 bg-gray-900 border border-gray-800 rounded-xl">
      <div className="flex items-center gap-2">
        <Radio size={12} className="text-emerald-400 animate-pulse" />
        <span className="text-xs text-gray-500">Market Scan</span>
        <span className={`text-sm font-bold ${macroColor}`}>{data.macroTrend.toUpperCase()}</span>
      </div>
      <div className="h-4 w-px bg-gray-700" />
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-gray-500">VIX</span>
        <span className={`font-semibold ${data.vixPrice > 25 ? 'text-red-400' : data.vixPrice > 18 ? 'text-amber-400' : 'text-white'}`}>{data.vixPrice.toFixed(1)}</span>
      </div>
      <div className="h-4 w-px bg-gray-700" />
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-gray-500">SPY</span>
        <span className={`font-semibold ${pctColor(data.spyChangePct)}`}>{fmt2(data.spyChangePct)}%</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-gray-500">QQQ</span>
        <span className={`font-semibold ${pctColor(data.qqqChangePct)}`}>{fmt2(data.qqqChangePct)}%</span>
      </div>
      <div className="h-4 w-px bg-gray-700" />
      <div className="flex gap-2 flex-wrap text-xs">
        {data.sectorRotation.slice(0, 4).map(s => (
          <span key={s.etf} className={`font-medium ${pctColor(s.relStrength)}`}>{s.etf} {s.relStrength >= 0 ? '+' : ''}{s.relStrength.toFixed(1)}%</span>
        ))}
      </div>
      <div className="ml-auto text-xs text-gray-600">
        {data.fetchedAt ? `Scanned ${new Date(data.fetchedAt).toLocaleTimeString()}` : ''}
      </div>
    </div>
  );
}

// ─── Single analysis mode (existing) ─────────────────────────────────────────

const SINGLE_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'NVDA', 'AAPL', 'TSLA', 'META', 'MSFT', 'AMZN', 'GOOGL', 'AMD'] as const;

function SingleAnalysisView({ data, symbol, onSymbol, loading, onRefresh }: {
  data: SingleData; symbol: string; onSymbol: (s: string) => void; loading: boolean; onRefresh: () => void;
}) {
  const macro = data.macroOutlook;
  const vol   = data.volatilityData;
  return (
    <div className="space-y-4">
      {/* Symbol selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {SINGLE_SYMBOLS.map(s => (
          <button key={s} onClick={() => onSymbol(s)}
            className={`px-3 py-1 rounded text-xs font-semibold border transition-all ${symbol === s ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'}`}>
            {s}
          </button>
        ))}
        <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-all">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2">
          <span className="text-xs text-gray-500">Analyzing</span>
          <span className="text-white font-bold">{data.symbol}</span>
          <span className="text-gray-400">@</span>
          <span className="text-white font-bold">${data.currentPrice.toLocaleString()}</span>
        </div>
        {data.quotes.spy && <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs"><span className="text-gray-400">SPY</span><span className="text-white font-semibold">${data.quotes.spy.price}</span><span className={pctColor(data.quotes.spy.changePct)}>{fmt2(data.quotes.spy.changePct)}%</span></div>}
        {data.quotes.qqq && <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs"><span className="text-gray-400">QQQ</span><span className="text-white font-semibold">${data.quotes.qqq.price}</span><span className={pctColor(data.quotes.qqq.changePct)}>{fmt2(data.quotes.qqq.changePct)}%</span></div>}
        <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs">
          <span className="text-gray-400">VIX</span>
          <span className={`font-semibold ${macro.vixRegime === 'extreme' ? 'text-red-400' : macro.vixRegime === 'elevated' ? 'text-amber-400' : 'text-white'}`}>{macro.vix.toFixed(1)}</span>
        </div>
        <div className="ml-auto text-xs text-gray-600">{data.fetchedAt ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}` : ''}</div>
      </div>

      {/* Macro */}
      <DarkCard accent={macro.trend === 'bullish' ? 'border-emerald-600' : macro.trend === 'bearish' ? 'border-red-600' : 'border-gray-600'}>
        <SectionTitle icon={<TrendingUp size={14} />} title="1. Macro Market Outlook" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge className={biasBg(macro.trend)}>{macro.trend === 'bullish' ? '↑ BULLISH' : macro.trend === 'bearish' ? '↓ BEARISH' : '→ NEUTRAL'} MACRO</Badge>
              <Badge className={macro.riskEnv === 'risk-on' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : macro.riskEnv === 'risk-off' ? 'bg-red-950 text-red-400 border-red-700' : 'bg-amber-950 text-amber-400 border-amber-700'}>{macro.riskEnv.toUpperCase()}</Badge>
              <Badge className={vixRegimeBadge(macro.vixRegime)}>VIX {macro.vixRegime.toUpperCase()}</Badge>
              <Badge className={macro.breadth === 'strong' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : macro.breadth === 'weak' ? 'bg-red-950 text-red-400 border-red-700' : 'bg-gray-800 text-gray-400 border-gray-700'}>BREADTH {macro.breadth.toUpperCase()}</Badge>
            </div>
            <p className="text-sm text-gray-300 mb-3">{macro.summary}</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: 'VIX', val: `${macro.vix.toFixed(1)} (${macro.vixChange > 0 ? '+' : ''}${macro.vixChange.toFixed(1)}%)` },
                { label: 'DXY', val: `${macro.dxy.toFixed(2)} ${macro.dxyTrend === 'rising' ? '↑' : macro.dxyTrend === 'falling' ? '↓' : '→'}` },
                { label: '10Y Yield', val: `${macro.yields.toFixed(2)}% ${macro.yieldsTrend === 'rising' ? '↑' : macro.yieldsTrend === 'falling' ? '↓' : '→'}` },
                { label: 'HYG', val: `${macro.hyg > 0 ? '+' : ''}${macro.hyg.toFixed(2)}%` },
                { label: 'Gold', val: `${macro.gld > 0 ? '+' : ''}${macro.gld.toFixed(2)}%` },
                { label: 'SPY/EMA200', val: macro.spyAboveEma200 ? 'Above ✓' : 'Below ✗' },
              ].map(({ label, val }) => (
                <div key={label} className="bg-gray-800 rounded p-2"><div className="text-gray-500">{label}</div><div className="text-gray-200 font-semibold mt-0.5">{val}</div></div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Key Risks</div>
            <ul className="space-y-1.5">
              {macro.keyRisks.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                  <AlertTriangle size={10} className="text-amber-400 mt-0.5 shrink-0" /> {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DarkCard>

      {/* Bias cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><div className="text-xs text-gray-500 uppercase tracking-wide mb-1 pl-1">2. Weekly Bias</div><BiasCard label="Weekly (SPY)" data={data.weeklyBias} /></div>
        <div><div className="text-xs text-gray-500 uppercase tracking-wide mb-1 pl-1">3. Daily Bias</div><BiasCard label="Daily (SPY)" data={data.dailyBias} /></div>
        <div><div className="text-xs text-gray-500 uppercase tracking-wide mb-1 pl-1">4. 4H Bias</div><BiasCard label={`4-Hour (${data.symbol})`} data={data.fourHourBias} /></div>
      </div>

      {/* Market regime */}
      <DarkCard>
        <SectionTitle icon={<Activity size={14} />} title="5. Market Regime" />
        <div className="flex flex-wrap items-start gap-4">
          <Badge className={`text-sm px-3 py-1 ${regimeColor(data.marketRegime.phase) === 'text-emerald-400' ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : regimeColor(data.marketRegime.phase) === 'text-red-400' ? 'bg-red-950 border-red-700 text-red-400' : regimeColor(data.marketRegime.phase) === 'text-blue-400' ? 'bg-blue-950 border-blue-700 text-blue-400' : regimeColor(data.marketRegime.phase) === 'text-amber-400' ? 'bg-amber-950 border-amber-700 text-amber-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
            {data.marketRegime.phase.toUpperCase()}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300 mb-2">{data.marketRegime.description}</p>
            <div className="flex gap-4 text-xs">
              <div className="flex-1"><div className="text-emerald-400 font-semibold mb-1">Approach</div><p className="text-gray-400">{data.marketRegime.tradingApproach}</p></div>
              <div className="flex-1"><div className="text-red-400 font-semibold mb-1">Avoid</div><ul className="space-y-0.5">{data.marketRegime.avoidList.map((a, i) => <li key={i} className="text-gray-400">· {a}</li>)}</ul></div>
            </div>
          </div>
        </div>
      </DarkCard>

      {/* FVG + Structure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DarkCard>
          <SectionTitle icon={<BarChart2 size={14} />} title="6. Key FVG Levels" />
          {data.fvgLevels.length === 0 ? <div className="text-xs text-gray-500 italic py-3 text-center">No active FVGs within 12% of price</div> : (
            <div className="space-y-2">
              {data.fvgLevels.slice(0, 8).map((f, i) => (
                <div key={i} className={`flex items-center justify-between p-2 rounded text-xs border ${f.type === 'bullish' ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
                  <div className="flex items-center gap-2">
                    <Badge className={f.type === 'bullish' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>{f.type === 'bullish' ? '▲' : '▼'}</Badge>
                    <span className="text-gray-400 uppercase">{f.timeframe}</span>
                    <span className={f.strength === 'strong' ? 'text-amber-400' : f.strength === 'moderate' ? 'text-gray-300' : 'text-gray-500'}>{f.strength}</span>
                  </div>
                  <div className="text-right"><div className="text-gray-200 font-semibold">{f.low.toFixed(2)} – {f.high.toFixed(2)}</div><div className="text-gray-500">mid {f.mid.toFixed(2)} · {f.ageCandles}c ago</div></div>
                </div>
              ))}
            </div>
          )}
        </DarkCard>
        <DarkCard>
          <SectionTitle icon={<Zap size={14} />} title="7. BOS / CHoCH Analysis" />
          {data.structureEvents.length === 0 ? <div className="text-xs text-gray-500 italic py-3 text-center">No recent BOS / CHoCH events detected</div> : (
            <div className="space-y-2">
              {data.structureEvents.map((e, i) => {
                const bull = e.event === 'BOS_UP' || e.event === 'CHoCH_UP';
                return (
                  <div key={i} className={`p-2.5 rounded border ${bull ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge className={bull ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>{e.event.replace('_', ' ')}</Badge>
                        <span className="text-xs text-gray-500 uppercase">{e.timeframe}</span>
                        {e.significance === 'major' && <Badge className="bg-amber-950 text-amber-400 border-amber-700">MAJOR</Badge>}
                      </div>
                      <span className="text-xs text-gray-400 font-semibold">{e.level.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-400">{e.description}</p>
                    <div className="text-xs text-gray-600 mt-0.5">{e.ageCandles} candles ago</div>
                  </div>
                );
              })}
            </div>
          )}
        </DarkCard>
      </div>

      {/* Sector rotation */}
      <DarkCard>
        <SectionTitle icon={<Activity size={14} />} title="8. Sector Strength / Rotation" />
        <div className="overflow-x-auto">
          <div className="flex gap-2 min-w-max pb-1">
            {data.sectorRotation.map((s, i) => (
              <div key={i} className={`flex flex-col items-center p-2.5 rounded-lg border min-w-[86px] text-center text-xs ${s.trend === 'bullish' ? 'bg-emerald-950/30 border-emerald-800/40' : s.trend === 'bearish' ? 'bg-red-950/30 border-red-800/40' : 'bg-gray-800/40 border-gray-700/40'}`}>
                <span className="text-gray-300 font-bold">{s.etf}</span>
                <span className="text-gray-500 text-[10px] mt-0.5 leading-tight">{s.name}</span>
                <span className={`font-semibold mt-1.5 ${pctColor(s.changePct1d)}`}>{s.changePct1d > 0 ? '+' : ''}{s.changePct1d.toFixed(1)}%</span>
                <span className={`text-[10px] mt-0.5 ${pctColor(s.relStrength)}`}>vs SPY {s.relStrength > 0 ? '+' : ''}{s.relStrength.toFixed(1)}%</span>
                <div className={`mt-1.5 h-1 w-full rounded-full ${s.trend === 'bullish' ? 'bg-emerald-500' : s.trend === 'bearish' ? 'bg-red-500' : 'bg-gray-600'}`} />
                <span className={`text-[10px] mt-0.5 font-bold ${s.rank <= 3 ? 'text-amber-400' : 'text-gray-600'}`}>#{s.rank}</span>
              </div>
            ))}
          </div>
        </div>
      </DarkCard>

      {/* Calls + Puts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DarkCard>
          <SectionTitle icon={<ChevronUp size={14} className="text-emerald-400" />} title="9. Best Swing Calls" right={<Badge className="bg-emerald-950 text-emerald-400 border-emerald-700">{data.scoredCalls.length} contracts</Badge>} />
          <OptionsTable contracts={data.scoredCalls} type="call" currentPrice={data.currentPrice} />
        </DarkCard>
        <DarkCard>
          <SectionTitle icon={<ChevronDown size={14} className="text-red-400" />} title="10. Best Swing Puts" right={<Badge className="bg-red-950 text-red-400 border-red-700">{data.scoredPuts.length} contracts</Badge>} />
          <OptionsTable contracts={data.scoredPuts} type="put" currentPrice={data.currentPrice} />
        </DarkCard>
      </div>

      {/* Trade guide */}
      <DarkCard className="bg-gray-900/50">
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <span className="font-semibold text-gray-300">Trade Guide:</span>
          <span>· <span className="text-gray-300">Mid</span> = entry</span>
          <span>· <span className="text-emerald-400">T1</span> = +65% (first scale)</span>
          <span>· <span className="text-emerald-300">T2</span> = +160% (runners)</span>
          <span>· <span className="text-red-400">Stop</span> = −55% (hard stop)</span>
        </div>
      </DarkCard>

      {/* Theta + Volatility */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DarkCard>
          <SectionTitle icon={<Clock size={14} />} title="11. Theta Risk" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Theta Friendly</span>
              {vol.thetaFriendly ? <Badge className="bg-emerald-950 text-emerald-400 border-emerald-700"><CheckCircle size={10} className="mr-1 inline" />FAVORABLE</Badge> : <Badge className="bg-amber-950 text-amber-400 border-amber-700"><AlertTriangle size={10} className="mr-1 inline" />ELEVATED DECAY</Badge>}
            </div>
            {data.scoredCalls.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-800 rounded p-2 text-xs">
                <span className="text-gray-400">{c.strike.toFixed(0)}C {expiryLabel(c.expiration)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{c.dte}DTE</span>
                  <span className={`font-semibold ${c.thetaEstDailyPct > 3 ? 'text-amber-400' : 'text-gray-300'}`}>{c.thetaEstDailyPct.toFixed(1)}%/day</span>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-500">Theta accelerates inside 21 DTE. Close or roll before last 7 days.</p>
          </div>
        </DarkCard>
        <DarkCard>
          <SectionTitle icon={<Shield size={14} />} title="12. Volatility Assessment" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div><span className="text-2xl font-black text-white">{vol.vix.toFixed(1)}</span><span className="text-xs text-gray-500 ml-1">VIX</span></div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={vixRegimeBadge(vol.regime)}>{vol.regime.toUpperCase()}</Badge>
                {vol.ivExpanding && <Badge className="bg-amber-950 text-amber-400 border-amber-700">IV EXPANDING</Badge>}
              </div>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${vol.vix > 30 ? 'bg-red-500' : vol.vix > 20 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (vol.vix / 50) * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-300">{vol.recommendation}</p>
          </div>
        </DarkCard>
      </div>

      {/* Conviction */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2 pl-1">13. Highest Conviction Trade</div>
        {data.highestConviction
          ? <ConvictionCard c={data.highestConviction} />
          : <DarkCard><p className="text-sm text-gray-500 text-center py-4">No qualifying contract met minimum criteria.</p></DarkCard>}
      </div>

      {/* Confidence */}
      <DarkCard>
        <SectionTitle icon={<Target size={14} />} title="14. Setup Confidence Score" />
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ConfidenceGauge score={data.confidenceScore} />
          <div className="flex-1 space-y-2 text-sm">
            {[
              { label: 'Weekly & Daily bias aligned', pass: data.weeklyBias.bias === data.dailyBias.bias && data.dailyBias.bias !== 'neutral' },
              { label: 'Multi-timeframe confluence', pass: data.dailyBias.bias === data.fourHourBias.bias && data.dailyBias.bias !== 'neutral' },
              { label: 'Market breadth supporting', pass: macro.breadth !== 'weak' },
              { label: 'Normal volatility regime', pass: vol.regime === 'normal' || vol.regime === 'low' },
              { label: 'Major structure event detected', pass: data.structureEvents.some(e => e.significance === 'major') },
              { label: 'Strong FVG present', pass: data.fvgLevels.some(f => f.strength === 'strong') },
              { label: 'Qualifying options found', pass: data.scoredCalls.length > 0 || data.scoredPuts.length > 0 },
            ].map(({ label, pass }) => (
              <div key={label} className="flex items-center gap-2">
                {pass ? <CheckCircle size={14} className="text-emerald-400 shrink-0" /> : <XCircle size={14} className="text-gray-600 shrink-0" />}
                <span className={pass ? 'text-gray-300' : 'text-gray-600'}>{label}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <div className={`text-5xl font-black ${data.confidenceScore >= 75 ? 'text-emerald-400' : data.confidenceScore >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>{Math.round(data.confidenceScore / 10)}/10</div>
            <div className="text-xs text-gray-500 mt-1">
              {data.confidenceScore >= 80 ? 'High conviction — favorable to act' : data.confidenceScore >= 60 ? 'Moderate — trade with discipline' : data.confidenceScore >= 45 ? 'Low conviction — reduce size' : 'Avoid — conditions unfavorable'}
            </div>
          </div>
        </div>
      </DarkCard>

      <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-xl text-xs text-gray-600 flex items-start gap-2">
        <Info size={11} className="mt-0.5 shrink-0 text-gray-700" />
        Educational analysis only. Options can expire worthless. Past setups do not guarantee future results.
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Mode = 'single' | 'scan';

export default function SwingEnginePage() {
  const [mode, setMode]           = useState<Mode>('single');
  const [symbol, setSymbol]       = useState('SPY');
  const [singleData, setSingleData] = useState<SingleData | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError]     = useState('');
  const [scanData, setScanData]   = useState<ScanOutput | null>(null);
  const [scanLoading, setScanLoading]     = useState(false);
  const [scanError, setScanError]         = useState('');
  const hasSingleLoaded = useRef(false);

  const loadSingle = useCallback(async (sym = symbol) => {
    setSingleLoading(true); setSingleError('');
    try {
      const res  = await fetch(`/api/swing-engine?symbol=${encodeURIComponent(sym)}`);
      const json = await res.json() as SingleData;
      if (!json.success) throw new Error(json.error ?? 'Engine failed');
      setSingleData(json);
    } catch (e) { setSingleError(e instanceof Error ? e.message : 'Request failed'); }
    setSingleLoading(false);
  }, [symbol]);

  const loadScan = useCallback(async () => {
    setScanLoading(true); setScanError('');
    try {
      const res  = await fetch('/api/swing-engine?mode=scan');
      const json = await res.json() as ScanOutput;
      if (!json.success) throw new Error(json.error ?? 'Scanner failed');
      setScanData(json);
    } catch (e) { setScanError(e instanceof Error ? e.message : 'Scan failed'); }
    setScanLoading(false);
  }, []);

  const handleMode = (m: Mode) => {
    setMode(m);
    if (m === 'single' && !hasSingleLoaded.current) {
      hasSingleLoaded.current = true;
      loadSingle();
    }
  };

  const handleSymbol = (s: string) => { setSymbol(s); loadSingle(s); };

  // Auto-load single on mount
  if (!hasSingleLoaded.current && mode === 'single') {
    hasSingleLoaded.current = true;
    // trigger on next tick
    setTimeout(() => loadSingle(), 0);
  }

  const scanCounts = scanData ? {
    bullish:   scanData.bullishSetups.length,
    bearish:   scanData.bearishSetups.length,
    breakout:  scanData.breakoutSetups.length,
    pullback:  scanData.pullbackFVGSetups.length,
    options:   scanData.highConvictionOptions.length,
    avoid:     scanData.avoidList.length,
    discovery: scanData.discoveredSymbols.length,
  } : { bullish: 0, bearish: 0, breakout: 0, pullback: 0, options: 0, avoid: 0, discovery: 0 };

  return (
    <AppShell title="Swing & Macro Options Engine">
      {/* ── Page header + mode toggle ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Swing & Macro Options Engine</h1>
          <p className="text-xs text-gray-500 mt-0.5">Multi-timeframe structure · Institutional liquidity · 14–60 DTE options</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => handleMode('single')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${mode === 'single' ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/30' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'}`}>
            <Crosshair size={14} />Single Analysis
          </button>
          <button onClick={() => handleMode('scan')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${mode === 'scan' ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/30' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'}`}>
            <Search size={14} />Market Scanner
          </button>
        </div>
      </div>

      {/* ── Single analysis mode ── */}
      {mode === 'single' && (
        <>
          {singleError && (
            <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg flex items-center gap-2 text-red-300 text-sm">
              <AlertTriangle size={14} /> {singleError}
            </div>
          )}
          {singleLoading && !singleData && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-900 rounded-xl animate-pulse border border-gray-800" />)}
            </div>
          )}
          {singleData && (
            <SingleAnalysisView
              data={singleData} symbol={symbol}
              onSymbol={handleSymbol} loading={singleLoading}
              onRefresh={() => loadSingle()}
            />
          )}
        </>
      )}

      {/* ── Market scanner mode ── */}
      {mode === 'scan' && (
        <>
          {!scanData && !scanLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              <div className="w-20 h-20 rounded-full bg-purple-950 border border-purple-700 flex items-center justify-center">
                <Search size={32} className="text-purple-400" />
              </div>
              <div className="text-center">
                <h2 className="text-white font-bold text-lg mb-2">Market Scanner Ready</h2>
                <p className="text-gray-400 text-sm max-w-md">
                  Scans 28 symbols + dynamic discovery — SPY, QQQ, IWM, NVDA, AAPL, TSLA, META, MSFT, AMZN and more.
                  Ranks every setup from strongest to weakest with options data.
                </p>
                <p className="text-gray-600 text-xs mt-2">Takes ~15 seconds to complete full analysis</p>
              </div>
              {scanError && (
                <div className="p-3 bg-red-950 border border-red-800 rounded-lg flex items-center gap-2 text-red-300 text-sm">
                  <AlertTriangle size={14} /> {scanError}
                </div>
              )}
              <button onClick={loadScan}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 border border-purple-500 text-white font-bold text-sm transition-all shadow-lg shadow-purple-900/40">
                <Search size={16} /> Run Market Scanner
              </button>
            </div>
          )}

          {scanLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-5">
              <div className="relative w-20 h-20">
                <div className="w-20 h-20 rounded-full border-4 border-gray-800" />
                <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-t-purple-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Search size={20} className="text-purple-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-white font-semibold">Scanning the market…</p>
                <p className="text-gray-500 text-sm mt-1">Fetching quotes · Analyzing structure · Scoring options</p>
                <p className="text-gray-600 text-xs mt-1">28+ symbols across all timeframes</p>
              </div>
              <div className="flex gap-1.5">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {scanData && !scanLoading && (
            <>
              {/* Sticky nav */}
              <ScannerNav counts={scanCounts} />

              {/* Macro bar */}
              <ScanMacroBar data={scanData} />

              {/* Rescan button */}
              <div className="flex justify-end mb-4">
                <button onClick={loadScan}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs font-semibold hover:bg-gray-700 transition-all">
                  <RefreshCw size={12} /> Re-scan Market
                </button>
              </div>

              {/* Top 5 */}
              <Top5Today results={scanData.top5Today} />

              {/* 6 sections */}
              <ScannerSection
                id="bullish" title="Best Bullish Swing Setups"
                icon={<TrendingUp size={15} />} accent="text-emerald-400"
                results={scanData.bullishSetups}
                emptyMsg="No clean bullish swing setups found. Market may be mixed or bearish — check the bearish section."
              />
              <ScannerSection
                id="bearish" title="Best Bearish Swing Setups"
                icon={<TrendingDown size={15} />} accent="text-red-400"
                results={scanData.bearishSetups}
                emptyMsg="No clean bearish setups. Macro may be bullish — check the bullish section."
              />
              <ScannerSection
                id="breakout" title="Best Breakout Setups"
                icon={<Zap size={15} />} accent="text-blue-400"
                results={scanData.breakoutSetups}
                emptyMsg="No fresh breakout setups. BOS / CHoCH events not detected in the required timeframe."
              />
              <ScannerSection
                id="pullback" title="Pullback-to-FVG Setups"
                icon={<BarChart2 size={15} />} accent="text-purple-400"
                results={scanData.pullbackFVGSetups}
                emptyMsg="No symbols currently pulling back into a Fair Value Gap. Check back later."
              />
              <ScannerSection
                id="options" title="High-Conviction Options"
                icon={<Star size={15} />} accent="text-amber-400"
                results={scanData.highConvictionOptions}
                emptyMsg="No A/A+ rated contracts found today. Consider revisiting later or widening DTE range."
              />

              {/* Sector snapshot in scanner mode */}
              <DarkCard className="mb-6">
                <SectionTitle icon={<Layers size={14} />} title="Sector Rotation Snapshot" />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {scanData.sectorRotation.map((s, i) => (
                    <div key={i} className={`flex flex-col items-center p-2 rounded-lg border min-w-[80px] text-center text-xs shrink-0 ${s.trend === 'bullish' ? 'bg-emerald-950/30 border-emerald-800/40' : s.trend === 'bearish' ? 'bg-red-950/30 border-red-800/40' : 'bg-gray-800/40 border-gray-700/40'}`}>
                      <span className="text-gray-300 font-bold">{s.etf}</span>
                      <span className="text-gray-500 text-[9px] mt-0.5 leading-tight">{s.name}</span>
                      <span className={`font-semibold mt-1 ${pctColor(s.changePct1d)}`}>{s.changePct1d > 0 ? '+' : ''}{s.changePct1d.toFixed(1)}%</span>
                      <span className={`text-[10px] mt-0.5 ${pctColor(s.relStrength)}`}>rs {s.relStrength > 0 ? '+' : ''}{s.relStrength.toFixed(1)}</span>
                      <span className={`text-[10px] font-bold mt-0.5 ${s.rank <= 3 ? 'text-amber-400' : 'text-gray-600'}`}>#{s.rank}</span>
                    </div>
                  ))}
                </div>
              </DarkCard>

              <ScannerSection
                id="avoid" title="Avoid / No Trade List"
                icon={<Eye size={15} />} accent="text-gray-500"
                results={scanData.avoidList}
                emptyMsg="No symbols flagged for avoidance. Most setups showing acceptable structure."
              />

              {scanData.discoveredSymbols.length > 0 && (
                <ScannerSection
                  id="discovery" title="Dynamic Discovery — New Finds"
                  icon={<Radio size={15} />} accent="text-fuchsia-400"
                  results={scanData.discoveredSymbols}
                  emptyMsg="No new symbols discovered outside the watchlist today."
                />
              )}

              {/* Disclaimer */}
              <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-xl text-xs text-gray-600 flex items-start gap-2 mt-2">
                <Info size={11} className="mt-0.5 shrink-0 text-gray-700" />
                Educational scanner only. Options can expire worthless. Confidence scores are algorithmic — always verify with your own analysis. Not financial advice.
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
