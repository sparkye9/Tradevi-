'use client';
import { useState } from 'react';
import type { OptionContract } from '@/lib/types';
import { RiskBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { clsx } from 'clsx';
import { safeMoney, safeNumber, safePercent, safeInteger } from '@/lib/formatters';

interface Props {
  contracts: OptionContract[];
  type: 'call' | 'put';
  stockPrice: number;
}

export function OptionsChainTable({ contracts, type, stockPrice }: Props) {
  const [sortBy, setSortBy] = useState<'strike' | 'volume' | 'oi' | 'score'>('strike');
  const [filter, setFilter] = useState<'all' | 'highlighted'>('all');

  const isHighlighted = (c: OptionContract) =>
    Math.abs(c.delta ?? 0) >= 0.30 && Math.abs(c.delta ?? 0) <= 0.60 &&
    (c.spreadPercent ?? Number.MAX_VALUE) <= 15 &&
    (c.volume ?? 0) >= 100 &&
    (c.costPerContract ?? Number.POSITIVE_INFINITY) <= 300;

  const sorted = [...contracts]
    .filter(c => filter === 'all' || isHighlighted(c))
    .sort((a, b) => {
      if (sortBy === 'volume') return (b.volume ?? 0) - (a.volume ?? 0);
      if (sortBy === 'oi') return (b.openInterest ?? 0) - (a.openInterest ?? 0);
      if (sortBy === 'score') return (b.estimatedGainPercent ?? 0) - (a.estimatedGainPercent ?? 0);
      return (a.strike ?? 0) - (b.strike ?? 0);
    });

  if (!contracts || contracts.length === 0) {
    return <EmptyState message="No options data available" />;
  }

  const th = (label: string, key: typeof sortBy) => (
    <th
      className={clsx('px-2 py-2 text-left text-xs font-medium cursor-pointer hover:text-purple-700 transition-colors', sortBy === key ? 'text-purple-700' : 'text-gray-500')}
      onClick={() => setSortBy(key)}
    >
      {label} {sortBy === key ? '↓' : ''}
    </th>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={clsx('px-3 py-1 rounded-full text-xs font-medium border', filter === 'all' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600')}
          >
            All
          </button>
          <button
            onClick={() => setFilter('highlighted')}
            className={clsx('px-3 py-1 rounded-full text-xs font-medium border', filter === 'highlighted' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600')}
          >
            ⭐ Quality Only
          </button>
        </div>
        <p className="text-xs text-gray-400">{sorted.length} contracts</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[840px]">
          <thead>
            <tr className="border-b border-gray-100">
              {th('Strike', 'strike')}
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Bid/Ask</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Mid</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Cost</th>
              {th('Vol', 'volume')}
              {th('OI', 'oi')}
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">IV</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Δ</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Θ</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Moneyness</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Risk</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const highlighted = isHighlighted(c);
              const inputDelta = c.delta ?? 0;
              const atm = stockPrice > 0 && Math.abs(c.strike - stockPrice) / stockPrice < 0.02;
              const bid = safeNumber(c?.bid, 2);
              const ask = safeNumber(c?.ask, 2);
              const mid = safeMoney(c?.mid, 2);
              const spread = safeNumber(c?.spreadPercent, 0);
              const cost = safeMoney(c?.costPerContract, 0);
              const volume = safeInteger(c?.volume);
              const oi = safeInteger(c?.openInterest);
              const iv = safePercent(c?.impliedVolatility, 0);
              const delta = safeNumber(c?.delta, 2);
              const theta = safeNumber(c?.theta, 3);
              const moneyness = c.moneyness != null ? `${c.moneyness.toFixed(1)}%` : '--';

              return (
                <tr
                  key={c.contractSymbol}
                  className={clsx(
                    'border-b border-gray-50 transition-colors',
                    highlighted && 'bg-purple-50',
                    atm && 'font-semibold',
                    'hover:bg-gray-50'
                  )}
                >
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <span className={atm ? 'text-purple-700' : ''}>${safeNumber(c.strike, 2)}</span>
                      {atm && <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded">ATM</span>}
                      {c.inTheMoney && <span className="text-xs text-green-600">ITM</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-gray-600">
                    ${bid} / ${ask}
                    <span className={clsx('ml-1 text-xs', (c.spreadPercent ?? 0) > 15 ? 'text-red-500' : 'text-gray-400')}>
                      ({spread}%)
                    </span>
                  </td>
                  <td className="px-2 py-2 text-gray-700">{mid}</td>
                  <td className="px-2 py-2 font-medium text-purple-700">{cost}</td>
                  <td className={clsx('px-2 py-2', (c.volume ?? 0) >= 500 ? 'text-green-700 font-medium' : '')}>
                    {volume}
                  </td>
                  <td className="px-2 py-2 text-gray-600">{oi}</td>
                  <td className="px-2 py-2">{iv}</td>
                  <td className={clsx('px-2 py-2', Math.abs(inputDelta) >= 0.30 && Math.abs(inputDelta) <= 0.60 ? 'text-green-700 font-medium' : '')}>{delta}</td>
                  <td className="px-2 py-2 text-red-500">{theta}</td>
                  <td className="px-2 py-2">{moneyness}</td>
                  <td className="px-2 py-2"><RiskBadge label={c.riskLabel} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800 space-y-1">
        <p className="font-semibold">📚 Reading this table (beginner):</p>
        <p><strong>Strike:</strong> The price the stock must reach for your option to be in-the-money.</p>
        <p><strong>Delta:</strong> How much the option moves for every $1 the stock moves. 0.30–0.60 is the sweet spot.</p>
        <p><strong>Theta:</strong> How much value the option loses per day from time decay (negative = costs you money).</p>
        <p><strong>IV:</strong> Implied Volatility — how much the market expects the stock to move. High IV = expensive options.</p>
        <p><strong>Breakeven:</strong> Where the stock needs to be at expiration for you to break even.</p>
        <p>⭐ Highlighted rows match quality criteria: delta 0.30–0.60, tight spread, decent volume, affordable premium.</p>
      </div>
    </div>
  );
}
