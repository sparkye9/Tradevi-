'use client';
import { useEffect, useState, useCallback } from 'react';
import TradingViewButton from '@/components/ui/TradingViewButton';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';
import type { TradierContract, TradierOptionsResult } from '@/lib/tradier';

// ─── Capital amounts ─────────────────────────────────────────────────────────

const CAPITAL_OPTIONS = [10, 25, 50, 75, 100, 250, 500, 1000];

// ─── Scoring ─────────────────────────────────────────────────────────────────

function computeScore(q: FinvizQuote, rvolThreshold: number): number {
  let score = 0;

  // RVOL — most weight (0–40 pts)
  const rvol = q.rvol ?? 0;
  score += Math.min((rvol / 5) * 40, 40);

  // Unusual volume flag (+15)
  if (q.unusualVolume) score += 15;

  // New day high (+12)
  if (q.newHighDay) score += 12;

  // SMA alignment (+8 each)
  if (q.sma50rel === 'above') score += 8;
  if (q.sma200rel === 'above') score += 8;

  // Sector strength (+7)
  if (q.groupStrength === 'strong') score += 7;

  // Gap momentum (+5 for gap > 1%, up or down)
  if (q.gap !== null && Math.abs(q.gap) >= 1) score += 5;

  // RVOL at or above threshold bonus (+5)
  if (rvol >= rvolThreshold) score += 5;

  return Math.min(Math.round(score), 100);
}

function deriveDirection(q: FinvizQuote): 'BULLISH' | 'BEARISH' | 'WATCH' {
  const chg = q.changePercent ?? 0;
  if (chg >= 0.5 && (q.sma50rel === 'above' || (q.gap ?? 0) > 0)) return 'BULLISH';
  if (chg <= -0.5 && (q.sma50rel === 'below' || (q.gap ?? 0) < 0)) return 'BEARISH';
  return 'WATCH';
}

function generateReason(q: FinvizQuote): string {
  const parts: string[] = [];
  if ((q.rvol ?? 0) >= 3) parts.push(`${q.rvol!.toFixed(1)}x relative volume`);
  else if ((q.rvol ?? 0) >= 1.5) parts.push(`elevated volume (${q.rvol!.toFixed(1)}x avg)`);
  if (q.unusualVolume) parts.push('unusual volume spike');
  if (q.newHighDay) parts.push('new session high');
  if (q.gap !== null && q.gap >= 1) parts.push(`+${q.gap.toFixed(1)}% gap up`);
  if (q.gap !== null && q.gap <= -1) parts.push(`${q.gap.toFixed(1)}% gap down`);
  if (q.sma50rel === 'above' && q.sma200rel === 'above') parts.push('price above SMA 50 & 200');
  else if (q.sma50rel === 'above') parts.push('above SMA 50');
  if (q.groupStrength === 'strong') parts.push('sector showing strength');
  if (q.groupStrength === 'weak') parts.push('sector showing weakness');
  if (parts.length === 0) parts.push('elevated momentum relative to peers');
  return parts.join(', ') + '.';
}

// Estimated levels — based on fixed risk tiers, labeled as estimates
function computeLevels(price: number, dir: 'BULLISH' | 'BEARISH' | 'WATCH') {
  if (price <= 0) return null;
  if (dir === 'BULLISH') {
    const stop = +(price * 0.97).toFixed(2);
    const t1 = +(price * 1.05).toFixed(2);
    const t2 = +(price * 1.10).toFixed(2);
    const t3 = +(price * 1.20).toFixed(2);
    const rr = +((t1 - price) / (price - stop)).toFixed(1);
    return { entry: price, stop, t1, t2, t3, rr, holdTime: '30 min – 2 hrs' };
  }
  if (dir === 'BEARISH') {
    const stop = +(price * 1.03).toFixed(2);
    const t1 = +(price * 0.95).toFixed(2);
    const t2 = +(price * 0.90).toFixed(2);
    const t3 = +(price * 0.80).toFixed(2);
    const rr = +((price - t1) / (stop - price)).toFixed(1);
    return { entry: price, stop, t1, t2, t3, rr, holdTime: '30 min – 2 hrs' };
  }
  return null;
}

function computeSwingLevels(price: number, dir: 'BULLISH' | 'BEARISH' | 'WATCH') {
  if (price <= 0) return null;
  if (dir === 'BULLISH') {
    const stop = +(price * 0.94).toFixed(2);
    const entryLow = +(price * 0.99).toFixed(2);
    const entryHigh = +(price * 1.01).toFixed(2);
    const t1 = +(price * 1.10).toFixed(2);
    const t2 = +(price * 1.20).toFixed(2);
    const t3 = +(price * 1.35).toFixed(2);
    const rr = +((t1 - price) / (price - stop)).toFixed(1);
    return { entryZone: `$${entryLow}–$${entryHigh}`, support: `$${stop}`, invalidation: `$${stop}`, t1, t2, t3, rr, holdTime: '2–10 days' };
  }
  if (dir === 'BEARISH') {
    const stop = +(price * 1.06).toFixed(2);
    const entryLow = +(price * 0.99).toFixed(2);
    const entryHigh = +(price * 1.01).toFixed(2);
    const t1 = +(price * 0.90).toFixed(2);
    const t2 = +(price * 0.82).toFixed(2);
    const t3 = +(price * 0.72).toFixed(2);
    const rr = +((price - t1) / (stop - price)).toFixed(1);
    return { entryZone: `$${entryLow}–$${entryHigh}`, support: `$${stop}`, invalidation: `$${stop}`, t1, t2, t3, rr, holdTime: '3–14 days' };
  }
  return null;
}

// ─── Position sizing ─────────────────────────────────────────────────────────

function PositionSizing({ price, capital, contracts }: { price: number | null; capital: number; contracts?: TradierContract[] }) {
  if (!price || price <= 0) return null;

  // Stock sizing
  const shares = Math.floor(capital / price);
  const stockCost = +(shares * price).toFixed(2);

  // Option sizing (cheapest qualifying call contract)
  const cheapestCall = contracts?.filter(c => c.type === 'call' && c.bid !== null && c.ask !== null)
    .sort((a, b) => {
      const midA = (a.bid! + a.ask!) / 2;
      const midB = (b.bid! + b.ask!) / 2;
      return midA - midB;
    })[0] ?? null;

  const optionContracts = cheapestCall && cheapestCall.bid !== null && cheapestCall.ask !== null
    ? Math.floor(capital / (((cheapestCall.bid + cheapestCall.ask) / 2) * 100))
    : 0;
  const optionCost = cheapestCall && cheapestCall.bid !== null && cheapestCall.ask !== null
    ? +(optionContracts * ((cheapestCall.bid + cheapestCall.ask) / 2) * 100).toFixed(2)
    : 0;

  const dir = cheapestCall ? 'BULLISH' : null;
  const lvl = dir ? computeLevels(price, 'BULLISH') : null;

  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-3 space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">With ${capital.toLocaleString()}</p>

      {shares > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Shares</span>
          <span className="text-white font-mono font-semibold">{shares} @ ${price.toFixed(2)} = <span className="text-gray-300">${stockCost}</span></span>
        </div>
      )}
      {shares === 0 && (
        <p className="text-xs text-red-400/70">Stock price exceeds capital</p>
      )}

      {cheapestCall && optionContracts > 0 && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Call option</span>
            <span className="text-white font-mono font-semibold">
              {optionContracts} contract{optionContracts > 1 ? 's' : ''} · ${optionCost}
            </span>
          </div>
          <div className="text-xs text-gray-600 font-mono">
            {cheapestCall.strike} strike · {cheapestCall.expiration} · Δ{cheapestCall.delta?.toFixed(2) ?? '--'}
          </div>
          {lvl && (
            <div className="grid grid-cols-4 gap-1 pt-1 text-xs font-mono">
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">STOP</div>
                <div className="text-red-400">-${(+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 0.3).toFixed(0))}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">T1</div>
                <div className="text-emerald-400">+${(+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 0.5).toFixed(0))}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">T2</div>
                <div className="text-emerald-400">+${(+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 1.0).toFixed(0))}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">T3</div>
                <div className="text-emerald-400">+${(+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 2.0).toFixed(0))}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Market context banner ───────────────────────────────────────────────────

interface MarketCtx {
  spy: FinvizQuote | null;
  qqq: FinvizQuote | null;
  iwm: FinvizQuote | null;
  esBias: number | null;  // from futures
  nqBias: number | null;
}

function marketCondition(ctx: MarketCtx): { label: string; color: string; light: 'green' | 'yellow' | 'red'; advice: string } {
  const spyChg = ctx.spy?.changePercent ?? 0;
  const qqqChg = ctx.qqq?.changePercent ?? 0;
  const esChg = ctx.esBias ?? 0;
  const bullCount = [spyChg > 0.3, qqqChg > 0.3, esChg > 0.05].filter(Boolean).length;
  const bearCount = [spyChg < -0.3, qqqChg < -0.3, esChg < -0.05].filter(Boolean).length;

  if (bullCount >= 2) return { label: 'Risk On', color: 'text-emerald-400', light: 'green', advice: 'Take long setups with full size' };
  if (bearCount >= 2) return { label: 'Risk Off', color: 'text-red-400', light: 'red', advice: 'Avoid new positions or short setups only' };
  return { label: 'Neutral', color: 'text-amber-400', light: 'yellow', advice: 'Reduce size — wait for conviction' };
}

function BiasChip({ label, chg }: { label: string; chg: number | null }) {
  const c = chg === null ? 'text-gray-600' : chg > 0.2 ? 'text-emerald-400' : chg < -0.2 ? 'text-red-400' : 'text-amber-400';
  const bg = chg === null ? 'bg-[#1a1a1a]' : chg > 0.2 ? 'bg-emerald-500/10' : chg < -0.2 ? 'bg-red-500/10' : 'bg-amber-500/10';
  const arrow = chg === null ? '' : chg > 0.2 ? '▲' : chg < -0.2 ? '▼' : '→';
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${bg} ${chg === null ? 'border-[#2a2a2a]' : chg > 0.2 ? 'border-emerald-500/20' : chg < -0.2 ? 'border-red-500/20' : 'border-amber-500/20'}`}>
      <span className="text-xs text-gray-500 font-semibold">{label}</span>
      <span className={`text-xs font-mono font-bold ${c}`}>
        {chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% ${arrow}` : '--'}
      </span>
    </div>
  );
}

function MarketContextBanner({ ctx, loading }: { ctx: MarketCtx | null; loading: boolean }) {
  if (loading || !ctx) {
    return (
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4">
        <div className="text-xs text-gray-600 animate-pulse">Loading market context...</div>
      </div>
    );
  }

  const cond = marketCondition(ctx);
  const lightColors = { green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-red-500' };

  return (
    <div className={`border rounded-2xl p-4 space-y-3 ${
      cond.light === 'green' ? 'bg-emerald-500/5 border-emerald-500/20' :
      cond.light === 'red' ? 'bg-red-500/5 border-red-500/20' :
      'bg-amber-500/5 border-amber-500/20'
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${lightColors[cond.light]} shadow-lg`} />
          <span className={`font-bold text-sm ${cond.color}`}>{cond.label}</span>
          <span className="text-xs text-gray-500">{cond.advice}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <BiasChip label="SPY" chg={ctx.spy?.changePercent ?? null} />
          <BiasChip label="QQQ" chg={ctx.qqq?.changePercent ?? null} />
          <BiasChip label="IWM" chg={ctx.iwm?.changePercent ?? null} />
          {ctx.esBias !== null && <BiasChip label="ES" chg={ctx.esBias} />}
          {ctx.nqBias !== null && <BiasChip label="NQ" chg={ctx.nqBias} />}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-600">
        {ctx.spy && (
          <span>
            SPY SMA50 <span className={ctx.spy.sma50rel === 'above' ? 'text-emerald-400' : 'text-red-400'}>
              {ctx.spy.sma50rel === 'above' ? '▲' : ctx.spy.sma50rel === 'below' ? '▼' : '?'}
            </span>
          </span>
        )}
        {ctx.spy && (
          <span>
            SPY SMA200 <span className={ctx.spy.sma200rel === 'above' ? 'text-emerald-400' : 'text-red-400'}>
              {ctx.spy.sma200rel === 'above' ? '▲' : ctx.spy.sma200rel === 'below' ? '▼' : '?'}
            </span>
          </span>
        )}
        <span className="text-gray-700">Levels estimated · verify on TradingView</span>
      </div>
    </div>
  );
}

// ─── Intraday opportunity card ────────────────────────────────────────────────

function IntradayCard({ q, capital, rvolThreshold }: { q: FinvizQuote; capital: number; rvolThreshold: number }) {
  const [showSizing, setShowSizing] = useState(false);
  const [contracts, setContracts] = useState<TradierContract[] | null>(null);
  const [loadingContracts, setLoadingContracts] = useState(false);

  const score = computeScore(q, rvolThreshold);
  const dir = deriveDirection(q);
  const lvl = q.price ? computeLevels(q.price, dir) : null;
  const reason = generateReason(q);

  async function loadContracts() {
    if (contracts !== null) { setShowSizing(p => !p); return; }
    setLoadingContracts(true);
    setShowSizing(true);
    try {
      const res = await fetch(`/api/tradier/options?symbol=${q.symbol}`);
      const json: TradierOptionsResult = await res.json();
      setContracts(json.contracts ?? []);
    } catch {
      setContracts([]);
    }
    setLoadingContracts(false);
  }

  const dirColor = dir === 'BULLISH' ? 'text-emerald-400' : dir === 'BEARISH' ? 'text-red-400' : 'text-amber-400';
  const dirBg = dir === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/30' : dir === 'BEARISH' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30';
  const cardBorder = dir === 'BULLISH' ? 'border-emerald-500/20 hover:border-emerald-500/40' : dir === 'BEARISH' ? 'border-red-500/20 hover:border-red-500/40' : 'border-[#1e1e1e] hover:border-[#2a2a2a]';
  const scoreColor = score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-gray-500';

  return (
    <div className={`bg-[#111111] border ${cardBorder} rounded-2xl p-4 flex flex-col gap-3 transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-white font-bold font-mono text-2xl">{q.symbol}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white font-mono font-semibold">
              {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
            </span>
            <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${dirBg} ${dirColor}`}>
            {dir}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">Score</span>
            <span className={`text-sm font-bold font-mono ${scoreColor}`}>{score}</span>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {q.unusualVolume && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            🔥 RVOL {q.rvol?.toFixed(2)}
          </span>
        )}
        {!q.unusualVolume && q.rvol !== null && (
          <span className="px-2 py-0.5 rounded-full text-xs font-mono text-amber-400 border border-amber-500/20">
            RVOL {q.rvol.toFixed(2)}
          </span>
        )}
        {q.newHighDay && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            NEW HIGH
          </span>
        )}
        {q.groupStrength === 'strong' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-400 border border-emerald-900">
            Sector ▲
          </span>
        )}
        {q.groupStrength === 'weak' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900/40 text-red-400 border border-red-900">
            Sector ▼
          </span>
        )}
      </div>

      {/* Levels */}
      {lvl && (
        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-2">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">Entry</div>
            <div className="text-white font-semibold">${lvl.entry.toFixed(2)}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-red-500/20 rounded-lg p-2">
            <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Stop</div>
            <div className="text-red-400 font-semibold">${lvl.stop.toFixed(2)}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/20 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T1 / T2</div>
            <div className="text-emerald-400 font-semibold">${lvl.t1} / ${lvl.t2}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T3 · R:R</div>
            <div className="text-emerald-400 font-semibold">${lvl.t3} · {lvl.rr}x</div>
          </div>
        </div>
      )}

      {/* Hold + reason */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Hold:</span>
          <span className="text-gray-400">{lvl?.holdTime ?? '--'}</span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{reason}</p>
      </div>

      {/* SMA row */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="text-gray-600">SMA50
          <span className={q.sma50rel === 'above' ? ' text-emerald-400' : ' text-red-400'}>
            {q.sma50rel === 'above' ? ' ▲' : q.sma50rel === 'below' ? ' ▼' : ' ?'}
          </span>
        </span>
        <span className="text-gray-600">SMA200
          <span className={q.sma200rel === 'above' ? ' text-emerald-400' : ' text-red-400'}>
            {q.sma200rel === 'above' ? ' ▲' : q.sma200rel === 'below' ? ' ▼' : ' ?'}
          </span>
        </span>
        {q.gap !== null && Math.abs(q.gap) > 0.5 && (
          <span className={q.gap > 0 ? 'text-emerald-400' : 'text-red-400'}>
            Gap {q.gap > 0 ? '+' : ''}{q.gap.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#1e1e1e]">
        <button
          onClick={loadContracts}
          disabled={loadingContracts}
          className={`flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg transition-all border ${
            showSizing
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-[#1a1a1a] text-gray-400 border-[#2a2a2a] hover:text-white hover:border-[#3a3a3a]'
          } disabled:opacity-50`}
        >
          {loadingContracts ? 'Loading...' : showSizing ? '▼ Position Sizing' : '▶ Position Sizing'}
        </button>
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>

      {/* Position sizing panel */}
      {showSizing && !loadingContracts && (
        <PositionSizing price={q.price} capital={capital} contracts={contracts ?? []} />
      )}
    </div>
  );
}

// ─── Swing opportunity card ───────────────────────────────────────────────────

function SwingCard({ q, capital, rvolThreshold }: { q: FinvizQuote; capital: number; rvolThreshold: number }) {
  const score = computeScore(q, rvolThreshold);
  const dir = deriveDirection(q);
  const lvl = q.price ? computeSwingLevels(q.price, dir) : null;
  const reason = generateReason(q);

  const dirColor = dir === 'BULLISH' ? 'text-emerald-400' : dir === 'BEARISH' ? 'text-red-400' : 'text-amber-400';
  const dirBg = dir === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/30' : dir === 'BEARISH' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30';
  const scoreColor = score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-gray-500';

  return (
    <div className="bg-[#111111] border border-[#1e1e1e] hover:border-[#2a2a2a] rounded-2xl p-4 flex flex-col gap-3 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-white font-bold font-mono text-2xl">{q.symbol}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white font-mono font-semibold">
              {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
            </span>
            <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${dirBg} ${dirColor}`}>
            {dir}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">Score</span>
            <span className={`text-sm font-bold font-mono ${scoreColor}`}>{score}</span>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {q.unusualVolume && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            🔥 RVOL {q.rvol?.toFixed(2)}
          </span>
        )}
        {q.newHighDay && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            NEW HIGH
          </span>
        )}
        {q.groupStrength === 'strong' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-400 border border-emerald-900">
            Sector ▲
          </span>
        )}
      </div>

      {/* Swing levels */}
      {lvl && (
        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-2">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">Entry Zone</div>
            <div className="text-white font-semibold">{lvl.entryZone}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-red-500/20 rounded-lg p-2">
            <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Invalidation</div>
            <div className="text-red-400 font-semibold">{lvl.invalidation}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/20 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T1 / T2</div>
            <div className="text-emerald-400 font-semibold">${lvl.t1} / ${lvl.t2}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T3 · R:R</div>
            <div className="text-emerald-400 font-semibold">${lvl.t3} · {lvl.rr}x</div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Hold:</span>
          <span className="text-gray-400">{lvl?.holdTime ?? '--'}</span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{reason}</p>
      </div>

      {/* Capital note */}
      {q.price !== null && q.price <= capital && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-2 text-xs font-mono">
          <span className="text-gray-600">With ${capital}: </span>
          <span className="text-white">{Math.floor(capital / q.price)} shares</span>
          <span className="text-gray-600"> = ${(Math.floor(capital / q.price) * q.price).toFixed(2)}</span>
        </div>
      )}
      {q.price !== null && q.price > capital && (
        <div className="text-xs text-amber-400/70 font-mono">
          Price ${q.price.toFixed(2)} exceeds ${capital} capital — consider options
        </div>
      )}

      <div className="flex justify-end pt-1 border-t border-[#1e1e1e]">
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OpportunityFinderPage() {
  const { rvolThreshold, capitalAmount, setCapitalAmount } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);
  const [futuresData, setFuturesData] = useState<{ changePercent: number; symbol: string }[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setMarketLoading(true);
    try {
      const [screenerRes, futuresRes] = await Promise.all([
        fetch(`/api/finviz/screener?tickers=${MARKET_TICKERS.join(',')}`),
        fetch('/api/finviz/futures'),
      ]);
      const screener = await screenerRes.json();
      const futures = await futuresRes.json();
      setData(screener);
      setFuturesData(futures?.data ?? []);
    } catch {
      setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
    }
    setLoading(false);
    setMarketLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const allQuotes = data?.data ?? [];

  // Market context
  const spy = allQuotes.find(q => q.symbol === 'SPY') ?? null;
  const qqq = allQuotes.find(q => q.symbol === 'QQQ') ?? null;
  const iwm = allQuotes.find(q => q.symbol === 'IWM') ?? null;
  const es = futuresData.find(f => f.symbol === 'ES');
  const nq = futuresData.find(f => f.symbol === 'NQ');
  const ctx: MarketCtx = { spy, qqq, iwm, esBias: es?.changePercent ?? null, nqBias: nq?.changePercent ?? null };

  // Score and filter — exclude index ETFs from opportunity list
  const INDEX_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'GLD'];
  const candidates = allQuotes.filter(q => !INDEX_ETFS.includes(q.symbol));
  const scored = candidates
    .map(q => ({ q, score: computeScore(q, rvolThreshold) }))
    .sort((a, b) => b.score - a.score);

  // Intraday: prefer RVOL/unusual volume hits; fallback to top movers by % change
  const intradayScored = scored.filter(({ q }) => (q.rvol ?? 0) >= rvolThreshold || q.newHighDay || q.unusualVolume);
  const intradayFallback = [...candidates]
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0));
  const intraday = (intradayScored.length >= 3 ? intradayScored : scored)
    .slice(0, 10)
    .map(({ q }) => q);
  // If still empty use raw fallback
  const intradayFinal = intraday.length > 0 ? intraday : intradayFallback.slice(0, 10);

  // Swing: above both SMAs + positive momentum; fallback to any above SMA50
  const swingScored = scored.filter(({ q }) =>
    q.sma50rel === 'above' && q.sma200rel === 'above'
  );
  const swingFallback = scored.filter(({ q }) => q.sma50rel === 'above');
  const swing = (swingScored.length >= 2 ? swingScored : swingFallback)
    .slice(0, 5)
    .map(({ q }) => q);

  const cond = marketCondition(ctx);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Opportunity Finder</h1>
          <p className="text-sm text-gray-500 mt-1">
            Highest-probability setups for small accounts · scores based on real signals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
          >
            {loading ? 'Scanning...' : '↻ Refresh'}
          </button>
          {data && <SourceTag source={data.source ?? ''} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {/* Market Context Banner */}
      <MarketContextBanner ctx={ctx} loading={marketLoading} />

      {/* Capital Selector */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">My Capital</span>
          <div className="flex flex-wrap gap-1.5">
            {CAPITAL_OPTIONS.map((amt) => (
              <button
                key={amt}
                onClick={() => setCapitalAmount(amt)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  capitalAmount === amt
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-[#1a1a1a] text-gray-500 border-[#2a2a2a] hover:text-gray-300 hover:border-[#3a3a3a]'
                }`}
              >
                ${amt.toLocaleString()}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-600 ml-2">
            Selected: <span className="text-white font-mono font-semibold">${capitalAmount.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* ── INTRADAY OPPORTUNITIES ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 pb-1 border-b border-[#1e1e1e]">
          <div>
            <h2 className="text-white font-bold text-base">⚡ Intraday Opportunities</h2>
            <p className="text-xs text-gray-600 mt-0.5">High RVOL · unusual volume · momentum — moves happening today</p>
          </div>
          <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            cond.light === 'green' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            cond.light === 'red' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
            'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${cond.light === 'green' ? 'bg-emerald-500' : cond.light === 'red' ? 'bg-red-500' : 'bg-amber-400'}`} />
            {cond.label}
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 h-48 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && intradayFinal.length === 0 && (
          <div className="text-center py-10 text-gray-600">
            No data returned. Check data source status above.
          </div>
        )}

        {!loading && intradayFinal.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {intradayFinal.map(q => (
              <IntradayCard key={q.symbol} q={q} capital={capitalAmount} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        )}
      </section>

      {/* ── SWING OPPORTUNITIES ── */}
      <section className="space-y-4">
        <div className="pb-1 border-b border-[#1e1e1e]">
          <h2 className="text-white font-bold text-base">📈 Swing Opportunities</h2>
          <p className="text-xs text-gray-600 mt-0.5">Trend-aligned · above SMA 50 & 200 · sector strength — holds 2–14 days</p>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2].map(i => (
              <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 h-48 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && swing.length === 0 && (
          <div className="text-center py-10 text-gray-600">
            No swing setups with full trend alignment right now.
          </div>
        )}

        {!loading && swing.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {swing.map(q => (
              <SwingCard key={q.symbol} q={q} capital={capitalAmount} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-700 pb-4">
        Scores computed from: RVOL, unusual volume, new highs, SMA alignment, sector strength, gap.
        Entry / stop / target levels are <span className="text-amber-400/70">estimated</span> — always verify structure on TradingView before entering.
      </p>
    </div>
  );
}
