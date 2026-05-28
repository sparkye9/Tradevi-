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
  bid: number; ask: number; mid: number; lastPrice: number;
  spreadPct: number;
  volume: number; openInterest: number; iv: number; ivPct: number;
  inTheMoney: boolean; moneyness: number; deltaApprox: number;
  theta: number; breakeven: number;
  expectedMoveByExp: number; probabilityOtm: number;
  entryMid: number; target1: number; target2: number; stopLoss: number;
  maxLoss: number; potentialReward: number;
  rrRatio: number; holdDays: number; thetaEstDailyPct: number;
  swingScore: number; grade: 'A+' | 'A' | 'B' | 'C' | 'D'; rationale: string;
  action: 'enter' | 'watch' | 'skip';
}

interface FuturesData {
  es:  { price: number; changePct: number };
  nq:  { price: number; changePct: number };
  ym:  { price: number; changePct: number };
  rty: { price: number; changePct: number };
  bias: 'bullish' | 'bearish' | 'mixed';
  confirmed: boolean;
  marketBias: 'bullish' | 'bearish' | 'neutral';
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
  futuresData?: { es: { price: number; changePct: number }; nq: { price: number; changePct: number }; bias: string; confirmed: boolean } | null;
  dataWarnings?: string[];
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
  optionsDataAvailable?: boolean;
  dataWarnings?: string[];
  futuresData?: FuturesData | null;
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const G = '#00ff88';
const R = '#ff3b3b';
const A = '#f59e0b';

const biasC = (b: string) => b === 'bullish' ? G : b === 'bearish' ? R : '#6b7280';
const biasBg = (b: string) =>
  b === 'bullish' ? { color: G,  bg: 'rgba(0,255,136,0.08)',  border: 'rgba(0,255,136,0.25)'  } :
  b === 'bearish' ? { color: R,  bg: 'rgba(255,59,59,0.08)',  border: 'rgba(255,59,59,0.25)'  } :
                    { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' };

const pctC = (v: number) => v > 0 ? G : v < 0 ? R : '#6b7280';
const fmt2 = (n: number) => n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);

const scoreC = (s: number) =>
  s >= 75 ? G : s >= 58 ? A : s >= 42 ? '#f97316' : R;

const gradeS = (g: string) => {
  if (g === 'A+') return { color: G,        bg: 'rgba(0,255,136,0.1)',  border: 'rgba(0,255,136,0.3)'  };
  if (g === 'A')  return { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',border: 'rgba(74,222,128,0.2)' };
  if (g === 'B')  return { color: A,         bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' };
  if (g === 'C')  return { color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' };
  return                  { color: R,        bg: 'rgba(255,59,59,0.1)',  border: 'rgba(255,59,59,0.3)'  };
};

const vixC = (r: string) =>
  r === 'low' ? { color: G, bg: 'rgba(0,255,136,0.1)', border: 'rgba(0,255,136,0.3)' } :
  r === 'normal' ? { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' } :
  r === 'elevated' ? { color: A, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' } :
  { color: R, bg: 'rgba(255,59,59,0.1)', border: 'rgba(255,59,59,0.3)' };

const expiryLabel = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

// ─── UI Primitives ────────────────────────────────────────────────────────────

function CpCard({ children, accentColor, className = '' }: {
  children: React.ReactNode;
  accentColor?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{
        background: '#111318',
        border: '1px solid rgba(255,255,255,0.07)',
        ...(accentColor ? { borderLeft: `2px solid ${accentColor}` } : {}),
      }}
    >
      {children}
    </div>
  );
}

function SecHeader({ title, right, accent = '#374151' }: { title: string; right?: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-3.5 rounded-full" style={{ background: accent }} />
        <p className="sec-label" style={{ margin: 0 }}>{title}</p>
      </div>
      {right}
    </div>
  );
}

function Chip({ label, color = '#6b7280', bg = 'transparent', border }: {
  label: string; color?: string; bg?: string; border?: string;
}) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
      style={{ color, background: bg, border: `1px solid ${border ?? color + '44'}` }}
    >
      {label}
    </span>
  );
}

// ─── Futures Confirmation Bar ─────────────────────────────────────────────────

function FuturesBar({ fd, dataWarnings, optionsAvailable }: {
  fd: FuturesData;
  dataWarnings?: string[];
  optionsAvailable?: boolean;
}) {
  const biasColor  = fd.bias === 'bullish' ? G : fd.bias === 'bearish' ? R : A;
  const confColor  = fd.confirmed ? G : A;
  const mktColor   = fd.marketBias === 'bullish' ? G : fd.marketBias === 'bearish' ? R : A;
  const noData     = optionsAvailable === false;

  return (
    <div className="space-y-2 mb-4">
      {/* Futures strip */}
      <div className="flex flex-wrap gap-2 items-center px-4 py-3 rounded-xl"
        style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
        <span className="text-xs font-bold uppercase tracking-wider mr-1" style={{ color: '#374151' }}>Futures</span>
        {[
          { label: 'ES', val: fd.es.changePct },
          { label: 'NQ', val: fd.nq.changePct },
          { label: 'YM', val: fd.ym?.changePct ?? 0 },
          { label: 'RTY', val: fd.rty?.changePct ?? 0 },
        ].map(({ label, val }) => (
          <span key={label} className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{
              color: val > 0.1 ? G : val < -0.1 ? R : '#9ca3af',
              background: val > 0.1 ? 'rgba(0,255,136,0.08)' : val < -0.1 ? 'rgba(255,59,59,0.08)' : 'rgba(107,114,128,0.08)',
              border: `1px solid ${val > 0.1 ? 'rgba(0,255,136,0.2)' : val < -0.1 ? 'rgba(255,59,59,0.2)' : 'rgba(107,114,128,0.15)'}`,
            }}>
            {label} {val >= 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        ))}
        <div className="h-4 w-px ml-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <span className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ color: biasColor, background: `${biasColor}14`, border: `1px solid ${biasColor}40` }}>
          FUTURES {fd.bias.toUpperCase()}
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ color: confColor, background: `${confColor}14`, border: `1px solid ${confColor}40` }}>
          {fd.confirmed ? 'CONFIRMED ✓' : 'NOT CONFIRMED ⚠'}
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded ml-auto"
          style={{ color: mktColor, background: `${mktColor}14`, border: `1px solid ${mktColor}40` }}>
          MARKET {fd.marketBias.toUpperCase()}
        </span>
      </div>

      {/* No-data safety warning */}
      {noData && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,59,59,0.12)', border: '1px solid rgba(255,59,59,0.4)', color: R }}>
          <span style={{ fontSize: 16 }}>⛔</span>
          Live contract data unavailable — do not trade from this signal.
        </div>
      )}

      {/* Futures / data warnings */}
      {(dataWarnings ?? []).map((w, i) => (
        <div key={i} className="flex items-start gap-2 px-4 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: A }}>
          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
          {w}
        </div>
      ))}
    </div>
  );
}

// ─── Bias Bar ─────────────────────────────────────────────────────────────────

function BiasBar({ strength, bias }: { strength: number; bias: string }) {
  const color = biasC(bias);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span style={{ color: '#374151' }}>Bear</span>
        <span className="font-bold font-mono" style={{ color }}>{strength}%</span>
        <span style={{ color: '#374151' }}>Bull</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1d26' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${strength}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Bias Card ─────────────────────────────────────────────────────────────────

function BiasCard({ label, data }: { label: string; data: BiasResult }) {
  const bs = biasBg(data.bias);
  return (
    <CpCard accentColor={bs.color}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#374151' }}>{label}</span>
        <Chip label={data.bias.toUpperCase()} color={bs.color} bg={bs.bg} border={bs.border} />
      </div>
      <BiasBar strength={data.strength} bias={data.bias} />
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs">
        {[
          { label: 'RSI', value: data.rsi.toString(), color: data.rsi > 70 ? R : data.rsi < 30 ? G : data.rsi > 55 ? G : data.rsi < 45 ? R : '#9ca3af' },
          { label: 'ATR', value: data.atr > 0 ? data.atr.toFixed(1) : '—', color: '#9ca3af' },
          { label: 'EMA', value: data.ema9AboveEma21 ? '9>21 ↑' : '9<21 ↓', color: data.ema9AboveEma21 ? G : R },
        ].map(({ label: l, value, color }) => (
          <div key={l} className="rounded-lg p-1.5 text-center" style={{ background: '#13161d' }}>
            <div className="text-xs" style={{ color: '#374151', fontSize: '9px' }}>{l}</div>
            <div className="font-bold font-mono" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>
      <ul className="mt-2 space-y-0.5">
        {data.notes.slice(0, 3).map((n, i) => (
          <li key={i} className="text-xs flex items-center gap-1" style={{ color: '#6b7280' }}>
            <span style={{ color: biasC(data.bias) }}>·</span> {n}
          </li>
        ))}
      </ul>
    </CpCard>
  );
}

// ─── MTF Alignment Score ──────────────────────────────────────────────────────

function MTFAlignmentScore({ weekly, daily, fourH }: { weekly: BiasResult; daily: BiasResult; fourH: BiasResult }) {
  const biases = [weekly.bias, daily.bias, fourH.bias];
  const bullCount = biases.filter(b => b === 'bullish').length;
  const bearCount = biases.filter(b => b === 'bearish').length;
  const aligned = bullCount === 3 || bearCount === 3;
  const direction = bullCount >= 2 ? 'bullish' : bearCount >= 2 ? 'bearish' : 'neutral';
  const score = Math.round(((bullCount === 3 || bearCount === 3) ? 100 : bullCount === 2 || bearCount === 2 ? 67 : 33));
  const color = direction === 'bullish' ? G : direction === 'bearish' ? R : '#6b7280';

  return (
    <CpCard>
      <SecHeader title="MTF Alignment Score" accent={color} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-3xl font-black font-mono" style={{ color }}>
            {score}%
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            {aligned ? 'Full alignment' : bullCount >= 2 ? 'Partial bullish' : bearCount >= 2 ? 'Partial bearish' : 'Mixed — no edge'}
          </p>
        </div>
        <Chip
          label={direction.toUpperCase()}
          color={color}
          bg={`${color}15`}
          border={`${color}44`}
        />
      </div>
      <div className="space-y-2">
        {[
          { label: 'Monthly (est)', bias: weekly.bias,   score: weekly.strength   },
          { label: 'Weekly',        bias: weekly.bias,   score: weekly.strength   },
          { label: 'Daily',         bias: daily.bias,    score: daily.strength    },
          { label: '4H',            bias: fourH.bias,    score: fourH.strength    },
        ].map(({ label, bias, score: s }) => {
          const c = biasC(bias);
          return (
            <div key={label} className="flex items-center gap-3 text-xs">
              <span className="w-20 font-medium" style={{ color: '#6b7280' }}>{label}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1d26' }}>
                <div className="h-full rounded-full" style={{ width: `${s}%`, background: c }} />
              </div>
              <span className="w-16 text-right font-bold font-mono" style={{ color: c }}>{bias.toUpperCase()}</span>
            </div>
          );
        })}
      </div>
    </CpCard>
  );
}

// ─── Options Table ────────────────────────────────────────────────────────────

function OptionsTable({ contracts, type, currentPrice }: { contracts: ScoredOption[]; type: 'call' | 'put'; currentPrice: number }) {
  if (!contracts.length) return (
    <div className="text-center py-5 px-3 rounded-lg" style={{ background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)' }}>
      <p className="text-xs font-semibold mb-0.5" style={{ color: R }}>No qualifying contracts</p>
      <p className="text-xs" style={{ color: '#374151' }}>Live contract data unavailable — do not trade from this signal.</p>
    </div>
  );
  const headers = ['Strike', 'Exp', 'DTE', 'Bid/Ask', 'Last', 'Vol', 'OI', 'IV%', 'Δ', 'Θ/day', 'Sprd%', 'Bkeven', 'Entry', 'T1', 'Stop', 'R:R', 'Grade', 'Act'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ minWidth: 900 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {headers.map(h => (
              <th key={h} className={`py-2 pr-2 font-bold uppercase tracking-wider ${h === 'Strike' || h === 'Exp' ? 'text-left' : 'text-right'}`}
                style={{ color: '#374151', fontSize: '9px', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contracts.slice(0, 8).map((c, i) => {
            const gs = gradeS(c.grade);
            const actColor = c.action === 'enter' ? G : c.action === 'watch' ? A : '#6b7280';
            return (
              <tr key={i} className="transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <td className="py-1.5 pr-2 font-semibold" style={{ color: '#f0f0f0' }}>
                  {c.strike.toFixed(c.strike < 50 ? 2 : 0)}
                  {c.inTheMoney && <span className="ml-1 text-xs" style={{ color: '#a78bfa' }}>ITM</span>}
                </td>
                <td className="py-1.5 pr-2" style={{ color: '#6b7280' }}>{expiryLabel(c.expiration)}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#9ca3af' }}>{c.dte}d</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#9ca3af' }}>${c.bid.toFixed(2)}/${c.ask.toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#6b7280' }}>${(c.lastPrice ?? c.mid).toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: c.volume >= 500 ? G : '#6b7280' }}>{c.volume.toLocaleString()}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: c.openInterest >= 1000 ? '#9ca3af' : '#6b7280' }}>{c.openInterest.toLocaleString()}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: c.ivPct > 80 ? A : '#9ca3af' }}>{c.ivPct.toFixed(0)}%</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: type === 'call' ? G : R }}>{c.deltaApprox.toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: (c.thetaEstDailyPct ?? 0) > 3 ? A : '#6b7280' }}>{(c.thetaEstDailyPct ?? 0).toFixed(1)}%</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: c.spreadPct > 15 ? A : '#6b7280' }}>{c.spreadPct.toFixed(1)}%</td>
                <td className="py-1.5 pr-2 text-right font-mono font-semibold" style={{ color: '#a78bfa' }}>${(c.breakeven ?? 0).toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right font-mono font-bold" style={{ color: type === 'call' ? G : R }}>${c.mid.toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: G }}>${c.target1.toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right font-mono" style={{ color: R }}>${c.stopLoss.toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right font-mono font-semibold" style={{ color: c.rrRatio >= 2 ? G : c.rrRatio >= 1.5 ? A : R }}>{c.rrRatio.toFixed(1)}:1</td>
                <td className="py-1.5 pr-2 text-right">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ color: gs.color, background: gs.bg, border: `1px solid ${gs.border}` }}>
                    {c.grade}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold uppercase" style={{ color: actColor, background: `${actColor}14`, border: `1px solid ${actColor}40` }}>
                    {c.action}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Conviction Card ──────────────────────────────────────────────────────────

function ConvictionCard({ c }: { c: ScoredOption }) {
  const isCall = c.type === 'call';
  const gs = gradeS(c.grade);
  return (
    <CpCard accentColor={isCall ? G : R} className="relative overflow-hidden">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="sec-label mb-1">Highest Conviction</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-black" style={{ color: '#f0f0f0' }}>{c.symbol}</span>
            <Chip label={c.type.toUpperCase()} color={isCall ? G : R} bg={isCall ? 'rgba(0,255,136,0.1)' : 'rgba(255,59,59,0.1)'} />
            <Chip label={c.grade} color={gs.color} bg={gs.bg} border={gs.border} />
          </div>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            ${c.strike.toFixed(c.strike < 50 ? 2 : 0)} · {expiryLabel(c.expiration)} · {c.dte}DTE
          </p>
        </div>
        <div className="text-center">
          <p className="sec-label">Score</p>
          <p className="text-3xl font-black font-mono" style={{ color: scoreC(c.swingScore) }}>{c.swingScore}</p>
          <p className="text-xs font-mono" style={{ color: '#374151' }}>/100</p>
        </div>
      </div>

      {/* Action recommendation */}
      {(() => {
        const actColor = c.action === 'enter' ? G : c.action === 'watch' ? A : '#6b7280';
        const actLabel = c.action === 'enter' ? '✓ ENTER — R:R ≥ 2:1, conditions met' : c.action === 'watch' ? '◎ WATCH — monitor for confirmation' : '✗ SKIP — conditions not favorable';
        return (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: `${actColor}12`, border: `1px solid ${actColor}40`, color: actColor }}>
            {actLabel}
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { title: 'Trade Parameters', rows: [
            ['Entry (mid)', `$${c.entryMid.toFixed(2)}`, '#f0f0f0'],
            ['Breakeven', `$${(c.breakeven ?? 0).toFixed(2)}`, '#a78bfa'],
            ['Target 1', `$${c.target1.toFixed(2)}`, G],
            ['Target 2', `$${c.target2.toFixed(2)}`, '#4ade80'],
            ['Stop Loss', `$${c.stopLoss.toFixed(2)}`, R],
            ['Max Loss', `$${((c.maxLoss ?? c.entryMid - c.stopLoss) * 100).toFixed(0)}/contract`, R],
            ['R:R', `${c.rrRatio.toFixed(1)}:1`, c.rrRatio >= 2 ? G : c.rrRatio >= 1.5 ? A : R],
          ]},
          { title: 'Contract Metrics', rows: [
            ['Bid / Ask', `$${c.bid.toFixed(2)} / $${c.ask.toFixed(2)}`, '#9ca3af'],
            ['Last Price', `$${(c.lastPrice ?? c.mid).toFixed(2)}`, '#9ca3af'],
            ['Volume', c.volume.toLocaleString(), c.volume >= 500 ? G : '#9ca3af'],
            ['OI', c.openInterest.toLocaleString(), '#9ca3af'],
            ['IV', `${c.ivPct.toFixed(0)}%`, c.ivPct > 80 ? A : '#9ca3af'],
            ['Spread', `${c.spreadPct.toFixed(1)}%`, c.spreadPct > 15 ? A : '#9ca3af'],
            ['Delta', c.deltaApprox.toFixed(2), '#9ca3af'],
            ['Theta/day', `${c.thetaEstDailyPct.toFixed(1)}%`, c.thetaEstDailyPct > 3 ? A : '#9ca3af'],
          ]},
        ].map(({ title, rows }) => (
          <div key={title} className="rounded-lg p-3" style={{ background: '#13161d' }}>
            <p className="sec-label mb-2">{title}</p>
            <div className="space-y-1 text-xs">
              {rows.map(([l, v, color]) => (
                <div key={l} className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>{l}</span>
                  <span className="font-semibold font-mono" style={{ color: color as string }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg p-3 text-xs" style={{ background: '#13161d' }}>
        <span style={{ color: '#374151' }}>Rationale: </span>
        <span style={{ color: '#9ca3af' }}>{c.rationale}</span>
      </div>
    </CpCard>
  );
}

// ─── Confidence Gauge ─────────────────────────────────────────────────────────

function ConfidenceGauge({ score }: { score: number }) {
  const color = score >= 75 ? G : score >= 55 ? A : R;
  const r = 44, cx = 52, cy = 52, circ = 2 * Math.PI * r;
  const norm = score / 100;
  const dash = norm * circ * 0.75;
  const gap  = circ * 0.25 + circ * 0.75 * (1 - norm);
  return (
    <div className="flex flex-col items-center">
      <svg width={104} height={80} viewBox="0 0 104 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1d26" strokeWidth={10}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={circ * 0.125} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset={circ * 0.125} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize={20} fontWeight="bold">{score}</text>
      </svg>
      <div className="text-xs -mt-2" style={{ color: '#374151' }}>Confidence / 100</div>
    </div>
  );
}

// ─── Scanner setup type badges ────────────────────────────────────────────────

function SetupTypeBadges({ types }: { types: SetupCategory[] }) {
  const map: Record<SetupCategory, { color: string; label: string }> = {
    bullish:           { color: G,        label: 'BULL'  },
    bearish:           { color: R,        label: 'BEAR'  },
    breakout:          { color: '#60a5fa', label: 'BREAK' },
    'pullback-fvg':    { color: '#a78bfa', label: 'FVG'   },
    'high-conviction': { color: A,        label: 'HOT'   },
    avoid:             { color: '#6b7280', label: 'AVOID' },
  };
  return (
    <div className="flex flex-wrap gap-1">
      {types.filter(t => t !== 'avoid' || types.length === 1).map(t => {
        const s = map[t];
        return <Chip key={t} label={s.label} color={s.color} bg={`${s.color}14`} />;
      })}
    </div>
  );
}

// ─── Mini option ──────────────────────────────────────────────────────────────

function MiniOption({ opt, label }: { opt: ScoredOption; label: string }) {
  const isCall = opt.type === 'call';
  return (
    <div className="rounded-lg p-2.5 text-xs" style={{ background: '#13161d' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ color: '#6b7280' }}>{label}</span>
        <div className="flex items-center gap-1">
          <Chip label={opt.type.toUpperCase()} color={isCall ? G : R} bg={isCall ? 'rgba(0,255,136,0.08)' : 'rgba(255,59,59,0.08)'} />
          <Chip label={opt.grade} color={gradeS(opt.grade).color} bg={gradeS(opt.grade).bg} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {[
          ['Strike', `$${opt.strike.toFixed(opt.strike < 50 ? 2 : 0)}`, '#f0f0f0'],
          ['Exp', expiryLabel(opt.expiration), '#f0f0f0'],
          ['DTE', `${opt.dte}d`, '#9ca3af'],
          ['Bid/Ask', `$${opt.bid.toFixed(2)}/$${opt.ask.toFixed(2)}`, '#9ca3af'],
          ['Entry', `$${opt.entryMid.toFixed(2)}`, isCall ? G : R],
          ['Bkeven', `$${(opt.breakeven ?? 0).toFixed(2)}`, '#a78bfa'],
          ['T1 (+100%)', `$${opt.target1.toFixed(2)}`, G],
          ['Stop (−50%)', `$${opt.stopLoss.toFixed(2)}`, R],
          ['R:R', `${opt.rrRatio.toFixed(1)}:1`, opt.rrRatio >= 2 ? G : A],
          ['Action', (opt.action ?? 'watch').toUpperCase(), opt.action === 'enter' ? G : opt.action === 'watch' ? A : '#6b7280'],
        ].map(([l, v, color]) => (
          <span key={l} className="text-xs">
            <span style={{ color: '#374151' }}>{l} </span>
            <span className="font-semibold font-mono" style={{ color: color as string }}>{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Setup Card ───────────────────────────────────────────────────────────────

function SetupCard({ result, rank, compact = false }: { result: ScanResult; rank?: number; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isAvoid = result.setupTypes.every(t => t === 'avoid');
  const accentColor = isAvoid ? '#374151'
    : result.setupTypes.includes('bullish') ? G
    : result.setupTypes.includes('bearish') ? R
    : result.setupTypes.includes('breakout') ? '#60a5fa'
    : '#a78bfa';

  const bestOption = result.setupTypes.includes('bearish') ? result.bestPut : result.bestCall;

  return (
    <CpCard accentColor={accentColor} className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {rank && (
            <span className="text-xs font-black px-1.5 py-0.5 rounded" style={{ color: A, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              #{rank}
            </span>
          )}
          <span className="font-black text-lg" style={{ color: '#f0f0f0' }}>{result.symbol}</span>
          {result.discovered && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)' }}>
              DISCOVERED
            </span>
          )}
          <SetupTypeBadges types={result.setupTypes} />
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg px-2 py-1 min-w-[44px] text-center"
          style={{ background: '#13161d', border: `1px solid ${scoreC(result.confidenceScore)}44` }}>
          <span className="text-lg font-black font-mono leading-none" style={{ color: scoreC(result.confidenceScore) }}>
            {result.confidenceScore}
          </span>
          <span className="text-xs uppercase tracking-wider" style={{ color: '#374151', fontSize: '8px' }}>score</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="font-semibold font-mono" style={{ color: '#f0f0f0' }}>
          ${result.price >= 1000 ? result.price.toLocaleString() : result.price.toFixed(2)}
        </span>
        <span className="font-mono" style={{ color: pctC(result.changePct) }}>
          {result.changePct >= 0 ? '+' : ''}{result.changePct.toFixed(2)}%
        </span>
        <Chip
          label={`RS ${result.relStrengthVsSPY >= 0 ? '+' : ''}${result.relStrengthVsSPY.toFixed(1)}% vs SPY`}
          color={result.relStrengthVsSPY > 0 ? G : R}
          bg={result.relStrengthVsSPY > 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,59,59,0.08)'}
        />
        {result.volumeRatio > 1.5 && (
          <Chip label={`${result.volumeRatio.toFixed(1)}x vol`} color={A} bg="rgba(245,158,11,0.08)" />
        )}
      </div>

      <div className="flex gap-2 text-xs flex-wrap">
        {(() => {
          const wb = biasBg(result.weeklyBias.bias);
          const db = biasBg(result.dailyBias.bias);
          return (
            <>
              <Chip label={`W: ${result.weeklyBias.bias.slice(0, 4).toUpperCase()}`} color={wb.color} bg={wb.bg} border={wb.border} />
              <Chip label={`D: ${result.dailyBias.bias.slice(0, 4).toUpperCase()}`} color={db.color} bg={db.bg} border={db.border} />
              <Chip label={`RSI ${result.dailyBias.rsi}`} color="#6b7280" bg="rgba(107,114,128,0.1)" />
              <Chip label={result.dailyBias.ema9AboveEma21 ? 'EMA ↑' : 'EMA ↓'} color={result.dailyBias.ema9AboveEma21 ? G : R} bg={result.dailyBias.ema9AboveEma21 ? 'rgba(0,255,136,0.08)' : 'rgba(255,59,59,0.08)'} />
            </>
          );
        })()}
      </div>

      {!compact && bestOption && <MiniOption opt={bestOption} label="Best Contract" />}
      {!compact && !bestOption && !isAvoid && (
        <p className="text-xs text-center py-2" style={{ color: '#374151', fontStyle: 'italic' }}>
          No qualifying contract found
        </p>
      )}

      {!compact && (
        <div className="space-y-1 text-xs pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p><span style={{ color: '#374151' }}>Reason: </span><span style={{ color: '#9ca3af' }}>{result.reason}</span></p>
          <p><span style={{ color: '#374151' }}>Invalidation: </span><span style={{ color: '#6b7280' }}>{result.invalidation}</span></p>
          <div className="flex items-start gap-1" style={{ color: A }}>
            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
            <span style={{ color: '#9ca3af' }}>{result.riskWarning}</span>
          </div>
        </div>
      )}

      {compact && (
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-xs transition-colors"
          style={{ color: '#374151' }}>
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? 'Less' : 'Details'}
        </button>
      )}
      {compact && expanded && (
        <div className="space-y-1.5 text-xs pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {bestOption && <MiniOption opt={bestOption} label="Best Contract" />}
          <p><span style={{ color: '#374151' }}>Reason: </span><span style={{ color: '#9ca3af' }}>{result.reason}</span></p>
          <p><span style={{ color: '#374151' }}>Invalidation: </span><span style={{ color: '#6b7280' }}>{result.invalidation}</span></p>
          <div className="flex items-start gap-1">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" style={{ color: A }} />
            <span style={{ color: '#9ca3af' }}>{result.riskWarning}</span>
          </div>
        </div>
      )}
    </CpCard>
  );
}

// ─── Top 5 ────────────────────────────────────────────────────────────────────

function Top5Today({ results }: { results: ScanResult[] }) {
  if (!results.length) return null;
  return (
    <div id="top5" className="scroll-mt-16 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-0.5 h-4 rounded-full" style={{ background: A }} />
        <p className="sec-label" style={{ margin: 0 }}>Top 5 Today</p>
        <Chip label="BEST SETUPS" color={A} bg="rgba(245,158,11,0.1)" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {results.map((r, i) => <SetupCard key={r.symbol} result={r} rank={i + 1} compact />)}
      </div>
    </div>
  );
}

// ─── Scanner Section ──────────────────────────────────────────────────────────

function ScannerSection({ id, title, results, emptyMsg, accentColor }: {
  id: string; title: string; results: ScanResult[];
  emptyMsg: string; accentColor?: string;
}) {
  const color = accentColor ?? '#6b7280';
  return (
    <div id={id} className="scroll-mt-16 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-0.5 h-4 rounded-full" style={{ background: color }} />
        <p className="sec-label" style={{ margin: 0, color }}>{title}</p>
        <Chip label={String(results.length)} color={color} bg={`${color}14`} />
      </div>
      {results.length === 0 ? (
        <CpCard>
          <p className="text-xs text-center py-4" style={{ color: '#374151', fontStyle: 'italic' }}>{emptyMsg}</p>
        </CpCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map(r => <SetupCard key={r.symbol} result={r} />)}
        </div>
      )}
    </div>
  );
}

// ─── Scanner Nav ──────────────────────────────────────────────────────────────

function ScannerNav({ counts }: { counts: Record<string, number> }) {
  const sections = [
    { id: 'top5',      label: 'Top 5',                       color: A        },
    { id: 'bullish',   label: `Bullish (${counts.bullish})`,  color: G        },
    { id: 'bearish',   label: `Bearish (${counts.bearish})`,  color: R        },
    { id: 'breakout',  label: `Breakout (${counts.breakout})`,color: '#60a5fa' },
    { id: 'pullback',  label: `FVG Pull (${counts.pullback})`,color: '#a78bfa' },
    { id: 'options',   label: `Hot Options (${counts.options})`,color: A       },
    { id: 'avoid',     label: `Avoid (${counts.avoid})`,      color: '#374151' },
    { id: 'discovery', label: `Discovery (${counts.discovery})`,color: '#c084fc' },
  ];
  return (
    <div
      className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-6 flex gap-5 overflow-x-auto scrollbar-cockpit"
      style={{
        background: 'rgba(13,15,20,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {sections.map(s => (
        <a key={s.id} href={`#${s.id}`}
          className="text-xs font-bold whitespace-nowrap transition-colors hover:opacity-100"
          style={{ color: s.color, opacity: 0.7 }}>
          {s.label}
        </a>
      ))}
    </div>
  );
}

// ─── Scan Macro Bar ───────────────────────────────────────────────────────────

function ScanMacroBar({ data }: { data: ScanOutput }) {
  const color = biasC(data.macroTrend);
  const fd = data.futuresData;
  return (
    <div className="space-y-2 mb-4">
      <div className="flex flex-wrap gap-3 items-center p-3 rounded-xl"
        style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: G }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#374151' }}>Macro</span>
          <span className="text-sm font-black" style={{ color }}>{data.macroTrend.toUpperCase()}</span>
        </div>
        <div className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
        {fd && (
          <>
            {[
              { label: 'ES', val: fd.es.changePct },
              { label: 'NQ', val: fd.nq.changePct },
            ].map(({ label, val }) => (
              <span key={label} className="text-xs font-mono font-bold"
                style={{ color: val > 0.1 ? G : val < -0.1 ? R : '#9ca3af' }}>
                {label} {val >= 0 ? '+' : ''}{val.toFixed(2)}%
              </span>
            ))}
            <span className="text-xs font-bold px-1.5 py-0.5 rounded"
              style={{ color: fd.confirmed ? G : A, background: fd.confirmed ? 'rgba(0,255,136,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${fd.confirmed ? 'rgba(0,255,136,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
              Futures {fd.confirmed ? 'CONFIRMED ✓' : 'NOT CONFIRMED ⚠'}
            </span>
            <div className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          <span style={{ color: '#374151' }}>VIX</span>
          <span className="font-mono font-bold" style={{ color: data.vixPrice > 25 ? R : data.vixPrice > 18 ? A : '#f0f0f0' }}>
            {data.vixPrice.toFixed(1)}
          </span>
        </div>
        <div className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="flex items-center gap-1.5 text-xs">
          <span style={{ color: '#374151' }}>SPY</span>
          <span className="font-mono font-bold" style={{ color: pctC(data.spyChangePct) }}>{fmt2(data.spyChangePct)}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span style={{ color: '#374151' }}>QQQ</span>
          <span className="font-mono font-bold" style={{ color: pctC(data.qqqChangePct) }}>{fmt2(data.qqqChangePct)}%</span>
        </div>
        <div className="ml-auto text-xs font-mono" style={{ color: '#374151' }}>
          {data.fetchedAt ? `Scanned ${new Date(data.fetchedAt).toLocaleTimeString()}` : ''}
        </div>
      </div>
      {(data.dataWarnings ?? []).map((w, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: A }}>
          ⚠ {w}
        </div>
      ))}
    </div>
  );
}

// ─── Single Analysis View ─────────────────────────────────────────────────────

const SINGLE_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'NVDA', 'AAPL', 'TSLA', 'META', 'MSFT', 'AMZN', 'GOOGL', 'AMD'] as const;

function SingleAnalysisView({ data, symbol, onSymbol, loading, onRefresh }: {
  data: SingleData; symbol: string; onSymbol: (s: string) => void; loading: boolean; onRefresh: () => void;
}) {
  const macro = data.macroOutlook;
  const vol   = data.volatilityData;
  const vixs  = vixC(macro.vixRegime);

  return (
    <div className="space-y-4">
      {/* Symbol selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {SINGLE_SYMBOLS.map(s => (
          <button key={s} onClick={() => onSymbol(s)}
            className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
            style={{
              background: symbol === s ? 'rgba(0,255,136,0.12)' : '#13161d',
              border: `1px solid ${symbol === s ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.07)'}`,
              color: symbol === s ? G : '#6b7280',
            }}>
            {s}
          </button>
        ))}
        <button onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: '#13161d', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Futures confirmation bar + data warnings */}
      {data.futuresData && (
        <FuturesBar
          fd={data.futuresData}
          dataWarnings={data.dataWarnings}
          optionsAvailable={data.optionsDataAvailable}
        />
      )}
      {!data.futuresData && (data.dataWarnings ?? []).length > 0 && (data.dataWarnings ?? []).map((w, i) => (
        <div key={i} className="mb-2 flex items-start gap-2 px-4 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: A }}>
          ⚠ {w}
        </div>
      ))}
      {data.optionsDataAvailable === false && !data.futuresData && (
        <div className="mb-2 flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,59,59,0.12)', border: '1px solid rgba(255,59,59,0.4)', color: R }}>
          ⛔ Live contract data unavailable — do not trade from this signal.
        </div>
      )}

      {/* MTF Alignment — NEW */}
      <MTFAlignmentScore weekly={data.weeklyBias} daily={data.dailyBias} fourH={data.fourHourBias} />

      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 rounded-xl px-4 py-2"
          style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-xs" style={{ color: '#6b7280' }}>Analyzing</span>
          <span className="font-bold" style={{ color: '#f0f0f0' }}>{data.symbol}</span>
          <span style={{ color: '#374151' }}>@</span>
          <span className="font-bold font-mono" style={{ color: '#f0f0f0' }}>${data.currentPrice.toLocaleString()}</span>
        </div>
        {data.quotes.spy && (
          <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
            style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ color: '#374151' }}>SPY</span>
            <span className="font-mono font-bold" style={{ color: '#f0f0f0' }}>${data.quotes.spy.price}</span>
            <span className="font-mono" style={{ color: pctC(data.quotes.spy.changePct) }}>{fmt2(data.quotes.spy.changePct)}%</span>
          </div>
        )}
        {data.quotes.qqq && (
          <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
            style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ color: '#374151' }}>QQQ</span>
            <span className="font-mono font-bold" style={{ color: '#f0f0f0' }}>${data.quotes.qqq.price}</span>
            <span className="font-mono" style={{ color: pctC(data.quotes.qqq.changePct) }}>{fmt2(data.quotes.qqq.changePct)}%</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
          style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ color: '#374151' }}>VIX</span>
          <span className="font-mono font-bold" style={{ color: vixs.color }}>{macro.vix.toFixed(1)}</span>
        </div>
        <div className="ml-auto text-xs font-mono" style={{ color: '#374151' }}>
          {data.fetchedAt ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}` : ''}
        </div>
      </div>

      {/* Macro Outlook */}
      <CpCard accentColor={biasC(macro.trend)}>
        <SecHeader title="1. Macro Market Outlook" accent={biasC(macro.trend)} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { label: `${macro.trend === 'bullish' ? '↑' : macro.trend === 'bearish' ? '↓' : '→'} ${macro.trend.toUpperCase()} MACRO`, b: biasBg(macro.trend) },
                { label: macro.riskEnv.toUpperCase(), b: macro.riskEnv === 'risk-on' ? biasBg('bullish') : macro.riskEnv === 'risk-off' ? biasBg('bearish') : biasBg('neutral') },
                { label: `VIX ${macro.vixRegime.toUpperCase()}`, b: { color: vixs.color, bg: vixs.bg, border: vixs.border } },
                { label: `BREADTH ${macro.breadth.toUpperCase()}`, b: macro.breadth === 'strong' ? biasBg('bullish') : macro.breadth === 'weak' ? biasBg('bearish') : biasBg('neutral') },
              ].map(({ label, b }) => (
                <Chip key={label} label={label} color={b.color} bg={b.bg} border={b.border} />
              ))}
            </div>
            <p className="text-sm mb-3" style={{ color: '#d1d5db' }}>{macro.summary}</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: 'VIX',       val: `${macro.vix.toFixed(1)} (${macro.vixChange > 0 ? '+' : ''}${macro.vixChange.toFixed(1)}%)` },
                { label: 'DXY',       val: `${macro.dxy.toFixed(2)} ${macro.dxyTrend === 'rising' ? '↑' : macro.dxyTrend === 'falling' ? '↓' : '→'}` },
                { label: '10Y Yield', val: `${macro.yields.toFixed(2)}% ${macro.yieldsTrend === 'rising' ? '↑' : macro.yieldsTrend === 'falling' ? '↓' : '→'}` },
                { label: 'HYG',       val: `${macro.hyg > 0 ? '+' : ''}${macro.hyg.toFixed(2)}%` },
                { label: 'Gold',      val: `${macro.gld > 0 ? '+' : ''}${macro.gld.toFixed(2)}%` },
                { label: 'SPY/EMA200',val: macro.spyAboveEma200 ? 'Above ✓' : 'Below ✗' },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-lg p-2" style={{ background: '#13161d' }}>
                  <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#374151', fontSize: '9px' }}>{label}</div>
                  <div className="font-semibold font-mono" style={{ color: '#f0f0f0' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="sec-label mb-2">Key Risks</p>
            <ul className="space-y-1.5">
              {macro.keyRisks.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: '#9ca3af' }}>
                  <AlertTriangle size={10} style={{ color: A, marginTop: 2, flexShrink: 0 }} /> {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CpCard>

      {/* Bias Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><p className="sec-label mb-1.5 pl-1">2. Weekly Bias</p><BiasCard label="Weekly (SPY)" data={data.weeklyBias} /></div>
        <div><p className="sec-label mb-1.5 pl-1">3. Daily Bias</p><BiasCard label="Daily (SPY)" data={data.dailyBias} /></div>
        <div><p className="sec-label mb-1.5 pl-1">4. 4H Bias</p><BiasCard label={`4-Hour (${data.symbol})`} data={data.fourHourBias} /></div>
      </div>

      {/* Market Regime */}
      <CpCard>
        <SecHeader title="5. Market Regime" />
        <div className="flex flex-wrap items-start gap-4">
          {(() => {
            const phaseColor = { expansion: G, accumulation: '#60a5fa', distribution: R, reversal: A, ranging: '#6b7280' }[data.marketRegime.phase] ?? '#6b7280';
            return (
              <>
                <Chip label={data.marketRegime.phase.toUpperCase()} color={phaseColor} bg={`${phaseColor}14`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm mb-3" style={{ color: '#d1d5db' }}>{data.marketRegime.description}</p>
                  <div className="flex gap-6 text-xs">
                    <div className="flex-1">
                      <p className="font-bold mb-1" style={{ color: G, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Approach</p>
                      <p style={{ color: '#9ca3af' }}>{data.marketRegime.tradingApproach}</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold mb-1" style={{ color: R, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Avoid</p>
                      <ul className="space-y-0.5">
                        {data.marketRegime.avoidList.map((a, i) => <li key={i} style={{ color: '#6b7280' }}>· {a}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </CpCard>

      {/* FVG + BOS/CHoCH */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CpCard>
          <SecHeader title="6. Key FVG Levels" />
          {data.fvgLevels.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: '#374151', fontStyle: 'italic' }}>No active FVGs within 12% of price</p>
          ) : (
            <div className="space-y-2">
              {data.fvgLevels.slice(0, 8).map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg text-xs"
                  style={{
                    background: f.type === 'bullish' ? 'rgba(0,255,136,0.05)' : 'rgba(255,59,59,0.05)',
                    border: `1px solid ${f.type === 'bullish' ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)'}`,
                  }}>
                  <div className="flex items-center gap-2">
                    <Chip label={f.type === 'bullish' ? '▲' : '▼'} color={f.type === 'bullish' ? G : R} bg={f.type === 'bullish' ? 'rgba(0,255,136,0.1)' : 'rgba(255,59,59,0.1)'} />
                    <span className="uppercase font-bold" style={{ color: '#6b7280' }}>{f.timeframe}</span>
                    <span style={{ color: f.strength === 'strong' ? A : f.strength === 'moderate' ? '#9ca3af' : '#374151' }}>{f.strength}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold font-mono" style={{ color: '#f0f0f0' }}>{f.low.toFixed(2)} – {f.high.toFixed(2)}</p>
                    <p className="font-mono" style={{ color: '#374151' }}>mid {f.mid.toFixed(2)} · {f.ageCandles}c</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CpCard>

        <CpCard>
          <SecHeader title="7. BOS / CHoCH Analysis" />
          {data.structureEvents.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: '#374151', fontStyle: 'italic' }}>No recent BOS / CHoCH events detected</p>
          ) : (
            <div className="space-y-2">
              {data.structureEvents.map((e, i) => {
                const bull = e.event === 'BOS_UP' || e.event === 'CHoCH_UP';
                return (
                  <div key={i} className="p-2.5 rounded-lg"
                    style={{
                      background: bull ? 'rgba(0,255,136,0.05)' : 'rgba(255,59,59,0.05)',
                      border: `1px solid ${bull ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)'}`,
                    }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Chip label={e.event.replace('_', ' ')} color={bull ? G : R} bg={bull ? 'rgba(0,255,136,0.1)' : 'rgba(255,59,59,0.1)'} />
                        <span className="text-xs uppercase font-bold" style={{ color: '#6b7280' }}>{e.timeframe}</span>
                        {e.significance === 'major' && <Chip label="MAJOR" color={A} bg="rgba(245,158,11,0.1)" />}
                      </div>
                      <span className="text-xs font-mono font-semibold" style={{ color: '#9ca3af' }}>{e.level.toFixed(2)}</span>
                    </div>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>{e.description}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: '#374151' }}>{e.ageCandles} candles ago</p>
                  </div>
                );
              })}
            </div>
          )}
        </CpCard>
      </div>

      {/* Sector Rotation */}
      <CpCard>
        <SecHeader title="8. Sector Strength / Rotation" />
        <div className="overflow-x-auto scrollbar-cockpit">
          <div className="flex gap-2 min-w-max pb-1">
            {data.sectorRotation.map((s, i) => (
              <div key={i} className="flex flex-col items-center p-2.5 rounded-lg min-w-[86px] text-center text-xs"
                style={{
                  background: s.trend === 'bullish' ? 'rgba(0,255,136,0.05)' : s.trend === 'bearish' ? 'rgba(255,59,59,0.05)' : '#13161d',
                  border: `1px solid ${s.trend === 'bullish' ? 'rgba(0,255,136,0.15)' : s.trend === 'bearish' ? 'rgba(255,59,59,0.15)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                <span className="font-bold" style={{ color: '#f0f0f0' }}>{s.etf}</span>
                <span className="mt-0.5 leading-tight" style={{ color: '#374151', fontSize: '9px' }}>{s.name}</span>
                <span className="font-mono font-semibold mt-1.5" style={{ color: pctC(s.changePct1d) }}>
                  {s.changePct1d > 0 ? '+' : ''}{s.changePct1d.toFixed(1)}%
                </span>
                <span className="font-mono mt-0.5" style={{ color: pctC(s.relStrength), fontSize: '9px' }}>
                  vs SPY {s.relStrength > 0 ? '+' : ''}{s.relStrength.toFixed(1)}%
                </span>
                <div className="mt-1.5 h-0.5 w-full rounded-full" style={{ background: s.trend === 'bullish' ? G : s.trend === 'bearish' ? R : '#374151' }} />
                <span className="mt-0.5 font-bold font-mono" style={{ color: s.rank <= 3 ? A : '#374151', fontSize: '9px' }}>#{s.rank}</span>
              </div>
            ))}
          </div>
        </div>
      </CpCard>

      {/* Options Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CpCard>
          <SecHeader title="9. Best Swing Calls" accent={G}
            right={<Chip label={`${data.scoredCalls.length} contracts`} color={G} bg="rgba(0,255,136,0.08)" />} />
          <OptionsTable contracts={data.scoredCalls} type="call" currentPrice={data.currentPrice} />
        </CpCard>
        <CpCard>
          <SecHeader title="10. Best Swing Puts" accent={R}
            right={<Chip label={`${data.scoredPuts.length} contracts`} color={R} bg="rgba(255,59,59,0.08)" />} />
          <OptionsTable contracts={data.scoredPuts} type="put" currentPrice={data.currentPrice} />
        </CpCard>
      </div>

      {/* Trade guide */}
      <div className="flex flex-wrap gap-4 text-xs p-3 rounded-xl" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}>
        <span className="font-semibold" style={{ color: '#f0f0f0' }}>Trade Guide:</span>
        <span style={{ color: '#6b7280' }}>· <span style={{ color: '#f0f0f0' }}>Mid</span> = entry</span>
        <span style={{ color: '#6b7280' }}>· <span style={{ color: '#a78bfa' }}>Bkeven</span> = stock price at breakeven</span>
        <span style={{ color: '#6b7280' }}>· <span style={{ color: G }}>T1</span> = +100% (2:1 R:R)</span>
        <span style={{ color: '#6b7280' }}>· <span style={{ color: '#4ade80' }}>T2</span> = +175% (3.5:1 R:R)</span>
        <span style={{ color: '#6b7280' }}>· <span style={{ color: R }}>Stop</span> = −50% (hard stop)</span>
        <span style={{ color: '#6b7280' }}>· <span style={{ color: G }}>ENTER</span> = R:R ≥ 2:1, A+ grade</span>
        <span style={{ color: '#6b7280' }}>· <span style={{ color: A }}>WATCH</span> = monitor, not yet ideal</span>
      </div>

      {/* Theta + Volatility */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CpCard>
          <SecHeader title="11. Theta Risk" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: '#9ca3af' }}>Theta Friendly</span>
              {vol.thetaFriendly
                ? <Chip label="✓ FAVORABLE" color={G} bg="rgba(0,255,136,0.08)" />
                : <Chip label="⚠ ELEVATED DECAY" color={A} bg="rgba(245,158,11,0.08)" />}
            </div>
            {data.scoredCalls.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg p-2 text-xs"
                style={{ background: '#13161d' }}>
                <span style={{ color: '#6b7280' }}>{c.strike.toFixed(0)}C {expiryLabel(c.expiration)}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#374151' }}>{c.dte}DTE</span>
                  <span className="font-mono font-semibold" style={{ color: c.thetaEstDailyPct > 3 ? A : '#9ca3af' }}>
                    {c.thetaEstDailyPct.toFixed(1)}%/day
                  </span>
                </div>
              </div>
            ))}
            <p className="text-xs" style={{ color: '#374151' }}>Theta accelerates inside 21 DTE. Close or roll before last 7 days.</p>
          </div>
        </CpCard>

        <CpCard>
          <SecHeader title="12. Volatility Assessment" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-black font-mono" style={{ color: '#f0f0f0' }}>{vol.vix.toFixed(1)}</span>
                <span className="text-xs ml-1" style={{ color: '#6b7280' }}>VIX</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Chip label={vol.regime.toUpperCase()} color={vixC(vol.regime).color} bg={vixC(vol.regime).bg} />
                {vol.ivExpanding && <Chip label="IV EXPANDING" color={A} bg="rgba(245,158,11,0.08)" />}
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1d26' }}>
              <div className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (vol.vix / 50) * 100)}%`,
                  background: vol.vix > 30 ? R : vol.vix > 20 ? A : G,
                }} />
            </div>
            <p className="text-xs" style={{ color: '#d1d5db' }}>{vol.recommendation}</p>
          </div>
        </CpCard>
      </div>

      {/* Conviction */}
      <div>
        <p className="sec-label mb-2 pl-1">13. Highest Conviction Trade</p>
        {data.highestConviction
          ? <ConvictionCard c={data.highestConviction} />
          : <CpCard><p className="text-sm text-center py-4" style={{ color: '#374151' }}>No qualifying contract met minimum criteria.</p></CpCard>}
      </div>

      {/* Confidence */}
      <CpCard>
        <SecHeader title="14. Setup Confidence Score" />
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ConfidenceGauge score={data.confidenceScore} />
          <div className="flex-1 space-y-2 text-sm">
            {[
              { label: 'Weekly & Daily bias aligned',    pass: data.weeklyBias.bias === data.dailyBias.bias && data.dailyBias.bias !== 'neutral' },
              { label: 'Multi-timeframe confluence',     pass: data.dailyBias.bias === data.fourHourBias.bias && data.dailyBias.bias !== 'neutral' },
              { label: 'Market breadth supporting',      pass: macro.breadth !== 'weak' },
              { label: 'Normal volatility regime',       pass: vol.regime === 'normal' || vol.regime === 'low' },
              { label: 'Major structure event detected', pass: data.structureEvents.some(e => e.significance === 'major') },
              { label: 'Strong FVG present',             pass: data.fvgLevels.some(f => f.strength === 'strong') },
              { label: 'Qualifying options found',       pass: data.scoredCalls.length > 0 || data.scoredPuts.length > 0 },
            ].map(({ label, pass }) => (
              <div key={label} className="flex items-center gap-2">
                {pass
                  ? <CheckCircle size={14} style={{ color: G, flexShrink: 0 }} />
                  : <XCircle    size={14} style={{ color: '#374151', flexShrink: 0 }} />}
                <span style={{ color: pass ? '#d1d5db' : '#374151' }}>{label}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-5xl font-black font-mono" style={{ color: scoreC(data.confidenceScore) }}>
              {Math.round(data.confidenceScore / 10)}/10
            </p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
              {data.confidenceScore >= 80 ? 'High conviction — favorable to act'
                : data.confidenceScore >= 60 ? 'Moderate — trade with discipline'
                : data.confidenceScore >= 45 ? 'Low conviction — reduce size'
                : 'Avoid — conditions unfavorable'}
            </p>
          </div>
        </div>
      </CpCard>

      <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
        style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.06)', color: '#374151' }}>
        <Info size={11} style={{ marginTop: 1, flexShrink: 0 }} />
        Educational analysis only. Options can expire worthless. Past setups do not guarantee future results.
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Mode = 'single' | 'scan';

export default function SwingEnginePage() {
  const [mode, setMode]             = useState<Mode>('single');
  const [symbol, setSymbol]         = useState('SPY');
  const [singleData, setSingleData] = useState<SingleData | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError]     = useState('');
  const [scanData, setScanData]           = useState<ScanOutput | null>(null);
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

  if (!hasSingleLoaded.current && mode === 'single') {
    hasSingleLoaded.current = true;
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
    <AppShell title="Swing Trades">
      {/* ── Core question ─────────────────────────────────────────────────── */}
      <div className="mb-5 text-center">
        <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: '#374151' }}>Today's Question</p>
        <p className="text-base font-semibold" style={{ color: '#9ca3af' }}>
          Is there a high-quality higher timeframe setup?
        </p>
      </div>

      {/* ── Mode toggle ───────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-2 justify-center flex-wrap">
        {([
          { mode: 'single' as Mode, label: 'Single Analysis', icon: <Crosshair size={13} /> },
          { mode: 'scan'   as Mode, label: 'Market Scanner',  icon: <Search size={13} /> },
        ]).map(({ mode: m, label, icon }) => (
          <button
            key={m}
            onClick={() => handleMode(m)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: mode === m ? 'rgba(0,255,136,0.12)' : '#111318',
              border: `1px solid ${mode === m ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.07)'}`,
              color: mode === m ? G : '#6b7280',
              boxShadow: mode === m ? '0 0 14px rgba(0,255,136,0.15)' : 'none',
            }}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Single Analysis ───────────────────────────────────────────────── */}
      {mode === 'single' && (
        <>
          {singleError && (
            <div className="mb-4 p-3 rounded-xl flex items-center gap-2 text-sm"
              style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)', color: R }}>
              <AlertTriangle size={14} /> {singleError}
            </div>
          )}
          {singleLoading && !singleData && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }} />
              ))}
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

      {/* ── Scanner Mode ──────────────────────────────────────────────────── */}
      {mode === 'scan' && (
        <>
          {!scanData && !scanLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
                <Search size={32} style={{ color: G }} />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold mb-2" style={{ color: '#f0f0f0' }}>Market Scanner Ready</h2>
                <p className="text-sm max-w-md" style={{ color: '#6b7280' }}>
                  Scans 28+ symbols — SPY, QQQ, IWM, NVDA, AAPL, TSLA, META, MSFT, AMZN and more.
                  Ranks every setup with MTF structure and options data.
                </p>
                <p className="text-xs mt-2" style={{ color: '#374151' }}>Takes ~15 seconds to complete full analysis</p>
              </div>
              {scanError && (
                <div className="p-3 rounded-xl flex items-center gap-2 text-sm"
                  style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)', color: R }}>
                  <AlertTriangle size={14} /> {scanError}
                </div>
              )}
              <button
                onClick={loadScan}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105"
                style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.4)', color: G, boxShadow: '0 0 20px rgba(0,255,136,0.2)' }}>
                <Search size={16} /> Run Market Scanner
              </button>
            </div>
          )}

          {scanLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-5">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 rounded-full border-2" style={{ borderColor: '#1a1d26' }} />
                <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `transparent ${G} ${G} ${G}` }} />
              </div>
              <div className="text-center">
                <p className="font-semibold" style={{ color: '#f0f0f0' }}>Scanning the market…</p>
                <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Fetching quotes · Analyzing structure · Scoring options</p>
              </div>
            </div>
          )}

          {scanData && !scanLoading && (
            <>
              <ScannerNav counts={scanCounts} />
              <ScanMacroBar data={scanData} />
              <div className="flex justify-end mb-4">
                <button onClick={loadScan}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}>
                  <RefreshCw size={11} /> Re-scan Market
                </button>
              </div>
              <Top5Today results={scanData.top5Today} />
              <ScannerSection id="bullish"   title="Best Bullish Swing Setups"  results={scanData.bullishSetups}          accentColor={G}        emptyMsg="No clean bullish swing setups found." />
              <ScannerSection id="bearish"   title="Best Bearish Swing Setups"  results={scanData.bearishSetups}          accentColor={R}        emptyMsg="No clean bearish setups." />
              <ScannerSection id="breakout"  title="Breakout Setups"            results={scanData.breakoutSetups}         accentColor="#60a5fa"  emptyMsg="No fresh breakout setups." />
              <ScannerSection id="pullback"  title="Pullback / FVG Setups"      results={scanData.pullbackFVGSetups}      accentColor="#a78bfa"  emptyMsg="No pullback-to-FVG setups found." />
              <ScannerSection id="options"   title="High Conviction Options"    results={scanData.highConvictionOptions}  accentColor={A}        emptyMsg="No high-conviction options plays found." />
              <ScannerSection id="avoid"     title="Avoid List"                 results={scanData.avoidList}              accentColor="#374151"  emptyMsg="Nothing flagged for avoidance." />
              <ScannerSection id="discovery" title="Discovered Symbols"         results={scanData.discoveredSymbols}      accentColor="#c084fc"  emptyMsg="No unusual momentum discovered." />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
