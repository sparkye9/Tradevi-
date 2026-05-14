'use client';

import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, DollarSign,
  Target, AlertCircle, Info,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ORBData {
  success: boolean;
  symbol: string;
  orbHigh: number;
  orbLow: number;
  orbMid: number;
  orbRange: number;
  currentPrice: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  extensions: { label: string; price: number; direction: 'up' | 'down'; multiplier: number }[];
  candleTime: string;
  timeDiffMinutes: number;
  hasValidOrb: boolean;
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

const SYMBOLS = [
  'QQQ', 'SPY', 'NVDA', 'TSLA', 'AAPL', 'AMD',
  'META', 'MSFT', 'SQQQ', 'TQQQ', 'IWM', 'PLTR', 'SOFI', 'USO',
];

const UP_COLORS   = ['#16a34a', '#15803d', '#166534', '#14532d'];
const DOWN_COLORS = ['#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreOption(o: OptionPick, maxCostPerContract: number): number {
  if (o.ask * 100 > maxCostPerContract) return -1;
  const vol   = Math.min((o.volume ?? 0) / 1000, 1) * 35;
  const oi    = Math.min((o.openInterest ?? 0) / 5000, 1) * 25;
  const delta = o.delta != null ? Math.min(Math.abs(o.delta) * 2, 1) * 25 : 0;
  const affor = Math.max(0, 1 - (o.ask * 100) / maxCostPerContract) * 15;
  return vol + oi + delta + affor;
}

function fmtPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

// ─── Sub-component: single option card ────────────────────────────────────────

function OptionPickCard({
  opt, rank, isPreferred, budget, contracts,
}: {
  opt: OptionPick;
  rank: number;
  isPreferred: boolean;
  budget: number;
  contracts: number;
}) {
  const totalCost    = opt.ask * 100 * contracts;
  const maxContracts = Math.floor(budget / (opt.ask * 100));
  const breakeven    = opt.type === 'call'
    ? opt.strike + opt.ask
    : opt.strike - opt.ask;
  const overBudget   = totalCost > budget;

  return (
    <div className={`rounded-xl border p-3 text-xs transition-colors ${
      isPreferred
        ? opt.type === 'call'
          ? 'border-green-200 bg-green-50/60'
          : 'border-red-200 bg-red-50/60'
        : 'border-gray-100 bg-gray-50/40'
    }`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-gray-400 font-semibold">#{rank}</span>
          <span className="font-bold text-gray-900 text-sm">
            {fmtPrice(opt.strike)} {opt.type.toUpperCase()}
          </span>
          {opt.expiration && (
            <span className="text-gray-500">{opt.expiration}</span>
          )}
          {opt.dte != null && (
            <Badge
              variant={opt.dte === 0 ? 'danger' : opt.dte <= 3 ? 'warning' : opt.dte <= 14 ? 'default' : 'success'}
            >
              {opt.dte}d
            </Badge>
          )}
        </div>
        {isPreferred && rank === 1 && (
          <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
            Top Pick
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mb-2.5">
        {[
          ['Ask',   fmtPrice(opt.ask)],
          ['Bid',   fmtPrice(opt.bid)],
          ['Spread', fmtPrice(opt.ask - opt.bid)],
          ['Volume', (opt.volume ?? 0).toLocaleString()],
          ['OI',    (opt.openInterest ?? 0).toLocaleString()],
          ['IV',    opt.impliedVolatility > 0 ? `${(opt.impliedVolatility * 100).toFixed(0)}%` : '—'],
          ['Delta', opt.delta != null ? opt.delta.toFixed(2) : '—'],
          ['BE',    fmtPrice(breakeven)],
          ['DTE',   opt.dte != null ? `${opt.dte}d` : '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <span className="text-gray-400">{label} </span>
            <span className="font-medium text-gray-800">{val}</span>
          </div>
        ))}
      </div>

      {/* Budget row */}
      <div className="pt-2 border-t border-gray-200/70 flex items-center justify-between">
        <div className="text-gray-600">
          <span className="font-semibold text-gray-900">{contracts}x</span>
          {' = '}
          <span className={`font-bold ${overBudget ? 'text-red-600' : 'text-green-700'}`}>
            ${totalCost.toFixed(0)}
          </span>
          {overBudget && <span className="text-red-500 ml-1">(over budget)</span>}
        </div>
        <div className="text-gray-400">
          Max: <span className="font-medium text-gray-700">{maxContracts} contracts</span>
        </div>
      </div>
    </div>
  );
}

// ─── Timeframe options ────────────────────────────────────────────────────────

const TIMEFRAMES = [1, 5, 10, 15, 30] as const;
type Timeframe = typeof TIMEFRAMES[number];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrbAnalysisPage() {
  const [symbol,    setSymbol]    = useState('QQQ');
  const [timeframe, setTimeframe] = useState<Timeframe>(5);
  const [budget,    setBudget]    = useState(500);
  const [contracts, setContracts] = useState(1);
  const [orbData,   setOrbData]   = useState<ORBData | null>(null);
  const [callPicks, setCallPicks] = useState<OptionPick[]>([]);
  const [putPicks,  setPutPicks]  = useState<OptionPick[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const analyze = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [orbRes, optRes] = await Promise.all([
        fetch(`/api/orb?symbol=${symbol}&timeframe=${timeframe}`),
        fetch(`/api/options-chain?symbol=${symbol}`),
      ]);

      const orb: ORBData  = await orbRes.json();
      const opt           = await optRes.json();

      if (!orb.success) throw new Error(orb.error ?? 'ORB analysis failed');
      setOrbData(orb);

      const maxCostPerContract = budget / contracts;

      const filterAndRank = (options: OptionPick[]): OptionPick[] =>
        options
          .filter(o =>
            o.ask > 0 &&
            o.ask * 100 <= maxCostPerContract &&
            (o.volume ?? 0) >= 5 &&
            (o.openInterest ?? 0) >= 20 &&
            (o.dte == null || (o.dte >= 0 && o.dte <= 60))
          )
          .map(o => ({ ...o, _score: scoreOption(o, maxCostPerContract) }))
          .sort((a: any, b: any) => b._score - a._score)
          .slice(0, 4);

      setCallPicks(filterAndRank(opt.calls ?? []));
      setPutPicks(filterAndRank(opt.puts ?? []));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    }
    setLoading(false);
  }, [symbol, timeframe, budget, contracts]);

  // Build scatter chart series from ORB data
  const chartLevels = orbData
    ? [
        { name: `Current (${fmtPrice(orbData.currentPrice)})`, color: '#f97316', price: orbData.currentPrice },
        { name: `ORB High (${fmtPrice(orbData.orbHigh)})`,     color: UP_COLORS[0],   price: orbData.orbHigh },
        { name: `ORB Mid (${fmtPrice(orbData.orbMid)})`,       color: '#9ca3af',  price: orbData.orbMid },
        { name: `ORB Low (${fmtPrice(orbData.orbLow)})`,       color: DOWN_COLORS[0], price: orbData.orbLow },
        ...orbData.extensions.filter(e => e.direction === 'up').map((e, i) => ({
          name:  `${e.label} (${fmtPrice(e.price)})`,
          color: UP_COLORS[i] ?? UP_COLORS[UP_COLORS.length - 1],
          price: e.price,
        })),
        ...orbData.extensions.filter(e => e.direction === 'down').map((e, i) => ({
          name:  `${e.label} (${fmtPrice(e.price)})`,
          color: DOWN_COLORS[i] ?? DOWN_COLORS[DOWN_COLORS.length - 1],
          price: e.price,
        })),
      ]
    : [];

  const allPrices = chartLevels.map(l => l.price);
  const chartMin  = allPrices.length ? Math.min(...allPrices) - 0.3 : 0;
  const chartMax  = allPrices.length ? Math.max(...allPrices) + 0.3 : 100;

  const biasBg =
    orbData?.bias === 'bullish' ? 'bg-green-50 border-green-200 text-green-800' :
    orbData?.bias === 'bearish' ? 'bg-red-50 border-red-200 text-red-800' :
    'bg-gray-50 border-gray-200 text-gray-700';

  return (
    <AppShell title="ORB Analysis">
      {/* Disclaimer */}
      <div className="p-3 mb-5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <strong>Education Only:</strong> ORB levels are for reference. Data is ~15-20 min delayed (Yahoo Finance).
        Robinhood does not have a public API — prices shown are sourced from Yahoo Finance delayed data.
        Always verify levels in your broker before entering any trade.
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
          <label className="text-xs font-medium text-gray-600 block mb-1">ORB Timeframe</label>
          <div className="flex gap-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  timeframe === tf
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-700'
                }`}
              >
                {tf}m
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Budget ($)</label>
          <input
            type="number"
            value={budget}
            onChange={e => setBudget(Math.max(50, Number(e.target.value)))}
            min={50}
            step={50}
            className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Contracts</label>
          <input
            type="number"
            value={contracts}
            onChange={e => setContracts(Math.max(1, Math.min(50, Number(e.target.value))))}
            min={1}
            max={50}
            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
          />
        </div>

        <Button onClick={analyze} loading={loading}>
          <Activity size={14} className="mr-1.5" />
          Analyze ORB
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

      {/* Loading spinner */}
      {loading && (
        <div className="text-center py-20">
          <div className="w-8 h-8 border-[3px] border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Fetching {symbol} {timeframe}m ORB candle and options chain…</p>
        </div>
      )}

      {/* Results */}
      {orbData && !loading && (
        <div className="space-y-5">

          {/* ORB stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'ORB High (8AM)', value: fmtPrice(orbData.orbHigh), color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
              { label: 'ORB Low (8AM)',  value: fmtPrice(orbData.orbLow),  color: 'text-red-700',   bg: 'bg-red-50 border-red-100' },
              { label: 'ORB Mid (Pivot)',value: fmtPrice(orbData.orbMid),  color: 'text-gray-700',  bg: 'bg-gray-50 border-gray-100' },
              { label: 'ORB Range',      value: fmtPrice(orbData.orbRange),color: 'text-purple-700',bg: 'bg-purple-50 border-purple-100' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-4 border`}>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Candle validity warning */}
          {!orbData.hasValidOrb && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2 text-xs text-yellow-800">
              <Info size={13} />
              Nearest candle was <strong>{orbData.timeDiffMinutes} min</strong> from 8AM ET (
              {new Date(orbData.candleTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} local).
              Market may be closed or pre-market data unavailable.
            </div>
          )}

          {/* Bias banner */}
          <div className={`rounded-xl p-4 border ${biasBg} flex flex-wrap items-center gap-4`}>
            <div className="flex items-center gap-2">
              {orbData.bias === 'bullish'
                ? <TrendingUp size={20} />
                : orbData.bias === 'bearish'
                  ? <TrendingDown size={20} />
                  : <Activity size={20} />}
              <span className="font-bold text-lg">{orbData.bias.toUpperCase()}</span>
            </div>
            <div className="text-sm font-medium">Current: {fmtPrice(orbData.currentPrice)}</div>
            <div className="text-sm">
              {orbData.currentPrice > orbData.orbHigh ? (
                <>Above ORB High by <strong>{fmtPrice(orbData.currentPrice - orbData.orbHigh)}</strong> — breakout zone, target calls</>
              ) : orbData.currentPrice < orbData.orbLow ? (
                <>Below ORB Low by <strong>{fmtPrice(orbData.orbLow - orbData.currentPrice)}</strong> — breakdown zone, target puts</>
              ) : orbData.currentPrice >= orbData.orbMid ? (
                <>Above ORB Mid by <strong>{fmtPrice(orbData.currentPrice - orbData.orbMid)}</strong> — inside range, leaning long</>
              ) : (
                <>Below ORB Mid by <strong>{fmtPrice(orbData.orbMid - orbData.currentPrice)}</strong> — inside range, leaning short</>
              )}
            </div>
          </div>

          {/* Chart + Extension table */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Scatter chart */}
            <Card className="lg:col-span-3">
              <CardHeader
                title={`${orbData.symbol} ORB ${timeframe}m — Range Extensions`}
                icon={<Target size={16} />}
                subtitle={`Candle at ${new Date(orbData.candleTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${orbData.hasValidOrb ? 'Valid' : 'Approximate'}`}
              />
              <ResponsiveContainer width="100%" height={380}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[-0.05, 1.05]}
                    tick={false}
                    label={{
                      value: 'ORB Levels',
                      position: 'insideBottom',
                      offset: -10,
                      fontSize: 11,
                      fill: '#9ca3af',
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[chartMin, chartMax]}
                    width={70}
                    tickFormatter={v => `$${Number(v).toFixed(2)}`}
                    tick={{ fontSize: 10 }}
                    label={{
                      value: 'Price ($)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 15,
                      fontSize: 11,
                      fill: '#9ca3af',
                    }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(value: unknown) => [`$${Number(value).toFixed(2)}`, 'Price']}
                    labelFormatter={() => ''}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10, lineHeight: '1.8', paddingTop: 8 }}
                    iconSize={8}
                  />
                  {chartLevels.map(level => (
                    <Scatter
                      key={level.name}
                      name={level.name}
                      data={[{ x: 0, y: level.price }, { x: 1, y: level.price }]}
                      fill={level.color}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </Card>

            {/* Extension levels table */}
            <Card className="lg:col-span-2">
              <CardHeader title="Extension Levels" icon={<DollarSign size={16} />} />
              <div className="space-y-1">

                {/* T4–T1 upside (highest to lowest) */}
                {[...orbData.extensions.filter(e => e.direction === 'up')].reverse().map(ext => {
                  const reached = orbData.currentPrice >= ext.price;
                  return (
                    <div key={ext.label} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${reached ? 'bg-green-100 text-green-800' : 'bg-green-50/60 text-green-700'}`}>
                      <span className="font-medium w-28">{ext.label}</span>
                      <span className="font-bold">{fmtPrice(ext.price)}</span>
                      <span className={`w-20 text-right ${reached ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                        {reached ? '✓ Reached' : `+${fmtPrice(ext.price - orbData.currentPrice)}`}
                      </span>
                    </div>
                  );
                })}

                {/* ORB High */}
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold ${orbData.currentPrice >= orbData.orbHigh ? 'bg-green-200 text-green-900' : 'bg-green-100 text-green-800'}`}>
                  <span className="w-28">ORB High</span>
                  <span className="font-bold">{fmtPrice(orbData.orbHigh)}</span>
                  <span className="w-20 text-right">
                    {orbData.currentPrice >= orbData.orbHigh ? '✓ Broken' : `+${fmtPrice(orbData.orbHigh - orbData.currentPrice)}`}
                  </span>
                </div>

                {/* Current price row */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
                  <span className="w-28">Current Price</span>
                  <span>{fmtPrice(orbData.currentPrice)}</span>
                  <span className="w-20 text-right text-orange-600">NOW</span>
                </div>

                {/* ORB Mid */}
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700">
                  <span className="w-28">ORB Mid (Pivot)</span>
                  <span className="font-bold">{fmtPrice(orbData.orbMid)}</span>
                  <span className={`w-20 text-right text-xs font-medium ${orbData.currentPrice >= orbData.orbMid ? 'text-green-600' : 'text-red-600'}`}>
                    {orbData.currentPrice >= orbData.orbMid ? 'Above' : 'Below'}
                  </span>
                </div>

                {/* ORB Low */}
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold ${orbData.currentPrice <= orbData.orbLow ? 'bg-red-200 text-red-900' : 'bg-red-100 text-red-800'}`}>
                  <span className="w-28">ORB Low</span>
                  <span className="font-bold">{fmtPrice(orbData.orbLow)}</span>
                  <span className="w-20 text-right">
                    {orbData.currentPrice <= orbData.orbLow ? '✓ Broken' : `-${fmtPrice(orbData.currentPrice - orbData.orbLow)}`}
                  </span>
                </div>

                {/* T1–T4 downside */}
                {orbData.extensions.filter(e => e.direction === 'down').map(ext => {
                  const reached = orbData.currentPrice <= ext.price;
                  return (
                    <div key={ext.label} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${reached ? 'bg-red-100 text-red-800' : 'bg-red-50/60 text-red-700'}`}>
                      <span className="font-medium w-28">{ext.label}</span>
                      <span className="font-bold">{fmtPrice(ext.price)}</span>
                      <span className={`w-20 text-right ${reached ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                        {reached ? '✓ Reached' : `-${fmtPrice(orbData.currentPrice - ext.price)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Options picks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Call options */}
            <Card>
              <CardHeader
                title="Call Options — Bullish Plays"
                icon={<TrendingUp size={16} className="text-green-600" />}
                action={
                  <Badge variant={orbData.bias === 'bullish' ? 'success' : 'default'}>
                    {orbData.bias === 'bullish' ? 'Preferred Direction' : 'Secondary'}
                  </Badge>
                }
              />
              <p className="text-xs text-gray-400 mb-3">
                Budget <strong>${budget}</strong> ÷ {contracts} contract{contracts > 1 ? 's' : ''}
                {' '}= max <strong>${(budget / contracts).toFixed(0)}</strong>/contract
                {' '}(max ask <strong>${(budget / (contracts * 100)).toFixed(2)}</strong>/share)
              </p>
              {callPicks.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
                  No calls found within budget. Try increasing budget, reducing contracts, or choosing a different symbol.
                </div>
              ) : (
                <div className="space-y-2">
                  {callPicks.map((opt, i) => (
                    <OptionPickCard
                      key={opt.contractSymbol}
                      opt={opt}
                      rank={i + 1}
                      isPreferred={orbData.bias === 'bullish'}
                      budget={budget}
                      contracts={contracts}
                    />
                  ))}
                </div>
              )}
            </Card>

            {/* Put options */}
            <Card>
              <CardHeader
                title="Put Options — Bearish Plays"
                icon={<TrendingDown size={16} className="text-red-600" />}
                action={
                  <Badge variant={orbData.bias === 'bearish' ? 'danger' : 'default'}>
                    {orbData.bias === 'bearish' ? 'Preferred Direction' : 'Secondary'}
                  </Badge>
                }
              />
              <p className="text-xs text-gray-400 mb-3">
                Budget <strong>${budget}</strong> ÷ {contracts} contract{contracts > 1 ? 's' : ''}
                {' '}= max <strong>${(budget / contracts).toFixed(0)}</strong>/contract
                {' '}(max ask <strong>${(budget / (contracts * 100)).toFixed(2)}</strong>/share)
              </p>
              {putPicks.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <TrendingDown size={28} className="mx-auto mb-2 opacity-30" />
                  No puts found within budget. Try increasing budget, reducing contracts, or choosing a different symbol.
                </div>
              ) : (
                <div className="space-y-2">
                  {putPicks.map((opt, i) => (
                    <OptionPickCard
                      key={opt.contractSymbol}
                      opt={opt}
                      rank={i + 1}
                      isPreferred={orbData.bias === 'bearish'}
                      budget={budget}
                      contracts={contracts}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* How to use */}
          <Card>
            <CardHeader title="How to Read This Page" icon={<Info size={16} />} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-600">
              <div>
                <p className="font-semibold text-green-700 mb-1">Green zone (above ORB High)</p>
                Long territory. Each darker green line is a profit target as price extends upward.
                T1 (0.5×) is the first target, T4 (2×) is the extended target.
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Gray line (ORB Mid)</p>
                The pivot. Price above = bullish bias → look at calls.
                Price below = bearish bias → look at puts. Staying inside the range = no clear signal yet.
              </div>
              <div>
                <p className="font-semibold text-red-700 mb-1">Red zone (below ORB Low)</p>
                Short territory. Each darker red line is a put target as price extends downward.
                Extensions represent potential downside exits.
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!orbData && !loading && !error && (
        <div className="text-center py-20">
          <Activity size={48} className="text-purple-200 mx-auto mb-4" />
          <p className="text-gray-600 font-medium text-lg">Select a symbol and click Analyze ORB</p>
          <p className="text-gray-400 text-sm mt-2">
            Fetches the 8AM 5-min pre-market candle, calculates opening range levels,
            and surfaces options picks within your budget.
          </p>
        </div>
      )}
    </AppShell>
  );
}
