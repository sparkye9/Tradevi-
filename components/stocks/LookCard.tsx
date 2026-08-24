'use client';
import type { ReactNode } from 'react';
import TradingViewButton from '@/components/ui/TradingViewButton';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import SmaLabel from '@/components/stocks/SmaLabel';
import { stockQuality } from '@/lib/stockQuality';
import type { FinvizQuote } from '@/lib/finviz';

export default function LookCard({
  q,
  threshold,
  extras,
}: {
  q: FinvizQuote;
  threshold: number;
  extras?: ReactNode;
}) {
  const quality = stockQuality(q, threshold);
  const chgColor = (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="bg-[#111111] border border-emerald-500/20 rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
        <VerdictBadge quality={quality} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-white font-mono font-semibold">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono font-semibold ${chgColor}`}>
          {q.changePercent !== null
            ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
            : '--'}
        </span>
        {q.rvol !== null && <span className="text-xs text-gray-500 font-mono">RVOL {q.rvol.toFixed(2)}</span>}
        {q.newHighDay && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            NEW HIGH
          </span>
        )}
      </div>
      <SmaLabel q={q} />
      <p className="text-[11px] text-gray-500">{quality.headline}</p>
      {extras}
      <div className="flex justify-end pt-1 border-t border-[#1e1e1e]">
        <TradingViewButton symbol={q.symbol} label="Confirm on TradingView" />
      </div>
    </div>
  );
}
