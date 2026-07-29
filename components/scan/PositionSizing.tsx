'use client';
import { computeIntradayLevels } from '@/lib/opportunityScore';
import type { TradierContract } from '@/lib/tradier';

// Extracted from Opportunity Finder so every screen can show "with $X, here's
// what you can actually afford" instead of re-deriving it per page.

export default function PositionSizing({
  price,
  capital,
  contracts,
}: {
  price: number | null;
  capital: number;
  contracts?: TradierContract[];
}) {
  if (!price || price <= 0) return null;

  const shares = Math.floor(capital / price);
  const stockCost = +(shares * price).toFixed(2);

  const cheapContracts =
    contracts?.filter(
      (c) => c.bid !== null && c.ask !== null && (c.bid + c.ask) / 2 <= 0.5 && (c.bid + c.ask) / 2 >= 0.1 && Math.abs(c.delta ?? 0) >= 0.29
    ) ?? [];
  const callPool =
    cheapContracts.filter((c) => c.type === 'call').length > 0
      ? cheapContracts.filter((c) => c.type === 'call')
      : contracts?.filter((c) => c.type === 'call' && c.bid !== null && c.ask !== null) ?? [];
  const cheapestCall = callPool.sort((a, b) => (a.bid! + a.ask!) / 2 - (b.bid! + b.ask!) / 2)[0] ?? null;

  const optionContracts =
    cheapestCall && cheapestCall.bid !== null && cheapestCall.ask !== null
      ? Math.floor(capital / (((cheapestCall.bid + cheapestCall.ask) / 2) * 100))
      : 0;
  const optionCost =
    cheapestCall && cheapestCall.bid !== null && cheapestCall.ask !== null
      ? +(optionContracts * ((cheapestCall.bid + cheapestCall.ask) / 2) * 100).toFixed(2)
      : 0;

  const lvl = cheapestCall ? computeIntradayLevels(price, 'BULLISH') : null;

  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-3 space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">With ${capital.toLocaleString()}</p>

      {shares > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Shares</span>
          <span className="text-white font-mono font-semibold">
            {shares} @ ${price.toFixed(2)} = <span className="text-gray-300">${stockCost}</span>
          </span>
        </div>
      )}
      {shares === 0 && <p className="text-xs text-red-400/70">Stock price exceeds capital</p>}

      {cheapestCall && optionContracts > 0 && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Call option</span>
            <span className="text-white font-mono font-semibold">
              {optionContracts} contract{optionContracts > 1 ? 's' : ''} · ${optionCost}
            </span>
          </div>
          <div className="text-xs text-gray-600 font-mono">
            {cheapestCall.strike} strike · {cheapestCall.expiration} · Δ{cheapestCall.delta?.toFixed(2) ?? '--'}
          </div>
          {lvl && (
            <div className="grid grid-cols-4 gap-1 pt-1 text-xs font-mono">
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">STOP</div>
                <div className="text-red-400">-${+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 0.3).toFixed(0)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">T1</div>
                <div className="text-emerald-400">+${+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 0.5).toFixed(0)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">T2</div>
                <div className="text-emerald-400">+${+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 1.0).toFixed(0)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-600 text-[10px]">T3</div>
                <div className="text-emerald-400">+${+(optionContracts * ((cheapestCall.bid! + cheapestCall.ask!) / 2) * 100 * 2.0).toFixed(0)}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
