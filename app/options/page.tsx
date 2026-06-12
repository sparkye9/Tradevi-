'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PutContract {
  contractSymbol: string;
  strike: number;
  bid: number;
  ask: number;
  delta: number;
  gamma: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: number;
  daysToExpiry: number;
  spreadPct: number;
  lastPrice: number;
  inTheMoney: boolean;
}

interface S1Item {
  ticker: string;
  price: number;
  changePercent: number;
  bearThesis: string;
  score: number;
  riskRating: 'Low' | 'Medium' | 'High';
  put: PutContract;
  targetPrice: number;
  resistance: number;
  expectedReturn: number;
  expLabel: string;
}

interface S2Entry {
  ticker: string;
  price: number;
  put: PutContract;
  cost: number;
  expLabel: string;
}

interface S2Results {
  bucket50: S2Entry[];
  bucket75: S2Entry[];
  bucket100: S2Entry[];
}

interface S3Item {
  ticker: string;
  price: number;
  changePercent: number;
  put: PutContract;
  expLabel: string;
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  entryZoneLow: number;
  entryZoneHigh: number;
  stop: number;
  profitTarget: number;
}

interface SuggestedPut { strike: number; lastPrice: number; expLabel: string; daysToExpiry: number; }
interface S4Item {
  ticker: string;
  sector: string;
  sensitivity: number;
  avgDrawdown: number;
  price: number;
  changePercent: number;
  suggestedPuts: { atm: SuggestedPut | null; otm10: SuggestedPut | null; otm20: SuggestedPut | null };
}

interface S5StrikeData {
  drop: number;
  targetStrike: number;
  lastPrice?: number;
  costBasis?: number;
  expLabel?: string;
  daysToExpiry?: number;
  estimatedValue?: number;
  roi?: number | null;
  put?: null;
}
interface S5Item { ticker: string; price: number; strikeData: S5StrikeData[]; }

interface S6Data {
  vix: number;
  vxn: number;
  vixLabel: string;
  signalColor: string;
  overallSignal: string;
  crashProbs: { d30: number; d90: number; m6: number; m12: number };
  qqqPrice: number;
  qqqChangePercent: number;
  qqqTrend: string;
  spyPrice: number;
  spyChangePercent: number;
  spyTrend: string;
}

interface S7Item {
  rank: number;
  ticker: string;
  score: number;
  source: string;
  details: {
    entry: number;
    target: number;
    stop: number;
    expectedReturn: string;
    reason: string;
    put: PutContract;
    expLabel: string;
    price: number;
    riskRating: string;
  };
}

type SectionData = S1Item[] | S2Results | S3Item[] | S4Item[] | S5Item[] | S6Data | S7Item[] | null;

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}
function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
function pctColor(v: number): string {
  return v < 0 ? 'text-red-400' : v > 0 ? 'text-emerald-400' : 'text-gray-400';
}
function riskColor(r: string): string {
  if (r === 'Low') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (r === 'Medium') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}
function confidenceColor(c: string): string {
  if (c === 'High') return 'text-emerald-400';
  if (c === 'Medium') return 'text-yellow-400';
  return 'text-red-400';
}
function confBar(c: string): string {
  if (c === 'High') return 'w-full bg-emerald-500';
  if (c === 'Medium') return 'w-2/3 bg-yellow-500';
  return 'w-1/3 bg-red-500';
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg bg-[#111] border border-[#1e1e1e] p-4 animate-pulse space-y-2">
          <div className="h-4 w-1/4 bg-[#1e1e1e] rounded" />
          <div className="h-3 w-2/3 bg-[#1e1e1e] rounded" />
          <div className="h-3 w-1/2 bg-[#1e1e1e] rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Section 1 ───────────────────────────────────────────────────────────────

function Section1({ data }: { data: S1Item[] }) {
  if (data.length === 0) return <div className="text-gray-500 text-sm">No high-probability puts found right now.</div>;
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.ticker} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-lg">{item.ticker}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskColor(item.riskRating)}`}>
                {item.riskRating} Risk
              </span>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-500">Prob Score</div>
              <div className="text-emerald-400 font-bold text-lg">{item.score}</div>
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-white font-mono text-base">${fmt(item.price)}</span>
            <span className={`text-sm font-medium ${pctColor(item.changePercent)}`}>
              {item.changePercent > 0 ? '+' : ''}{fmt(item.changePercent, 2)}%
            </span>
          </div>

          <div className="text-sm text-gray-400 italic">{item.bearThesis}</div>

          <div className="border-t border-[#2a2a2a] my-1" />

          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-gray-500">Strike</span> <span className="text-white font-mono">${item.put.strike}</span></div>
            <div><span className="text-gray-500">Exp</span> <span className="text-white">{item.expLabel}</span></div>
            <div><span className="text-gray-500">DTE</span> <span className="text-white">{item.put.daysToExpiry}d</span></div>
            <div><span className="text-gray-500">Delta</span> <span className="text-blue-300 font-mono">{fmt(item.put.delta, 3)}</span></div>
            <div><span className="text-gray-500">Gamma</span> <span className="text-purple-300 font-mono">{fmt(item.put.gamma, 4)}</span></div>
            <div><span className="text-gray-500">IV</span> <span className="text-yellow-300 font-mono">{(item.put.impliedVolatility * 100).toFixed(0)}%</span></div>
            <div><span className="text-gray-500">OI</span> <span className="text-white">{fmtK(item.put.openInterest)}</span></div>
            <div><span className="text-gray-500">Vol</span> <span className="text-white">{fmtK(item.put.volume)}</span></div>
            <div><span className="text-gray-500">Spread</span> <span className="text-white">{fmt(item.put.spreadPct, 1)}%</span></div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-gray-500">Target <span className="text-red-400 font-mono">${fmt(item.targetPrice)}</span></div>
            <div className="text-xs text-gray-500">Resistance <span className="text-orange-400 font-mono">${fmt(item.resistance)}</span></div>
            <div className="text-xs text-gray-500">Expected <span className="text-emerald-400 font-bold">+{item.expectedReturn}%</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section 2 ───────────────────────────────────────────────────────────────

function S2Card({ item }: { item: S2Entry }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold text-sm">{item.ticker}</span>
        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-1.5 py-0.5 rounded font-bold">
          ${item.cost}
        </span>
      </div>
      <div className="text-xs text-gray-500">@ ${fmt(item.price)} current</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mt-1">
        <div><span className="text-gray-600">Strike</span> <span className="text-white font-mono">${item.put.strike}</span></div>
        <div><span className="text-gray-600">Exp</span> <span className="text-white">{item.expLabel}</span></div>
        <div><span className="text-gray-600">Delta</span> <span className="text-blue-300 font-mono">{fmt(item.put.delta, 3)}</span></div>
        <div><span className="text-gray-600">DTE</span> <span className="text-white">{item.put.daysToExpiry}d</span></div>
        <div><span className="text-gray-600">OI</span> <span className="text-white">{fmtK(item.put.openInterest)}</span></div>
        <div><span className="text-gray-600">Vol</span> <span className="text-white">{fmtK(item.put.volume)}</span></div>
      </div>
    </div>
  );
}

function Section2({ data }: { data: S2Results }) {
  const buckets = [
    { label: 'Under $50', key: 'bucket50' as const },
    { label: 'Under $75', key: 'bucket75' as const },
    { label: 'Under $100', key: 'bucket100' as const },
  ];
  return (
    <div className="space-y-6">
      {buckets.map(({ label, key }) => (
        <div key={key}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-white">{label}</h3>
            <span className="text-xs text-gray-500">({data[key]?.length ?? 0} found)</span>
          </div>
          {data[key]?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data[key].slice(0, 6).map((item, i) => <S2Card key={`${item.ticker}-${i}`} item={item} />)}
            </div>
          ) : (
            <div className="text-gray-500 text-sm">No contracts in this range.</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Section 3 ───────────────────────────────────────────────────────────────

function Section3({ data }: { data: S3Item[] }) {
  if (data.length === 0) return <div className="text-gray-500 text-sm">No power hour setups. Check back during active trading session.</div>;
  const [best, ...rest] = data;
  return (
    <div className="space-y-4">
      {/* Featured card */}
      <div className="bg-[#111] border border-emerald-500/20 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-white font-bold text-xl">{best.ticker}</span>
            <span className={`ml-2 text-sm ${pctColor(best.changePercent)}`}>
              {best.changePercent > 0 ? '+' : ''}{fmt(best.changePercent)}%
            </span>
          </div>
          <span className={`text-sm font-bold ${confidenceColor(best.confidence)}`}>
            {best.confidence} Confidence
          </span>
        </div>

        <div className="h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${confBar(best.confidence)}`} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-[#1a1a1a] rounded-lg p-2.5">
            <div className="text-gray-500 text-xs mb-0.5">Entry Zone</div>
            <div className="text-white font-mono">${fmt(best.entryZoneLow)} – ${fmt(best.entryZoneHigh)}</div>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg p-2.5">
            <div className="text-gray-500 text-xs mb-0.5">Stop</div>
            <div className="text-red-400 font-mono">${fmt(best.stop)}</div>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg p-2.5">
            <div className="text-gray-500 text-xs mb-0.5">Target</div>
            <div className="text-emerald-400 font-mono">${fmt(best.profitTarget)}</div>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg p-2.5">
            <div className="text-gray-500 text-xs mb-0.5">Exp</div>
            <div className="text-white">{best.expLabel} ({best.put.daysToExpiry}d)</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs text-gray-400">
          <div>Delta <span className="text-blue-300">{fmt(best.put.delta, 3)}</span></div>
          <div>IV <span className="text-yellow-300">{(best.put.impliedVolatility * 100).toFixed(0)}%</span></div>
          <div>Spread <span className="text-white">{fmt(best.put.spreadPct, 1)}%</span></div>
        </div>
      </div>

      {/* Remaining as table */}
      {rest.length > 0 && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-gray-500">
                <th className="text-left py-2 px-3">Ticker</th>
                <th className="text-right py-2 px-3">Strike</th>
                <th className="text-right py-2 px-3">Delta</th>
                <th className="text-right py-2 px-3">Entry</th>
                <th className="text-right py-2 px-3">Target</th>
                <th className="text-right py-2 px-3">Conf</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((item) => (
                <tr key={item.ticker} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <td className="py-2 px-3 text-white font-medium">{item.ticker}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-300">${item.put.strike}</td>
                  <td className="py-2 px-3 text-right font-mono text-blue-300">{fmt(item.put.delta, 3)}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-300">${fmt(item.entryZoneLow)}-${fmt(item.entryZoneHigh)}</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-400">${fmt(item.profitTarget)}</td>
                  <td className={`py-2 px-3 text-right font-medium ${confidenceColor(item.confidence)}`}>{item.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section 4 ───────────────────────────────────────────────────────────────

function Section4({ data }: { data: S4Item[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[700px]">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-gray-500">
            <th className="text-left py-2 px-3">Ticker</th>
            <th className="text-left py-2 px-3">Sector</th>
            <th className="text-right py-2 px-3">Sensitivity</th>
            <th className="text-right py-2 px-3">Avg Drawdown</th>
            <th className="text-right py-2 px-3">Price</th>
            <th className="text-center py-2 px-3">ATM Put</th>
            <th className="text-center py-2 px-3">-10% OTM</th>
            <th className="text-center py-2 px-3">-20% OTM</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.ticker} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
              <td className="py-2.5 px-3 text-white font-bold">{item.ticker}</td>
              <td className="py-2.5 px-3 text-gray-400">{item.sector}</td>
              <td className="py-2.5 px-3 text-right">
                <span className={`font-mono ${item.sensitivity >= 90 ? 'text-red-400' : item.sensitivity >= 80 ? 'text-orange-400' : 'text-yellow-400'}`}>
                  {item.sensitivity}
                </span>
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-red-400">{item.avgDrawdown}%</td>
              <td className="py-2.5 px-3 text-right font-mono text-white">${fmt(item.price)}</td>
              {[item.suggestedPuts.atm, item.suggestedPuts.otm10, item.suggestedPuts.otm20].map((sp, j) => (
                <td key={j} className="py-2.5 px-3 text-center">
                  {sp ? (
                    <div>
                      <div className="text-white font-mono">${sp.strike}</div>
                      <div className="text-gray-500">${fmt(sp.lastPrice)} · {sp.expLabel}</div>
                    </div>
                  ) : (
                    <span className="text-gray-600">--</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 5 ───────────────────────────────────────────────────────────────

function roiColor(roi: number | null | undefined): string {
  if (roi === null || roi === undefined) return 'text-gray-600';
  if (roi > 500) return 'text-emerald-300 font-bold';
  if (roi > 200) return 'text-emerald-400';
  if (roi > 50) return 'text-yellow-400';
  if (roi > 0) return 'text-gray-300';
  return 'text-red-400';
}

function Section5({ data }: { data: S5Item[] }) {
  return (
    <div className="space-y-6">
      {data.map((ticker) => (
        <div key={ticker.ticker} className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1e1e1e] flex items-center gap-2">
            <span className="text-white font-bold">{ticker.ticker}</span>
            <span className="text-gray-500 text-xs">@ ${fmt(ticker.price)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-gray-500">
                  <th className="text-left py-2 px-3">Drop</th>
                  <th className="text-right py-2 px-3">Strike</th>
                  <th className="text-right py-2 px-3">Cost</th>
                  <th className="text-right py-2 px-3">Exp</th>
                  <th className="text-right py-2 px-3">Est. Value</th>
                  <th className="text-right py-2 px-3">ROI</th>
                </tr>
              </thead>
              <tbody>
                {ticker.strikeData.map((sd) => (
                  <tr key={sd.drop} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
                    <td className="py-2 px-3 text-red-400 font-medium">-{sd.drop}%</td>
                    <td className="py-2 px-3 text-right font-mono text-white">${sd.targetStrike}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-300">
                      {sd.costBasis !== undefined ? `$${sd.costBasis.toFixed(0)}` : '--'}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-400">{sd.expLabel ?? '--'}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200">
                      {sd.estimatedValue !== undefined ? `$${sd.estimatedValue.toFixed(2)}` : '--'}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono ${roiColor(sd.roi)}`}>
                      {sd.roi !== null && sd.roi !== undefined ? `${sd.roi > 0 ? '+' : ''}${sd.roi}%` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section 6 ───────────────────────────────────────────────────────────────

function Section6({ data }: { data: S6Data }) {
  const vixColorClass =
    data.vix < 15 ? 'text-emerald-400' :
    data.vix < 20 ? 'text-yellow-400' :
    data.vix < 30 ? 'text-orange-400' : 'text-red-400';

  const signalBadge =
    data.overallSignal === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
    data.overallSignal === 'Crash Risk Elevated' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
    data.overallSignal === 'Bearish' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
    'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';

  return (
    <div className="space-y-4">
      {/* VIX display */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-gray-500 text-xs mb-1">CBOE Volatility Index</div>
            <div className={`text-5xl font-bold font-mono ${vixColorClass}`}>{fmt(data.vix, 2)}</div>
            <div className={`text-sm mt-1 ${vixColorClass}`}>{data.vixLabel}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500 text-xs mb-1">VXN (Nasdaq Vol)</div>
            <div className="text-3xl font-bold font-mono text-gray-300">{fmt(data.vxn, 2)}</div>
            <span className={`mt-2 text-xs px-2 py-1 rounded-full border font-semibold inline-block ${signalBadge}`}>
              {data.overallSignal}
            </span>
          </div>
        </div>
      </div>

      {/* Market context */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'QQQ', price: data.qqqPrice, chg: data.qqqChangePercent, trend: data.qqqTrend },
          { label: 'SPY', price: data.spyPrice, chg: data.spyChangePercent, trend: data.spyTrend },
        ].map((m) => (
          <div key={m.label} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-white font-bold">{m.label}</span>
              <span className="text-gray-400 font-mono text-sm">${fmt(m.price)}</span>
              <span className={`text-xs ${pctColor(m.chg)}`}>{m.chg > 0 ? '+' : ''}{fmt(m.chg)}%</span>
            </div>
            <div className="text-gray-500 text-xs mt-1">{m.trend}</div>
          </div>
        ))}
      </div>

      {/* Crash probability grid */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Crash Probability Model (VIX-based)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '30 Days', val: data.crashProbs.d30 },
            { label: '90 Days', val: data.crashProbs.d90 },
            { label: '6 Months', val: data.crashProbs.m6 },
            { label: '12 Months', val: data.crashProbs.m12 },
          ].map((p) => (
            <div key={p.label} className="bg-[#1a1a1a] rounded-lg p-3 text-center">
              <div className="text-gray-500 text-xs mb-1">{p.label}</div>
              <div className={`text-2xl font-bold ${p.val >= 40 ? 'text-red-400' : p.val >= 25 ? 'text-orange-400' : p.val >= 15 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {p.val}%
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-3">Model estimates only. Not financial advice.</p>
      </div>
    </div>
  );
}

// ─── Section 7 ───────────────────────────────────────────────────────────────

function Section7({ data }: { data: S7Item[] }) {
  if (data.length === 0) return <div className="text-gray-500 text-sm">No top picks available right now.</div>;
  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.ticker} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm flex-shrink-0">
              {item.rank}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-lg">{item.ticker}</span>
                <span className="text-xs bg-[#1e1e1e] text-gray-400 px-2 py-0.5 rounded">{item.source}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskColor(item.details.riskRating)}`}>
                  {item.details.riskRating}
                </span>
              </div>
              <div className="text-gray-400 text-xs mt-0.5">{item.details.reason}</div>
            </div>
            <div className="ml-auto text-right flex-shrink-0">
              <div className="text-xs text-gray-500">Score</div>
              <div className="text-emerald-400 font-bold">{item.score}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#1a1a1a] rounded-lg p-2.5">
              <div className="text-gray-500 mb-0.5">Entry</div>
              <div className="text-white font-mono">${fmt(item.details.entry)}</div>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-2.5">
              <div className="text-gray-500 mb-0.5">Target</div>
              <div className="text-emerald-400 font-mono">${fmt(item.details.target)}</div>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-2.5">
              <div className="text-gray-500 mb-0.5">Stop</div>
              <div className="text-red-400 font-mono">${fmt(item.details.stop)}</div>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-2.5">
              <div className="text-gray-500 mb-0.5">Expected Return</div>
              <div className="text-emerald-400 font-medium">{item.details.expectedReturn}</div>
            </div>
          </div>

          <div className="mt-2 flex gap-3 text-xs text-gray-500">
            <span>Strike <span className="text-white font-mono">${item.details.put.strike}</span></span>
            <span>Exp <span className="text-white">{item.details.expLabel}</span></span>
            <span>Delta <span className="text-blue-300">{fmt(item.details.put.delta, 3)}</span></span>
            <span>IV <span className="text-yellow-300">{(item.details.put.impliedVolatility * 100).toFixed(0)}%</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 1, label: 'High Prob' },
  { id: 2, label: 'Cheap' },
  { id: 3, label: 'Power Hour' },
  { id: 4, label: 'Crash Watch' },
  { id: 5, label: 'Black Swan' },
  { id: 6, label: 'Fear Index' },
  { id: 7, label: 'Top 5' },
];

export default function OptionsPage() {
  const [activeTab, setActiveTab] = useState(1);
  const [sectionData, setSectionData] = useState<Record<number, SectionData>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const loadedTabs = useRef<Set<number>>(new Set());

  const loadSection = useCallback(async (section: number) => {
    if (loadedTabs.current.has(section)) return;
    loadedTabs.current.add(section);
    setLoading((p) => ({ ...p, [section]: true }));
    setErrors((p) => ({ ...p, [section]: null }));
    try {
      const res = await fetch(`/api/options/scan?section=${section}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSectionData((p) => ({ ...p, [section]: json.results }));
    } catch (err) {
      setErrors((p) => ({ ...p, [section]: String(err) }));
      loadedTabs.current.delete(section); // allow retry
    } finally {
      setLoading((p) => ({ ...p, [section]: false }));
    }
  }, []);

  const retrySection = useCallback((section: number) => {
    loadedTabs.current.delete(section);
    void loadSection(section);
  }, [loadSection]);

  useEffect(() => {
    void loadSection(activeTab);
  }, [activeTab, loadSection]);

  function renderContent() {
    const isLoading = loading[activeTab];
    const error = errors[activeTab];
    const data = sectionData[activeTab];

    if (isLoading) return <Skeleton rows={activeTab === 2 ? 6 : 3} />;

    if (error) {
      return (
        <div className="bg-[#111] border border-red-500/20 rounded-xl p-4 space-y-2">
          <div className="text-red-400 text-sm font-medium">Failed to load data</div>
          <div className="text-gray-500 text-xs">{error}</div>
          <button
            onClick={() => retrySection(activeTab)}
            className="text-xs text-emerald-400 hover:text-emerald-300 underline"
          >
            Retry
          </button>
        </div>
      );
    }

    if (!data) return <Skeleton />;

    switch (activeTab) {
      case 1: return <Section1 data={data as S1Item[]} />;
      case 2: return <Section2 data={data as S2Results} />;
      case 3: return <Section3 data={data as S3Item[]} />;
      case 4: return <Section4 data={data as S4Item[]} />;
      case 5: return <Section5 data={data as S5Item[]} />;
      case 6: return <Section6 data={data as S6Data} />;
      case 7: return <Section7 data={data as S7Item[]} />;
      default: return null;
    }
  }

  return (
    <div className="space-y-4 max-w-5xl pb-20">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Options Scanner</h1>
        <p className="text-gray-500 text-sm mt-0.5">7-section put scanner with live Yahoo Finance data & BSM greeks</p>
      </div>

      {/* Sticky tabs */}
      <div
        className="sticky top-0 z-20 -mx-4 px-4 py-2"
        style={{ background: '#0a0a0a', borderBottom: '1px solid #1a1a1a' }}
      >
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              {tab.label}
              {tab.id === 7 && <span className="ml-1 text-emerald-500">★</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-gray-600 bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2">
        Data from Yahoo Finance · BSM greeks calculated server-side · 5-min cache · Not financial advice
      </div>

      {/* Section content */}
      <div>{renderContent()}</div>
    </div>
  );
}
