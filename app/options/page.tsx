'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import ScanControls from '@/components/stocks/ScanControls';
import NoTradeEmpty from '@/components/stocks/NoTradeEmpty';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import { useFinvizScan } from '@/hooks/useFinvizScan';
import { STOCK_HONEST_GAPS } from '@/lib/stockQuality';
import type { TradierOptionsResult, TradierContract } from '@/lib/tradier';
import type { YahooOptionsResult } from '@/lib/yahoo-fallback';

type OptionsResult = (TradierOptionsResult | YahooOptionsResult) & { tradierError?: string };

function fmtGreek(n: number | null): string {
  if (n === null) return '--';
  return n.toFixed(3);
}

function ContractsTable({
  contracts,
  isTradier,
}: {
  contracts: TradierContract[];
  isTradier: boolean;
}) {
  const calls = contracts.filter((c) => c.type === 'call').slice(0, 10);
  const puts = contracts.filter((c) => c.type === 'put').slice(0, 10);

  function Row({ c }: { c: TradierContract }) {
    return (
      <tr className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
        <td className="py-1.5 pr-3 font-mono text-xs text-gray-300">${c.strike}</td>
        <td className="py-1.5 pr-3 text-xs text-gray-400">{c.expiration}</td>
        <td className="py-1.5 pr-3 font-mono text-xs text-blue-300">{fmtGreek(c.delta)}</td>
        {isTradier && (
          <>
            <td className="py-1.5 pr-3 font-mono text-xs text-gray-400">{fmtGreek(c.gamma)}</td>
            <td className="py-1.5 pr-3 font-mono text-xs text-gray-400">{fmtGreek(c.theta)}</td>
          </>
        )}
        <td className="py-1.5 pr-3 font-mono text-xs text-gray-300">
          {c.iv !== null ? `${(c.iv * 100).toFixed(1)}%` : '--'}
        </td>
        <td className="py-1.5 pr-3 font-mono text-xs text-gray-400">{c.volume ?? '--'}</td>
        <td className="py-1.5 pr-3 font-mono text-xs text-gray-400">{c.openInterest ?? '--'}</td>
        <td className="py-1.5 pr-3 font-mono text-xs text-green-400">{c.bid ?? '--'}</td>
        <td className="py-1.5 font-mono text-xs text-red-400">{c.ask ?? '--'}</td>
      </tr>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="text-gray-500 text-sm">
        No contracts meet filter criteria (delta 0.20-0.70, vol &gt; 50, OI &gt; 100).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {calls.length > 0 && (
        <div>
          <div className="text-xs text-green-400 font-medium mb-1">Calls</div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-600 border-b border-[#2a2a2a] text-xs">
                <th className="py-1 pr-3">Strike</th>
                <th className="py-1 pr-3">Exp</th>
                <th className="py-1 pr-3">Delta</th>
                {isTradier && (
                  <>
                    <th className="py-1 pr-3">Gamma</th>
                    <th className="py-1 pr-3">Theta</th>
                  </>
                )}
                <th className="py-1 pr-3">IV</th>
                <th className="py-1 pr-3">Vol</th>
                <th className="py-1 pr-3">OI</th>
                <th className="py-1 pr-3">Bid</th>
                <th className="py-1">Ask</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <Row key={c.symbol} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {puts.length > 0 && (
        <div>
          <div className="text-xs text-red-400 font-medium mb-1">Puts</div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-600 border-b border-[#2a2a2a] text-xs">
                <th className="py-1 pr-3">Strike</th>
                <th className="py-1 pr-3">Exp</th>
                <th className="py-1 pr-3">Delta</th>
                {isTradier && (
                  <>
                    <th className="py-1 pr-3">Gamma</th>
                    <th className="py-1 pr-3">Theta</th>
                  </>
                )}
                <th className="py-1 pr-3">IV</th>
                <th className="py-1 pr-3">Vol</th>
                <th className="py-1 pr-3">OI</th>
                <th className="py-1 pr-3">Bid</th>
                <th className="py-1">Ask</th>
              </tr>
            </thead>
            <tbody>
              {puts.map((c) => (
                <Row key={c.symbol} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SymbolOptionsPanel({
  symbol,
  headline,
}: {
  symbol: string;
  headline: string;
}) {
  const [result, setResult] = useState<OptionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setResult(null);
    setExpanded(false);
  }, [symbol]);

  async function load() {
    if (result) {
      setExpanded(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/tradier/options?symbol=${symbol}`);
      const json = await res.json();
      setResult(json);
      setExpanded(true);
    } catch {
      setResult({
        contracts: [],
        sourceError: 'Fetch failed',
        source: 'Tradier',
        lastUpdated: new Date().toISOString(),
      });
    }
    setLoading(false);
  }

  const isTradier = result?.source === 'Tradier';

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-white font-bold font-mono">{symbol}</span>
          <p className="text-[11px] text-gray-500 mt-0.5">{headline}</p>
        </div>
        <button onClick={() => (expanded ? setExpanded(false) : load())} className="text-xs text-blue-400 hover:underline">
          {loading ? 'Loading...' : expanded ? 'Collapse' : 'Load options'}
        </button>
      </div>

      {expanded && result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SourceTag source={result.source} lastUpdated={result.lastUpdated} />
            {isTradier && (
              <span className="text-xs text-gray-500">Greeks updated ~hourly. Verify with your broker.</span>
            )}
            {!isTradier && (
              <span className="text-xs text-yellow-500">Delayed data. Greeks not available from Yahoo Finance.</span>
            )}
          </div>

          {'tradierError' in result && result.tradierError && (
            <div className="text-xs text-gray-500">
              Tradier: {result.tradierError}. Showing Yahoo Finance fallback.
            </div>
          )}

          {result.sourceError ? (
            <div className="space-y-2">
              <DataUnavailable symbol={symbol} reason={result.sourceError} />
              <div className="text-sm text-gray-500">Read delta and gamma on your broker platform directly.</div>
            </div>
          ) : (
            <ContractsTable contracts={result.contracts as TradierContract[]} isTradier={isTradier} />
          )}
        </div>
      )}
    </div>
  );
}

export default function OptionsPage() {
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

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-white">Options</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Chains only for LOOK names. Delta 0.20–0.70. No flow, no GEX, no fabricated greeks.
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

      <div className="text-xs text-gray-600 p-3 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
        Filters: delta 0.20-0.70, volume &gt; 50, OI &gt; 100. Greeks from Tradier refresh hourly. If Tradier
        is not connected, IV, OI, volume, bid, ask from Yahoo Finance (delayed).
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {!loading && !data?.sourceError && looks.length === 0 && (
        <NoTradeEmpty detail="No LOOK names on this scan, so there is no chain to load. Weak tape is a hard no-trade — not a cheaper contract." />
      )}

      <div className="space-y-3">
        {looks.map(({ q, quality }) => (
          <div key={q.symbol} className="space-y-1">
            <div className="flex items-center gap-2 px-1">
              <VerdictBadge quality={quality} />
              <span className="text-xs text-gray-600 font-mono">
                {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                {q.rvol !== null ? ` · RVOL ${q.rvol.toFixed(2)}` : ''}
              </span>
            </div>
            <SymbolOptionsPanel symbol={q.symbol} headline={quality.headline} />
          </div>
        ))}
      </div>

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
