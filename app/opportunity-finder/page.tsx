'use client';
import { useEffect, useState, useCallback } from 'react';
import TradingViewButton from '@/components/ui/TradingViewButton';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import PositionSizing from '@/components/scan/PositionSizing';
import { useTradeviStore } from '@/store/tradeviStore';
import {
  computeOpportunityScore,
  deriveDirection,
  generateReason,
  generateBeginnerReason,
  computeIntradayLevels,
  computeSwingLevels,
} from '@/lib/opportunityScore';
import { isBeginner, volumeLabel, trendLabel, sectorLabel } from '@/lib/labels';
import type { FinvizQuote, FinvizFuture } from '@/lib/finviz';
import type { TradierContract, TradierOptionsResult } from '@/lib/tradier';
import type { UniverseScanResult } from '@/lib/universe';

// ─── Capital amounts ─────────────────────────────────────────────────────────

const CAPITAL_OPTIONS = [10, 25, 50, 75, 100, 250, 500, 1000];

// Scoring, direction, reasons, and entry/exit levels all come from the one
// shared engine in lib/opportunityScore.ts — every screen in the app scores
// a ticker the same way now.
const computeScore = computeOpportunityScore;
const computeLevels = computeIntradayLevels;

// ─── Market context banner ───────────────────────────────────────────────────

interface MarketCtx {
  spy: FinvizQuote | null;
  qqq: FinvizQuote | null;
  iwm: FinvizQuote | null;
  dia: FinvizQuote | null;
  esBias: number | null;  // from futures
  nqBias: number | null;
  rtyBias: number | null;
  clBias: number | null;
  gcBias: number | null;
  vix: FinvizFuture | null;
  bonds: FinvizQuote | null; // TLT proxy
  dollar: FinvizQuote | null; // UUP proxy
  btc: FinvizFuture | null;
  eth: FinvizFuture | null;
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
          <BiasChip label="DIA" chg={ctx.dia?.changePercent ?? null} />
          {ctx.esBias !== null && <BiasChip label="ES" chg={ctx.esBias} />}
          {ctx.nqBias !== null && <BiasChip label="NQ" chg={ctx.nqBias} />}
          {ctx.rtyBias !== null && <BiasChip label="RTY" chg={ctx.rtyBias} />}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <BiasChip label="VIX" chg={ctx.vix?.changePercent ?? null} />
        {ctx.clBias !== null && <BiasChip label="CL" chg={ctx.clBias} />}
        {ctx.gcBias !== null && <BiasChip label="GC" chg={ctx.gcBias} />}
        <BiasChip label="Bonds (TLT)" chg={ctx.bonds?.changePercent ?? null} />
        <BiasChip label="Dollar (UUP)" chg={ctx.dollar?.changePercent ?? null} />
        <BiasChip label="BTC" chg={ctx.btc?.changePercent ?? null} />
        <BiasChip label="ETH" chg={ctx.eth?.changePercent ?? null} />
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
  const { experienceMode } = useTradeviStore();
  const beginner = isBeginner(experienceMode);
  const [showSizing, setShowSizing] = useState(false);
  const [contracts, setContracts] = useState<TradierContract[] | null>(null);
  const [loadingContracts, setLoadingContracts] = useState(false);

  const score = computeScore(q, rvolThreshold);
  const dir = deriveDirection(q);
  const lvl = q.price ? computeLevels(q.price, dir) : null;
  const reason = beginner ? generateBeginnerReason(q) : generateReason(q);

  async function loadContracts() {
    if (contracts !== null) { setShowSizing(p => !p); return; }
    setLoadingContracts(true);
    setShowSizing(true);
    try {
      const res = await fetch(`/api/tradier/options?symbol=${q.symbol}&cheap=true`);
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
        {q.rvol !== null && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
            q.unusualVolume ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'font-mono text-amber-400 border-amber-500/20'
          }`}>
            {q.unusualVolume && !beginner ? '🔥 ' : ''}{volumeLabel(q, experienceMode)}
          </span>
        )}
        {q.newHighDay && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {beginner ? 'NEW SESSION HIGH' : 'NEW HIGH'}
          </span>
        )}
        {sectorLabel(q, experienceMode) && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
            q.groupStrength === 'strong'
              ? 'bg-emerald-900/40 text-emerald-400 border-emerald-900'
              : 'bg-red-900/40 text-red-400 border-red-900'
          }`}>
            {sectorLabel(q, experienceMode)}
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

      {/* Trend row */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className={q.sma50rel === 'above' ? 'text-emerald-400' : q.sma50rel === 'below' ? 'text-red-400' : 'text-gray-600'}>
          {trendLabel(q, experienceMode)}
        </span>
        {q.gap !== null && Math.abs(q.gap) > 0.5 && (
          <span className={q.gap > 0 ? 'text-emerald-400' : 'text-red-400'}>
            {beginner ? (q.gap > 0 ? 'Opened higher' : 'Opened lower') : `Gap ${q.gap > 0 ? '+' : ''}${q.gap.toFixed(1)}%`}
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
  const { experienceMode } = useTradeviStore();
  const beginner = isBeginner(experienceMode);
  const score = computeScore(q, rvolThreshold);
  const dir = deriveDirection(q);
  const lvl = q.price ? computeSwingLevels(q.price, dir) : null;
  const reason = beginner ? generateBeginnerReason(q) : generateReason(q);

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
        {q.rvol !== null && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
            q.unusualVolume ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'font-mono text-amber-400 border-amber-500/20'
          }`}>
            {q.unusualVolume && !beginner ? '🔥 ' : ''}{volumeLabel(q, experienceMode)}
          </span>
        )}
        {q.newHighDay && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {beginner ? 'NEW SESSION HIGH' : 'NEW HIGH'}
          </span>
        )}
        {sectorLabel(q, experienceMode) && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-400 border border-emerald-900">
            {sectorLabel(q, experienceMode)}
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

// ─── Penny Options Scanner ────────────────────────────────────────────────────

interface PennyContract {
  ticker: string;
  tickerPrice: number | null;
  contract: TradierContract;
  costPerContract: number;
  estGain5pct: number;
  estGain10pct: number;
}

function PennyRow({ p }: { p: PennyContract }) {
  const mid = p.costPerContract;
  const isCall = p.contract.type === 'call';
  const color = isCall ? 'text-emerald-400' : 'text-red-400';
  const bg = isCall ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20';
  const daysUntilExpiry = Math.max(0, Math.round(
    (new Date(p.contract.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));

  return (
    <div className={`border rounded-xl p-3 flex flex-col gap-2 ${bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold font-mono text-sm">{p.ticker}</span>
          <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${color} bg-black/30`}>{p.contract.type}</span>
          <span className="text-gray-400 font-mono text-xs">${p.contract.strike}</span>
        </div>
        <div className="text-right">
          <div className="text-white font-mono font-bold text-sm">${mid.toFixed(2)}<span className="text-gray-600 text-xs font-normal">/share</span></div>
          <div className="text-gray-600 text-xs">${(mid * 100).toFixed(0)}/contract</div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
        <span className="text-gray-600">{p.contract.expiration}</span>
        <span className={daysUntilExpiry <= 2 ? 'text-red-400' : 'text-amber-400'}>{daysUntilExpiry}d to exp</span>
        {p.contract.delta !== null && <span className={color}>Δ{p.contract.delta.toFixed(2)}</span>}
        {p.contract.iv !== null && <span className="text-gray-600">IV {(p.contract.iv * 100).toFixed(0)}%</span>}
        {p.tickerPrice !== null && <span className="text-gray-500">stock ${p.tickerPrice.toFixed(2)}</span>}
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="bg-black/30 rounded-lg p-1.5 text-center">
          <div className="text-gray-600 text-[10px]">stock +5%</div>
          <div className="text-emerald-400 font-mono font-semibold">+{p.estGain5pct.toFixed(0)}%</div>
        </div>
        <div className="bg-black/30 rounded-lg p-1.5 text-center">
          <div className="text-gray-600 text-[10px]">stock +10%</div>
          <div className="text-emerald-400 font-mono font-semibold">+{p.estGain10pct.toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}

function PennyScanner({ quotes }: { quotes: FinvizQuote[] }) {
  const [pennies, setPennies] = useState<PennyContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanType, setScanType] = useState<'calls' | 'puts'>('calls');

  const scanPennies = useCallback(async (type: 'calls' | 'puts') => {
    setLoading(true);
    setScanned(false);
    setScanType(type);

    const INDEX_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'GLD'];
    const sorted = [...quotes]
      .filter(q => !INDEX_ETFS.includes(q.symbol) && q.price !== null && q.price > 0)
      .sort((a, b) =>
        type === 'calls'
          ? (b.changePercent ?? 0) - (a.changePercent ?? 0)
          : (a.changePercent ?? 0) - (b.changePercent ?? 0)
      )
      .slice(0, 12);

    const results: PennyContract[] = [];

    await Promise.all(sorted.map(async (q) => {
      try {
        const res = await fetch(`/api/tradier/options?symbol=${q.symbol}&penny=true`);
        const json: TradierOptionsResult = await res.json();
        const contracts = (json.contracts ?? [])
          .filter(c => c.type === (type === 'calls' ? 'call' : 'put'))
          .filter(c => c.bid !== null && c.ask !== null);

        for (const c of contracts) {
          const mid = ((c.bid ?? 0) + (c.ask ?? 0)) / 2;
          if (mid < 0.05 || mid > 0.50) continue;
          const delta = Math.abs(c.delta ?? 0);
          const stockMove5 = (q.price ?? 0) * 0.05;
          const stockMove10 = (q.price ?? 0) * 0.10;
          results.push({
            ticker: q.symbol,
            tickerPrice: q.price,
            contract: c,
            costPerContract: mid,
            estGain5pct: mid > 0 ? (delta * stockMove5 / mid) * 100 : 0,
            estGain10pct: mid > 0 ? (delta * stockMove10 / mid) * 100 : 0,
          });
        }
      } catch {
        // skip this ticker silently
      }
    }));

    // Sort by best estimated gain on a 5% move
    results.sort((a, b) => b.estGain5pct - a.estGain5pct);
    setPennies(results.slice(0, 20));
    setLoading(false);
    setScanned(true);
  }, [quotes]);

  return (
    <div className="bg-[#0d0d0d] border border-purple-500/20 rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">💎</span>
            <h2 className="text-white font-bold text-base">Penny Options Scanner</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Finds options priced $0.05–$0.50/share ($5–$50/contract) · delta 0.10–0.35 · near expiry.
            Same type as AAPL at $0.27 — scans today&apos;s top movers.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => scanPennies('calls')}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full hover:bg-emerald-500/30 transition-all disabled:opacity-50"
          >
            {loading && scanType === 'calls' ? 'Scanning...' : '⚡ Scan Calls'}
          </button>
          <button
            onClick={() => scanPennies('puts')}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30 rounded-full hover:bg-red-500/30 transition-all disabled:opacity-50"
          >
            {loading && scanType === 'puts' ? 'Scanning...' : '🔻 Scan Puts'}
          </button>
        </div>
      </div>

      {!scanned && !loading && (
        <div className="text-center py-6 text-gray-600 text-sm">
          Hit &quot;Scan Calls&quot; or &quot;Scan Puts&quot; to find penny options on today&apos;s top movers
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-3 h-24 animate-pulse" />
          ))}
        </div>
      )}

      {scanned && !loading && pennies.length === 0 && (
        <div className="text-center py-6 text-gray-600 text-sm">
          No penny options found right now. Try the other direction, or check back during market hours.
        </div>
      )}

      {scanned && !loading && pennies.length > 0 && (
        <>
          <p className="text-xs text-gray-600">
            Found <span className="text-white font-semibold">{pennies.length}</span> penny {scanType} · sorted by estimated gain on a +5% stock move
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pennies.map((p, i) => <PennyRow key={`${p.ticker}-${p.contract.symbol}-${i}`} p={p} />)}
          </div>
          <p className="text-[10px] text-gray-700">
            Gains estimated using delta × price move ÷ option cost. Actual gains vary — gamma, IV crush, and theta all affect outcome. Never risk more than you can afford to lose on penny options.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OpportunityFinderPage() {
  const { rvolThreshold, capitalAmount, setCapitalAmount } = useTradeviStore();
  const [scan, setScan] = useState<UniverseScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketLoading, setMarketLoading] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMarketLoading(true);
    setScanError(null);
    try {
      const res = await fetch(`/api/scan/universe?rvolThreshold=${rvolThreshold}`);
      const json: UniverseScanResult = await res.json();
      setScan(json);
      if (json.meta?.sourceError) setScanError(json.meta.sourceError);
    } catch {
      setScan(null);
      setScanError('Full market scan failed — check Finviz Elite credentials.');
    }
    setLoading(false);
    setMarketLoading(false);
  }, [rvolThreshold]);

  useEffect(() => { load(); }, [load]);

  // The full NYSE + NASDAQ + AMEX scan, already scored by the shared engine.
  const candidates = (scan?.opportunities ?? []).map(({ q }) => q);

  // Market context — SPY/QQQ/IWM/DIA, sector ETFs, futures, VIX, bonds, dollar, crypto
  const ctx: MarketCtx = {
    spy: scan?.context.indexes.find(q => q.symbol === 'SPY') ?? null,
    qqq: scan?.context.indexes.find(q => q.symbol === 'QQQ') ?? null,
    iwm: scan?.context.indexes.find(q => q.symbol === 'IWM') ?? null,
    dia: scan?.context.indexes.find(q => q.symbol === 'DIA') ?? null,
    esBias: scan?.context.futures.find(f => f.symbol === 'ES')?.changePercent ?? null,
    nqBias: scan?.context.futures.find(f => f.symbol === 'NQ')?.changePercent ?? null,
    rtyBias: scan?.context.futures.find(f => f.symbol === 'RTY')?.changePercent ?? null,
    clBias: scan?.context.futures.find(f => f.symbol === 'CL')?.changePercent ?? null,
    gcBias: scan?.context.futures.find(f => f.symbol === 'GC')?.changePercent ?? null,
    vix: scan?.context.macro.find(f => f.symbol === 'VIX') ?? null,
    bonds: scan?.context.bonds.find(q => q.symbol === 'TLT') ?? null,
    dollar: scan?.context.dollar.find(q => q.symbol === 'UUP') ?? null,
    btc: scan?.context.macro.find(f => f.symbol === 'BTC') ?? null,
    eth: scan?.context.macro.find(f => f.symbol === 'ETH') ?? null,
  };

  const scored = (scan?.opportunities ?? []).map(({ q, score }) => ({ q, score }));

  // Intraday BULLISH: RVOL, new highs, positive momentum
  const intradayBullish = scored
    .filter(({ q }) => (q.rvol ?? 0) >= rvolThreshold || q.newHighDay || q.unusualVolume)
    .filter(({ q }) => (q.changePercent ?? 0) >= -1) // not crashing hard
    .slice(0, 15).map(({ q }) => q);

  // Intraday BEARISH: dropping with volume — put plays
  const intradayBearish = [...candidates]
    .filter(q => (q.changePercent ?? 0) <= -1.5)
    .sort((a, b) => {
      // prioritize: RVOL desc, then % change (most negative first)
      const rvolScore = ((b.rvol ?? 0) - (a.rvol ?? 0)) * 10;
      const chgScore = (a.changePercent ?? 0) - (b.changePercent ?? 0);
      return rvolScore + chgScore;
    })
    .slice(0, 10);

  // Fallback: if both empty use top movers by absolute % change
  const intradayFallback = [...candidates]
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, 15);
  const intradayFinal = (intradayBullish.length + intradayBearish.length >= 3)
    ? intradayBullish
    : intradayFallback;

  // Swing LONG: above SMA50+200, sector strength
  const swingLong = scored
    .filter(({ q }) => q.sma50rel === 'above' && q.sma200rel === 'above')
    .slice(0, 8).map(({ q }) => q);
  const swingLongFallback = scored
    .filter(({ q }) => q.sma50rel === 'above')
    .slice(0, 8).map(({ q }) => q);
  const swing = swingLong.length >= 2 ? swingLong : swingLongFallback;

  // Swing SHORT: below SMA50+200, sector weak — put plays
  const swingShort = candidates
    .filter(q => q.sma50rel === 'below' && q.sma200rel === 'below')
    .sort((a, b) => {
      const aScore = ((a.rvol ?? 0) >= rvolThreshold ? 10 : 0) + (a.groupStrength === 'weak' ? 8 : 0) + Math.abs(a.changePercent ?? 0);
      const bScore = ((b.rvol ?? 0) >= rvolThreshold ? 10 : 0) + (b.groupStrength === 'weak' ? 8 : 0) + Math.abs(b.changePercent ?? 0);
      return bScore - aScore;
    })
    .slice(0, 8);

  const cond = marketCondition(ctx);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Small Account Edge</h1>
          <p className="text-sm text-gray-500 mt-1">
            Full NYSE + NASDAQ + AMEX scan · scores based on real signals
          </p>
          {scan && (
            <p className="text-xs text-gray-600 mt-1 font-mono">
              Scanned {scan.meta.scannedCount.toLocaleString()} names across {scan.meta.exchangesCovered.join(', ').toUpperCase() || '--'}
              {scan.meta.cappedByPageLimit ? ' (capped — raise FINVIZ_UNIVERSE_PAGES_PER_EXCHANGE for deeper coverage)' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
          >
            {loading ? 'Scanning...' : '↻ Refresh'}
          </button>
          {scan && <SourceTag source="Finviz Elite (full universe scan)" lastUpdated={scan.meta.asOf} />}
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

      {scanError && <DataUnavailable reason={scanError} />}

      {/* ── PENNY OPTIONS SCANNER ── */}
      {!loading && <PennyScanner quotes={candidates} />}

      {/* ── INTRADAY CALL PLAYS ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 pb-1 border-b border-[#1e1e1e]">
          <div>
            <h2 className="text-white font-bold text-base">⚡ Intraday — Call Plays</h2>
            <p className="text-xs text-gray-600 mt-0.5">High RVOL · unusual volume · upside momentum · options $10–$50</p>
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
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 h-48 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && intradayFinal.length === 0 && (
          <div className="text-center py-10 text-gray-600">No data returned. Check data source status above.</div>
        )}

        {!loading && intradayFinal.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {intradayFinal.map(q => (
              <IntradayCard key={q.symbol} q={q} capital={capitalAmount} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        )}
      </section>

      {/* ── INTRADAY PUT PLAYS ── */}
      {!loading && intradayBearish.length > 0 && (
        <section className="space-y-4">
          <div className="pb-1 border-b border-red-500/20">
            <h2 className="text-red-400 font-bold text-base">🔻 Intraday — Put Plays</h2>
            <p className="text-xs text-gray-600 mt-0.5">Dropping with volume · bearish structure · put options $10–$50</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {intradayBearish.map(q => (
              <IntradayCard key={q.symbol} q={q} capital={capitalAmount} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {/* ── SWING LONG PLAYS ── */}
      <section className="space-y-4">
        <div className="pb-1 border-b border-[#1e1e1e]">
          <h2 className="text-white font-bold text-base">📈 Swing — Call Plays</h2>
          <p className="text-xs text-gray-600 mt-0.5">Above SMA 50 &amp; 200 · sector strength · hold 2–14 days</p>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 h-48 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && swing.length === 0 && (
          <div className="text-center py-10 text-gray-600">No swing call setups with trend alignment right now.</div>
        )}

        {!loading && swing.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {swing.map(q => (
              <SwingCard key={q.symbol} q={q} capital={capitalAmount} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        )}
      </section>

      {/* ── SWING SHORT / PUT PLAYS ── */}
      {!loading && swingShort.length > 0 && (
        <section className="space-y-4">
          <div className="pb-1 border-b border-red-500/20">
            <h2 className="text-red-400 font-bold text-base">📉 Swing — Put Plays</h2>
            <p className="text-xs text-gray-600 mt-0.5">Below SMA 50 &amp; 200 · sector weakness · hold 3–14 days</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {swingShort.map(q => (
              <SwingCard key={q.symbol} q={q} capital={capitalAmount} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-700 pb-4">
        Options filtered: Δ ≥ 0.29 · contract cost $10–$50 · Δ 0.70–0.85 max.
        Entry / stop / target levels are <span className="text-amber-400/70">estimated</span> — verify structure on TradingView before entering.
      </p>
    </div>
  );
}
