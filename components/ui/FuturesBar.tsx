'use client';
import { useEffect, useState } from 'react';

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

function getMarketStatus(etDate: Date): 'CLOSED' | 'PRE-MARKET' | 'OPEN' {
  const day = etDate.getDay();
  const h = etDate.getHours();
  const m = etDate.getMinutes();
  const timeMin = h * 60 + m;

  if (day === 0 || day === 6) return 'CLOSED';

  const preMarketStart = 4 * 60;
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;

  if (timeMin >= marketOpen && timeMin < marketClose) return 'OPEN';
  if (timeMin >= preMarketStart && timeMin < marketOpen) return 'PRE-MARKET';
  return 'CLOSED';
}

function formatET(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/New_York',
  });
}

function getETDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export default function FuturesBar() {
  const [futures, setFutures] = useState<Future[]>(PLACEHOLDERS);
  const [etTime, setEtTime] = useState('');
  const [status, setStatus] = useState<'CLOSED' | 'PRE-MARKET' | 'OPEN'>('CLOSED');
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
      const et = getETDate();
      setEtTime(formatET(new Date()));
      setStatus(getMarketStatus(et));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dotColor =
    status === 'OPEN'
      ? 'bg-emerald-400'
      : status === 'PRE-MARKET'
      ? 'bg-amber-400'
      : 'bg-red-400/60';

  return (
    <div
      className="w-full flex items-center gap-3 px-4 py-2 border-b border-[#1a1a1a] overflow-x-auto"
      style={{ background: '#090909', minHeight: 40 }}
    >
      {/* Status dot + ET time */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
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
