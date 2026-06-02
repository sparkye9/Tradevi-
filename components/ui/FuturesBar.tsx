'use client';
import { useEffect, useState } from 'react';

interface Future {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | null;
}

const SYMBOLS = ['ES', 'NQ', 'YM', 'RTY', 'NKD'];

function getMarketStatus(etDate: Date): 'CLOSED' | 'PRE-MARKET' | 'OPEN' {
  const day = etDate.getDay(); // 0=Sun, 6=Sat
  const h = etDate.getHours();
  const m = etDate.getMinutes();
  const timeMin = h * 60 + m;

  if (day === 0 || day === 6) return 'CLOSED';

  const preMarketStart = 4 * 60;       // 4:00 AM
  const marketOpen = 9 * 60 + 30;      // 9:30 AM
  const marketClose = 16 * 60;         // 4:00 PM
  const afterHoursEnd = 20 * 60;       // 8:00 PM

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
  // We use the wall-clock date in ET timezone
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export default function FuturesBar() {
  const [futures, setFutures] = useState<Future[]>([]);
  const [etTime, setEtTime] = useState('');
  const [status, setStatus] = useState<'CLOSED' | 'PRE-MARKET' | 'OPEN'>('CLOSED');

  useEffect(() => {
    async function loadFutures() {
      try {
        const res = await fetch('/api/finviz/futures');
        const json = await res.json();
        const data: Future[] = (json.data ?? []).filter((f: Future) => SYMBOLS.includes(f.symbol));
        // Sort in SYMBOLS order
        data.sort((a, b) => SYMBOLS.indexOf(a.symbol) - SYMBOLS.indexOf(b.symbol));
        setFutures(data);
      } catch {
        // silently fail
      }
    }
    loadFutures();
  }, []);

  useEffect(() => {
    function tick() {
      const et = getETDate();
      setEtTime(formatET(new Date())); // use real Date for toLocaleTimeString with tz
      setStatus(getMarketStatus(et));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const statusColor =
    status === 'OPEN' ? 'text-green-400' :
    status === 'PRE-MARKET' ? 'text-yellow-400' :
    'text-gray-500';

  return (
    <div
      className="w-full flex items-center gap-4 px-4 py-1 text-xs border-b border-[#1e1e1e] overflow-x-auto"
      style={{ background: '#0a0a0a', minHeight: 28 }}
    >
      {/* Market status */}
      <span className={`font-bold tracking-wide whitespace-nowrap ${statusColor}`}>{status}</span>

      {/* ET time */}
      <span className="text-gray-500 font-mono whitespace-nowrap">{etTime} ET</span>

      {/* Separator */}
      <span className="text-[#2a2a2a]">|</span>

      {/* Futures */}
      {futures.length === 0 && (
        <span className="text-gray-600">Loading futures...</span>
      )}
      {futures.map((f) => {
        const isUp = f.direction === 'up';
        const isDown = f.direction === 'down';
        const color = isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-gray-400';
        const arrow = isUp ? '▲' : isDown ? '▼' : '';
        return (
          <div key={f.symbol} className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-gray-400 font-mono">{f.symbol}</span>
            {f.price !== null && (
              <span className="text-gray-300 font-mono">{f.price.toLocaleString()}</span>
            )}
            <span className={`font-mono ${color}`}>
              {arrow}{f.changePercent !== null ? ` ${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%` : '--'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
