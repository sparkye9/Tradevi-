'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore } from '@/store/tradeviStore';
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

function MaIcon({ rel }: { rel: 'above' | 'below' | null }) {
  if (rel === 'above') return <span className="text-green-500 text-xs">A</span>;
  if (rel === 'below') return <span className="text-red-500 text-xs">B</span>;
  return <span className="text-gray-600 text-xs">--</span>;
}

export default function TradeDiscoveryPage() {
  const { watchlist, rvolThreshold } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/finviz/screener?tickers=${watchlist.join(',')}`);
        const json = await res.json();
        setData(json);
      } catch {
        setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
      }
      setLoading(false);
    }
    load();
  }, [watchlist]);

  const unusualVolumeItems = [...(data?.data ?? [])]
    .filter((q) => q.unusualVolume === true && (q.rvol ?? 0) >= 2)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  const sorted = [...(data?.data ?? [])].sort((a, b) => {
    const scoreDiff = autoScore(b, rvolThreshold) - autoScore(a, rvolThreshold);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.rvol ?? 0) - (a.rvol ?? 0);
  });

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white">Trade Discovery</h1>
        <p className="text-gray-500 text-sm mt-0.5">What is moving with conviction today?</p>
      </div>

      <div className="flex items-center justify-between">
        {data && <SourceTag source="Finviz Elite" lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {!data?.sourceError && sorted.length === 0 && !loading && (
        <div className="text-gray-500 text-sm">No data yet.</div>
      )}

      {sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b border-[#2a2a2a]">
                <th className="py-2 pr-4">Symbol</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">% Chg</th>
                <th className="py-2 pr-4">RVOL</th>
                <th className="py-2 pr-4">Unusual Vol</th>
                <th className="py-2 pr-4">New High</th>
                <th className="py-2 pr-4 text-center">SMA 20/50/200</th>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Tag</th>
                <th className="py-2 pr-4">Auto</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((q) => {
                const tag = deriveTag(q, rvolThreshold);
                const score = autoScore(q, rvolThreshold);
                return (
                  <tr key={q.symbol} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
                    <td className="py-2 pr-4 font-mono font-bold text-white">{q.symbol}</td>
                    <td className="py-2 pr-4 font-mono text-gray-200">
                      {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                    </td>
                    <td className={`py-2 pr-4 font-mono ${
                      q.changePercent !== null && q.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {q.changePercent !== null
                        ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                        : '--'}
                    </td>
                    <td className={`py-2 pr-4 font-mono ${
                      (q.rvol ?? 0) >= rvolThreshold ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {q.unusualVolume ? (
                        <span className="text-green-500">Y</span>
                      ) : (
                        <span className="text-gray-600">N</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {q.newHighDay ? (
                        <span className="text-green-500">Y</span>
                      ) : (
                        <span className="text-gray-600">N</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1 justify-center">
                        <MaIcon rel={q.sma20rel} />
                        <span className="text-gray-600">/</span>
                        <MaIcon rel={q.sma50rel} />
                        <span className="text-gray-600">/</span>
                        <MaIcon rel={q.sma200rel} />
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs ${
                        q.groupStrength === 'strong' ? 'text-green-400' :
                        q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-500'
                      }`}>
                        {q.groupStrength ?? '--'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#252525] text-gray-400 border border-[#2a2a2a]">
                        {tag}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{score} of 5</td>
                    <td className="py-2">
                      <TradingViewButton symbol={q.symbol} label="Chart" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-600 mt-4">
        Structure (CHOCH, BOS, FVG, VWAP) is read live on TradingView -- not computed here.
      </div>
    </div>
  );
}
