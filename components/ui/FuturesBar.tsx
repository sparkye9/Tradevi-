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
    ? 'bg-tv-amber'
    : clock.tradesOpen
    ? 'bg-tv-green'
    : 'bg-tv-red/60';

  const sessionColor = clock.powerHour
    ? 'text-tv-amber'
    : clock.tradesOpen
    ? 'text-tv-green'
    : 'text-tv-muted';

  return (
    <div
      className="w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 border-b border-tv-border overflow-x-auto scrollbar-none"
      style={{ background: '#080A10', minHeight: 38 }}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className={`text-[10px] font-bold tracking-widest whitespace-nowrap ${sessionColor}`}>
          {clock.shortLabel}
        </span>
        <span className="text-tv-muted font-mono text-xs whitespace-nowrap">{etTime} ET</span>
        <span className="pill border-tv-border text-tv-muted">Delayed</span>
      </div>

      <span className="text-tv-border text-xs shrink-0">|</span>

      {futures.map((f) => {
        const isUp = f.direction === 'up';
        const isDown = f.direction === 'down';
        const chgColor = f.symbol === 'VIX'
          ? (isUp ? 'text-tv-red' : isDown ? 'text-tv-green' : 'text-tv-muted')
          : (isUp ? 'text-tv-green' : isDown ? 'text-tv-red' : 'text-tv-muted');
        const chgArrow = isUp ? '▲' : isDown ? '▼' : '';
        const isPlaceholder = !loaded || f.price === null;
        const label = f.symbol === 'GC' ? 'Gold' : f.symbol;
        return (
          <div
            key={f.symbol}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span className="text-tv-muted font-mono text-xs">{label}</span>
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

      <div className="ml-auto flex items-center shrink-0">
        <span className="text-[10px] text-tv-purple/70 font-bold tracking-widest">TRADEVI</span>
      </div>
    </div>
  );
}
