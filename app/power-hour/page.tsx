'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Clock, TrendingUp, TrendingDown, Activity, Zap,
  AlertCircle, Shield, Flame,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Signal {
  type: string;
  description: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PowerHourData {
  success: boolean;
  symbol: string;
  currentPrice: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  vwap: number;
  phHigh: number | null;
  phLow: number | null;
  phOpen: number | null;
  bias: 'bullish' | 'bearish' | 'neutral';
  momentumScore: number;
  volumeSurge: number;
  signals: Signal[];
  sessionPhase: 'pre_power_hour' | 'power_hour' | 'post_power_hour';
  minsToPhStart: number;
  minsInPh: number | null;
  minsRemainingInPh: number | null;
  totalSessionVolume: number;
  avgCandleVolume: number;
  lastVolume: number;
  candleCount: number;
  phCandleCount: number;
  recentCandles: Candle[];
  fetchedAt: string;
  error?: string;
}

interface OptionPick {
  contractSymbol: string;
  strike: number;
  expiration: string | null;
  dte: number | null;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number | null;
  costPerContract: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYMBOLS = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL', 'AMD', 'META', 'MSFT', 'IWM', 'TQQQ', 'SQQQ', 'PLTR', 'SOFI'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtVol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

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
  const etOffset = getETOffsetHours();
  const etMs = now.getTime() + etOffset * 3600 * 1000;
  const etDate = new Date(etMs);
  const h = etDate.getUTCHours();
  const m = etDate.getUTCMinutes();
  const s = etDate.getUTCSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return {
    timeStr: `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm} ET`,
    etHour: h,
    etMin: m,
  };
}

function scoreOption(o: OptionPick, budget: number): number {
  if (o.ask * 100 > budget) return -1;
  if ((o.volume ?? 0) < 20 || (o.openInterest ?? 0) < 50) return -1;
  const spreadRatio = o.ask > 0 ? (o.ask - o.bid) / o.ask : 1;
  if (spreadRatio > 0.20) return -1;

  const volScore    = Math.min((o.volume ?? 0) / 500, 1) * 30;
  const oiScore     = Math.min((o.openInterest ?? 0) / 2000, 1) * 20;
  const deltaScore  = o.delta != null ? Math.max(0, 1 - Math.abs(Math.abs(o.delta) - 0.50) * 4) * 30 : 0;
  const spreadScore = Math.max(0, 1 - spreadRatio * 5) * 20;
  return volScore + oiScore + deltaScore + spreadScore;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, colorClass = 'text-gray-900', bgClass = 'bg-gray-50 border-gray-100',
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
  bgClass?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${bgClass}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const colors =
    signal.direction === 'bullish' ? 'bg-green-50 border-green-200 text-green-800' :
    signal.direction === 'bearish' ? 'bg-red-50 border-red-200 text-red-800' :
                                     'bg-gray-50 border-gray-200 text-gray-700';
  const strengthBadge =
    signal.strength === 'strong'   ? 'bg-yellow-100 text-yellow-800' :
    signal.strength === 'moderate' ? 'bg-blue-100 text-blue-800' :
                                     'bg-gray-100 text-gray-600';
  return (
    <div className={`rounded-xl border p-3 ${colors}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-semibold text-sm">{signal.type}</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${strengthBadge}`}>
          {signal.strength}
        </span>
      </div>
      <p className="text-xs leading-relaxed">{signal.description}</p>
    </div>
  );
}

function OptionPickCard({
  opt, rank, budget,
}: {
  opt: OptionPick;
  rank: number;
  budget: number;
}) {
  const breakeven = opt.type === 'call' ? opt.strike + opt.ask : opt.strike - opt.ask;
  const spreadPct = opt.ask > 0 ? ((opt.ask - opt.bid) / opt.ask * 100).toFixed(0) : '—';
  const overBudget = opt.ask * 100 > budget;

  return (
    <div className={`rounded-xl border p-3 text-xs transition-colors ${
      rank === 1
        ? opt.type === 'call'
          ? 'border-green-200 bg-green-50/60'
          : 'border-red-200 bg-red-50/60'
        : 'border-gray-100 bg-gray-50/40'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-gray-400 font-semibold">#{rank}</span>
          <span className="font-bold text-gray-900 text-sm">
            {fmtPrice(opt.strike)} {opt.type.toUpperCase()}
          </span>
          {opt.expiration && <span className="text-gray-500">{opt.expiration}</span>}
          {opt.dte != null && (
            <Badge variant={opt.dte === 0 ? 'danger' : opt.dte === 1 ? 'warning' : 'default'}>
              {opt.dte === 0 ? '0DTE' : `${opt.dte}d`}
            </Badge>
          )}
        </div>
        {rank === 1 && (
          <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
            Top Scalp
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mb-2">
        {[
          ['Ask',    fmtPrice(opt.ask)],
          ['Bid',    fmtPrice(opt.bid)],
          ['Spread', `${spreadPct}%`],
          ['Volume', (opt.volume ?? 0).toLocaleString()],
          ['OI',     (opt.openInterest ?? 0).toLocaleString()],
          ['IV',     opt.impliedVolatility > 0 ? `${(opt.impliedVolatility * 100).toFixed(0)}%` : '—'],
          ['Delta',  opt.delta != null ? opt.delta.toFixed(2) : '—'],
          ['BE',     fmtPrice(breakeven)],
          ['Cost',   `$${(opt.ask * 100).toFixed(0)}`],
        ].map(([label, val]) => (
          <div key={label}>
            <span className="text-gray-400">{label} </span>
            <span className="font-medium text-gray-800">{val}</span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-gray-200/70">
        <span className={`font-bold ${overBudget ? 'text-red-600' : 'text-green-700'}`}>
          ${(opt.ask * 100).toFixed(0)}/contract
        </span>
        {overBudget && <span className="text-red-500 ml-1 text-xs">(over budget)</span>}
        <span className="text-gray-400 ml-2">
          Max {Math.floor(budget / (opt.ask * 100))} contracts in budget
        </span>
      </div>
    </div>
  );
}

// ─── Playbook entries ─────────────────────────────────────────────────────────

const PLAYBOOK = [
  {
    title: 'VWAP Reclaim',
    icon: <TrendingUp size={16} />,
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-100',
    entry: 'Price dips to VWAP then closes a 1-min candle above it with volume surge',
    target: '0.25%–0.5% above VWAP',
    stop: 'Close back below VWAP',
    direction: 'Calls',
  },
  {
    title: 'HOD Breakout',
    icon: <Flame size={16} />,
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-100',
    entry: 'Price consolidates within $0.10 of day high, then prints a candle close above HOD',
    target: 'HOD + (HOD – prior support)',
    stop: 'Back inside prior consolidation',
    direction: 'Calls (0DTE)',
  },
  {
    title: 'LOD Breakdown',
    icon: <TrendingDown size={16} />,
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-100',
    entry: 'Price consolidates within $0.10 of day low, then closes below LOD with volume',
    target: 'LOD – (prior resistance – LOD)',
    stop: 'Close back above LOD',
    direction: 'Puts (0DTE)',
  },
  {
    title: 'VWAP Rejection',
    icon: <TrendingDown size={16} />,
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-100',
    entry: 'Price bounces up to VWAP from below, fails to close above it — bearish engulf on 1m',
    target: '0.25%–0.5% below VWAP',
    stop: 'Close above VWAP',
    direction: 'Puts',
  },
  {
    title: 'Momentum Continuation',
    icon: <Zap size={16} />,
    color: 'text-purple-700',
    bg: 'bg-purple-50 border-purple-100',
    entry: 'Strong directional trend entering 3pm window — wait for a 1-min flag/pause then enter on the break',
    target: '1× the size of the flag',
    stop: 'Below the flag low (calls) or above flag high (puts)',
    direction: 'Follow the trend',
  },
  {
    title: 'Mean Reversion',
    icon: <Activity size={16} />,
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-100',
    entry: 'Price is >0.5% extended from VWAP heading into 3pm — wait for a 1-min reversal candle near HOD/LOD',
    target: 'VWAP',
    stop: 'New HOD (if fading) or new LOD (if buying dip)',
    direction: 'Against prior trend',
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

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

  // Live ET clock
  useEffect(() => {
    const id = setInterval(() => setEtTime(getETTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [phRes, optRes] = await Promise.all([
        fetch(`/api/power-hour?symbol=${symbol}`),
        fetch(`/api/options-chain?symbol=${symbol}`),
      ]);

      const ph: PowerHourData = await phRes.json();
      const opt               = await optRes.json();

      if (!ph.success) throw new Error(ph.error ?? 'Power hour analysis failed');
      setPhData(ph);

      const filterAndRank = (options: OptionPick[]): OptionPick[] =>
        options
          .filter(o =>
            o.ask > 0 &&
            o.ask * 100 <= budget &&
            (o.dte == null || o.dte <= 3) &&
            (o.volume ?? 0) >= 20 &&
            (o.openInterest ?? 0) >= 50
          )
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

  // Session phase display helpers
  const phaseLabel =
    phData?.sessionPhase === 'power_hour'     ? 'In Power Hour' :
    phData?.sessionPhase === 'pre_power_hour' ? 'Pre Power Hour' :
                                                'After Power Hour';

  const phaseBadgeVariant =
    phData?.sessionPhase === 'power_hour'     ? 'danger' :
    phData?.sessionPhase === 'pre_power_hour' ? 'warning' : 'default';

  const biasBg =
    phData?.bias === 'bullish' ? 'bg-green-50 border-green-200 text-green-800' :
    phData?.bias === 'bearish' ? 'bg-red-50 border-red-200 text-red-800' :
                                 'bg-gray-50 border-gray-200 text-gray-700';

  const etHourMin = etTime.etHour * 60 + etTime.etMin;
  const inPHWindow = etHourMin >= 15 * 60 && etHourMin < 15 * 60 + 35;

  return (
    <AppShell title="Power Hour">
      {/* Disclaimer */}
      <div className="p-3 mb-5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <strong>Education Only:</strong> Power hour analysis uses ~15–20 min delayed Yahoo Finance data.
        All setups are for learning purposes only. Options can lose 100% of value. Always verify levels
        in your broker before entering any trade.
      </div>

      {/* Hero banner */}
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700">
              <Flame size={15} /> Power Hour
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-gray-900">
              3:00 PM – 3:35 PM ET Scalp Analysis
            </h1>
            <p className="mt-2 text-sm text-gray-500 max-w-2xl">
              The prime scalping window before the final close push. Identify VWAP, HOD/LOD setups,
              momentum continuations, and the best 0DTE options for fast directional scalps.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2 border font-mono text-sm font-semibold ${
              inPHWindow
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}>
              <Clock size={15} />
              {etTime.timeStr}
            </div>
            {inPHWindow && (
              <span className="text-xs font-bold text-red-600 animate-pulse">
                POWER HOUR ACTIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Symbol</label>
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none bg-white"
          >
            {SYMBOLS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Options Budget ($)</label>
          <input
            type="number"
            value={budget}
            onChange={e => setBudget(Math.max(50, Number(e.target.value)))}
            min={50}
            step={50}
            className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
          />
        </div>

        <Button onClick={analyze} loading={loading}>
          <Flame size={14} className="mr-1.5" />
          Analyze Power Hour
        </Button>

        {lastUpdated && (
          <span className="text-xs text-gray-400 self-center">Updated: {lastUpdated}</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-20">
          <div className="w-8 h-8 border-[3px] border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Fetching {symbol} intraday data and options chain…</p>
        </div>
      )}

      {/* Results */}
      {phData && !loading && (
        <div className="space-y-5">

          {/* Session phase banner */}
          <div className={`rounded-xl p-4 border flex flex-wrap items-center justify-between gap-4 ${biasBg}`}>
            <div className="flex items-center gap-3">
              {phData.bias === 'bullish'
                ? <TrendingUp size={22} />
                : phData.bias === 'bearish'
                  ? <TrendingDown size={22} />
                  : <Activity size={22} />}
              <div>
                <p className="font-bold text-lg">{phData.bias.toUpperCase()} BIAS</p>
                <p className="text-sm">
                  {phData.currentPrice > phData.vwap
                    ? `Above VWAP by $${(phData.currentPrice - phData.vwap).toFixed(2)}`
                    : `Below VWAP by $${(phData.vwap - phData.currentPrice).toFixed(2)}`}
                  {' · '}
                  {phData.volumeSurge >= 1.5
                    ? `${phData.volumeSurge.toFixed(1)}x volume surge`
                    : `${phData.volumeSurge.toFixed(1)}x avg volume`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={phaseBadgeVariant}>{phaseLabel}</Badge>
              {phData.sessionPhase === 'pre_power_hour' && phData.minsToPhStart > 0 && (
                <span className="text-sm font-semibold">
                  {phData.minsToPhStart}m until 3:00 PM ET
                </span>
              )}
              {phData.sessionPhase === 'power_hour' && phData.minsRemainingInPh != null && (
                <span className="text-sm font-semibold text-red-700">
                  {phData.minsRemainingInPh}m remaining
                </span>
              )}
            </div>
          </div>

          {/* Market stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Current Price"
              value={fmtPrice(phData.currentPrice)}
              sub={`Open: ${fmtPrice(phData.dayOpen)}`}
              colorClass={phData.currentPrice >= phData.dayOpen ? 'text-green-700' : 'text-red-700'}
              bgClass={phData.currentPrice >= phData.dayOpen ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}
            />
            <StatCard
              label="VWAP"
              value={fmtPrice(phData.vwap)}
              sub={phData.currentPrice > phData.vwap ? 'Price above VWAP' : 'Price below VWAP'}
              colorClass="text-purple-700"
              bgClass="bg-purple-50 border-purple-100"
            />
            <StatCard
              label="Day High"
              value={fmtPrice(phData.dayHigh)}
              sub={`Distance: $${(phData.dayHigh - phData.currentPrice).toFixed(2)}`}
              colorClass="text-green-700"
              bgClass="bg-green-50 border-green-100"
            />
            <StatCard
              label="Day Low"
              value={fmtPrice(phData.dayLow)}
              sub={`Distance: $${(phData.currentPrice - phData.dayLow).toFixed(2)}`}
              colorClass="text-red-700"
              bgClass="bg-red-50 border-red-100"
            />
          </div>

          {/* Power hour levels (if in/after window) */}
          {(phData.phHigh !== null || phData.phLow !== null) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {phData.phOpen !== null && (
                <StatCard
                  label="Power Hour Open (3:00 PM)"
                  value={fmtPrice(phData.phOpen)}
                  sub="Entry reference"
                  colorClass="text-orange-700"
                  bgClass="bg-orange-50 border-orange-100"
                />
              )}
              {phData.phHigh !== null && (
                <StatCard
                  label="Power Hour High"
                  value={fmtPrice(phData.phHigh)}
                  sub="Breakout above = momentum"
                  colorClass="text-green-700"
                  bgClass="bg-green-50 border-green-100"
                />
              )}
              {phData.phLow !== null && (
                <StatCard
                  label="Power Hour Low"
                  value={fmtPrice(phData.phLow)}
                  sub="Breakdown below = momentum"
                  colorClass="text-red-700"
                  bgClass="bg-red-50 border-red-100"
                />
              )}
            </div>
          )}

          {/* Volume + Momentum row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Volume Surge"
              value={`${phData.volumeSurge.toFixed(1)}x`}
              sub={`Last candle: ${fmtVol(phData.lastVolume)} vs avg ${fmtVol(Math.round(phData.avgCandleVolume))}`}
              colorClass={phData.volumeSurge >= 2 ? 'text-orange-700' : phData.volumeSurge >= 1.2 ? 'text-yellow-700' : 'text-gray-600'}
              bgClass={phData.volumeSurge >= 2 ? 'bg-orange-50 border-orange-100' : phData.volumeSurge >= 1.2 ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50 border-gray-100'}
            />
            <StatCard
              label="10-Candle Momentum"
              value={`${phData.momentumScore >= 0 ? '+' : ''}${phData.momentumScore.toFixed(2)}%`}
              sub="Recent directional strength"
              colorClass={phData.momentumScore > 0.1 ? 'text-green-700' : phData.momentumScore < -0.1 ? 'text-red-700' : 'text-gray-600'}
              bgClass={phData.momentumScore > 0.1 ? 'bg-green-50 border-green-100' : phData.momentumScore < -0.1 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}
            />
            <StatCard
              label="Session Candles"
              value={String(phData.candleCount)}
              sub={`${phData.phCandleCount} in power hour window`}
              colorClass="text-gray-700"
              bgClass="bg-gray-50 border-gray-100"
            />
          </div>

          {/* Signals */}
          {phData.signals.length > 0 && (
            <Card>
              <CardHeader
                title="Active Setup Signals"
                icon={<Zap size={16} className="text-yellow-500" />}
                subtitle={`${phData.signals.length} signal${phData.signals.length !== 1 ? 's' : ''} detected for ${phData.symbol}`}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {phData.signals.map((signal, i) => (
                  <SignalCard key={i} signal={signal} />
                ))}
              </div>
            </Card>
          )}

          {phData.signals.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 text-center">
              <Activity size={24} className="mx-auto mb-2 opacity-30" />
              No strong signals detected. Price may be mid-range — wait for a clear VWAP or HOD/LOD test.
            </div>
          )}

          {/* Options picks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                title="Call Scalps — Bullish Power Hour"
                icon={<TrendingUp size={16} className="text-green-600" />}
                action={
                  <Badge variant={phData.bias === 'bullish' ? 'success' : 'default'}>
                    {phData.bias === 'bullish' ? 'Preferred' : 'Secondary'}
                  </Badge>
                }
              />
              <p className="text-xs text-gray-400 mb-3">
                Filtered for 0–3 DTE · budget <strong>${budget}</strong> · tight spreads · delta near 0.50
              </p>
              {callPicks.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
                  No qualifying calls found. Try increasing budget or use a higher-volume symbol.
                </div>
              ) : (
                <div className="space-y-2">
                  {callPicks.map((opt, i) => (
                    <OptionPickCard key={opt.contractSymbol} opt={opt} rank={i + 1} budget={budget} />
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Put Scalps — Bearish Power Hour"
                icon={<TrendingDown size={16} className="text-red-600" />}
                action={
                  <Badge variant={phData.bias === 'bearish' ? 'danger' : 'default'}>
                    {phData.bias === 'bearish' ? 'Preferred' : 'Secondary'}
                  </Badge>
                }
              />
              <p className="text-xs text-gray-400 mb-3">
                Filtered for 0–3 DTE · budget <strong>${budget}</strong> · tight spreads · delta near -0.50
              </p>
              {putPicks.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <TrendingDown size={28} className="mx-auto mb-2 opacity-30" />
                  No qualifying puts found. Try increasing budget or use a higher-volume symbol.
                </div>
              ) : (
                <div className="space-y-2">
                  {putPicks.map((opt, i) => (
                    <OptionPickCard key={opt.contractSymbol} opt={opt} rank={i + 1} budget={budget} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Scalp playbook */}
          <Card>
            <CardHeader
              title="Power Hour Scalp Playbook"
              icon={<BookOpen size={16} />}
              subtitle="3:00–3:35 PM ET setup guide — pick one setup and stick to it"
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PLAYBOOK.map(play => (
                <div key={play.title} className={`rounded-xl border p-3 ${play.bg}`}>
                  <div className={`flex items-center gap-2 font-semibold text-sm mb-2 ${play.color}`}>
                    {play.icon}
                    {play.title}
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <div>
                      <span className="font-semibold text-gray-700">Entry: </span>{play.entry}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Target: </span>{play.target}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Stop: </span>{play.stop}
                    </div>
                    <div className={`font-semibold mt-1 ${play.color}`}>
                      → {play.direction}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Rules */}
          <Card>
            <CardHeader title="Power Hour Rules" icon={<Shield size={16} className="text-purple-600" />} />
            <div className="grid gap-3 sm:grid-cols-2 text-xs text-gray-600">
              {[
                ['Max hold time', 'Exit all positions by 3:35 PM ET. Never hold into close.'],
                ['0DTE only', 'Use 0 or 1 DTE options. Theta accelerates — you need a fast move, not time.'],
                ['Confirm with volume', 'Only enter if the breakout/reclaim candle has above-average volume.'],
                ['One setup at a time', 'Pick the clearest signal and execute it. Do not chase multiple setups.'],
                ['No entries after 3:30', "If you haven't entered by 3:30 PM, sit out. Spread blowout risk is high."],
                ['Size down', 'Use 1–2 contracts max. Power hour can reverse in one candle.'],
                ['Target 20–50%', 'Take the money at 20–30% gain. Power hour moves fast but also reverses fast.'],
                ['Stop at 30–40%', "If the trade moves against you 30–40%, cut it. Don't let a small loss become a wipe."],
              ].map(([rule, detail]) => (
                <div key={rule} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="font-semibold text-gray-800 mb-1">{rule}</p>
                  <p>{detail}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!phData && !loading && !error && (
        <div className="text-center py-20">
          <Flame size={48} className="text-orange-200 mx-auto mb-4" />
          <p className="text-gray-600 font-medium text-lg">Select a symbol and click Analyze Power Hour</p>
          <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto">
            Fetches today&apos;s intraday data to calculate VWAP, HOD/LOD, power hour levels,
            momentum signals, and the best 0DTE scalp options within your budget.
          </p>
        </div>
      )}
    </AppShell>
  );
}

// Needed for playbook
function BookOpen({ size, ...props }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
