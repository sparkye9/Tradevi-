'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

type Tag = 'INTRADAY' | 'SWING' | 'BOTH';

function deriveTag(q: FinvizQuote, threshold: number): Tag {
  const intraday = (q.rvol ?? 0) > threshold || q.newHighDay;
  const swing = q.sma50rel === 'above' && q.sma200rel === 'above' && q.groupStrength === 'strong';
  if (intraday && swing) return 'BOTH';
  if (swing) return 'SWING';
  return 'INTRADAY';
}

function autoScore(q: FinvizQuote, threshold: number): number {
  let n = 0;
  if ((q.rvol ?? 0) >= threshold) n++;
  if (q.unusualVolume) n++;
  if (q.newHighDay) n++;
  if (q.sma50rel === 'above') n++;
  if (q.sma200rel === 'above') n++;
  return n;
}

function TagBadge({ tag }: { tag: Tag }) {
  const colors =
    tag === 'INTRADAY' ? 'bg-blue-900/50 text-blue-300 border-blue-800' :
    tag === 'SWING' ? 'bg-purple-900/50 text-purple-300 border-purple-800' :
    'bg-emerald-900/50 text-emerald-300 border-emerald-800';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors}`}>
      {tag}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const colors = ['bg-gray-700', 'bg-red-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-400', 'bg-green-500'];
  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`h-2 w-3 rounded-sm ${i <= score ? colors[score] : 'bg-[#2a2a2a]'}`}
        />
      ))}
      <span className="ml-1 text-gray-500 text-xs">{score}/5</span>
    </div>
  );
}

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

function UnusualVolumeCard({ q }: { q: FinvizQuote }) {
  return (
    <div className="bg-[#111111] border border-amber-900/50 rounded-xl p-4 flex flex-col gap-2 hover:border-amber-700/60 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold font-mono text-lg">{q.symbol}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
          (q.rvol ?? 0) >= 3 ? 'bg-amber-900/50 text-amber-300 border-amber-700' :
          'bg-orange-900/40 text-orange-300 border-orange-800'
        }`}>
          RVOL {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-400 font-mono">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono font-semibold ${
          (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
        }`}>
          {q.changePercent !== null
            ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
            : '--'}
        </span>
        {q.newHighDay && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-300 border border-green-800">
            NEW HIGH
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <SmaLabel q={q} />
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>
    </div>
  );
}

export default function TradeDiscoveryPage() {
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

  const unusualVolumeItems = [...(data?.data ?? [])]
    .filter((q) => q.unusualVolume === true && (q.rvol ?? 0) >= 2)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  const sorted = [...(data?.data ?? [])].sort((a, b) => {
    const scoreDiff = autoScore(b, rvolThreshold) - autoScore(a, rvolThreshold);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.rvol ?? 0) - (a.rvol ?? 0);
  });

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white">Trade Discovery</h1>
        <p className="text-gray-500 text-sm mt-0.5">What is moving with conviction today?</p>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Scan mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-[#2a2a2a]">
          <button
            onClick={() => setScanMode('watchlist')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              scanMode === 'watchlist'
                ? 'bg-[#222] text-white'
                : 'bg-[#111] text-gray-500 hover:text-gray-300'
            }`}
          >
            Watchlist ({watchlist.length})
          </button>
          <button
            onClick={() => setScanMode('market')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              scanMode === 'market'
                ? 'bg-[#222] text-white'
                : 'bg-[#111] text-gray-500 hover:text-gray-300'
            }`}
          >
            Market Scan ({MARKET_TICKERS.length})
          </button>
        </div>

        {/* RVOL threshold */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 uppercase tracking-wider">RVOL &ge;</span>
          <input
            type="number"
            value={rvolThreshold}
            step={0.1}
            min={0.5}
            max={10}
            onChange={(e) => setRvolThreshold(parseFloat(e.target.value) || 1.5)}
            className="w-16 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-white font-mono text-xs"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-gray-300 hover:border-[#333] hover:text-white transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>

        <div className="ml-auto">
          {data && <SourceTag source={data.source ?? 'Loading...'} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* Unusual Volume Section */}
      {unusualVolumeItems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-wider">
              🔥 Unusual Volume
            </h2>
            <span className="text-xs text-amber-700 px-2 py-0.5 rounded-full bg-amber-950/50 border border-amber-900">
              {unusualVolumeItems.length} alerts
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {unusualVolumeItems.map((q) => (
              <UnusualVolumeCard key={q.symbol} q={q} />
            ))}
          </div>
          <div className="border-t border-[#1e1e1e] pt-4 mt-4" />
        </section>
      )}

      {/* Main candidates table */}
      {!data?.sourceError && sorted.length === 0 && !loading && (
        <div className="text-gray-500 text-sm">No data yet.</div>
      )}

      {sorted.length > 0 && (
        <section>
          <h2 className="text-white font-semibold text-sm mb-3 uppercase tracking-wider">
            All Candidates
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[#222222]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-[#2a2a2a] bg-[#0f0f0f]">
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">Symbol</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">Price</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">% Chg</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">RVOL</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">Vol</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">High</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">SMA</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">Group</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">Tag</th>
                  <th className="py-2.5 px-3 text-xs uppercase tracking-wider">Auto</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((q, idx) => {
                  const tag = deriveTag(q, rvolThreshold);
                  const score = autoScore(q, rvolThreshold);
                  const rowBg = idx % 2 === 0 ? 'bg-[#111]' : 'bg-[#0f0f0f]';
                  return (
                    <tr
                      key={q.symbol}
                      className={`${rowBg} border-b border-[#1a1a1a] hover:bg-[#181818] hover:border-[#333333] transition-colors`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-white">
                        {q.symbol}
                        {q.newHighDay && (
                          <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-emerald-400" title="New High" />
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-200">
                        {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                      </td>
                      <td className={`py-2.5 px-3 font-mono font-semibold ${
                        (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {q.changePercent !== null
                          ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                          : '--'}
                      </td>
                      <td className={`py-2.5 px-3 font-mono font-semibold ${
                        (q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'
                      }`}>
                        {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {q.unusualVolume ? (
                          <span className="text-amber-400 text-xs font-medium">UV</span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {q.newHighDay ? (
                          <span className="text-emerald-400 text-xs font-medium">NEW</span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <SmaLabel q={q} />
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs ${
                          q.groupStrength === 'strong' ? 'text-emerald-400' :
                          q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-600'
                        }`}>
                          {q.groupStrength ?? '--'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <TagBadge tag={tag} />
                      </td>
                      <td className="py-2.5 px-3">
                        <ScoreBar score={score} />
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

      <div className="text-xs text-gray-600 mt-4">
        Structure (CHOCH, BOS, FVG, VWAP) is read live on TradingView — not computed here.
      </div>
    </div>
  );
}
