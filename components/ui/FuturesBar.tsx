'use client';
import { useEffect, useState } from 'react';
import { marketClock, type MarketClock } from '@/lib/powerHour';

interface Future {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | null;
}

const SYMBOLS = ['ES', 'NQ', 'YM', 'RTY', 'VIX', 'GC'];

const PLACEHOLDERS: Future[] = SYMBOLS.map((symbol) => ({
  symbol,
  price: null,
  changePercent: null,
  direction: null,
}));

function formatET(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/New_York',
  });
}

export default function FuturesBar() {
  const [futures, setFutures] = useState<Future[]>(PLACEHOLDERS);
  const [etTime, setEtTime] = useState('');
  const [clock, setClock] = useState<MarketClock>(() => marketClock());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/finviz/futures');
        const json = await res.json();
        const data: Future[] = (json.data ?? []).filter((f: Future) => SYMBOLS.includes(f.symbol));
        // Merge with placeholders so we always show all 5 symbols
        const merged = SYMBOLS.map((sym) => {
          const found = data.find((f) => f.symbol === sym);
          return found ?? { symbol: sym, price: null, changePercent: null, direction: null };
        });
        setFutures(merged);
      } catch {
        // Keep placeholders
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function tick() {
      setEtTime(formatET(new Date()));
      setClock(marketClock());
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dotColor = clock.powerHour
    ? 'bg-amber-400'
    : clock.tradesOpen
    ? 'bg-emerald-400'
    : 'bg-red-400/60';

  const sessionColor = clock.powerHour
    ? 'text-amber-300'
    : clock.tradesOpen
    ? 'text-emerald-400'
    : 'text-gray-500';

  return (
    <div
      className="w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 border-b border-[#1a1a1a] overflow-x-auto scrollbar-none"
      style={{ background: '#090909', minHeight: 38 }}
    >
      {/* Session + ET time */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className={`text-[10px] font-bold tracking-widest whitespace-nowrap ${sessionColor}`}>
          {clock.shortLabel}
        </span>
        <span className="text-gray-600 font-mono text-xs whitespace-nowrap">{etTime} ET</span>
      </div>

      <span className="text-[#222] text-xs shrink-0">|</span>

      {/* Futures chips */}
      {futures.map((f) => {
        const isUp = f.direction === 'up';
        const isDown = f.direction === 'down';
        // VIX: rising is bearish (red), falling is bullish (green)
        const chgColor = f.symbol === 'VIX'
          ? (isUp ? 'text-red-400' : isDown ? 'text-emerald-400' : 'text-gray-500')
          : (isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-gray-500');
        const chgArrow = isUp ? '▲' : isDown ? '▼' : '';
        const isPlaceholder = !loaded || f.price === null;
        const label = f.symbol === 'GC' ? 'Gold' : f.symbol;
        return (
          <div
            key={f.symbol}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span className="text-gray-500 font-mono text-xs">{label}</span>
            {!isPlaceholder ? (
              <>
                <span className="text-white font-mono text-xs">{f.price!.toLocaleString()}</span>
                <span className={`font-mono text-xs ${chgColor}`}>
                  {chgArrow}{f.changePercent !== null ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%` : '--'}
                </span>
              </>
            ) : (
              <span className="text-gray-600 font-mono text-xs">--</span>
            )}
          </div>
        );
      })}

      {/* Right side branding */}
      <div className="ml-auto flex items-center shrink-0">
        <span className="text-[10px] text-gray-700 font-bold tracking-widest">TRADEVI</span>
      </div>
    </div>
  );
}
