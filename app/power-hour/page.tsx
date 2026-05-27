'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  Clock, TrendingUp, TrendingDown, Activity, Zap,
  AlertCircle, Shield, Flame, RefreshCw, CheckCircle, Target,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const G = '#00ff88';
const R = '#ff3b3b';
const A = '#f59e0b';

// ─── Types (all preserved) ────────────────────────────────────────────────────
interface Signal {
  type: string;
  description: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
}

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

interface PowerHourData {
  success: boolean;
  symbol: string; currentPrice: number; dayHigh: number; dayLow: number; dayOpen: number;
  vwap: number; phHigh: number | null; phLow: number | null; phOpen: number | null;
  bias: 'bullish' | 'bearish' | 'neutral'; momentumScore: number; volumeSurge: number;
  signals: Signal[]; sessionPhase: 'pre_power_hour' | 'power_hour' | 'post_power_hour';
  minsToPhStart: number; minsInPh: number | null; minsRemainingInPh: number | null;
  totalSessionVolume: number; avgCandleVolume: number; lastVolume: number;
  candleCount: number; phCandleCount: number; recentCandles: Candle[];
  fetchedAt: string; error?: string;
}

interface OptionPick {
  contractSymbol: string; strike: number; expiration: string | null; dte: number | null;
  type: 'call' | 'put'; bid: number; ask: number; volume: number; openInterest: number;
  impliedVolatility: number; delta: number | null; costPerContract: number;
}

// ─── Constants (all preserved) ───────────────────────────────────────────────
const SYMBOLS = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL', 'AMD', 'META', 'MSFT', 'IWM', 'TQQQ', 'SQQQ', 'PLTR', 'SOFI'];

const PLAYBOOK = [
  { title: 'VWAP Reclaim',       dir: 'bullish' as const, entry: 'Price dips to VWAP then closes a 1-min candle above it with volume surge', target: '0.25%–0.5% above VWAP', stop: 'Close back below VWAP', instrument: 'Calls' },
  { title: 'HOD Breakout',       dir: 'bullish' as const, entry: 'Price consolidates within $0.10 of day high, then prints a candle close above HOD', target: 'HOD + (HOD – prior support)', stop: 'Back inside prior consolidation', instrument: 'Calls (0DTE)' },
  { title: 'LOD Breakdown',      dir: 'bearish' as const, entry: 'Price consolidates within $0.10 of day low, then closes below LOD with volume', target: 'LOD – (prior resistance – LOD)', stop: 'Close back above LOD', instrument: 'Puts (0DTE)' },
  { title: 'VWAP Rejection',     dir: 'bearish' as const, entry: 'Price bounces up to VWAP from below, fails to close above — bearish engulf on 1m', target: '0.25%–0.5% below VWAP', stop: 'Close above VWAP', instrument: 'Puts' },
  { title: 'Momentum Continuation', dir: 'neutral' as const, entry: 'Strong directional trend entering 3pm — wait for 1-min flag/pause then enter on the break', target: '1× the size of the flag', stop: 'Below the flag low (calls) / above flag high (puts)', instrument: 'Follow the trend' },
  { title: 'Mean Reversion',     dir: 'neutral' as const, entry: 'Price is >0.5% extended from VWAP heading into 3pm — wait for a 1-min reversal candle near HOD/LOD', target: 'VWAP', stop: 'New HOD (if fading) or new LOD (if buying dip)', instrument: 'Against prior trend' },
];

const RULES = [
  ['Max hold time',         'Exit all positions by 3:35 PM ET. Never hold into close.'],
  ['0DTE only',             'Use 0 or 1 DTE options. Theta accelerates — you need a fast move, not time.'],
  ['Confirm with volume',   'Only enter if the breakout/reclaim candle has above-average volume.'],
  ['One setup at a time',   'Pick the clearest signal and execute it. Do not chase multiple setups.'],
  ['No entries after 3:30', "If you haven't entered by 3:30 PM, sit out. Spread blowout risk is high."],
  ['Size down',             'Use 1–2 contracts max. Power hour can reverse in one candle.'],
  ['Target 20–50%',         'Take the money at 20–30% gain. Power hour moves fast but reverses fast.'],
  ['Stop at 30–40%',        "If the trade moves against you 30–40%, cut it. Don't let a small loss become a wipe."],
];

// ─── Helpers (all preserved) ──────────────────────────────────────────────────
function fmtPrice(n: number) { return `$${n.toFixed(2)}`; }
function fmtVol(n: number) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n); }

function getETOffsetHours(): number {
  const now = new Date();
  const year = now.getFullYear();
  const mar1Day = new Date(year, 2, 1).getDay();
  const dstStart = new Date(year, 2, mar1Day === 0 ? 8 : 15 - mar1Day);
  const nov1Day = new Date(year, 10, 1).getDay();
  const dstEnd = new Date(year, 10, nov1Day === 0 ? 1 : 8 - nov1Day);
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

function getETTime(): { timeStr: string; etHour: number; etMin: number } {
  const now = new Date();
  const etMs = now.getTime() + getETOffsetHours() * 3600 * 1000;
  const etDate = new Date(etMs);
  const h = etDate.getUTCHours(), m = etDate.getUTCMinutes(), s = etDate.getUTCSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return { timeStr: `${h12}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ampm} ET`, etHour: h, etMin: m };
}

function scoreOption(o: OptionPick, budget: number): number {
  if (o.ask * 100 > budget) return -1;
  if ((o.volume ?? 0) < 20 || (o.openInterest ?? 0) < 50) return -1;
  const spreadRatio = o.ask > 0 ? (o.ask - o.bid) / o.ask : 1;
  if (spreadRatio > 0.20) return -1;
  const volScore   = Math.min((o.volume ?? 0) / 500, 1) * 30;
  const oiScore    = Math.min((o.openInterest ?? 0) / 2000, 1) * 20;
  const deltaScore = o.delta != null ? Math.max(0, 1 - Math.abs(Math.abs(o.delta) - 0.50) * 4) * 30 : 0;
  const spreadScore = Math.max(0, 1 - spreadRatio * 5) * 20;
  return volScore + oiScore + deltaScore + spreadScore;
}

// ─── UI Primitives ─────────────────────────────────────────────────────────────
function CpCard({ children, className = '', accentColor }: { children: React.ReactNode; className?: string; accentColor?: string }) {
  return (
    <div className={`rounded-xl p-4 ${className}`}
      style={{ background: '#111318', border: accentColor ? `1px solid ${accentColor}40` : '1px solid rgba(255,255,255,0.08)', borderLeft: accentColor ? `3px solid ${accentColor}` : undefined }}>
      {children}
    </div>
  );
}

function SecHeader({ icon, title, right }: { icon?: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">{icon && <span style={{ color: '#6b7280' }}>{icon}</span>}<span className="sec-label">{title}</span></div>
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

function StatTile({ label, value, sub, color = '#f0f0f0', accent }: { label: string; value: string; sub?: string; color?: string; accent?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#111318', border: accent ? `1px solid ${accent}30` : '1px solid rgba(255,255,255,0.08)' }}>
      <div className="text-xs mb-1" style={{ color: '#6b7280' }}>{label}</div>
      <div className="font-mono font-bold" style={{ color, fontSize: '20px' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{sub}</div>}
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const col = signal.direction === 'bullish' ? G : signal.direction === 'bearish' ? R : '#6b7280';
  const strengthC = signal.strength === 'strong' ? A : signal.strength === 'moderate' ? '#60a5fa' : '#6b7280';
  return (
    <div className="rounded-lg p-3" style={{ background: signal.direction === 'bullish' ? 'rgba(0,255,136,0.04)' : signal.direction === 'bearish' ? 'rgba(255,59,59,0.04)' : 'rgba(255,255,255,0.03)', border: `1px solid ${col}25` }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-semibold text-sm" style={{ color: col }}>{signal.type}</span>
        <Chip color={strengthC}>{signal.strength.toUpperCase()}</Chip>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>{signal.description}</p>
    </div>
  );
}

function OptionCard({ opt, rank, budget }: { opt: OptionPick; rank: number; budget: number }) {
  const col = opt.type === 'call' ? G : R;
  const breakeven = opt.type === 'call' ? opt.strike + opt.ask : opt.strike - opt.ask;
  const spreadPct = opt.ask > 0 ? ((opt.ask - opt.bid) / opt.ask * 100).toFixed(0) : '—';
  const overBudget = opt.ask * 100 > budget;
  return (
    <div className="rounded-xl p-3 text-xs" style={{ background: rank === 1 ? `${col}08` : 'rgba(255,255,255,0.03)', border: rank === 1 ? `1px solid ${col}40` : '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={{ color: '#6b7280', fontWeight: 600 }}>#{rank}</span>
          <span className="font-mono font-bold" style={{ color: col, fontSize: '13px' }}>{fmtPrice(opt.strike)} {opt.type.toUpperCase()}</span>
          {opt.expiration && <span style={{ color: '#6b7280' }}>{opt.expiration}</span>}
          {opt.dte != null && <Chip color={opt.dte === 0 ? R : opt.dte === 1 ? A : '#6b7280'}>{opt.dte === 0 ? '0DTE' : `${opt.dte}d`}</Chip>}
        </div>
        {rank === 1 && <Chip color={A}>TOP SCALP</Chip>}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mb-2">
        {[['Ask', fmtPrice(opt.ask)], ['Bid', fmtPrice(opt.bid)], ['Spread', `${spreadPct}%`],
          ['Volume', (opt.volume ?? 0).toLocaleString()], ['OI', (opt.openInterest ?? 0).toLocaleString()],
          ['IV', opt.impliedVolatility > 0 ? `${(opt.impliedVolatility * 100).toFixed(0)}%` : '—'],
          ['Delta', opt.delta != null ? opt.delta.toFixed(2) : '—'], ['BE', fmtPrice(breakeven)],
          ['Cost', `$${(opt.ask * 100).toFixed(0)}`]].map(([l, v]) => (
          <div key={l}><span style={{ color: '#6b7280' }}>{l} </span><span className="font-mono font-medium" style={{ color: '#f0f0f0' }}>{v}</span></div>
        ))}
      </div>
      <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="font-bold font-mono" style={{ color: overBudget ? R : G }}>${(opt.ask * 100).toFixed(0)}/contract</span>
        {overBudget && <span className="text-xs ml-1" style={{ color: R }}>(over budget)</span>}
        <span className="text-xs ml-2" style={{ color: '#6b7280' }}>Max {Math.floor(budget / (opt.ask * 100))} contracts</span>
      </div>
    </div>
  );
}

// ─── Playbook mode detection ──────────────────────────────────────────────────
function detectPlaybookMode(d: PowerHourData): string {
  if (!d) return 'NO TRADE';
  const aboveVwap = d.currentPrice > d.vwap;
  const nearHod = d.dayHigh > 0 && (d.dayHigh - d.currentPrice) / d.currentPrice < 0.003;
  const nearLod = d.dayLow > 0 && (d.currentPrice - d.dayLow) / d.currentPrice < 0.003;
  const momentum = Math.abs(d.momentumScore) > 0.3;
  if (d.volumeSurge < 0.8) return 'NO TRADE';
  if (momentum && aboveVwap && d.bias === 'bullish') return 'TREND CONTINUATION';
  if (momentum && !aboveVwap && d.bias === 'bearish') return 'TREND CONTINUATION';
  if (nearHod && d.volumeSurge > 1.5) return 'HOD BREAKOUT';
  if (nearLod && d.volumeSurge > 1.5) return 'LOD BREAKDOWN';
  if (aboveVwap && d.bias === 'bearish') return 'MEAN REVERSION';
  if (!aboveVwap && d.bias === 'bullish') return 'VWAP RECLAIM';
  if (d.signals.some(s => s.strength === 'strong')) return 'MOMENTUM CONTINUATION';
  return 'WAIT FOR SIGNAL';
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PowerHourPage() {
  const [symbol,      setSymbol]      = useState('SPY');
  const [budget,      setBudget]      = useState(500);
  const [phData,      setPhData]      = useState<PowerHourData | null>(null);
  const [callPicks,   setCallPicks]   = useState<OptionPick[]>([]);
  const [putPicks,    setPutPicks]    = useState<OptionPick[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [etTime,      setEtTime]      = useState(() => getETTime());
  const [checklist,   setChecklist]   = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => setEtTime(getETTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const analyze = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [phRes, optRes] = await Promise.all([
        fetch(`/api/power-hour?symbol=${symbol}`),
        fetch(`/api/options-chain?symbol=${symbol}`),
      ]);
      const ph: PowerHourData = await phRes.json();
      const opt = await optRes.json();
      if (!ph.success) throw new Error(ph.error ?? 'Power hour analysis failed');
      setPhData(ph);
      const filterAndRank = (options: OptionPick[]): OptionPick[] =>
        options.filter(o => o.ask > 0 && o.ask * 100 <= budget && (o.dte == null || o.dte <= 3) && (o.volume ?? 0) >= 20 && (o.openInterest ?? 0) >= 50)
          .map(o => ({ ...o, _score: scoreOption(o, budget) }))
          .filter((o: any) => o._score >= 0)
          .sort((a: any, b: any) => b._score - a._score)
          .slice(0, 4);
      setCallPicks(filterAndRank(opt.calls ?? []));
      setPutPicks(filterAndRank(opt.puts ?? []));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    }
    setLoading(false);
  }, [symbol, budget]);

  const etHourMin = etTime.etHour * 60 + etTime.etMin;
  const inPH = etHourMin >= 15 * 60 && etHourMin < 15 * 60 + 35;
  const prePH = etHourMin >= 14 * 60 + 30 && etHourMin < 15 * 60;
  const biasCfg = phData?.bias === 'bullish' ? { color: G, label: 'BULLISH BIAS' } : phData?.bias === 'bearish' ? { color: R, label: 'BEARISH BIAS' } : { color: '#6b7280', label: 'NEUTRAL' };
  const activeMode = phData ? detectPlaybookMode(phData) : null;

  const CHECKLIST_ITEMS = [
    'Setup is clearly defined (HOD/LOD/VWAP test)',
    'Volume confirms the move',
    'Bias aligns with direction',
    'Options spread is tight (<15%)',
    'Entry is at key level, not mid-range',
    'Stop is clearly defined before entry',
    'Size is 1–2 contracts max',
  ];

  return (
    <AppShell title="Power Hour">
      {/* Core question */}
      <div className="mb-4">
        <div className="sec-label mb-1">Core Question</div>
        <h1 style={{ color: '#f0f0f0', fontWeight: 700, fontSize: '18px' }}>Is there a high-probability end-of-day opportunity?</h1>
      </div>

      {/* POWER HOUR ACTIVE banner */}
      {inPH && (
        <div className="flex items-center justify-between px-5 py-4 rounded-xl mb-5"
          style={{ background: `${R}10`, border: `1px solid ${R}50`, boxShadow: `0 0 24px ${R}20` }}>
          <div className="flex items-center gap-3">
            <Flame size={22} style={{ color: R }} className="animate-pulse" />
            <div>
              <div className="font-bold" style={{ color: R, fontSize: '18px', letterSpacing: '0.05em' }}>POWER HOUR ACTIVE</div>
              <div className="text-xs" style={{ color: '#6b7280' }}>3:00–3:35 PM ET · High focus required</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold" style={{ color: '#f0f0f0', fontSize: '18px' }}>{etTime.timeStr}</div>
            {phData?.minsRemainingInPh != null && (
              <div className="text-xs mt-0.5" style={{ color: R }}>{phData.minsRemainingInPh}m remaining</div>
            )}
          </div>
        </div>
      )}

      {!inPH && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-5"
          style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <Clock size={16} style={{ color: prePH ? A : '#6b7280' }} />
            <span style={{ color: prePH ? A : '#6b7280', fontWeight: 600 }}>
              {prePH ? 'POWER HOUR APPROACHING' : etHourMin > 15 * 60 + 35 ? 'POWER HOUR ENDED' : 'POWER HOUR INACTIVE'}
            </span>
            {prePH && phData && <span className="text-xs" style={{ color: '#6b7280' }}>{phData.minsToPhStart}m until 3:00 PM ET</span>}
          </div>
          <div className="font-mono font-semibold text-sm" style={{ color: '#6b7280' }}>{etTime.timeStr}</div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <div className="sec-label mb-1.5">Symbol</div>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f0f0' }}>
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div className="sec-label mb-1.5">Options Budget ($)</div>
          <input type="number" value={budget} onChange={e => setBudget(Math.max(50, Number(e.target.value)))} min={50} step={50}
            className="w-28 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f0f0', fontFamily: '"JetBrains Mono",monospace' }} />
        </div>
        <button onClick={analyze} disabled={loading}
          className="flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all"
          style={{ background: loading ? 'rgba(255,255,255,0.06)' : G, color: loading ? '#6b7280' : '#0d0f14' }}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Flame size={14} />}
          {loading ? 'Analyzing…' : 'Analyze Power Hour'}
        </button>
        {lastUpdated && <span className="text-xs self-center" style={{ color: '#6b7280' }}>Updated: {lastUpdated}</span>}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2 text-sm"
          style={{ background: 'rgba(255,59,59,0.08)', border: `1px solid ${R}30`, color: R }}>
          <AlertCircle size={14} className="shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative w-14 h-14">
            <div className="w-14 h-14 rounded-full" style={{ border: '3px solid rgba(255,255,255,0.06)' }} />
            <div className="absolute inset-0 rounded-full animate-spin" style={{ border: '3px solid transparent', borderTopColor: G }} />
            <div className="absolute inset-0 flex items-center justify-center"><Flame size={16} style={{ color: G }} /></div>
          </div>
          <p style={{ color: '#6b7280', fontSize: '13px' }}>Fetching {symbol} intraday data and options chain…</p>
        </div>
      )}

      {phData && !loading && (
        <div className="space-y-5">
          {/* Bias + playbook mode strip */}
          <div className="flex flex-wrap gap-4 p-4 rounded-xl items-center"
            style={{ background: '#111318', border: `1px solid ${biasCfg.color}25` }}>
            <div className="flex items-center gap-3">
              {phData.bias === 'bullish' ? <TrendingUp size={22} style={{ color: G }} /> : phData.bias === 'bearish' ? <TrendingDown size={22} style={{ color: R }} /> : <Activity size={22} style={{ color: '#6b7280' }} />}
              <div>
                <div className="font-bold" style={{ color: biasCfg.color, fontSize: '16px' }}>{biasCfg.label}</div>
                <div className="text-xs" style={{ color: '#6b7280' }}>
                  {phData.currentPrice > phData.vwap
                    ? `Above VWAP by $${(phData.currentPrice - phData.vwap).toFixed(2)}`
                    : `Below VWAP by $${(phData.vwap - phData.currentPrice).toFixed(2)}`}
                  {' · '}{phData.volumeSurge.toFixed(1)}x avg volume
                </div>
              </div>
            </div>
            {activeMode && (
              <div className="ml-auto flex items-center gap-2">
                <span className="sec-label">Active Mode:</span>
                <span className="font-bold font-mono" style={{ color: activeMode === 'NO TRADE' || activeMode === 'WAIT FOR SIGNAL' ? R : G, fontSize: '13px' }}>
                  {activeMode}
                </span>
              </div>
            )}
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Current Price" value={fmtPrice(phData.currentPrice)}
              sub={`Open: ${fmtPrice(phData.dayOpen)}`}
              color={phData.currentPrice >= phData.dayOpen ? G : R}
              accent={phData.currentPrice >= phData.dayOpen ? G : R} />
            <StatTile label="VWAP" value={fmtPrice(phData.vwap)}
              sub={phData.currentPrice > phData.vwap ? 'Price above VWAP' : 'Price below VWAP'}
              color="#a78bfa" accent="#a78bfa" />
            <StatTile label="Day High" value={fmtPrice(phData.dayHigh)}
              sub={`Dist: $${(phData.dayHigh - phData.currentPrice).toFixed(2)}`} color={G} accent={G} />
            <StatTile label="Day Low" value={fmtPrice(phData.dayLow)}
              sub={`Dist: $${(phData.currentPrice - phData.dayLow).toFixed(2)}`} color={R} accent={R} />
          </div>

          {(phData.phHigh !== null || phData.phLow !== null) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {phData.phOpen !== null && <StatTile label="PH Open (3:00 PM)" value={fmtPrice(phData.phOpen)} sub="Entry reference" color={A} accent={A} />}
              {phData.phHigh !== null && <StatTile label="Power Hour High" value={fmtPrice(phData.phHigh)} sub="Breakout above = momentum" color={G} accent={G} />}
              {phData.phLow !== null && <StatTile label="Power Hour Low" value={fmtPrice(phData.phLow)} sub="Breakdown below = momentum" color={R} accent={R} />}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile label="Volume Surge" value={`${phData.volumeSurge.toFixed(1)}x`}
              sub={`Last: ${fmtVol(phData.lastVolume)} vs avg ${fmtVol(Math.round(phData.avgCandleVolume))}`}
              color={phData.volumeSurge >= 2 ? A : phData.volumeSurge >= 1.2 ? G : '#6b7280'}
              accent={phData.volumeSurge >= 1.5 ? A : undefined} />
            <StatTile label="10-Candle Momentum" value={`${phData.momentumScore >= 0 ? '+' : ''}${phData.momentumScore.toFixed(2)}%`}
              sub="Recent directional strength"
              color={phData.momentumScore > 0.1 ? G : phData.momentumScore < -0.1 ? R : '#6b7280'} />
            <StatTile label="Session Candles" value={String(phData.candleCount)}
              sub={`${phData.phCandleCount} in power hour window`} />
          </div>

          {/* Signals */}
          {phData.signals.length > 0 ? (
            <CpCard>
              <SecHeader icon={<Zap size={14} />} title="Active Setup Signals"
                right={<Chip color={A}>{phData.signals.length} detected</Chip>} />
              <div className="grid gap-3 sm:grid-cols-2">
                {phData.signals.map((sig, i) => <SignalRow key={i} signal={sig} />)}
              </div>
            </CpCard>
          ) : (
            <div className="p-5 rounded-xl text-center" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Activity size={24} className="mx-auto mb-2 opacity-30" style={{ color: '#6b7280' }} />
              <p className="text-sm" style={{ color: '#6b7280' }}>No strong signals detected. Price may be mid-range — wait for a clear VWAP or HOD/LOD test.</p>
            </div>
          )}

          {/* Options */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { title: 'Call Scalps — Bullish', picks: callPicks, type: 'call' as const, col: G },
              { title: 'Put Scalps — Bearish',  picks: putPicks,  type: 'put' as const,  col: R },
            ].map(({ title, picks, type, col }) => (
              <CpCard key={type}>
                <SecHeader icon={type === 'call' ? <TrendingUp size={14} style={{ color: G }} /> : <TrendingDown size={14} style={{ color: R }} />}
                  title={title}
                  right={<Chip color={phData.bias === (type === 'call' ? 'bullish' : 'bearish') ? col : '#6b7280'}>
                    {phData.bias === (type === 'call' ? 'bullish' : 'bearish') ? 'PREFERRED' : 'SECONDARY'}
                  </Chip>} />
                <p className="text-xs mb-3" style={{ color: '#6b7280' }}>0–3 DTE · budget ${budget} · tight spreads · delta near {type === 'call' ? '0.50' : '-0.50'}</p>
                {!picks.length
                  ? <div className="text-center py-8" style={{ color: '#374151', fontSize: '13px' }}>No qualifying {type}s. Try increasing budget or use a higher-volume symbol.</div>
                  : <div className="space-y-2">{picks.map((opt, i) => <OptionCard key={opt.contractSymbol} opt={opt} rank={i+1} budget={budget} />)}</div>}
              </CpCard>
            ))}
          </div>

          {/* Pre-trade checklist */}
          <CpCard>
            <SecHeader icon={<CheckCircle size={14} />} title="Pre-Trade Execution Checklist"
              right={<Chip color={G}>{Object.values(checklist).filter(Boolean).length}/{CHECKLIST_ITEMS.length}</Chip>} />
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item, i) => (
                <label key={i} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg transition-colors"
                  style={{ background: checklist[item] ? `${G}08` : 'transparent' }}
                  onMouseEnter={e => !checklist[item] && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => !checklist[item] && (e.currentTarget.style.background = 'transparent')}>
                  <input type="checkbox" checked={!!checklist[item]}
                    onChange={e => setChecklist(prev => ({ ...prev, [item]: e.target.checked }))}
                    className="sr-only" />
                  <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all"
                    style={{ background: checklist[item] ? G : 'transparent', border: `1px solid ${checklist[item] ? G : 'rgba(255,255,255,0.2)'}` }}>
                    {checklist[item] && <svg width={10} height={10} viewBox="0 0 10 10"><polyline points="1.5,5 3.5,7.5 8.5,2.5" fill="none" stroke="#0d0f14" strokeWidth={1.5} /></svg>}
                  </div>
                  <span style={{ color: checklist[item] ? '#f0f0f0' : '#6b7280', fontSize: '13px', textDecoration: checklist[item] ? 'line-through' : 'none' }}>{item}</span>
                </label>
              ))}
            </div>
            {Object.values(checklist).filter(Boolean).length === CHECKLIST_ITEMS.length && (
              <div className="mt-3 p-3 rounded-lg text-center" style={{ background: `${G}10`, border: `1px solid ${G}30` }}>
                <span style={{ color: G, fontWeight: 700 }}>✓ All conditions met — cleared to execute</span>
              </div>
            )}
          </CpCard>

          {/* Playbook */}
          <CpCard>
            <SecHeader icon={<Target size={14} />} title="Power Hour Playbook — Pick ONE Setup"
              right={activeMode && <Chip color={activeMode === 'NO TRADE' || activeMode === 'WAIT FOR SIGNAL' ? R : G}>ACTIVE: {activeMode}</Chip>} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PLAYBOOK.map(play => {
                const col = play.dir === 'bullish' ? G : play.dir === 'bearish' ? R : '#60a5fa';
                const isActive = activeMode === play.title.toUpperCase();
                return (
                  <div key={play.title} className="rounded-xl p-3 transition-all"
                    style={{ background: isActive ? `${col}10` : 'rgba(255,255,255,0.03)', border: isActive ? `1px solid ${col}50` : '1px solid rgba(255,255,255,0.08)', boxShadow: isActive ? `0 0 12px ${col}15` : 'none' }}>
                    {isActive && <div className="flex items-center gap-1 mb-2"><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: col }} /><span className="text-[10px] font-bold" style={{ color: col }}>ACTIVE</span></div>}
                    <div className="font-semibold text-sm mb-2" style={{ color: col }}>{play.title}</div>
                    <div className="space-y-1.5 text-xs" style={{ color: '#6b7280' }}>
                      <div><span className="font-semibold" style={{ color: '#f0f0f0' }}>Entry: </span>{play.entry}</div>
                      <div><span className="font-semibold" style={{ color: '#f0f0f0' }}>Target: </span>{play.target}</div>
                      <div><span className="font-semibold" style={{ color: '#f0f0f0' }}>Stop: </span>{play.stop}</div>
                      <div className="font-semibold mt-1" style={{ color: col }}>→ {play.instrument}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CpCard>

          {/* Rules */}
          <CpCard>
            <SecHeader icon={<Shield size={14} />} title="Power Hour Rules — Non-Negotiable" />
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              {RULES.map(([rule, detail]) => (
                <div key={rule} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="font-semibold mb-1" style={{ color: '#f0f0f0' }}>{rule}</p>
                  <p style={{ color: '#6b7280' }}>{detail}</p>
                </div>
              ))}
            </div>
          </CpCard>
        </div>
      )}

      {!phData && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: `${R}08`, border: `1px solid ${R}20` }}>
            <Flame size={28} style={{ color: R, opacity: 0.5 }} />
          </div>
          <p style={{ color: '#6b7280', fontWeight: 500, fontSize: '16px' }}>Select a symbol and click Analyze Power Hour</p>
          <p className="text-sm text-center max-w-md" style={{ color: '#374151' }}>
            Fetches today&apos;s intraday data to calculate VWAP, HOD/LOD, power hour levels,
            momentum signals, and the best 0DTE scalp options within your budget.
          </p>
        </div>
      )}
    </AppShell>
  );
}
