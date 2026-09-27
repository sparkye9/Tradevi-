'use client';
import LearnBox from '@/components/ui/LearnBox';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import LookCard from '@/components/stocks/LookCard';
import ScanControls from '@/components/stocks/ScanControls';
import NoTradeEmpty from '@/components/stocks/NoTradeEmpty';
import StockTable from '@/components/stocks/StockTable';
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
  } = useFinvizScan();

  const unusual = withQuality.filter((row) => row.q.unusualVolume === true && (row.q.rvol ?? 0) >= 2);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stocks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Scans your watchlist (or the whole market) and rates each stock on volume and trend. LOOK means
            the signals agree; NO TRADE means they don&apos;t. Tap any stock to see why.
          </p>
        </div>
        <StocksSubnav />
      </div>

      <LearnBox
        summary="a scanner that ranks stocks on your watchlist by volume and trend."
        items={[
          { term: 'RVOL', text: 'Relative volume: today’s volume vs. normal. 2.0 means twice as much trading as usual — people are paying attention.' },
          { term: 'SMA 20 / 50 / 200', text: 'Simple moving averages: the average closing price over the last 20, 50 or 200 days. Price above them = uptrend-ish; below = downtrend-ish.' },
          { term: 'LOOK', text: 'Volume and trend line up well enough to be worth studying on a chart. It is not a buy button.' },
          { term: 'NO TRADE', text: 'The scan found nothing clean. Sitting out is a real, often correct, decision.' },
          { term: 'Quality', text: 'A 0–100 score from volume, trend and today’s move. Higher means more things agree — not that it will go up.' },
        ]}
        learnHref="/learn"
      />

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
            <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-widest">Worth a look</h2>
            <span className="text-xs text-gray-600">
              {looks.length} stock{looks.length === 1 ? '' : 's'} where volume and trend agree — verify on the chart
            </span>
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
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">Unusual volume</h2>
            <span className="text-xs text-gray-600">At least 2× normal volume — busy, but check the verdict</span>
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

      {withQuality.length > 0 && <StockTable rows={withQuality} rvolThreshold={rvolThreshold} />}

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
