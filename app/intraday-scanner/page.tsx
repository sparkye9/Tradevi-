'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Zap, BarChart2, Activity, Target, Shield, Flame, Search,
  ChevronUp, ChevronDown, CheckCircle, XCircle, Info, Radio,
  Layers, EyeOff, Crosshair,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const G = '#00ff88';
const R = '#ff3b3b';
const A = '#f59e0b';

// ─── Types (all preserved) ────────────────────────────────────────────────────
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
const biasC  = (b: string) => b === 'bullish' ? G : b === 'bearish' ? R : '#6b7280';
const pctC   = (v: number) => v > 0 ? G : v < 0 ? R : '#6b7280';
const scoreC = (s: number) => s >= 75 ? G : s >= 58 ? A : s >= 42 ? '#f97316' : R;
const gradeC = (g: string) => ({'A+': G, A: G, B: A, C: '#f97316'} as Record<string, string>)[g] ?? '#6b7280';
const vixC   = (r: string) => ({'low': G, 'normal': '#60a5fa', 'elevated': A, 'extreme': R} as Record<string, string>)[r] ?? '#6b7280';
const probC  = (p: string) => p === 'high' ? G : p === 'medium' ? A : '#6b7280';
const fmt2   = (n: number) => n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
const expLabel = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Noise suppression ─────────────────────────────────────────────────────────
function useNoiseStatus(d: IntradayData | null) {
  const [etH, setEtH] = useState(12);
  const [etM, setEtM] = useState(0);
  useEffect(() => {
    const tick = () => {
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      setEtH(et.getHours()); setEtM(et.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  const mins = etH * 60 + etM;
  const midday     = mins >= 660 && mins < 840;
  const lowVol     = d ? d.volumeRatio < 0.7 : false;
  const weakBreadth = d ? d.overallBias === 'neutral' && d.biasStrength < 40 : false;
  const lowVola    = d ? d.vixRegime === 'low' : false;
  const reasons: string[] = [];
  if (midday)      reasons.push('Midday chop window (11am–2pm ET)');
  if (lowVol && d) reasons.push(`Low volume (${d.volumeRatio.toFixed(2)}x avg)`);
  if (weakBreadth) reasons.push('Weak market breadth');
  if (lowVola)     reasons.push('Low volatility environment');
  return { suppressed: reasons.length > 0, reasons };
}

// ─── UI Primitives ─────────────────────────────────────────────────────────────
function CpCard({ children, className = '', accentColor, id }: { children: React.ReactNode; className?: string; accentColor?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-xl p-4 ${className}`}
      style={{
        background: '#111318',
        border: accentColor ? `1px solid ${accentColor}40` : '1px solid rgba(255,255,255,0.08)',
        borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
      }}>
      {children}
    </div>
  );
}

function SecHeader({ icon, title, right }: { icon?: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon && <span style={{ color: '#6b7280' }}>{icon}</span>}
        <span className="sec-label">{title}</span>
      </div>
      {right}
    </div>
  );
}

function Chip({ children, color = '#6b7280' }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
      style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}>
      {children}
    </span>
  );
}

function TFBiasCard({ label, data }: { label: string; data: BiasResult }) {
  const col = biasC(data.bias);
  return (
    <div className="rounded-lg p-3" style={{ background: '#13161d', border: `1px solid ${col}25` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="sec-label">{label}</span>
        <Chip color={col}>{data.bias.toUpperCase()}</Chip>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]" style={{ color: '#6b7280' }}>
          <span>Bear</span>
          <span style={{ color: col, fontFamily: '"JetBrains Mono",monospace', fontWeight: 700 }}>{data.strength}%</span>
          <span>Bull</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full" style={{ width: `${data.strength}%`, background: col }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
        {([['RSI', data.rsi, data.rsi > 70 ? R : data.rsi < 30 ? G : '#f0f0f0'],
           ['ATR', data.atr > 0 ? data.atr.toFixed(1) : '—', '#f0f0f0'],
           ['EMA', data.ema9AboveEma21 ? '↑' : '↓', data.ema9AboveEma21 ? G : R]] as [string, string | number, string][]).map(([k, v, c]) => (
          <div key={k} className="rounded p-1 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ color: '#6b7280' }}>{k}</div>
            <div style={{ color: c, fontFamily: '"JetBrains Mono",monospace', fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GreeksTable({ contracts, type }: { contracts: IntradayScoredOption[]; type: 'call' | 'put' }) {
  const col = type === 'call' ? G : R;
  if (!contracts.length) return <div className="text-xs py-4 text-center italic" style={{ color: '#6b7280' }}>No qualifying contracts (0–7 DTE)</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#6b7280', fontSize: '10px' }}>
            {['Strike','Exp','DTE','Mid','IV%','Δ','Γ','Θ/d','Vega','OI','Vol','Sprd','T1','Stop','Grade'].map(h => (
              <th key={h} className={h === 'Strike' ? 'text-left py-1.5 pr-2' : 'text-right py-1.5 pr-2'}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => (
            <tr key={i} className="transition-colors hover:bg-white/[0.02]"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <td className="py-1.5 pr-2" style={{ color: '#f0f0f0', fontWeight: 600 }}>
                {c.strike.toFixed(c.strike < 50 ? 2 : 0)}
                {c.inTheMoney && <span className="ml-1 text-[9px]" style={{ color: '#a78bfa' }}>ITM</span>}
                {c.scalp0DTE && <span className="ml-1 text-[9px]" style={{ color: A }}>0D</span>}
                {c.institutionalActivity && <span className="ml-1 text-[9px]" style={{ color: '#22d3ee' }}>★</span>}
              </td>
              <td className="py-1.5 pr-2 text-right" style={{ color: '#6b7280' }}>{expLabel(c.expiration)}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#6b7280' }}>{c.dte}d</td>
              <td className="py-1.5 pr-2 text-right font-mono font-semibold" style={{ color: col }}>${c.mid.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: c.ivPct > 80 ? A : '#6b7280' }}>{c.ivPct.toFixed(0)}%</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#7dd3fc' }}>{c.delta.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#c4b5fd' }}>{c.gamma.toFixed(4)}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: c.theta < -0.05 ? R : '#6b7280' }}>{c.theta.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#93c5fd' }}>{c.vega.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#6b7280' }}>{c.openInterest > 999 ? `${(c.openInterest/1000).toFixed(1)}k` : c.openInterest}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: '#6b7280' }}>{c.volume > 999 ? `${(c.volume/1000).toFixed(1)}k` : c.volume}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: c.spreadPct > 15 ? A : '#6b7280' }}>{c.spreadPct.toFixed(1)}%</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: G }}>${c.target1.toFixed(2)}</td>
              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: R }}>${c.stopLoss.toFixed(2)}</td>
              <td className="py-1.5 text-right"><Chip color={gradeC(c.grade)}>{c.grade}</Chip></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] flex gap-4" style={{ color: '#374151' }}>
        <span>★ = institutional</span><span>0D = 0DTE scalp</span><span>ITM = in the money</span><span>Θ = daily decay</span>
      </div>
    </div>
  );
}

function Top5IntradayContracts({ calls, puts }: { calls: IntradayScoredOption[]; puts: IntradayScoredOption[] }) {
  const all = [...calls, ...puts].sort((a, b) => b.score - a.score).slice(0, 5);
  if (!all.length) return <p className="text-xs py-3 text-center italic" style={{ color: '#6b7280' }}>No qualifying contracts found</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {all.map((c, i) => {
        const isCall = c.type === 'call';
        const col = isCall ? G : R;
        return (
          <div key={i} className="rounded-lg p-3"
            style={{
              background: '#13161d',
              border: `1px solid ${isCall ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)'}`,
              borderTop: `2px solid ${col}`,
            }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
                style={{ color: A, background: 'rgba(245,158,11,0.1)' }}>
                #{i + 1}
              </span>
              <div className="flex gap-1">
                <Chip color={col}>{c.type.toUpperCase()}</Chip>
                <Chip color={gradeC(c.grade)}>{c.grade}</Chip>
              </div>
            </div>
            <div className="text-center mb-2">
              <p className="font-black font-mono" style={{ color: scoreC(c.score), fontSize: '26px', lineHeight: 1 }}>{c.score}</p>
              <p className="text-[10px]" style={{ color: '#374151' }}>score / 100</p>
            </div>
            <div className="space-y-0.5 text-[11px]">
              {([
                ['Strike', `$${c.strike.toFixed(c.strike < 50 ? 2 : 0)}`, '#f0f0f0'],
                ['Exp',    expLabel(c.expiration),                          '#6b7280'],
                ['DTE',    `${c.dte}d`,                                    c.dte === 0 ? A : '#9ca3af'],
                ['Entry',  `$${c.entryMid.toFixed(2)}`,                    col],
                ['Delta',  c.delta.toFixed(2),                             '#7dd3fc'],
                ['IV',     `${c.ivPct.toFixed(0)}%`,                       '#9ca3af'],
                ['T1',     `$${c.target1.toFixed(2)}`,                     G],
                ['Stop',   `$${c.stopLoss.toFixed(2)}`,                    R],
                ['R:R',    `${c.rrRatio.toFixed(1)}:1`,                    '#a78bfa'],
              ] as [string, string, string][]).map(([l, v, color]) => (
                <div key={l} className="flex justify-between">
                  <span style={{ color: '#374151' }}>{l}</span>
                  <span className="font-mono font-semibold" style={{ color }}>{v}</span>
                </div>
              ))}
              <div className="flex gap-1 mt-1 flex-wrap">
                {c.scalp0DTE && <Chip color={A}>0DTE</Chip>}
                {c.institutionalActivity && <Chip color="#22d3ee">INST</Chip>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const bull = scenario.direction === 'bullish';
  const col = bull ? G : R;
  return (
    <div className="rounded-xl p-4" style={{ background: bull ? 'rgba(0,255,136,0.04)' : 'rgba(255,59,59,0.04)', border: `1px solid ${col}25` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {bull ? <TrendingUp size={14} style={{ color: col }} /> : <TrendingDown size={14} style={{ color: col }} />}
          <span style={{ color: col, fontWeight: 700, fontSize: '13px' }}>{scenario.title}</span>
        </div>
        <Chip color={probC(scenario.probability)}>{scenario.probability.toUpperCase()} PROB</Chip>
      </div>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: '#6b7280' }}>{scenario.entryCondition}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1.5">
          {scenario.entryLevel && <div className="flex justify-between"><span style={{ color: '#6b7280' }}>Entry</span><span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>${scenario.entryLevel}</span></div>}
          {scenario.target1 && <div className="flex justify-between"><span style={{ color: '#6b7280' }}>T1</span><span className="font-mono font-semibold" style={{ color: G }}>${scenario.target1}</span></div>}
          {scenario.target2 && <div className="flex justify-between"><span style={{ color: '#6b7280' }}>T2</span><span className="font-mono font-semibold" style={{ color: G }}>${scenario.target2}</span></div>}
        </div>
        <div className="space-y-1.5">
          {scenario.stopLevel && <div className="flex justify-between"><span style={{ color: '#6b7280' }}>Stop</span><span className="font-mono font-semibold" style={{ color: R }}>${scenario.stopLevel}</span></div>}
          <div className="flex justify-between"><span style={{ color: '#6b7280' }}>Inval.</span><span className="text-right leading-tight" style={{ color: '#6b7280' }}>{scenario.invalidation.slice(0, 40)}</span></div>
        </div>
      </div>
    </div>
  );
}

function VolProfileBar({ poc, vahigh, valow, price }: { poc: number; vahigh: number; valow: number; price: number }) {
  if (!poc) return null;
  const range = vahigh - valow || 1;
  const pocPct = Math.min(100, Math.max(0, (poc - valow) / range * 100));
  const pricePct = Math.min(100, Math.max(0, (price - valow) / range * 100));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs" style={{ color: '#6b7280' }}>
        <span>VA Low <span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>${valow.toFixed(2)}</span></span>
        <span>POC <span className="font-mono font-semibold" style={{ color: A }}>${poc.toFixed(2)}</span></span>
        <span>VA High <span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>${vahigh.toFixed(2)}</span></span>
      </div>
      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg,rgba(59,130,246,0.1),rgba(59,130,246,0.2),rgba(59,130,246,0.1))' }} />
        <div className="absolute h-full w-1 rounded-full" style={{ left: `${pocPct}%`, transform: 'translateX(-50%)', background: A }} />
        <div className="absolute h-full w-0.5 rounded-full bg-white" style={{ left: `${pricePct}%`, transform: 'translateX(-50%)' }} />
      </div>
      <div className="flex items-center gap-3 text-[10px]" style={{ color: '#6b7280' }}>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 rounded" style={{ background: A }} />POC</span>
        <span className="flex items-center gap-1"><span className="inline-block w-1 h-2 rounded bg-white" />Price</span>
        <span className="ml-auto">Price {price > poc ? 'above' : price < poc ? 'below' : 'at'} POC</span>
      </div>
    </div>
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const color = score >= 75 ? G : score >= 55 ? A : R;
  const r = 36, cx = 44, cy = 44, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ * 0.75;
  const gap = circ * 0.25 + circ * 0.75 * (1 - score / 100);
  return (
    <svg width={88} height={66} viewBox="0 0 88 66">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}
        strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${gap}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" />
      <text x={cx} y={cy + 5} textAnchor="middle" fill={color} fontSize={16} fontWeight="bold"
        fontFamily='"JetBrains Mono",monospace'>{score}</text>
    </svg>
  );
}

const SECTIONS = [
  { id: 's0', label: 'Top 5' },
  { id: 's1', label: 'Bias' },{ id: 's2', label: 'Structure' },{ id: 's3', label: 'FVGs' },
  { id: 's4', label: 'Sweeps' },{ id: 's5', label: 'Levels' },{ id: 's6', label: 'Scenarios' },
  { id: 's7', label: 'Calls' },{ id: 's8', label: 'Puts' },{ id: 's9', label: 'Best R:R' },
  { id: 's10', label: 'Plan' },{ id: 's11', label: 'No-Trade' },{ id: 's12', label: 'Score' },
];

function StickyNav() {
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-5 flex gap-4 overflow-x-auto scroll-mt-14"
      style={{ background: 'rgba(13,15,20,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {SECTIONS.map(s => (
        <a key={s.id} href={`#${s.id}`}
          className="text-xs font-semibold whitespace-nowrap transition-colors"
          style={{ color: '#6b7280', fontFamily: '"JetBrains Mono",monospace' }}
          onMouseEnter={e => (e.currentTarget.style.color = G)}
          onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}>
          {s.label}
        </a>
      ))}
    </div>
  );
}

function MarketBar({ d }: { d: IntradayData }) {
  const vwapC = d.priceVsVwap === 'above' ? G : d.priceVsVwap === 'below' ? R : '#6b7280';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 rounded-xl mb-5 text-xs"
      style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.08)' }}>
      {[['ES', d.futures.es > 0 ? d.futures.es.toLocaleString() : '—', d.futures.esChange],
        ['NQ', d.futures.nq > 0 ? d.futures.nq.toLocaleString() : '—', d.futures.nqChange]].map(([l, v, c]) => (
        <div key={l as string} className="flex items-center gap-1.5">
          <span style={{ color: '#6b7280' }}>{l}</span>
          <span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>{v as string}</span>
          <span className="font-mono" style={{ color: pctC(c as number) }}>{fmt2(c as number)}%</span>
          <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span style={{ color: '#6b7280' }}>VIX</span>
        <span className="font-mono font-semibold" style={{ color: d.vix > 25 ? R : d.vix > 18 ? A : '#f0f0f0' }}>{d.vix.toFixed(1)}</span>
        <Chip color={vixC(d.vixRegime)}>{d.vixRegime.toUpperCase()}</Chip>
        <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ color: '#6b7280' }}>VWAP</span>
        <span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>${d.vwap}</span>
        <span className="font-semibold" style={{ color: vwapC }}>{d.priceVsVwap.toUpperCase()}</span>
        <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ color: '#6b7280' }}>Zone</span>
        <Chip color={d.zone === 'premium' ? R : d.zone === 'discount' ? G : '#6b7280'}>{d.zone.toUpperCase()}</Chip>
        <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ color: '#6b7280' }}>Vol</span>
        <span className="font-mono font-semibold" style={{ color: d.volumeRatio >= 1.5 ? A : d.volumeRatio < 0.7 ? R : '#f0f0f0' }}>{d.volumeRatio.toFixed(2)}x</span>
      </div>
      <div className="ml-auto font-mono text-[10px]" style={{ color: '#374151' }}>
        {d.fetchedAt ? new Date(d.fetchedAt).toLocaleTimeString() : ''}
      </div>
    </div>
  );
}

function AnalysisView({ d }: { d: IntradayData }) {
  return (
    <div className="space-y-5">
      <MarketBar d={d} />
      <StickyNav />

      {/* S0 — Top 5 Best Contracts */}
      <CpCard id="s0" accentColor={G}>
        <SecHeader icon={<Flame size={14} />} title="Top 5 Best Contracts"
          right={<div className="flex gap-2"><Chip color={G}>0–7 DTE</Chip><Chip color="#6b7280">RANKED BY SCORE</Chip></div>} />
        <Top5IntradayContracts calls={d.topCalls} puts={d.topPuts} />
      </CpCard>

      {/* S1 */}
      <CpCard id="s1" accentColor={biasC(d.overallBias)}>
        <SecHeader icon={<Target size={14} />} title="Overall Market Bias" />
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 font-mono font-black" style={{ color: biasC(d.overallBias), fontSize: '26px' }}>
            {d.overallBias === 'bullish' ? <TrendingUp size={26} /> : d.overallBias === 'bearish' ? <TrendingDown size={26} /> : <Minus size={26} />}
            {d.overallBias.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${d.biasStrength}%`, background: biasC(d.overallBias) }} />
            </div>
            <p className="text-xs" style={{ color: '#6b7280' }}>{d.biasReason}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Chip color={d.regime.type === 'trending_up' ? G : d.regime.type === 'trending_down' ? R : A}>{d.regime.label}</Chip>
            <Chip color={vixC(d.vixRegime)}>VIX {d.vixRegime.toUpperCase()}</Chip>
          </div>
        </div>
        <p className="text-xs mt-2 italic" style={{ color: '#6b7280' }}>{d.regime.approach}</p>
      </CpCard>

      {/* S2 */}
      <div id="s2">
        <div className="sec-label mb-2 pl-1">Multi-Timeframe Structure</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {([['Weekly', d.weeklyBias],['Daily', d.dailyBias],['4H', d.fourHBias],['1H', d.oneHBias],['15m', d.fif15mBias]] as [string, BiasResult][]).map(([l, b]) => (
            <TFBiasCard key={l} label={l} data={b} />
          ))}
        </div>
      </div>

      {/* S3 */}
      <CpCard id="s3">
        <SecHeader icon={<BarChart2 size={14} />} title="Fair Value Gaps" right={<Chip color="#6b7280">{d.fvgLevels.length} active</Chip>} />
        {!d.fvgLevels.length
          ? <p className="text-xs py-3 text-center italic" style={{ color: '#374151' }}>No FVGs within 8% of price</p>
          : <div className="space-y-1.5">
              {d.fvgLevels.slice(0, 10).map((f, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded text-xs"
                  style={{ background: f.type === 'bullish' ? 'rgba(0,255,136,0.04)' : 'rgba(255,59,59,0.04)', border: `1px solid ${f.type === 'bullish' ? G : R}25` }}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: f.type === 'bullish' ? G : R, fontWeight: 700 }}>{f.type === 'bullish' ? '▲FVG' : '▼FVG'}</span>
                    <span className="uppercase" style={{ color: '#6b7280' }}>{f.timeframe}</span>
                    <span style={{ color: f.strength === 'strong' ? A : f.strength === 'moderate' ? '#6b7280' : '#374151' }}>{f.strength}</span>
                  </div>
                  <span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>{f.low.toFixed(2)} – {f.high.toFixed(2)}</span>
                </div>
              ))}
            </div>}
      </CpCard>

      {/* S4 */}
      <div id="s4" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CpCard>
          <SecHeader icon={<Zap size={14} />} title="BOS / CHoCH" />
          {!d.structureEvents.length
            ? <p className="text-xs py-3 text-center italic" style={{ color: '#374151' }}>No structure events detected</p>
            : <div className="space-y-2">
                {d.structureEvents.map((e, i) => {
                  const bull = e.event === 'BOS_UP' || e.event === 'CHoCH_UP';
                  return (
                    <div key={i} className="p-2.5 rounded" style={{ background: bull ? 'rgba(0,255,136,0.04)' : 'rgba(255,59,59,0.04)', border: `1px solid ${bull ? G : R}25` }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <Chip color={bull ? G : R}>{e.event.replace('_', ' ')}</Chip>
                          <span className="text-[10px] uppercase" style={{ color: '#6b7280' }}>{e.timeframe}</span>
                          {e.significance === 'major' && <Chip color={A}>MAJOR</Chip>}
                        </div>
                        <span className="font-mono font-semibold text-xs" style={{ color: '#f0f0f0' }}>${e.level}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: '#6b7280' }}>{e.description}</p>
                    </div>
                  );
                })}
              </div>}
        </CpCard>
        <CpCard>
          <SecHeader icon={<Crosshair size={14} />} title="Liquidity Sweeps" />
          {!d.liquiditySweeps.length
            ? <p className="text-xs py-3 text-center italic" style={{ color: '#374151' }}>No recent liquidity sweeps detected</p>
            : <div className="space-y-2">
                {d.liquiditySweeps.map((s, i) => {
                  const bull = s.type === 'bullish_sweep';
                  return (
                    <div key={i} className="p-2.5 rounded" style={{ background: bull ? 'rgba(0,255,136,0.04)' : 'rgba(255,59,59,0.04)', border: `1px solid ${bull ? G : R}25` }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <Chip color={bull ? G : R}>{bull ? 'BULL SWEEP' : 'BEAR SWEEP'}</Chip>
                        <span className="font-mono font-semibold text-xs" style={{ color: '#f0f0f0' }}>${s.level}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: '#6b7280' }}>{s.description}</p>
                      <div className="text-[10px] mt-0.5" style={{ color: '#374151' }}>{s.ageCandles} candles ago · {s.timeframe}</div>
                    </div>
                  );
                })}
              </div>}
        </CpCard>
      </div>

      {/* S5 */}
      <CpCard id="s5">
        <SecHeader icon={<Layers size={14} />} title="Key Levels & Liquidity Targets" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
          {[
            { label: 'Prev Day High', val: d.prevDayHigh, color: G },
            { label: 'Prev Day Low',  val: d.prevDayLow,  color: R },
            { label: 'Weekly High',   val: d.weeklyHigh,  color: G },
            { label: 'Weekly Low',    val: d.weeklyLow,   color: R },
            { label: 'VWAP',          val: d.vwap,        color: '#7dd3fc' },
            { label: 'Equilibrium',   val: d.equil,       color: '#f0f0f0' },
            { label: 'POC',           val: d.volumeProfile.poc, color: A },
            { label: 'VA High/Low',   val: null,          color: '#6b7280', custom: `${d.volumeProfile.vahigh} / ${d.volumeProfile.valow}` },
          ].map(({ label, val, color, custom }) => (
            <div key={label} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ color: '#6b7280', fontSize: '10px' }}>{label}</div>
              <div className="font-mono font-semibold mt-0.5" style={{ color }}>{custom ?? (val ? `$${(val as number).toFixed(2)}` : '—')}</div>
            </div>
          ))}
        </div>
        <VolProfileBar poc={d.volumeProfile.poc} vahigh={d.volumeProfile.vahigh} valow={d.volumeProfile.valow} price={d.price} />
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
          {[{ title: 'Resistance Zones', levels: d.resistanceLevels, color: R, arrow: '▲' },
            { title: 'Support Zones',    levels: d.supportLevels,    color: G, arrow: '▼' }].map(({ title, levels, color, arrow }) => (
            <div key={title}>
              <div className="mb-1" style={{ color: '#6b7280' }}>{title}</div>
              {levels.slice(0, 3).map((l, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span style={{ color, fontSize: '10px' }}>{arrow}</span>
                  <span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>${l}</span>
                </div>
              ))}
              {!levels.length && <span className="italic" style={{ color: '#374151' }}>None detected</span>}
            </div>
          ))}
        </div>
      </CpCard>

      {/* S6 */}
      <div id="s6">
        <div className="sec-label mb-2 pl-1">Trade Scenarios</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScenarioCard scenario={d.bullishScenario} />
          <ScenarioCard scenario={d.bearishScenario} />
        </div>
      </div>

      {/* S7 */}
      <CpCard id="s7">
        <SecHeader icon={<ChevronUp size={14} style={{ color: G }} />} title="Top Call Contracts"
          right={<div className="flex gap-2"><Chip color={G}>0–7 DTE</Chip><Chip color="#6b7280">{d.topCalls.length} found</Chip></div>} />
        <GreeksTable contracts={d.topCalls} type="call" />
      </CpCard>

      {/* S8 */}
      <CpCard id="s8">
        <SecHeader icon={<ChevronDown size={14} style={{ color: R }} />} title="Top Put Contracts"
          right={<div className="flex gap-2"><Chip color={R}>0–7 DTE</Chip><Chip color="#6b7280">{d.topPuts.length} found</Chip></div>} />
        <GreeksTable contracts={d.topPuts} type="put" />
      </CpCard>

      {/* S9 */}
      <CpCard id="s9" accentColor={d.bestRR?.type === 'call' ? G : d.bestRR?.type === 'put' ? R : undefined}>
        <SecHeader icon={<Star14 />} title="Best Risk / Reward Trade" />
        {d.bestRR ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="font-mono font-black" style={{ color: '#f0f0f0', fontSize: '20px' }}>{d.symbol}</span>
                <Chip color={d.bestRR.type === 'call' ? G : R}>{d.bestRR.type.toUpperCase()}</Chip>
                <Chip color={gradeC(d.bestRR.grade)}>{d.bestRR.grade}</Chip>
                <Chip color={d.bestRR.category === 'aggressive' ? R : d.bestRR.category === 'balanced' ? '#60a5fa' : '#6b7280'}>{d.bestRR.category.toUpperCase()}</Chip>
                {d.bestRR.institutionalActivity && <Chip color="#22d3ee">INST.</Chip>}
              </div>
              <div className="text-sm mb-3 font-mono" style={{ color: '#6b7280' }}>
                ${d.bestRR.strike} · {expLabel(d.bestRR.expiration)} · {d.bestRR.dte}DTE
              </div>
              <div className="rounded-lg p-3 space-y-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.04)' }}>
                {[['Entry', `$${d.bestRR.entryMid.toFixed(2)}`, '#f0f0f0'],
                  ['Target 1', `$${d.bestRR.target1.toFixed(2)}`, G],
                  ['Runner', `$${d.bestRR.target2.toFixed(2)}`, G],
                  ['Stop', `$${d.bestRR.stopLoss.toFixed(2)}`, R],
                  ['R:R', `${d.bestRR.rrRatio.toFixed(1)}:1`, '#a78bfa']].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between">
                    <span style={{ color: '#6b7280' }}>{l}</span>
                    <span className="font-mono font-semibold" style={{ color: c }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg p-3 text-xs space-y-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="mb-2 font-semibold" style={{ color: '#6b7280' }}>Full Greeks</div>
              {[['Delta', d.bestRR.delta.toFixed(3), '#7dd3fc'],
                ['Gamma', d.bestRR.gamma.toFixed(5), '#c4b5fd'],
                ['Theta/day', `$${d.bestRR.theta.toFixed(3)}`, R],
                ['Vega', `$${d.bestRR.vega.toFixed(3)}`, '#93c5fd'],
                ['IV', `${d.bestRR.ivPct.toFixed(1)}%`, '#f0f0f0'],
                ['OI', d.bestRR.openInterest.toLocaleString(), '#f0f0f0'],
                ['Volume', d.bestRR.volume.toLocaleString(), '#f0f0f0'],
                ['Spread', `${d.bestRR.spreadPct.toFixed(1)}%`, '#f0f0f0']].map(([l, v, c]) => (
                <div key={l} className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>{l}</span>
                  <span className="font-mono font-semibold" style={{ color: c }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <p className="text-sm text-center py-4 italic" style={{ color: '#374151' }}>No qualifying contract meets minimum R:R threshold today.</p>}
      </CpCard>

      {/* S10 */}
      <div id="s10" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[{ label: 'Long Entry Triggers', triggers: d.entryTriggers.long, icon: <ChevronUp size={14} style={{ color: G }} />, stop: d.stopLoss.long, col: G },
          { label: 'Short Entry Triggers', triggers: d.entryTriggers.short, icon: <ChevronDown size={14} style={{ color: R }} />, stop: d.stopLoss.short, col: R }].map(({ label, triggers, icon, stop, col }) => (
          <CpCard key={label}>
            <SecHeader icon={icon} title={label} />
            {!triggers.length
              ? <p className="text-xs py-3 italic" style={{ color: '#374151' }}>No clear triggers at current levels</p>
              : <ul className="space-y-2">
                  {triggers.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      {col === G ? <CheckCircle size={12} style={{ color: G, marginTop: 1, flexShrink: 0 }} /> : <XCircle size={12} style={{ color: R, marginTop: 1, flexShrink: 0 }} />}
                      <span style={{ color: '#f0f0f0' }}>{t}</span>
                    </li>
                  ))}
                </ul>}
            {stop && (
              <div className="mt-3 flex items-center gap-2 text-xs rounded p-2" style={{ background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.15)' }}>
                <Shield size={12} style={{ color: R }} />
                <span style={{ color: '#6b7280' }}>Stop: <span className="font-mono font-semibold" style={{ color: R }}>${stop}</span></span>
              </div>
            )}
          </CpCard>
        ))}
      </div>

      {/* S11 */}
      <CpCard id="s11" accentColor={d.noTradeConditions.length > 0 ? A : undefined}>
        <SecHeader icon={<AlertTriangle size={14} />} title="No-Trade Conditions"
          right={<Chip color={d.noTradeConditions.length > 0 ? A : G}>{d.noTradeConditions.length > 0 ? `${d.noTradeConditions.length} ACTIVE` : 'CLEAR'}</Chip>} />
        {!d.noTradeConditions.length
          ? <div className="flex items-center gap-2 text-sm" style={{ color: G }}><CheckCircle size={16} />No active no-trade conditions — conditions currently favorable.</div>
          : <ul className="space-y-2">
              {d.noTradeConditions.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle size={12} style={{ color: A, marginTop: 1, flexShrink: 0 }} />
                  <span style={{ color: '#f0f0f0' }}>{c}</span>
                </li>
              ))}
            </ul>}
        <div className="mt-3 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#374151' }}>
          <span>· 0DTE: strong momentum required</span>
          <span>· Avoid mid-range without direction</span>
          <span>· Never hold through high-impact events</span>
        </div>
      </CpCard>

      {/* S12 */}
      <CpCard id="s12">
        <SecHeader icon={<Target size={14} />} title="Confidence Score" />
        <div className="flex flex-col md:flex-row items-center gap-5">
          <ConfidenceRing score={d.confidenceScore} />
          <div className="flex-1 space-y-1.5 text-sm">
            {[
              { label: '4+ timeframes aligned', pass: [d.weeklyBias.bias, d.dailyBias.bias, d.fourHBias.bias, d.oneHBias.bias].filter(b => b !== 'neutral').length >= 3 },
              { label: 'Major structure event',  pass: d.structureEvents.some(e => e.significance === 'major') },
              { label: 'Strong FVG present',     pass: d.fvgLevels.some(f => f.strength === 'strong') },
              { label: 'Normal volatility',      pass: d.vixRegime === 'normal' || d.vixRegime === 'low' },
              { label: 'Above-avg volume',       pass: d.volumeRatio >= 1.2 },
              { label: 'A/A+ contracts found',   pass: d.topCalls.some(c => c.grade === 'A+' || c.grade === 'A') || d.topPuts.some(c => c.grade === 'A+' || c.grade === 'A') },
              { label: 'No-trade conditions clear', pass: d.noTradeConditions.length === 0 },
            ].map(({ label, pass }) => (
              <div key={label} className="flex items-center gap-2">
                {pass ? <CheckCircle size={13} style={{ color: G, flexShrink: 0 }} /> : <XCircle size={13} style={{ color: '#374151', flexShrink: 0 }} />}
                <span style={{ color: pass ? '#f0f0f0' : '#374151' }}>{label}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <div className="font-mono font-black" style={{ color: d.confidenceScore >= 75 ? G : d.confidenceScore >= 55 ? A : R, fontSize: '36px' }}>
              {Math.round(d.confidenceScore / 10)}/10
            </div>
            <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
              {d.confidenceScore >= 80 ? 'High conviction' : d.confidenceScore >= 60 ? 'Moderate setup' : d.confidenceScore >= 45 ? 'Low conviction' : 'Avoid'}
            </div>
          </div>
        </div>
      </CpCard>

      <div className="p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#374151' }}>
        <Info size={11} style={{ marginTop: 1, flexShrink: 0 }} />
        Intraday scanner only. Options scalping carries significant risk. Greeks approximated via Black-Scholes. 0DTE theta decay accelerates after 2pm ET. Never risk more than 1% per scalp.
      </div>
    </div>
  );
}

function ScannerView({ data, onSelect, showSuppressed }: { data: ScanData; onSelect: (s: string) => void; showSuppressed: boolean }) {
  const bullish = data.scanResults.filter(r => r.bias === 'bullish' && r.confidenceScore >= 50).slice(0, 5);
  const bearish = data.scanResults.filter(r => r.bias === 'bearish' && r.confidenceScore >= 50).slice(0, 5);
  const filtered = showSuppressed ? data.scanResults : data.scanResults.filter(r => r.confidenceScore >= 45 && r.bias !== 'neutral');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center p-3 rounded-xl text-xs" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2"><Radio size={10} className="animate-pulse" style={{ color: G }} /><span style={{ color: '#6b7280' }}>Live Scan</span></div>
        <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
        {[['ES', data.futures.es, data.futures.esChange], ['NQ', data.futures.nq, data.futures.nqChange]].map(([l, p, c]) => (
          <div key={l as string} className="flex items-center gap-1">
            <span style={{ color: '#6b7280' }}>{l}</span>
            <span className="font-mono font-semibold" style={{ color: '#f0f0f0' }}>{(p as number) > 0 ? (p as number).toLocaleString() : '—'}</span>
            <span className="font-mono" style={{ color: pctC(c as number) }}>{fmt2(c as number)}%</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span style={{ color: '#6b7280' }}>VIX</span>
          <span className="font-mono font-semibold" style={{ color: data.vix > 25 ? R : data.vix > 18 ? A : '#f0f0f0' }}>{data.vix.toFixed(1)}</span>
        </div>
        <div className="ml-auto font-mono text-[10px]" style={{ color: '#374151' }}>{data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : ''}</div>
      </div>

      <CpCard>
        <SecHeader icon={<Activity size={14} />} title="All Symbols — Ranked by Confidence"
          right={<div className="flex items-center gap-2">
            <Chip color="#6b7280">{filtered.length} shown</Chip>
            {!showSuppressed && data.scanResults.length > filtered.length && <Chip color={A}>{data.scanResults.length - filtered.length} suppressed</Chip>}
          </div>} />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-wide" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#6b7280' }}>
                {['Symbol','Price','Chg%','Gap%','Bias','Regime','vs VWAP','BOS/CHoCH','FVGs','Score','Reason'].map(h => (
                  <th key={h} className={h === 'Symbol' || h === 'Reason' ? 'text-left py-2 pr-3' : 'text-center py-2 pr-3'}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.symbol} className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i < 3 ? 'rgba(0,255,136,0.02)' : 'transparent' }}
                  onClick={() => onSelect(r.symbol)}>
                  <td className="py-2 pr-3 font-mono font-black" style={{ color: '#f0f0f0' }}>{r.symbol}</td>
                  <td className="py-2 pr-3 text-right font-mono font-semibold" style={{ color: '#f0f0f0' }}>${r.price.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right font-mono font-semibold" style={{ color: pctC(r.changePct) }}>{r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%</td>
                  <td className="py-2 pr-3 text-right font-mono" style={{ color: Math.abs(r.gapPct) > 1.5 ? A : '#374151' }}>{r.gapPct !== 0 ? `${r.gapPct > 0 ? '+' : ''}${r.gapPct.toFixed(1)}%` : '—'}</td>
                  <td className="py-2 pr-3 text-center"><Chip color={biasC(r.bias)}>{r.bias.slice(0, 4).toUpperCase()}</Chip></td>
                  <td className="py-2 pr-3 text-center text-[10px]" style={{ color: '#6b7280' }}>{r.regime}</td>
                  <td className="py-2 pr-3 text-center text-[10px] font-semibold font-mono" style={{ color: r.priceVsVwap === 'above' ? G : R }}>{r.priceVsVwap.toUpperCase()}</td>
                  <td className="py-2 pr-3 text-center text-[10px]">
                    {r.bosEvent ? <Chip color={r.bosEvent.includes('UP') ? G : R}>{r.bosEvent.replace('_', ' ')}</Chip> : <span style={{ color: '#374151' }}>—</span>}
                  </td>
                  <td className="py-2 pr-3 text-center font-mono" style={{ color: '#6b7280' }}>{r.fvgCount > 0 ? r.fvgCount : '—'}</td>
                  <td className="py-2 pr-3 text-center">
                    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-sm font-black font-mono"
                      style={{ color: scoreC(r.confidenceScore), background: `${scoreC(r.confidenceScore)}18`, border: `1px solid ${scoreC(r.confidenceScore)}40` }}>
                      {r.confidenceScore}
                    </span>
                  </td>
                  <td className="py-2 max-w-xs truncate" style={{ color: '#6b7280' }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CpCard>

      {data.discoveredTickers.length > 0 && (
        <CpCard>
          <SecHeader icon={<Radio size={14} />} title="Dynamic Discovery — Gap-ups / Movers" right={<Chip color="#c084fc">AUTO-FOUND</Chip>} />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {data.discoveredTickers.map(t => (
              <button key={t.symbol} onClick={() => onSelect(t.symbol)}
                className="rounded-lg p-3 text-left transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => (e.currentTarget.style.border = `1px solid ${G}40`)}
                onMouseLeave={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)')}>
                <div className="font-mono font-black" style={{ color: '#f0f0f0' }}>{t.symbol}</div>
                <div className="font-mono font-semibold" style={{ color: pctC(t.changePct), fontSize: '13px' }}>{t.changePct >= 0 ? '+' : ''}{t.changePct.toFixed(2)}%</div>
                {t.gapPct !== 0 && <div className="text-xs mt-0.5" style={{ color: Math.abs(t.gapPct) > 2 ? A : '#6b7280' }}>Gap {t.gapPct > 0 ? '+' : ''}{t.gapPct.toFixed(1)}%</div>}
                <div className="text-[10px] mt-1 leading-tight" style={{ color: '#374151' }}>{t.reason}</div>
              </button>
            ))}
          </div>
        </CpCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[{ title: 'Top Bullish Setups', results: bullish, dir: 'bullish', col: G },
          { title: 'Top Bearish Setups', results: bearish, dir: 'bearish', col: R }].map(({ title, results, dir, col }) => (
          <CpCard key={dir}>
            <SecHeader
              icon={dir === 'bullish' ? <TrendingUp size={14} style={{ color: G }} /> : <TrendingDown size={14} style={{ color: R }} />}
              title={title} />
            {!results.length
              ? <p className="text-xs italic py-3" style={{ color: '#374151' }}>No clean setups currently</p>
              : <div className="space-y-2">
                  {results.map(r => (
                    <button key={r.symbol} onClick={() => onSelect(r.symbol)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg transition-all text-left"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      onMouseEnter={e => (e.currentTarget.style.border = `1px solid ${col}30`)}
                      onMouseLeave={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)')}>
                      <span className="font-mono font-black" style={{ color: '#f0f0f0', width: 48 }}>{r.symbol}</span>
                      <span className="font-mono font-semibold" style={{ color: pctC(r.changePct), fontSize: '13px' }}>{r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%</span>
                      <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-black font-mono ml-auto"
                        style={{ color: scoreC(r.confidenceScore), background: `${scoreC(r.confidenceScore)}18`, border: `1px solid ${scoreC(r.confidenceScore)}40` }}>
                        {r.confidenceScore}
                      </span>
                      <span className="text-[10px] truncate max-w-[120px]" style={{ color: '#374151' }}>{r.regime}</span>
                    </button>
                  ))}
                </div>}
          </CpCard>
        ))}
      </div>
    </div>
  );
}

function Star14() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
type Mode = 'single' | 'scan';

export default function IntradayScannerPage() {
  const [mode, setMode]               = useState<Mode>('single');
  const [symbol, setSymbol]           = useState('SPY');
  const [data, setData]               = useState<IntradayData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [scanData, setScanData]       = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError]     = useState('');
  const [showSuppressed, setShowSuppressed] = useState(false);
  const loadedRef = useRef(false);
  const noise = useNoiseStatus(data);

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

  if (!loadedRef.current && mode === 'single') { loadedRef.current = true; setTimeout(() => loadSingle(), 0); }

  return (
    <AppShell title="Intraday">
      <div className="mb-4">
        <div className="sec-label mb-1">Core Question</div>
        <h1 style={{ color: '#f0f0f0', fontWeight: 700, fontSize: '18px' }}>What is moving right now with momentum?</h1>
      </div>

      {noise.suppressed && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl mb-5"
          style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid ${A}30` }}>
          <EyeOff size={16} style={{ color: A, flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1">
            <div className="text-sm font-semibold mb-0.5" style={{ color: A }}>Noise Suppression Active</div>
            <div className="text-xs" style={{ color: '#6b7280' }}>
              {noise.reasons.join(' · ')}. Weak setups are being filtered.
            </div>
          </div>
          <button onClick={() => setShowSuppressed(s => !s)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: showSuppressed ? A : '#6b7280', background: showSuppressed ? `${A}15` : 'transparent', border: `1px solid ${A}30` }}>
            {showSuppressed ? 'Show all' : 'Show all'}
          </button>
        </div>
      )}

      <div className="mb-5 flex items-center gap-1 p-1 rounded-lg w-fit"
        style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.08)' }}>
        {([['single', <Crosshair key="c" size={13} />, 'Deep Analysis'] as const,
           ['scan',   <Search key="s" size={13} />,    'Market Scan'] as const]).map(([key, icon, label]) => (
          <button key={key} onClick={() => handleMode(key as Mode)}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition-all"
            style={{ background: mode === key ? G : 'transparent', color: mode === key ? '#0d0f14' : '#6b7280' }}>
            {icon}{label}
          </button>
        ))}
      </div>

      {mode === 'single' && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {WATCHLIST.map(s => (
              <button key={s} onClick={() => loadSingle(s)}
                className="px-3 py-1.5 rounded text-xs font-bold font-mono transition-all"
                style={{
                  background: symbol === s && data ? `${G}20` : 'rgba(255,255,255,0.04)',
                  color: symbol === s && data ? G : '#6b7280',
                  border: symbol === s && data ? `1px solid ${G}50` : '1px solid rgba(255,255,255,0.08)',
                }}>
                {s}
              </button>
            ))}
            <button onClick={() => loadSingle()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all ml-auto"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f0f0' }}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg flex items-center gap-2 text-sm"
              style={{ background: 'rgba(255,59,59,0.08)', border: `1px solid ${R}30`, color: R }}>
              <AlertTriangle size={14} />{error}
            </div>
          )}

          {loading && !data && (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.06)' }} />
              ))}
            </div>
          )}

          {data && (
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="font-mono font-black" style={{ color: '#f0f0f0', fontSize: '22px' }}>{data.symbol}</span>
                <span className="font-mono font-bold" style={{ color: '#f0f0f0', fontSize: '18px' }}>${data.price.toLocaleString()}</span>
                <span className="font-mono font-bold" style={{ color: pctC(data.changePct), fontSize: '16px' }}>
                  {data.changePct >= 0 ? '+' : ''}{data.changePct.toFixed(2)}%
                </span>
                {loading && <span className="text-xs flex items-center gap-1" style={{ color: '#6b7280' }}><RefreshCw size={10} className="animate-spin" />Refreshing…</span>}
              </div>
              <AnalysisView d={data} />
            </div>
          )}
        </>
      )}

      {mode === 'scan' && (
        <>
          {!scanData && !scanLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: `${G}10`, border: `1px solid ${G}30` }}>
                <Search size={24} style={{ color: G }} />
              </div>
              <div className="text-center">
                <h2 style={{ color: '#f0f0f0', fontWeight: 700, fontSize: '18px' }}>Intraday Market Scan</h2>
                <p className="text-sm mt-1 max-w-md" style={{ color: '#6b7280' }}>
                  Scans {WATCHLIST.length} symbols + dynamic discovery. Ranks by confidence score using VWAP, FVGs, BOS/CHoCH.
                </p>
              </div>
              {scanError && (
                <div className="p-3 rounded-lg text-sm flex items-center gap-2"
                  style={{ background: 'rgba(255,59,59,0.08)', border: `1px solid ${R}30`, color: R }}>
                  <AlertTriangle size={14} />{scanError}
                </div>
              )}
              <button onClick={loadScan}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all"
                style={{ background: G, color: '#0d0f14' }}>
                <Search size={16} />Run Intraday Scan
              </button>
            </div>
          )}

          {scanLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 rounded-full" style={{ border: '4px solid rgba(255,255,255,0.06)' }} />
                <div className="absolute inset-0 rounded-full animate-spin" style={{ border: '4px solid transparent', borderTopColor: G }} />
                <div className="absolute inset-0 flex items-center justify-center"><Search size={16} style={{ color: G }} /></div>
              </div>
              <p style={{ color: '#f0f0f0', fontWeight: 600 }}>Scanning {WATCHLIST.length} symbols…</p>
              <p className="text-sm" style={{ color: '#6b7280' }}>Fetching quotes · Computing structure · Analyzing VWAP</p>
              <div className="flex gap-1.5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: G, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {scanData && !scanLoading && (
            <>
              <div className="flex justify-end mb-4">
                <button onClick={loadScan}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f0f0' }}>
                  <RefreshCw size={12} />Re-scan
                </button>
              </div>
              <ScannerView data={scanData} onSelect={sym => { setMode('single'); loadSingle(sym); }} showSuppressed={showSuppressed} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
