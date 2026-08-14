'use client';
import { useState } from 'react';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import ScanControls from '@/components/stocks/ScanControls';
import NoTradeEmpty from '@/components/stocks/NoTradeEmpty';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import OptionsContracts from '@/components/stocks/OptionsContracts';
import { useFinvizScan } from '@/hooks/useFinvizScan';
import { STOCK_HONEST_GAPS, type StockQuality } from '@/lib/stockQuality';
import { estimatedLevels, LEVELS_DISCLAIMER } from '@/lib/estimatedLevels';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizQuote } from '@/lib/finviz';

const CAPITAL_OPTIONS = [50, 100, 250, 500, 1000, 2500];
const INDEX_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'GLD'];

function shareCount(price: number, capital: number): number {
  return Math.floor(capital / price);
}

function ContractToggle({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
          open
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'text-gray-500 border border-[#2a2a2a]'
        }`}
      >
        {open ? '▼ Contracts' : '▶ Contracts'}
      </button>
      {open && <OptionsContracts symbol={symbol} cheap />}
    </div>
  );
}

function SmallLookCard({
  q,
  quality,
  capital,
}: {
  q: FinvizQuote;
  quality: StockQuality;
  capital: number;
}) {
  const price = q.price;
  const side = quality.side === 'short' ? 'short' : 'long';
  const levels = price && price > 0 && quality.side !== 'none' ? estimatedLevels(price, side) : null;
  const shares = price && price > 0 ? shareCount(price, capital) : 0;

  return (
    <div className="bg-[#111111] border border-emerald-500/20 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
          <div className="flex items-center gap-2 mt-1 text-sm">
            <span className="text-white font-mono font-semibold">
              {price !== null ? `$${price.toFixed(2)}` : '--'}
            </span>
            <span
              className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {q.changePercent !== null
                ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                : '--'}
            </span>
          </div>
        </div>
        <VerdictBadge quality={quality} />
      </div>

      {levels && (
        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-2">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">Est. entry</div>
            <div className="text-white font-semibold">${levels.entry.toFixed(2)}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-red-500/20 rounded-lg p-2">
            <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Est. stop</div>
            <div className="text-red-400 font-semibold">${levels.stop.toFixed(2)}</div>
          </div>
          <div className="bg-[#0d0d0d] border border-emerald-500/20 rounded-lg p-2 col-span-2">
            <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">Est. T1 / T2</div>
            <div className="text-emerald-400 font-semibold">
              ${levels.t1.toFixed(2)} / ${levels.t2.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-2 text-xs font-mono">
        {shares > 0 && price ? (
          <>
            <span className="text-gray-600">With ${capital.toLocaleString()}: </span>
            <span className="text-white">{shares} shares</span>
            <span className="text-gray-600"> = ${(shares * price).toFixed(2)}</span>
          </>
        ) : (
          <span className="text-amber-400/80">
            Price exceeds ${capital.toLocaleString()} — size via options only if this stays LOOK.
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-500">{quality.headline}</p>
      <ContractToggle symbol={q.symbol} />
      <div className="flex justify-end pt-1 border-t border-[#1e1e1e]">
        <TradingViewButton symbol={q.symbol} label="Confirm on TradingView" />
      </div>
    </div>
  );
}

export default function OpportunityFinderPage() {
  const { capitalAmount, setCapitalAmount } = useTradeviStore();
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
    withQuality,
  } = useFinvizScan();

  const names = looks.filter(({ q }) => !INDEX_ETFS.includes(q.symbol));
  const affordable = names.filter(({ q }) => q.price !== null && q.price > 0 && q.price <= 20);
  const rest = names.filter(({ q }) => !(q.price !== null && q.price > 0 && q.price <= 20));
  const spy = withQuality.find((row) => row.q.symbol === 'SPY');
  const qqq = withQuality.find((row) => row.q.symbol === 'QQQ');
  const iwm = withQuality.find((row) => row.q.symbol === 'IWM');

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Small Account</h1>
          <p className="text-sm text-gray-500 mt-1">
            LOOK names only, sized to the capital you set. Estimated levels are percent math from last
            price — not structure.
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

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Capital</span>
          <div className="flex flex-wrap gap-1.5">
            {CAPITAL_OPTIONS.map((amt) => (
              <button
                key={amt}
                onClick={() => setCapitalAmount(amt)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  capitalAmount === amt
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-[#1a1a1a] text-gray-500 border-[#2a2a2a] hover:text-gray-300'
                }`}
              >
                ${amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-mono text-gray-500">
          {[spy, qqq, iwm].map((row) =>
            row ? (
              <span key={row.q.symbol}>
                {row.q.symbol}{' '}
                <span className={(row.q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {row.q.changePercent !== null
                    ? `${row.q.changePercent >= 0 ? '+' : ''}${row.q.changePercent.toFixed(2)}%`
                    : '--'}
                </span>
              </span>
            ) : null,
          )}
          <span className="text-gray-700">Index tape only — not a green-light to size up.</span>
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {!loading && !data?.sourceError && names.length === 0 && (
        <NoTradeEmpty detail="No LOOK names on this scan. Small-account sizing is off until the tape qualifies." />
      )}

      {affordable.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">Under $20</h2>
            <p className="text-xs text-gray-600 mt-0.5">LOOK names that can fit a smaller ticket in shares.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {affordable.map(({ q, quality }) => (
              <SmallLookCard key={q.symbol} q={q} quality={quality} capital={capitalAmount} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">Look board</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {rest.length} LOOK names above $20 · size shown for ${capitalAmount.toLocaleString()}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rest.map(({ q, quality }) => (
              <SmallLookCard key={q.symbol} q={q} quality={quality} capital={capitalAmount} />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-600">{LEVELS_DISCLAIMER}</p>

      <div className="text-xs text-gray-500 p-4 rounded-2xl bg-[#111111] border border-[#1e1e1e] space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-gray-600">What this page does not do</div>
        <ul className="space-y-1">
          {STOCK_HONEST_GAPS.map((line) => (
            <li key={line}>• {line}</li>
          ))}
          <li>• Penny-option scanners and letter grades are gone. Weak tape is NO TRADE.</li>
        </ul>
      </div>
    </div>
  );
}
