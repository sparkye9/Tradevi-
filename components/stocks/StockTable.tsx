'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import TradingViewButton from '@/components/ui/TradingViewButton';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import SmaLabel from '@/components/stocks/SmaLabel';
import { plainReasons, type StockQuality } from '@/lib/stockQuality';
import type { FinvizQuote } from '@/lib/finviz';

type Row = { q: FinvizQuote; quality: StockQuality };

/** Full scan results: search, LOOK-only filter, and tap-to-explain rows. */
export default function StockTable({ rows, rvolThreshold }: { rows: Row[]; rvolThreshold: number }) {
  const [query, setQuery] = useState('');
  const [looksOnly, setLooksOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const filtered = rows.filter(
    ({ q, quality }) =>
      (!looksOnly || quality.label === 'LOOK') && (!query || q.symbol.includes(query.trim().toUpperCase())),
  );
  const noTradeCount = rows.filter((r) => r.quality.label === 'NO_TRADE').length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="label">
          All results · {rows.length - noTradeCount} LOOK · {noTradeCount} no-trade
        </h2>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tv-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find ticker"
            aria-label="Filter by ticker"
            className="w-32 bg-tv-bg border border-tv-border rounded-full pl-7 pr-3 py-1 text-xs font-mono text-white uppercase focus:border-tv-purple outline-none"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={looksOnly} onChange={(e) => setLooksOnly(e.target.checked)} className="accent-[#22E38A]" />
          LOOK only
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#1e1e1e]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-[#2a2a2a] bg-[#0f0f0f]">
              <th className="py-2.5 px-3 label">Stock</th>
              <th className="py-2.5 px-3 label">Verdict</th>
              <th className="py-2.5 px-3 label" title="0–100: how many signals agree">Score</th>
              <th className="py-2.5 px-3 label">Price</th>
              <th className="py-2.5 px-3 label">Today</th>
              <th className="py-2.5 px-3 label" title="Today's volume vs normal (RVOL)">Volume vs normal</th>
              <th className="py-2.5 px-3 label hidden md:table-cell" title="Price vs 20/50/200-day moving averages. ▲ above, ▼ below">
                Trend (SMA)
              </th>
              <th className="py-2.5 px-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-tv-muted">
                  No stocks match.
                </td>
              </tr>
            )}
            {filtered.map(({ q, quality }) => {
              const isOpen = open === q.symbol;
              return (
                <Fragment key={q.symbol}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : q.symbol)}
                    className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${
                      isOpen ? 'bg-tv-purple/10' : 'bg-[#111111] hover:bg-[#161616]'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-white">{q.symbol}</td>
                    <td className="py-2.5 px-3">
                      <VerdictBadge quality={quality} />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">{quality.score}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-200">{q.price !== null ? `$${q.price.toFixed(2)}` : '--'}</td>
                    <td
                      className={`py-2.5 px-3 font-mono font-semibold ${
                        (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
                    </td>
                    <td
                      className={`py-2.5 px-3 font-mono font-semibold ${
                        (q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'
                      }`}
                    >
                      {q.rvol !== null ? `${q.rvol.toFixed(2)}×` : '--'}
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      <SmaLabel q={q} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <ChevronDown size={15} className={`inline text-tv-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-tv-purple/[0.06] border-b border-[#1a1a1a]">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex flex-col md:flex-row md:items-start gap-3">
                          <ul className="space-y-1 flex-1">
                            {plainReasons(q, rvolThreshold).map((r) => (
                              <li key={r.text} className="flex items-start gap-1.5 text-xs">
                                {r.ok ? (
                                  <Check size={13} className="text-tv-green shrink-0 mt-px" />
                                ) : (
                                  <X size={13} className="text-gray-600 shrink-0 mt-px" />
                                )}
                                <span className={r.ok ? 'text-gray-200' : 'text-gray-500'}>{r.text}</span>
                              </li>
                            ))}
                            {q.sector && (
                              <li className="text-[11px] text-tv-muted pl-5">
                                {q.sector}
                                {q.industry ? ` · ${q.industry}` : ''}
                              </li>
                            )}
                          </ul>
                          <div className="flex items-center gap-3 shrink-0">
                            <Link
                              href={`/options?symbol=${encodeURIComponent(q.symbol)}`}
                              className="text-xs font-semibold text-tv-purple hover:text-white"
                            >
                              Options chain →
                            </Link>
                            <TradingViewButton symbol={q.symbol} label="Verify on chart" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-tv-muted">Tap any row to see why it got its verdict.</p>
    </section>
  );
}
