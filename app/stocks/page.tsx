'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import { STOCK_HONEST_GAPS, stockQuality } from '@/lib/stockQuality';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

function SmaLabel({ q }: { q: FinvizQuote }) {
  const fmt = (rel: 'above' | 'below' | null, label: string) => {
    if (rel === 'above') return <span key={label} className="text-emerald-400">{label}▲</span>;
    if (rel === 'below') return <span key={label} className="text-red-400">{label}▼</span>;
    return <span key={label} className="text-gray-600">{label}?</span>;
  };
  return (
    <div className="flex gap-1 text-xs font-mono">
      {fmt(q.sma20rel, '20')}
      {fmt(q.sma50rel, '50')}
      {fmt(q.sma200rel, '200')}
    </div>
  );
}

function LookCard({ q, threshold }: { q: FinvizQuote; threshold: number }) {
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
          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
        </span>
        {q.rvol !== null && <span className="text-xs text-gray-500 font-mono">RVOL {q.rvol.toFixed(2)}</span>}
      </div>
      <SmaLabel q={q} />
      <p className="text-[11px] text-gray-500">{quality.headline}</p>
      <div className="flex justify-end pt-1 border-t border-[#1e1e1e]">
        <TradingViewButton symbol={q.symbol} label="Confirm on TradingView" />
      </div>
    </div>
  );
}

export default function StocksPage() {
  const { watchlist, rvolThreshold, setRvolThreshold, scanMode, setScanMode } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

  const tickers = scanMode === 'market' ? MARKET_TICKERS : watchlist;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/finviz/screener?tickers=${tickers.join(',')}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, watchlist]);

  const quotes = data?.data ?? [];
  const withQuality = quotes
    .map((q) => ({ q, quality: stockQuality(q, rvolThreshold) }))
    .sort((a, b) => b.quality.score - a.quality.score || (b.q.rvol ?? 0) - (a.q.rvol ?? 0));

  const looks = withQuality.filter((row) => row.quality.label === 'LOOK');
  const noTrades = withQuality.filter((row) => row.quality.label === 'NO_TRADE');
  const unusual = withQuality.filter((row) => row.q.unusualVolume === true && (row.q.rvol ?? 0) >= 2);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stocks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Volume and SMA tape. Quality score, then a hard no-trade when the tape is weak. SMA is not
            structure — confirm CHOCH / BOS / FVG on TradingView.
          </p>
        </div>
        <StocksSubnav />
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 bg-[#111111] border border-[#1e1e1e] rounded-2xl">
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          <button
            onClick={() => setScanMode('watchlist')}
            className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
              scanMode === 'watchlist'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Watchlist ({watchlist.length})
          </button>
          <button
            onClick={() => setScanMode('market')}
            className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
              scanMode === 'market'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Market Scan ({MARKET_TICKERS.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="label">RVOL &ge;</span>
          <input
            type="number"
            value={rvolThreshold}
            step={0.1}
            min={0.5}
            max={10}
            onChange={(e) => setRvolThreshold(parseFloat(e.target.value) || 1.5)}
            className="w-16 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
        >
          {loading ? 'Loading...' : '↻ Refresh'}
        </button>

        <div className="ml-auto">
          {data && <SourceTag source={data.source ?? 'Loading...'} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {!data?.sourceError && !loading && looks.length === 0 && (
        <div className="border border-gray-500/30 bg-[#141414] rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Workstation read</div>
          <div className="text-2xl font-black text-gray-200">NO TRADE</div>
          <p className="text-sm text-gray-400 mt-1">
            Nothing on this scan has volume plus a directional lean. Sit out or wait for RVOL to show up.
          </p>
        </div>
      )}

      {looks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-widest">Look board</h2>
            <span className="text-xs text-gray-600">{looks.length} names — still confirm on TradingView</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {looks.slice(0, 8).map(({ q }) => (
              <LookCard key={q.symbol} q={q} threshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {unusual.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">Volume tape</h2>
            <span className="text-xs text-gray-600">Unusual volume — verdict still applies</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {unusual.map(({ q, quality }) => (
              <div key={q.symbol} className="bg-[#111111] border border-amber-500/20 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
                  <VerdictBadge quality={quality} />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-white font-mono font-semibold">
                    {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                  </span>
                  <span className="text-xs text-amber-300 font-mono">RVOL {q.rvol !== null ? q.rvol.toFixed(2) : '--'}</span>
                </div>
                <TradingViewButton symbol={q.symbol} label="Chart" />
              </div>
            ))}
          </div>
        </section>
      )}

      {withQuality.length > 0 && (
        <section>
          <h2 className="label mb-3">Full tape · {noTrades.length} marked no-trade</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#1e1e1e]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-[#2a2a2a] bg-[#0f0f0f]">
                  <th className="py-2.5 px-3 label">Symbol</th>
                  <th className="py-2.5 px-3 label">Verdict</th>
                  <th className="py-2.5 px-3 label">Quality</th>
                  <th className="py-2.5 px-3 label">Price</th>
                  <th className="py-2.5 px-3 label">% Chg</th>
                  <th className="py-2.5 px-3 label">RVOL</th>
                  <th className="py-2.5 px-3 label">SMA</th>
                  <th className="py-2.5 px-3 label">Group</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {withQuality.map(({ q, quality }, idx) => {
                  const rowBg = idx % 2 === 0 ? 'bg-[#111111]' : 'bg-[#0d0d0d]';
                  return (
                    <tr key={q.symbol} className={`${rowBg} border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors`}>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{q.symbol}</td>
                      <td className="py-2.5 px-3">
                        <VerdictBadge quality={quality} />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-300">{quality.score}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-200">
                        {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-mono font-semibold ${
                          (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {q.changePercent !== null
                          ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                          : '--'}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-mono font-semibold ${
                          (q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'
                        }`}
                      >
                        {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                      </td>
                      <td className="py-2.5 px-3">
                        <SmaLabel q={q} />
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-xs font-semibold ${
                            q.groupStrength === 'strong'
                              ? 'text-emerald-400'
                              : q.groupStrength === 'weak'
                              ? 'text-red-400'
                              : 'text-gray-600'
                          }`}
                        >
                          {q.groupStrength ?? '--'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <TradingViewButton symbol={q.symbol} label="Chart" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="text-xs text-gray-500 p-4 rounded-2xl bg-[#111111] border border-[#1e1e1e] space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gray-600">What this page does not do</div>
        <ul className="space-y-1">
          {STOCK_HONEST_GAPS.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
