'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';
import type { TradierOptionsResult, TradierContract } from '@/lib/tradier';
import type { YahooOptionsResult } from '@/lib/yahoo-fallback';

type OptionsResult = (TradierOptionsResult | YahooOptionsResult) & { tradierError?: string };

function fmtGreek(n: number | null): string {
  if (n === null) return '--';
  return n.toFixed(3);
}

function ContractsTable({ contracts, isTradier }: {
  contracts: TradierContract[];
  isTradier: boolean;
}) {
  const calls = contracts.filter((c) => c.type === 'call').slice(0, 5);
  const puts = contracts.filter((c) => c.type === 'put').slice(0, 5);

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
    return <div className="text-gray-500 text-sm">No contracts meet filter criteria (delta 0.20-0.70, vol &gt; 50, OI &gt; 100).</div>;
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
                {isTradier && <><th className="py-1 pr-3">Gamma</th><th className="py-1 pr-3">Theta</th></>}
                <th className="py-1 pr-3">IV</th>
                <th className="py-1 pr-3">Vol</th>
                <th className="py-1 pr-3">OI</th>
                <th className="py-1 pr-3">Bid</th>
                <th className="py-1">Ask</th>
              </tr>
            </thead>
            <tbody>{calls.map((c) => <Row key={c.symbol} c={c} />)}</tbody>
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
                {isTradier && <><th className="py-1 pr-3">Gamma</th><th className="py-1 pr-3">Theta</th></>}
                <th className="py-1 pr-3">IV</th>
                <th className="py-1 pr-3">Vol</th>
                <th className="py-1 pr-3">OI</th>
                <th className="py-1 pr-3">Bid</th>
                <th className="py-1">Ask</th>
              </tr>
            </thead>
            <tbody>{puts.map((c) => <Row key={c.symbol} c={c} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SymbolOptionsPanel({ symbol }: { symbol: string }) {
  const [result, setResult] = useState<OptionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function load() {
    if (result) { setExpanded(true); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/tradier/options?symbol=${symbol}`);
      const json = await res.json();
      setResult(json);
      setExpanded(true);
    } catch {
      setResult({ contracts: [], sourceError: 'Fetch failed', source: 'Tradier', lastUpdated: new Date().toISOString() });
    }
    setLoading(false);
  }

  const isTradier = result?.source === 'Tradier';

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold">{symbol}</span>
        <button
          onClick={() => expanded ? setExpanded(false) : load()}
          className="text-xs text-blue-400 hover:underline"
        >
          {loading ? 'Loading...' : expanded ? 'Collapse' : 'Load options'}
        </button>
      </div>

      {expanded && result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SourceTag source={result.source} lastUpdated={result.lastUpdated} />
            {isTradier && (
              <span className="text-xs text-gray-500">
                Greeks updated ~hourly. Verify with your broker.
              </span>
            )}
            {!isTradier && (
              <span className="text-xs text-yellow-500">
                Delayed data. Greeks not available from Yahoo Finance.
              </span>
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
              <div className="text-sm text-gray-500">
                Read delta and gamma on your broker platform directly.
              </div>
            </div>
          ) : (
            <ContractsTable
              contracts={result.contracts as TradierContract[]}
              isTradier={isTradier}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function OptionsPage() {
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

  // Top candidates by auto score
  const candidates = [...(data?.data ?? [])]
    .filter((q) => {
      const intraday = (q.rvol ?? 0) > rvolThreshold || q.newHighDay;
      const swing = q.sma50rel === 'above' && q.sma200rel === 'above';
      return intraday || swing;
    })
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-white">Options</h1>
        <p className="text-gray-500 text-sm mt-0.5">Which contracts are worth trading on today's candidates?</p>
      </div>

      <div className="text-xs text-gray-600 p-3 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
        Filters: delta 0.20-0.70, volume &gt; 50, OI &gt; 100. Greeks from Tradier refresh hourly.
        If Tradier is not connected, IV, OI, volume, bid, ask from Yahoo Finance (delayed). No fabricated greeks.
        No options flow. No GEX.
      </div>

      {loading && <div className="text-gray-500 text-sm">Loading candidates...</div>}

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {candidates.length === 0 && !loading && !data?.sourceError && (
        <div className="text-gray-500 text-sm">No candidates from current watchlist.</div>
      )}

      <div className="space-y-3">
        {candidates.map((q) => (
          <SymbolOptionsPanel key={q.symbol} symbol={q.symbol} />
        ))}
      </div>
    </div>
  );
}
