'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import SetupCard from '@/components/setup/SetupCard';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

export default function SwingPage() {
  const { watchlist } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);
  const [retestMap, setRetestMap] = useState<Record<string, boolean>>({});

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

  const longCandidates = (data?.data ?? []).filter(
    (q) => q.sma50rel === 'above' && q.sma200rel === 'above' && q.groupStrength === 'strong'
  );
  const shortCandidates = (data?.data ?? []).filter(
    (q) => q.sma50rel === 'below' && q.sma200rel === 'below' && q.groupStrength === 'weak'
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-white">Swing</h1>
        <p className="text-gray-500 text-sm mt-0.5">What can I hold for multiple days?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      <div className="text-xs text-gray-600">
        Filters: long = above SMA 50 + SMA 200 + group strong. Short = below SMA 50 + SMA 200 + group weak.
        Daily and 4H structure is read on TradingView.
      </div>

      {longCandidates.length > 0 && (
        <section>
          <h2 className="text-green-400 font-semibold text-sm mb-3">Long candidates ({longCandidates.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {longCandidates.map((q) => (
              <SetupCard
                key={q.symbol}
                quote={q}
                direction="LONG"
                waitForRetest={retestMap[q.symbol] ?? false}
                onWaitForRetestChange={(v) =>
                  setRetestMap((m) => ({ ...m, [q.symbol]: v }))
                }
              />
            ))}
          </div>
        </section>
      )}

      {shortCandidates.length > 0 && (
        <section>
          <h2 className="text-red-400 font-semibold text-sm mb-3">Short candidates ({shortCandidates.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {shortCandidates.map((q) => (
              <SetupCard
                key={q.symbol}
                quote={q}
                direction="SHORT"
                waitForRetest={retestMap[q.symbol] ?? false}
                onWaitForRetestChange={(v) =>
                  setRetestMap((m) => ({ ...m, [q.symbol]: v }))
                }
              />
            ))}
          </div>
        </section>
      )}

      {!loading && longCandidates.length === 0 && shortCandidates.length === 0 && !data?.sourceError && (
        <div className="text-gray-500 text-sm">No swing candidates meet the filter criteria.</div>
      )}
    </div>
  );
}
