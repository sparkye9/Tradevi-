'use client';
import { useEffect, useState } from 'react';

interface BarItem {
  symbol: string;
  label: string;
  price: number | null;
  changeAmt: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | null;
}

const BAR_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: 'ES',  label: 'S&P Futures' },
  { symbol: 'YM',  label: 'Dow Futures' },
  { symbol: 'NQ',  label: 'Nasdaq Futures' },
  { symbol: 'RTY', label: 'Russell 2000' },
  { symbol: 'VIX', label: 'VIX' },
  { symbol: 'GC',  label: 'Gold' },
  { symbol: 'NKD', label: 'Nikkei 225' },
];

function getMarketStatus(etDate: Date): 'CLOSED' | 'PRE-MARKET' | 'OPEN' {
  const day = etDate.getDay();
  const t = etDate.getHours() * 60 + etDate.getMinutes();
  if (day === 0 || day === 6) return 'CLOSED';
  if (t >= 9 * 60 + 30 && t < 16 * 60) return 'OPEN';
  if (t >= 4 * 60 && t < 9 * 60 + 30) return 'PRE-MARKET';
  return 'CLOSED';
}

function formatET(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/New_York',
  });
}

export default function FuturesBar() {
  const [items, setItems] = useState<BarItem[]>(
    BAR_SYMBOLS.map(({ symbol, label }) => ({ symbol, label, price: null, changeAmt: null, changePercent: null, direction: null }))
  );
  const [etTime, setEtTime] = useState('');
  const [status, setStatus] = useState<'CLOSED' | 'PRE-MARKET' | 'OPEN'>('CLOSED');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/finviz/futures');
        const json = await res.json();
        const raw: { symbol: string; price: number | null; changePercent: number | null; direction: 'up' | 'down' | 'flat' | null }[] = json.data ?? [];
        const map = new Map(raw.map((r) => [r.symbol, r]));
        setItems(
          BAR_SYMBOLS.map(({ symbol, label }) => {
            const r = map.get(symbol);
            const price = r?.price ?? null;
            const changePercent = r?.changePercent ?? null;
            const changeAmt = price !== null && changePercent !== null
              ? (price / (1 + changePercent / 100)) * (changePercent / 100)
              : null;
            return { symbol, label, price, changeAmt, changePercent, direction: r?.direction ?? null };
          })
        );
      } catch {
        // keep placeholders
      }
    }
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    function tick() {
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      setEtTime(formatET(new Date()));
      setStatus(getMarketStatus(et));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const statusStyle =
    status === 'OPEN'       ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
    status === 'PRE-MARKET' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                              'bg-gray-800 text-gray-500 border-gray-700';

  return (
    <div
      className="w-full flex items-center gap-0 border-b border-[#1a1a1a] overflow-x-auto"
      style={{ background: '#090909', minHeight: 42 }}
    >
      {/* Status + time */}
      <div className="flex items-center gap-2 px-3 shrink-0 border-r border-[#1e1e1e] h-full py-2">
        <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full border ${statusStyle}`}>
          {status}
        </span>
        <span className="hidden sm:inline text-gray-600 font-mono text-xs">{etTime} ET</span>
      </div>

      {/* Instrument chips */}
      {items.map((item, i) => {
        const up = item.direction === 'up';
        const down = item.direction === 'down';
        const chgColor = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-gray-500';
        const hasData = item.price !== null;
        const isLast = i === items.length - 1;

        return (
          <div
            key={item.symbol}
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 shrink-0 ${!isLast ? 'border-r border-[#1e1e1e]' : ''} hover:bg-white/[0.02] transition-colors`}
          >
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] text-gray-500 font-medium leading-none mb-0.5">{item.symbol}</span>
              {hasData ? (
                <span className="text-white font-mono text-xs font-semibold leading-none">
                  {item.symbol === 'VIX'
                    ? item.price!.toFixed(2)
                    : item.symbol === 'NKD'
                    ? item.price!.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                    : item.price!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-gray-700 font-mono text-xs">--</span>
              )}
            </div>
            {hasData && item.changePercent !== null && (
              <div className={`flex flex-col items-end ${chgColor}`}>
                <span className="font-mono text-[10px] leading-none mb-0.5">
                  {item.changeAmt !== null
                    ? `${item.changeAmt >= 0 ? '+' : ''}${item.changeAmt.toFixed(2)}`
                    : ''}
                </span>
                <span className="font-mono text-[10px] leading-none">
                  {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        );
      })}

      <div className="ml-auto px-4 shrink-0">
        <span className="text-[10px] text-gray-700 font-bold tracking-widest">TRADEVI</span>
      </div>
    </div>
  );
}
