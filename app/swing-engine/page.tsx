'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle,
  Target, Shield, Zap, BarChart2, Activity, Clock,
  ChevronUp, ChevronDown, CheckCircle, XCircle, Info,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BiasResult {
  bias: 'bullish' | 'bearish' | 'neutral'; strength: number;
  ema9: number | null; ema21: number | null; ema50: number | null;
  rsi: number; atr: number;
  priceVsEma21: 'above' | 'below'; ema9AboveEma21: boolean;
  notes: string[];
}

interface FVGLevel {
  symbol: string; timeframe: 'weekly' | 'daily' | '4h';
  type: 'bullish' | 'bearish';
  high: number; low: number; mid: number;
  filled: boolean; ageCandles: number;
  strength: 'strong' | 'moderate' | 'weak';
}

interface StructureEvent {
  symbol: string; timeframe: 'weekly' | 'daily' | '4h';
  event: 'BOS_UP' | 'BOS_DOWN' | 'CHoCH_UP' | 'CHoCH_DOWN';
  level: number; ageCandles: number;
  significance: 'major' | 'minor'; description: string;
}

interface ScoredOption {
  contractSymbol: string; symbol: string; type: 'call' | 'put';
  strike: number; expiration: number; dte: number;
  bid: number; ask: number; mid: number; spreadPct: number;
  volume: number; openInterest: number;
  iv: number; ivPct: number; inTheMoney: boolean; moneyness: number;
  deltaApprox: number; expectedMoveByExp: number; probabilityOtm: number;
  entryMid: number; target1: number; target2: number; stopLoss: number;
  rrRatio: number; holdDays: number; thetaEstDailyPct: number;
  swingScore: number; grade: 'A+' | 'A' | 'B' | 'C' | 'D'; rationale: string;
}

interface SwingData {
  success: boolean; error?: string;
  symbol: string; currentPrice: number;
  macroOutlook: {
    trend: 'bullish' | 'bearish' | 'neutral'; riskEnv: 'risk-on' | 'risk-off' | 'mixed';
    vix: number; vixChange: number; vixRegime: 'low' | 'normal' | 'elevated' | 'extreme';
    spyAboveEma200: boolean;
    dxy: number; dxyTrend: 'rising' | 'falling' | 'flat';
    yields: number; yieldsTrend: 'rising' | 'falling' | 'flat';
    hyg: number; gld: number;
    breadth: 'strong' | 'neutral' | 'weak';
    fedSentiment: 'dovish' | 'neutral' | 'hawkish';
    summary: string; keyRisks: string[];
  };
  weeklyBias: BiasResult; dailyBias: BiasResult; fourHourBias: BiasResult;
  fvgLevels: FVGLevel[];
  structureEvents: StructureEvent[];
  marketRegime: {
    phase: 'accumulation' | 'expansion' | 'distribution' | 'reversal' | 'ranging';
    description: string; tradingApproach: string; avoidList: string[];
  };
  sectorRotation: { name: string; etf: string; price: number; changePct1d: number; relStrength: number; trend: 'bullish' | 'bearish' | 'neutral'; rank: number }[];
  scoredCalls: ScoredOption[]; scoredPuts: ScoredOption[];
  highestConviction: ScoredOption | null;
  confidenceScore: number;
  volatilityData: {
    vix: number; vixChangePct: number; ivExpanding: boolean;
    regime: 'low' | 'normal' | 'elevated' | 'extreme';
    thetaFriendly: boolean; recommendation: string;
  };
  quotes: { spy: { price: number; changePct: number } | null; qqq: { price: number; changePct: number } | null; iwm: { price: number; changePct: number } | null };
  fetchedAt: string;
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'NVDA', 'AAPL', 'TSLA', 'META', 'MSFT', 'AMZN', 'GOOGL', 'AMD'] as const;

// ─── Color helpers ────────────────────────────────────────────────────────────

const biasColor = (b: string) =>
  b === 'bullish' ? 'text-emerald-400' : b === 'bearish' ? 'text-red-400' : 'text-gray-400';
const biasBg = (b: string) =>
  b === 'bullish' ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
  : b === 'bearish' ? 'bg-red-950 border-red-700 text-red-300'
  : 'bg-gray-800 border-gray-600 text-gray-300';
const pctColor = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
const fmt2 = (n: number) => n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
const regimeColor = (p: string) => ({
  expansion: 'text-emerald-400', accumulation: 'text-blue-400',
  distribution: 'text-red-400', reversal: 'text-amber-400', ranging: 'text-gray-400',
} as Record<string, string>)[p] ?? 'text-gray-400';

const vixRegimeBadge = (r: string) => ({
  low:      'bg-emerald-950 text-emerald-400 border-emerald-700',
  normal:   'bg-blue-950   text-blue-400   border-blue-700',
  elevated: 'bg-amber-950  text-amber-400  border-amber-700',
  extreme:  'bg-red-950    text-red-400    border-red-700',
} as Record<string, string>)[r] ?? 'bg-gray-800 text-gray-400';

const gradeColor = (g: string) => ({
  'A+': 'text-emerald-400 bg-emerald-950 border-emerald-700',
  A:    'text-emerald-300 bg-emerald-950 border-emerald-800',
  B:    'text-yellow-400  bg-yellow-950  border-yellow-700',
  C:    'text-orange-400  bg-orange-950  border-orange-700',
  D:    'text-red-400     bg-red-950     border-red-700',
} as Record<string, string>)[g] ?? 'text-gray-400';

const expiryLabel = (ts: number) => {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function DarkCard({ children, className = '', accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${accent ? `border-l-4 ${accent}` : ''} ${className}`}>
      {children}
    </div>
  );
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

function BiasCard({ label, data, price }: { label: string; data: BiasResult; price?: number }) {
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
  if (!contracts.length) {
    return <div className="text-xs text-gray-500 italic py-4 text-center">No qualifying contracts found for this symbol / DTE range</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800 text-gray-500">
            <th className="text-left py-2 pr-3">Strike</th>
            <th className="text-left py-2 pr-3">Exp</th>
            <th className="text-right py-2 pr-3">DTE</th>
            <th className="text-right py-2 pr-3">Mid</th>
            <th className="text-right py-2 pr-3">IV%</th>
            <th className="text-right py-2 pr-3">OI</th>
            <th className="text-right py-2 pr-3">Sprd%</th>
            <th className="text-right py-2 pr-3">T1</th>
            <th className="text-right py-2 pr-3">Stop</th>
            <th className="text-right py-2 pr-3">R:R</th>
            <th className="text-right py-2">Grade</th>
          </tr>
        </thead>
        <tbody>
          {contracts.slice(0, 8).map((c, i) => (
            <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${i === 0 ? 'bg-gray-800/20' : ''}`}>
              <td className="py-1.5 pr-3 font-semibold text-gray-200">
                {c.strike.toFixed(c.strike < 50 ? 2 : 0)}
                {c.inTheMoney && <span className="ml-1 text-purple-400 text-[10px]">ITM</span>}
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
              <td className="py-1.5 text-right">
                <Badge className={gradeColor(c.grade)}>{c.grade}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConvictionCard({ c, currentPrice }: { c: ScoredOption; currentPrice: number }) {
  const isCall = c.type === 'call';
  const accent = isCall ? 'border-emerald-600' : 'border-red-600';
  return (
    <DarkCard accent={accent} className="relative overflow-hidden">
      <div className="absolute top-3 right-4 text-4xl font-black opacity-5 text-white">{isCall ? '↑' : '↓'}</div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Highest Conviction Setup</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-black text-white">{c.symbol}</span>
            <Badge className={isCall ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>
              {c.type.toUpperCase()}
            </Badge>
            <Badge className={gradeColor(c.grade)}>{c.grade}</Badge>
          </div>
          <div className="text-sm text-gray-400 mt-1">
            ${c.strike.toFixed(c.strike < 50 ? 2 : 0)} · {expiryLabel(c.expiration)} · {c.dte}DTE
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Score</div>
          <div className={`text-3xl font-black ${c.swingScore >= 80 ? 'text-emerald-400' : c.swingScore >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>
            {c.swingScore}
          </div>
          <div className="text-xs text-gray-500">/ 100</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Trade Parameters</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Entry (mid)</span><span className="text-white font-semibold">${c.entryMid.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Target 1</span><span className="text-emerald-400 font-semibold">${c.target1.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Target 2</span><span className="text-emerald-300 font-semibold">${c.target2.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Stop Loss</span><span className="text-red-400 font-semibold">${c.stopLoss.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">R:R</span><span className="text-purple-400 font-semibold">{c.rrRatio.toFixed(1)}:1</span></div>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Contract Metrics</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">IV</span><span className={`font-semibold ${c.ivPct > 80 ? 'text-amber-400' : 'text-gray-200'}`}>{c.ivPct.toFixed(0)}%</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Open Interest</span><span className="text-gray-200 font-semibold">{c.openInterest.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Spread</span><span className={`font-semibold ${c.spreadPct > 15 ? 'text-amber-400' : 'text-gray-200'}`}>{c.spreadPct.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Delta ~</span><span className="text-gray-200 font-semibold">{c.deltaApprox.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Hold</span><span className="text-gray-200 font-semibold">{c.holdDays}d</span></div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400">
        <span className="text-gray-500 font-medium">Rationale: </span>{c.rationale}
        {c.inTheMoney && <span className="ml-2 text-purple-300">· ITM contract</span>}
      </div>
    </DarkCard>
  );
}

// ─── Confidence gauge ─────────────────────────────────────────────────────────

function ConfidenceGauge({ score }: { score: number }) {
  const norm = score / 100;
  const color = score >= 75 ? '#34d399' : score >= 55 ? '#fbbf24' : '#f87171';
  const r = 44, cx = 52, cy = 52;
  const circ = 2 * Math.PI * r;
  const dash = norm * circ * 0.75;
  const gap  = circ * 0.25 + circ * 0.75 * (1 - norm);
  return (
    <div className="flex flex-col items-center">
      <svg width={104} height={80} viewBox="0 0 104 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={10}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={circ * 0.125} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset={circ * 0.125} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize={20} fontWeight="bold">{score}</text>
      </svg>
      <div className="text-xs text-gray-500 -mt-2">Confidence / 100</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SwingEnginePage() {
  const [symbol, setSymbol]   = useState<string>('SPY');
  const [data,   setData]     = useState<SwingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (sym = symbol) => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/swing-engine?symbol=${encodeURIComponent(sym)}`);
      const json = await res.json() as SwingData;
      if (!json.success) throw new Error(json.error ?? 'Engine failed');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
    setLoading(false);
  }, [symbol]);

  useEffect(() => { load(); }, []);

  const handleSymbol = (s: string) => { setSymbol(s); load(s); };

  const macro = data?.macroOutlook;
  const vol   = data?.volatilityData;

  return (
    <AppShell title="Swing & Macro Options Engine">
      {/* ── Header ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Swing & Macro Options Engine</h1>
          <p className="text-xs text-gray-500 mt-0.5">Multi-timeframe structure · Institutional liquidity · 14–60 DTE options</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {SYMBOLS.map(s => (
            <button key={s} onClick={() => handleSymbol(s)}
              className={`px-3 py-1 rounded text-xs font-semibold border transition-all ${symbol === s ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'}`}>
              {s}
            </button>
          ))}
          <button onClick={() => load()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-all">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Scanning…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg flex items-center gap-2 text-red-300 text-sm">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-900 rounded-xl animate-pulse border border-gray-800" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-4">

          {/* ── Row 0: Summary strip ── */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2">
              <span className="text-xs text-gray-500">Scanning</span>
              <span className="text-white font-bold">{data.symbol}</span>
              <span className="text-gray-400">@</span>
              <span className="text-white font-bold">${data.currentPrice.toLocaleString()}</span>
            </div>
            {data.quotes.spy && (
              <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs">
                <span className="text-gray-400">SPY</span>
                <span className="text-white font-semibold">${data.quotes.spy.price}</span>
                <span className={pctColor(data.quotes.spy.changePct)}>{fmt2(data.quotes.spy.changePct)}%</span>
              </div>
            )}
            {data.quotes.qqq && (
              <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs">
                <span className="text-gray-400">QQQ</span>
                <span className="text-white font-semibold">${data.quotes.qqq.price}</span>
                <span className={pctColor(data.quotes.qqq.changePct)}>{fmt2(data.quotes.qqq.changePct)}%</span>
              </div>
            )}
            {data.quotes.iwm && (
              <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs">
                <span className="text-gray-400">IWM</span>
                <span className="text-white font-semibold">${data.quotes.iwm.price}</span>
                <span className={pctColor(data.quotes.iwm.changePct)}>{fmt2(data.quotes.iwm.changePct)}%</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs">
              <span className="text-gray-400">VIX</span>
              <span className={`font-semibold ${macro?.vixRegime === 'extreme' ? 'text-red-400' : macro?.vixRegime === 'elevated' ? 'text-amber-400' : 'text-white'}`}>{macro?.vix.toFixed(1)}</span>
            </div>
            <div className="ml-auto text-xs text-gray-600">
              {data.fetchedAt ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}` : ''}
            </div>
          </div>

          {/* ── Section 1: Macro Outlook ── */}
          <DarkCard accent={macro?.trend === 'bullish' ? 'border-emerald-600' : macro?.trend === 'bearish' ? 'border-red-600' : 'border-gray-600'}>
            <SectionTitle icon={<TrendingUp size={14} />} title="1. Macro Market Outlook" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge className={biasBg(macro?.trend ?? 'neutral')}>
                    {macro?.trend === 'bullish' ? '↑ BULLISH' : macro?.trend === 'bearish' ? '↓ BEARISH' : '→ NEUTRAL'} MACRO
                  </Badge>
                  <Badge className={
                    macro?.riskEnv === 'risk-on' ? 'bg-emerald-950 text-emerald-400 border-emerald-700'
                    : macro?.riskEnv === 'risk-off' ? 'bg-red-950 text-red-400 border-red-700'
                    : 'bg-amber-950 text-amber-400 border-amber-700'
                  }>{macro?.riskEnv?.toUpperCase()}</Badge>
                  <Badge className={vixRegimeBadge(macro?.vixRegime ?? 'normal')}>
                    VIX {macro?.vixRegime?.toUpperCase()}
                  </Badge>
                  <Badge className={macro?.fedSentiment === 'hawkish' ? 'bg-red-950 text-red-400 border-red-700' : macro?.fedSentiment === 'dovish' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-gray-800 text-gray-400 border-gray-700'}>
                    FED {macro?.fedSentiment?.toUpperCase()}
                  </Badge>
                  <Badge className={macro?.breadth === 'strong' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : macro?.breadth === 'weak' ? 'bg-red-950 text-red-400 border-red-700' : 'bg-gray-800 text-gray-400 border-gray-700'}>
                    BREADTH {macro?.breadth?.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-gray-300 mb-3">{macro?.summary}</p>
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  {[
                    { label: 'VIX', val: `${macro?.vix.toFixed(1)} (${macro?.vixChange && macro.vixChange > 0 ? '+' : ''}${macro?.vixChange.toFixed(1)}%)` },
                    { label: 'DXY', val: `${macro?.dxy.toFixed(2)} ${macro?.dxyTrend === 'rising' ? '↑' : macro?.dxyTrend === 'falling' ? '↓' : '→'}` },
                    { label: '10Y Yield', val: `${macro?.yields.toFixed(2)}% ${macro?.yieldsTrend === 'rising' ? '↑' : macro?.yieldsTrend === 'falling' ? '↓' : '→'}` },
                    { label: 'HYG', val: `${macro?.hyg && macro.hyg > 0 ? '+' : ''}${macro?.hyg.toFixed(2)}%` },
                    { label: 'Gold', val: `${macro?.gld && macro.gld > 0 ? '+' : ''}${macro?.gld.toFixed(2)}%` },
                    { label: 'SPY/EMA200', val: macro?.spyAboveEma200 ? 'Above ✓' : 'Below ✗' },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-gray-800 rounded p-2">
                      <div className="text-gray-500">{label}</div>
                      <div className="text-gray-200 font-semibold mt-0.5">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Key Risks</div>
                <ul className="space-y-1.5">
                  {macro?.keyRisks.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                      <AlertTriangle size={10} className="text-amber-400 mt-0.5 shrink-0" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </DarkCard>

          {/* ── Sections 2-4: Bias cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 pl-1">2. Weekly Bias</div>
              <BiasCard label="Weekly (SPY)" data={data.weeklyBias} />
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 pl-1">3. Daily Bias</div>
              <BiasCard label="Daily (SPY)" data={data.dailyBias} />
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 pl-1">4H Bias</div>
              <BiasCard label={`4-Hour (${data.symbol})`} data={data.fourHourBias} />
            </div>
          </div>

          {/* ── Section 6: Market Regime ── */}
          <DarkCard>
            <SectionTitle icon={<Activity size={14} />} title="6. Market Regime" />
            <div className="flex flex-wrap items-start gap-4">
              <div>
                <Badge className={`text-sm px-3 py-1 ${regimeColor(data.marketRegime.phase) === 'text-emerald-400' ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : regimeColor(data.marketRegime.phase) === 'text-red-400' ? 'bg-red-950 border-red-700 text-red-400' : regimeColor(data.marketRegime.phase) === 'text-blue-400' ? 'bg-blue-950 border-blue-700 text-blue-400' : regimeColor(data.marketRegime.phase) === 'text-amber-400' ? 'bg-amber-950 border-amber-700 text-amber-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                  {data.marketRegime.phase.toUpperCase()}
                </Badge>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 mb-2">{data.marketRegime.description}</p>
                <div className="flex gap-4 text-xs">
                  <div className="flex-1">
                    <div className="text-emerald-400 font-semibold mb-1">Approach</div>
                    <p className="text-gray-400">{data.marketRegime.tradingApproach}</p>
                  </div>
                  <div className="flex-1">
                    <div className="text-red-400 font-semibold mb-1">Avoid</div>
                    <ul className="space-y-0.5">{data.marketRegime.avoidList.map((a, i) => <li key={i} className="text-gray-400">· {a}</li>)}</ul>
                  </div>
                </div>
              </div>
            </div>
          </DarkCard>

          {/* ── Sections 4+5: FVG + BOS/CHoCH ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DarkCard>
              <SectionTitle icon={<BarChart2 size={14} />} title="4. Key FVG Levels" />
              {data.fvgLevels.length === 0 ? (
                <div className="text-xs text-gray-500 italic py-3 text-center">No active FVGs within 12% of current price</div>
              ) : (
                <div className="space-y-2">
                  {data.fvgLevels.slice(0, 8).map((f, i) => (
                    <div key={i} className={`flex items-center justify-between p-2 rounded text-xs border ${f.type === 'bullish' ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
                      <div className="flex items-center gap-2">
                        <Badge className={f.type === 'bullish' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>{f.type === 'bullish' ? '▲' : '▼'}</Badge>
                        <span className="text-gray-400 uppercase">{f.timeframe}</span>
                        <span className="text-gray-500">·</span>
                        <span className={f.strength === 'strong' ? 'text-amber-400' : f.strength === 'moderate' ? 'text-gray-300' : 'text-gray-500'}>{f.strength}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-200 font-semibold">{f.low.toFixed(2)} – {f.high.toFixed(2)}</div>
                        <div className="text-gray-500">mid {f.mid.toFixed(2)} · {f.ageCandles}c ago</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DarkCard>

            <DarkCard>
              <SectionTitle icon={<Zap size={14} />} title="5. BOS / CHoCH Analysis" />
              {data.structureEvents.length === 0 ? (
                <div className="text-xs text-gray-500 italic py-3 text-center">No recent BOS / CHoCH events detected</div>
              ) : (
                <div className="space-y-2">
                  {data.structureEvents.map((e, i) => {
                    const bull = e.event === 'BOS_UP' || e.event === 'CHoCH_UP';
                    return (
                      <div key={i} className={`p-2.5 rounded border ${bull ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge className={bull ? 'bg-emerald-950 text-emerald-400 border-emerald-700' : 'bg-red-950 text-red-400 border-red-700'}>
                              {e.event.replace('_', ' ')}
                            </Badge>
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

          {/* ── Section 7: Sector Rotation ── */}
          <DarkCard>
            <SectionTitle icon={<Activity size={14} />} title="7. Sector Strength / Rotation" />
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

          {/* ── Sections 8+9: Calls + Puts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DarkCard>
              <SectionTitle icon={<ChevronUp size={14} className="text-emerald-400" />} title="8. Best Swing Calls"
                right={<Badge className="bg-emerald-950 text-emerald-400 border-emerald-700">{data.scoredCalls.length} contracts</Badge>} />
              <OptionsTable contracts={data.scoredCalls} type="call" currentPrice={data.currentPrice} />
            </DarkCard>
            <DarkCard>
              <SectionTitle icon={<ChevronDown size={14} className="text-red-400" />} title="9. Best Swing Puts"
                right={<Badge className="bg-red-950 text-red-400 border-red-700">{data.scoredPuts.length} contracts</Badge>} />
              <OptionsTable contracts={data.scoredPuts} type="put" currentPrice={data.currentPrice} />
            </DarkCard>
          </div>

          {/* ── Note: sections 10-13 (entry/target/invalidation/hold) are inside the table rows above ── */}
          <DarkCard className="bg-gray-900/50">
            <div className="flex flex-wrap gap-4 text-xs text-gray-400">
              <span className="font-semibold text-gray-300">10–13 Trade Guide:</span>
              <span>· <span className="text-gray-300">Mid</span> = entry price</span>
              <span>· <span className="text-emerald-400">T1</span> = +65% target (first scale)</span>
              <span>· <span className="text-emerald-300">T2</span> = +160% target (runners)</span>
              <span>· <span className="text-red-400">Stop</span> = -55% (hard stop)</span>
              <span>· <span className="text-gray-300">Hold</span> = ~{data.scoredCalls[0]?.holdDays ?? 14}–{data.scoredPuts[0]?.holdDays ?? 21}d recommended</span>
            </div>
          </DarkCard>

          {/* ── Sections 14+15: Theta + Volatility ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DarkCard>
              <SectionTitle icon={<Clock size={14} />} title="14. Theta Risk Assessment" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Theta Friendly Environment</span>
                  {vol?.thetaFriendly
                    ? <Badge className="bg-emerald-950 text-emerald-400 border-emerald-700"><CheckCircle size={10} className="mr-1 inline" />FAVORABLE</Badge>
                    : <Badge className="bg-amber-950 text-amber-400 border-amber-700"><AlertTriangle size={10} className="mr-1 inline" />ELEVATED DECAY</Badge>}
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
                <p className="text-xs text-gray-500">Theta decay accelerates inside 21 DTE. Hold minimum 14 DTE. Close or roll before last 7 days.</p>
              </div>
            </DarkCard>

            <DarkCard>
              <SectionTitle icon={<Shield size={14} />} title="15. Volatility Assessment" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-2xl font-black text-white">{vol?.vix.toFixed(1)}</span>
                    <span className="text-xs text-gray-500 ml-1">VIX</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={vixRegimeBadge(vol?.regime ?? 'normal')}>{vol?.regime.toUpperCase()}</Badge>
                    {vol?.ivExpanding && <Badge className="bg-amber-950 text-amber-400 border-amber-700">IV EXPANDING</Badge>}
                  </div>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${(vol?.vix ?? 0) > 30 ? 'bg-red-500' : (vol?.vix ?? 0) > 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, ((vol?.vix ?? 18) / 50) * 100)}%` }} />
                </div>
                <p className="text-xs text-gray-300">{vol?.recommendation}</p>
              </div>
            </DarkCard>
          </div>

          {/* ── Section 16: Highest Conviction ── */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2 pl-1">16. Highest Conviction Trade</div>
            {data.highestConviction
              ? <ConvictionCard c={data.highestConviction} currentPrice={data.currentPrice} />
              : <DarkCard><p className="text-sm text-gray-500 text-center py-4">No qualifying contract met minimum criteria. Market conditions may not favor swing options at this time.</p></DarkCard>
            }
          </div>

          {/* ── Section 17: Confidence Score ── */}
          <DarkCard>
            <SectionTitle icon={<Target size={14} />} title="17. Confidence Score" />
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ConfidenceGauge score={data.confidenceScore} />
              <div className="flex-1 space-y-2 text-sm">
                {[
                  { label: 'Weekly & Daily bias aligned', pass: data.weeklyBias.bias === data.dailyBias.bias && data.dailyBias.bias !== 'neutral' },
                  { label: 'Multi-timeframe confluence', pass: data.dailyBias.bias === data.fourHourBias.bias && data.dailyBias.bias !== 'neutral' },
                  { label: 'Market breadth supporting', pass: macro?.breadth !== 'weak' },
                  { label: 'Normal volatility regime', pass: vol?.regime === 'normal' || vol?.regime === 'low' },
                  { label: 'Major structure event detected', pass: data.structureEvents.some(e => e.significance === 'major') },
                  { label: 'Strong FVG present', pass: data.fvgLevels.some(f => f.strength === 'strong') },
                  { label: 'Qualifying options found', pass: (data.scoredCalls.length > 0 || data.scoredPuts.length > 0) },
                ].map(({ label, pass }) => (
                  <div key={label} className="flex items-center gap-2">
                    {pass
                      ? <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                      : <XCircle    size={14} className="text-gray-600 shrink-0" />}
                    <span className={pass ? 'text-gray-300' : 'text-gray-600'}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="text-center">
                <div className={`text-5xl font-black ${data.confidenceScore >= 75 ? 'text-emerald-400' : data.confidenceScore >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {Math.round(data.confidenceScore / 10)}/10
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {data.confidenceScore >= 80 ? 'High conviction — favorable to act'
                   : data.confidenceScore >= 60 ? 'Moderate — trade with discipline'
                   : data.confidenceScore >= 45 ? 'Low conviction — reduce size'
                   : 'Avoid — conditions unfavorable'}
                </div>
              </div>
            </div>
          </DarkCard>

          {/* ── Disclaimer ── */}
          <div className="p-3 bg-gray-900/50 border border-gray-800 rounded-xl text-xs text-gray-600 flex items-start gap-2">
            <Info size={11} className="mt-0.5 shrink-0 text-gray-700" />
            Educational analysis only. Options can expire worthless. Past setups do not guarantee future results. Always verify with your own analysis before trading.
          </div>

        </div>
      )}
    </AppShell>
  );
}
