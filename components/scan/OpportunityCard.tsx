'use client';
import { useState } from 'react';
import TradingViewButton from '@/components/ui/TradingViewButton';
import ManualChecklist from '@/components/ui/ManualChecklist';
import OptionsPanel from '@/components/options/OptionsPanel';
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
import { isBeginner, isAdvanced, volumeLabel, trendLabel, sectorLabel } from '@/lib/labels';
import type { FinvizQuote } from '@/lib/finviz';
import type { TradierContract, TradierOptionsResult } from '@/lib/tradier';

// The one candidate card every scan screen renders. Previously this existed
// as five near-identical, independently-drifting copies across Dashboard,
// Trade Discovery, Swing, Intraday, and Power Hour.

interface Props {
  q: FinvizQuote;
  rvolThreshold: number;
  timeframe: 'intraday' | 'swing';
  capital?: number;
  defaultOptionsOpen?: boolean;
}

export default function OpportunityCard({ q, rvolThreshold, timeframe, capital, defaultOptionsOpen = false }: Props) {
  const { experienceMode } = useTradeviStore();
  const beginner = isBeginner(experienceMode);
  const advanced = isAdvanced(experienceMode);

  const [showManual, setShowManual] = useState(false);
  const [showOptions, setShowOptions] = useState(defaultOptionsOpen);
  const [showSizing, setShowSizing] = useState(false);
  const [sizingContracts, setSizingContracts] = useState<TradierContract[] | null>(null);
  const [loadingSizing, setLoadingSizing] = useState(false);

  async function toggleSizing() {
    if (sizingContracts !== null) { setShowSizing((p) => !p); return; }
    setLoadingSizing(true);
    setShowSizing(true);
    try {
      const res = await fetch(`/api/tradier/options?symbol=${q.symbol}&cheap=true`);
      const json: TradierOptionsResult = await res.json();
      setSizingContracts(json.contracts ?? []);
    } catch {
      setSizingContracts([]);
    }
    setLoadingSizing(false);
  }

  const score = computeOpportunityScore(q, rvolThreshold);
  const direction = deriveDirection(q);
  const reason = beginner ? generateBeginnerReason(q) : generateReason(q);
  const intradayLvl = timeframe === 'intraday' && q.price ? computeIntradayLevels(q.price, direction) : null;
  const swingLvl = timeframe === 'swing' && q.price ? computeSwingLevels(q.price, direction) : null;

  const scoreColor = score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-gray-500';
  const dirColor = direction === 'BULLISH' ? 'text-emerald-400' : direction === 'BEARISH' ? 'text-red-400' : 'text-amber-400';
  const dirBg = direction === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/30' : direction === 'BEARISH' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30';
  const cardBorder = direction === 'BULLISH' ? 'border-emerald-500/20 hover:border-emerald-500/40' : direction === 'BEARISH' ? 'border-red-500/20 hover:border-red-500/40' : 'border-[#1e1e1e] hover:border-[#2a2a2a]';

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
            {beginner ? (direction === 'BULLISH' ? 'BUY' : direction === 'BEARISH' ? 'SELL' : 'WATCH') : direction}
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

      {/* Levels */}
      {intradayLvl && (
        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-2">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">Entry</div>
            <div className="text-white font-semibold">${intradayLvl.entry.toFixed(2)}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-red-500/20 rounded-lg p-2">
            <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Stop</div>
            <div className="text-red-400 font-semibold">${intradayLvl.stop.toFixed(2)}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/20 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T1 / T2</div>
            <div className="text-emerald-400 font-semibold">${intradayLvl.t1} / ${intradayLvl.t2}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T3 · R:R</div>
            <div className="text-emerald-400 font-semibold">${intradayLvl.t3} · {intradayLvl.rr}x</div>
          </div>
        </div>
      )}
      {swingLvl && (
        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-2">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">Entry Zone</div>
            <div className="text-white font-semibold">{swingLvl.entryZone}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-red-500/20 rounded-lg p-2">
            <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Invalidation</div>
            <div className="text-red-400 font-semibold">{swingLvl.invalidation}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/20 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T1 / T2</div>
            <div className="text-emerald-400 font-semibold">${swingLvl.t1} / ${swingLvl.t2}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg p-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">T3 · R:R</div>
            <div className="text-emerald-400 font-semibold">${swingLvl.t3} · {swingLvl.rr}x</div>
          </div>
        </div>
      )}

      {/* Hold + reason */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Hold:</span>
          <span className="text-gray-400">{intradayLvl?.holdTime ?? swingLvl?.holdTime ?? '--'}</span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{reason}</p>
      </div>

      {/* Manual structure checklist — Advanced mode only */}
      {advanced && (
        <div>
          <button
            onClick={() => setShowManual((p) => !p)}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <span>{showManual ? '▼' : '▶'}</span>
            <span>Manual Structure Checklist</span>
          </button>
          {showManual && (
            <div className="mt-2">
              <ManualChecklist symbol={q.symbol} />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#1e1e1e]">
        <button
          onClick={() => setShowOptions((p) => !p)}
          className={`flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg transition-all border ${
            showOptions
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'text-gray-500 hover:text-gray-300 border-[#2a2a2a] hover:border-[#3a3a3a]'
          }`}
        >
          {showOptions ? '▼ Contracts' : '▶ Contracts'}
        </button>
        {capital !== undefined && (
          <button
            onClick={toggleSizing}
            disabled={loadingSizing}
            className={`flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg transition-all border disabled:opacity-50 ${
              showSizing
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'text-gray-500 hover:text-gray-300 border-[#2a2a2a] hover:border-[#3a3a3a]'
            }`}
          >
            {loadingSizing ? 'Loading...' : showSizing ? '▼ Position Sizing' : '▶ Position Sizing'}
          </button>
        )}
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>

      {showOptions && <OptionsPanel symbol={q.symbol} bordered={false} />}
      {showSizing && !loadingSizing && capital !== undefined && (
        <PositionSizing price={q.price} capital={capital} contracts={sizingContracts ?? []} />
      )}
    </div>
  );
}
