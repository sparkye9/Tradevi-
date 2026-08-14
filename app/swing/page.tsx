'use client';
import { useState } from 'react';
import DataUnavailable from '@/components/ui/DataUnavailable';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import LookCard from '@/components/stocks/LookCard';
import ScanControls from '@/components/stocks/ScanControls';
import NoTradeEmpty from '@/components/stocks/NoTradeEmpty';
import OptionsContracts from '@/components/stocks/OptionsContracts';
import ManualChecklist from '@/components/ui/ManualChecklist';
import { useFinvizScan } from '@/hooks/useFinvizScan';
import { STOCK_HONEST_GAPS, smaTrendAligned } from '@/lib/stockQuality';

function SwingExtras({ symbol }: { symbol: string }) {
  const [showChecklist, setShowChecklist] = useState(false);
  const [showOptions, setShowOptions] = useState(true);
  return (
    <div className="space-y-2">
      <button
        onClick={() => setShowChecklist((p) => !p)}
        className="text-xs text-gray-500 hover:text-gray-300"
      >
        {showChecklist ? '▼' : '▶'} Manual checklist
      </button>
      {showChecklist && <ManualChecklist symbol={symbol} />}
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

export default function SwingPage() {
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

  const swingLooks = looks.filter(({ q }) => smaTrendAligned(q));
  const longs = swingLooks.filter(({ quality }) => quality.side === 'long');
  const shorts = swingLooks.filter(({ quality }) => quality.side === 'short');

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Swing</h1>
          <p className="text-sm text-gray-500 mt-1">
            LOOK names with SMA 50 and 200 aligned. Same quality engine as Discovery — not a 0–5 score.
            Daily and 4H structure is read on TradingView.
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

      {!loading && !data?.sourceError && swingLooks.length === 0 && (
        <NoTradeEmpty
          detail="No LOOK names have SMA 50 and 200 on the same side. Sit out or wait for the tape to align."
        />
      )}

      {longs.length > 0 && (
        <section>
          <h2 className="text-emerald-400 font-semibold text-sm mb-3 uppercase tracking-widest">
            Look long ({longs.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {longs.map(({ q }) => (
              <LookCard
                key={q.symbol}
                q={q}
                threshold={rvolThreshold}
                extras={<SwingExtras symbol={q.symbol} />}
              />
            ))}
          </div>
        </section>
      )}

      {shorts.length > 0 && (
        <section>
          <h2 className="text-red-400 font-semibold text-sm mb-3 uppercase tracking-widest">
            Look short ({shorts.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {shorts.map(({ q }) => (
              <LookCard
                key={q.symbol}
                q={q}
                threshold={rvolThreshold}
                extras={<SwingExtras symbol={q.symbol} />}
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
