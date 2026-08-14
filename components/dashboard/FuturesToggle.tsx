'use client';
import { DESK_FUTURES, type DeskInstrument, type TrendBiasStackResult } from '@/lib/trendBias';
import type { FinvizFuture } from '@/lib/finviz';

function tapeFor(instrument: DeskInstrument, futures: FinvizFuture[]): FinvizFuture | undefined {
  const row = DESK_FUTURES.find((f) => f.instrument === instrument);
  return futures.find((f) => f.symbol === row?.tape);
}

export default function FuturesToggle({
  selected,
  onSelect,
  futures,
  stacks,
  loadingInstrument,
}: {
  selected: DeskInstrument;
  onSelect: (instrument: DeskInstrument) => void;
  futures: FinvizFuture[];
  stacks: Partial<Record<DeskInstrument, TrendBiasStackResult>>;
  loadingInstrument: DeskInstrument | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {DESK_FUTURES.map((row) => {
        const tape = tapeFor(row.instrument, futures);
        const stack = stacks[row.instrument];
        const on = selected === row.instrument;
        const chg = tape?.changePercent;
        const chgColor =
          chg == null ? 'text-tv-muted' : chg >= 0 ? 'text-tv-green' : 'text-tv-red';
        const status =
          loadingInstrument === row.instrument
            ? '…'
            : stack
            ? stack.quality.label === 'TRADE'
              ? 'LOOK'
              : stack.quality.label === 'WAIT'
              ? 'WAIT'
              : 'NO TRADE'
            : tape?.direction === 'up'
            ? '▲'
            : tape?.direction === 'down'
            ? '▼'
            : '—';
        return (
          <button
            key={row.instrument}
            type="button"
            onClick={() => onSelect(row.instrument)}
            className={`min-w-[7.5rem] text-left rounded-2xl border px-3 py-2.5 transition-colors ${
              on
                ? 'border-tv-purple/50 bg-tv-purple/15'
                : 'border-tv-border bg-tv-surface hover:border-tv-purple/30'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-bold font-mono ${on ? 'text-tv-purple' : 'text-white'}`}>
                {row.instrument}
              </span>
              <span className="text-[10px] font-semibold tracking-wide text-tv-muted">{status}</span>
            </div>
            <div className="text-[10px] text-tv-muted mt-0.5">{row.name}</div>
            <div className="flex items-baseline gap-1.5 mt-1 font-mono">
              <span className="text-xs text-white">
                {tape?.price != null ? tape.price.toLocaleString() : '—'}
              </span>
              <span className={`text-[11px] ${chgColor}`}>
                {chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '—'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
