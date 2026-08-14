'use client';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import LookCard from '@/components/stocks/LookCard';
import ScanControls from '@/components/stocks/ScanControls';
import NoTradeEmpty from '@/components/stocks/NoTradeEmpty';
import SmaLabel from '@/components/stocks/SmaLabel';
import { useFinvizScan } from '@/hooks/useFinvizScan';
import { STOCK_HONEST_GAPS } from '@/lib/stockQuality';

export default function StocksPage() {
  const {
    data,
    loading,
    load,
    watchlist,
    rvolThreshold,
    setRvolThreshold,
    scanMode,
    setScanMode,
    withQuality,
    looks,
    noTrades,
  } = useFinvizScan();

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

      <ScanControls
        watchlistLen={watchlist.length}
        scanMode={scanMode}
        setScanMode={setScanMode}
        rvolThreshold={rvolThreshold}
        setRvolThreshold={setRvolThreshold}
        onRefresh={load}
        loading={loading}
        source={data?.source}
        lastUpdated={data?.lastUpdated}
      />

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {!data?.sourceError && !loading && looks.length === 0 && (
        <NoTradeEmpty />
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
                  <span className="text-xs text-amber-300 font-mono">
                    RVOL {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                  </span>
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
