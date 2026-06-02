'use client';
import { useState } from 'react';
import StatusBadge, { StatusType } from '@/components/ui/StatusBadge';
import ConditionRow from '@/components/ui/ConditionRow';
import ManualChecklist from '@/components/ui/ManualChecklist';
import TradingViewButton from '@/components/ui/TradingViewButton';
import SourceTag from '@/components/ui/SourceTag';
import { useTradeviStore, ManualCheck } from '@/store/tradeviStore';
import type { FinvizQuote } from '@/lib/finviz';

export interface AutoConditions {
  rvolAboveThreshold: boolean | null;
  unusualVolume: boolean | null;
  newHighDay: boolean | null;
  aboveSma50: boolean | null;
  aboveSma200: boolean | null;
  groupStrong: boolean | null;
}

function countMet(auto: AutoConditions): number {
  return Object.values(auto).filter((v) => v === true).length;
}

export function deriveStatus(auto: AutoConditions, manual: ManualCheck): StatusType {
  const autoCount = countMet(auto);
  const allManualDone = Object.values(manual).every(Boolean);
  if (autoCount <= 1) return 'AVOID';
  if (autoCount >= 4 && allManualDone) return 'READY';
  if (autoCount >= 3) return 'WATCH';
  return 'WATCH';
}

function buildAutoConditions(
  quote: FinvizQuote,
  rvolThreshold: number
): AutoConditions {
  return {
    rvolAboveThreshold:
      quote.rvol !== null ? quote.rvol >= rvolThreshold : null,
    unusualVolume: quote.unusualVolume,
    newHighDay: quote.newHighDay,
    aboveSma50: quote.sma50rel !== null ? quote.sma50rel === 'above' : null,
    aboveSma200: quote.sma200rel !== null ? quote.sma200rel === 'above' : null,
    groupStrong:
      quote.groupStrength !== null ? quote.groupStrength === 'strong' : null,
  };
}

type Tag = 'INTRADAY' | 'SWING' | 'BOTH';

function deriveTag(auto: AutoConditions): Tag {
  const intraday = auto.rvolAboveThreshold === true || auto.newHighDay === true;
  const swing = auto.aboveSma50 === true && auto.aboveSma200 === true && auto.groupStrong === true;
  if (intraday && swing) return 'BOTH';
  if (swing) return 'SWING';
  return 'INTRADAY';
}

interface Props {
  quote: FinvizQuote;
  direction?: 'LONG' | 'SHORT';
  waitForRetest?: boolean;
  onWaitForRetestChange?: (v: boolean) => void;
}

export default function SetupCard({ quote, direction, waitForRetest, onWaitForRetestChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { manualChecks, rvolThreshold } = useTradeviStore();
  const manual = manualChecks[quote.symbol] ?? {
    choch: false, bos: false, fvg: false, vwap: false, marketAligned: false,
  };

  const auto = buildAutoConditions(quote, rvolThreshold);
  const autoCount = countMet(auto);
  const manualCount = Object.values(manual).filter(Boolean).length;
  const tag = deriveTag(auto);

  let status: StatusType = deriveStatus(auto, manual);
  if (waitForRetest) status = 'WAIT_FOR_RETEST';

  const autoConditionLabels: { key: keyof AutoConditions; label: string }[] = [
    { key: 'rvolAboveThreshold', label: `RVOL >= ${rvolThreshold}` },
    { key: 'unusualVolume', label: 'Unusual volume (RVOL >= 2)' },
    { key: 'newHighDay', label: 'New high of day' },
    { key: 'aboveSma50', label: 'Above SMA 50' },
    { key: 'aboveSma200', label: 'Above SMA 200' },
    { key: 'groupStrong', label: 'Group strength: strong' },
  ];

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-base">{quote.symbol}</span>
          {direction && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              direction === 'LONG'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {direction}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#252525] text-gray-400 border border-[#2a2a2a]">
            {tag}
          </span>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Price row */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-200 font-mono">
          {quote.price !== null ? `$${quote.price.toFixed(2)}` : '--'}
        </span>
        <span
          className={`font-mono text-sm ${
            quote.changePercent !== null && quote.changePercent >= 0
              ? 'text-green-400'
              : 'text-red-400'
          }`}
        >
          {quote.changePercent !== null
            ? `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`
            : '--'}
        </span>
        {quote.rvol !== null && (
          <span className="text-gray-500 text-xs">RVOL {quote.rvol.toFixed(2)}</span>
        )}
      </div>

      {/* Automated conditions */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Automated {autoCount} of 5</div>
        {autoConditionLabels.slice(0, 5).map(({ key, label }) => (
          <ConditionRow key={key} label={label} met={auto[key]} />
        ))}
      </div>

      {/* Manual conditions */}
      <div>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
        >
          <span className="text-gray-600">{expanded ? '▼' : '▶'}</span>
          Manual {manualCount} of 5
        </button>
        {expanded && (
          <div className="mt-2">
            <ManualChecklist symbol={quote.symbol} />
          </div>
        )}
      </div>

      {/* Wait for retest override */}
      {onWaitForRetestChange && (
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={waitForRetest ?? false}
            onChange={(e) => onWaitForRetestChange(e.target.checked)}
            className="accent-orange-500"
          />
          Wait for retest
        </label>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <SourceTag source="Finviz Elite" lastUpdated={quote.lastUpdated} />
        <TradingViewButton symbol={quote.symbol} />
      </div>
    </div>
  );
}
