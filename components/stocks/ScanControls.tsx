'use client';
import SourceTag from '@/components/ui/SourceTag';
import { MARKET_TICKERS } from '@/store/tradeviStore';

export default function ScanControls({
  watchlistLen,
  scanMode,
  setScanMode,
  rvolThreshold,
  setRvolThreshold,
  onRefresh,
  loading,
  source,
  lastUpdated,
  showRvol = true,
}: {
  watchlistLen: number;
  scanMode: 'watchlist' | 'market';
  setScanMode: (mode: 'watchlist' | 'market') => void;
  rvolThreshold: number;
  setRvolThreshold: (n: number) => void;
  onRefresh: () => void;
  loading: boolean;
  source?: string;
  lastUpdated?: string;
  showRvol?: boolean;
}) {
  return (
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
          Watchlist ({watchlistLen})
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

      {showRvol && (
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
      )}

      <button
        onClick={onRefresh}
        disabled={loading}
        className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
      >
        {loading ? 'Loading...' : '↻ Refresh'}
      </button>

      <div className="ml-auto">
        {source && lastUpdated && <SourceTag source={source} lastUpdated={lastUpdated} />}
      </div>
    </div>
  );
}
