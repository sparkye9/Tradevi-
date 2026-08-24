'use client';
import { useState } from 'react';
import DataUnavailable from '@/components/ui/DataUnavailable';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import LookCard from '@/components/stocks/LookCard';
import ScanControls from '@/components/stocks/ScanControls';
import NoTradeEmpty from '@/components/stocks/NoTradeEmpty';
import OptionsContracts from '@/components/stocks/OptionsContracts';
import { useFinvizScan } from '@/hooks/useFinvizScan';
import { STOCK_HONEST_GAPS, intradayTape } from '@/lib/stockQuality';

function IntradayExtras({ symbol }: { symbol: string }) {
  const [showOptions, setShowOptions] = useState(true);
  return (
    <div>
      <button
        onClick={() => setShowOptions((p) => !p)}
        className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
          showOptions
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'text-gray-500 border border-[#2a2a2a]'
        }`}
      >
        {showOptions ? '▼ Contracts' : '▶ Contracts'}
      </button>
      {showOptions && <OptionsContracts symbol={symbol} />}
    </div>
  );
}

export default function IntradayPage() {
  const {
    data,
    loading,
    load,
    watchlist,
    rvolThreshold,
    setRvolThreshold,
    scanMode,
    setScanMode,
    looks,
  } = useFinvizScan();

  const sessionLooks = looks.filter(({ q }) => intradayTape(q, rvolThreshold));
  const hot = sessionLooks.filter(
    ({ q }) => (q.rvol ?? 0) >= 2 || q.unusualVolume === true || q.newHighDay === true,
  );
  const rest = sessionLooks.filter((row) => !hot.includes(row));

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Intraday</h1>
          <p className="text-sm text-gray-500 mt-1">
            LOOK names with RVOL, unusual volume, or a new day high. Same quality engine as Discovery.
            Opening range and VWAP are confirmed on TradingView.
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

      {!loading && !data?.sourceError && sessionLooks.length === 0 && (
        <NoTradeEmpty detail="No LOOK names have session volume or a new high. Sit out or lower RVOL only if the tape actually shows up." />
      )}

      {hot.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">Volume tape</h2>
            <span className="text-xs text-gray-600">{hot.length} — still LOOK, still confirm</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hot.map(({ q }) => (
              <LookCard
                key={q.symbol}
                q={q}
                threshold={rvolThreshold}
                extras={<IntradayExtras symbol={q.symbol} />}
              />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">Look board</h2>
            <span className="text-xs text-gray-600">RVOL ≥ {rvolThreshold}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rest.map(({ q }) => (
              <LookCard
                key={q.symbol}
                q={q}
                threshold={rvolThreshold}
                extras={<IntradayExtras symbol={q.symbol} />}
              />
            ))}
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
