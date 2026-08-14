'use client';
import { useEffect, useState } from 'react';
import type { TradierContract, TradierOptionsResult } from '@/lib/tradier';

function ContractRow({ c }: { c: TradierContract }) {
  const mid = c.bid !== null && c.ask !== null ? ((c.bid + c.ask) / 2).toFixed(2) : '--';
  const typeColor = c.type === 'call' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1e1e1e] last:border-0 text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className={`font-semibold uppercase ${typeColor}`}>{c.type}</span>
        <span className="text-gray-300">${c.strike}</span>
        <span className="text-gray-600">{c.expiration}</span>
      </div>
      <div className="flex items-center gap-3">
        {c.delta !== null && <span className={typeColor}>Δ{c.delta.toFixed(2)}</span>}
        {c.iv !== null && <span className="text-gray-500">IV {(c.iv * 100).toFixed(0)}%</span>}
        <span className="text-white font-semibold">${mid}</span>
        {c.openInterest !== null && (
          <span className="text-gray-600">OI {c.openInterest.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

export default function OptionsContracts({
  symbol,
  cheap = false,
}: {
  symbol: string;
  cheap?: boolean;
}) {
  const [result, setResult] = useState<TradierOptionsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const qs = cheap ? `&cheap=true` : '';
    fetch(`/api/tradier/options?symbol=${symbol}${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setResult(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            contracts: [],
            sourceError: 'Fetch failed',
            source: 'Tradier',
            lastUpdated: new Date().toISOString(),
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, cheap]);

  if (loading) {
    return (
      <div className="mt-2 pt-2 border-t border-[#1e1e1e] text-xs text-gray-600 animate-pulse">
        Loading contracts...
      </div>
    );
  }
  if (result?.sourceError) {
    return (
      <div className="mt-2 pt-2 border-t border-[#1e1e1e] text-xs text-red-500/70">{result.sourceError}</div>
    );
  }

  const calls = (result?.contracts ?? []).filter((c) => c.type === 'call').slice(0, 4);
  const puts = (result?.contracts ?? []).filter((c) => c.type === 'put').slice(0, 4);

  if (calls.length === 0 && puts.length === 0) {
    return (
      <div className="mt-2 pt-2 border-t border-[#1e1e1e] text-xs text-gray-600">No qualifying contracts</div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-[#1e1e1e] space-y-3">
      {calls.length > 0 && (
        <div>
          <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">Calls</p>
          {calls.map((c) => (
            <ContractRow key={c.symbol} c={c} />
          ))}
        </div>
      )}
      {puts.length > 0 && (
        <div>
          <p className="text-xs text-red-400 font-semibold uppercase tracking-wider mb-1">Puts</p>
          {puts.map((c) => (
            <ContractRow key={c.symbol} c={c} />
          ))}
        </div>
      )}
      <p className="text-xs text-gray-700">{result?.source} · Δ 0.20–0.70</p>
    </div>
  );
}
