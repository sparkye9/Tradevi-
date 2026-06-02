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
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors}`}>
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
    <div className="bg-[#111111] border border-amber-500/30 rounded-2xl p-4 flex flex-col gap-2 hover:bg-[#161616] hover:border-amber-500/50 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          RVOL {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white font-mono font-semibold">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
        </span>
        {q.newHighDay && (
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
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

  // Hidden Gems: RVOL >= 3, not in the obvious mega-caps, strong momentum
  const MEGA_CAPS = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','SPY','QQQ','IWM','DIA'];
  const hiddenGems = [...(data?.data ?? [])]
    .filter((q) =>
      (q.rvol ?? 0) >= 3 &&
      !MEGA_CAPS.includes(q.symbol) &&
      Math.abs(q.changePercent ?? 0) >= 1.5
    )
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0))
    .slice(0, 12);

  const sorted = [...(data?.data ?? [])].sort((a, b) => {
    const scoreDiff = autoScore(b, rvolThreshold) - autoScore(a, rvolThreshold);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.rvol ?? 0) - (a.rvol ?? 0);
  });

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Trade Discovery</h1>
        <p className="text-sm text-gray-500 mt-1">What is moving with conviction today?</p>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-[#111111] border border-[#1e1e1e] rounded-2xl">
        {/* Scan mode toggle — pill style */}
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

        {/* RVOL threshold */}
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

        {/* Refresh */}
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

      {/* Unusual Volume Section */}
      {unusualVolumeItems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">
              🔥 UNUSUAL VOLUME
            </h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {unusualVolumeItems.length} alerts
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {unusualVolumeItems.map((q) => (
              <UnusualVolumeCard key={q.symbol} q={q} />
            ))}
          </div>
          {unusualVolumeItems.length === 0 && (
            <p className="text-gray-600 text-sm">No unusual volume detected</p>
          )}
          <div className="border-t border-[#1e1e1e] pt-4 mt-4" />
        </section>
      )}

      {!data?.sourceError && unusualVolumeItems.length === 0 && !loading && (
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <span>🔥</span>
          <span className="label">Unusual Volume</span>
          <span className="text-gray-700">— No unusual volume detected</span>
        </div>
      )}

      {/* Hidden Gems */}
      {hiddenGems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-purple-400 font-bold text-sm uppercase tracking-widest">💎 Hidden Gems</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {hiddenGems.length}
            </span>
            <span className="text-xs text-gray-600">RVOL 3x+ — strong momentum, not the obvious names</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {hiddenGems.map((q) => (
              <div key={q.symbol} className="bg-[#111111] border border-purple-500/30 rounded-2xl p-4 flex flex-col gap-2 hover:bg-[#161616] hover:border-purple-500/50 transition-all">
                <div className="flex items-start justify-between">
                  <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    RVOL {q.rvol!.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono font-semibold">
                    {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                  </span>
                  <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
                  </span>
                  {q.newHighDay && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">HIGH</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs font-mono">
                  {q.sma50rel === 'above' ? <span className="text-emerald-400">50▲</span> : <span className="text-red-400">50▼</span>}
                  {q.sma200rel === 'above' ? <span className="text-emerald-400">200▲</span> : <span className="text-red-400">200▼</span>}
                  {q.sector && <span className="text-gray-600 ml-1">{q.sector}</span>}
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[#1e1e1e]">
                  <span className="text-xs text-gray-700">Verify structure on chart</span>
                  <TradingViewButton symbol={q.symbol} label="Chart" />
                </div>
              </div>
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
          <h2 className="label mb-3">All Candidates</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#1e1e1e]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-[#2a2a2a] bg-[#0f0f0f]">
                  <th className="py-2.5 px-3 label">Symbol</th>
                  <th className="py-2.5 px-3 label">Price</th>
                  <th className="py-2.5 px-3 label">% Chg</th>
                  <th className="py-2.5 px-3 label">RVOL</th>
                  <th className="py-2.5 px-3 label">Vol</th>
                  <th className="py-2.5 px-3 label">High</th>
                  <th className="py-2.5 px-3 label">SMA</th>
                  <th className="py-2.5 px-3 label">Group</th>
                  <th className="py-2.5 px-3 label">Tag</th>
                  <th className="py-2.5 px-3 label">Auto</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((q, idx) => {
                  const tag = deriveTag(q, rvolThreshold);
                  const score = autoScore(q, rvolThreshold);
                  const rowBg = idx % 2 === 0 ? 'bg-[#111111]' : 'bg-[#0d0d0d]';
                  return (
                    <tr
                      key={q.symbol}
                      className={`${rowBg} border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors`}
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
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">UV</span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {q.newHighDay ? (
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">NEW</span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <SmaLabel q={q} />
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs font-semibold ${
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

      <div className="text-xs text-gray-700 mt-4">
        Structure (CHOCH, BOS, FVG, VWAP) is read live on TradingView — not computed here.
      </div>
    </div>
  );
}
