'use client';
import { useEffect, useState } from 'react';
import { marketClock, type MarketClock } from '@/lib/powerHour';

interface Future {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  state?: 'live' | 'delayed' | 'stale' | 'closed' | 'unavailable';
  detail?: string;
  clsLabel?: string;
  quoteTime?: string | null;
}

interface QuoteRowLite {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  clsLabel: string;
  quoteTime: string | null;
  freshness: { state: Future['state']; detail: string };
}

const SYMBOLS = ['ES', 'NQ', 'YM', 'RTY', 'VIX', 'GC'];

const PLACEHOLDERS: Future[] = SYMBOLS.map((symbol) => ({
  symbol,
  price: null,
  changePercent: null,
  direction: null,
}));

function directionOf(chg: number | null): Future['direction'] {
  if (chg == null) return null;
  return chg > 0.05 ? 'up' : chg < -0.05 ? 'down' : 'flat';
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

export default function FuturesBar() {
  const [futures, setFutures] = useState<Future[]>(PLACEHOLDERS);
  const [etTime, setEtTime] = useState('');
  // Starts null so the server HTML and first client render match (no hydration mismatch).
  const [clock, setClock] = useState<MarketClock | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/quotes');
        const json = await res.json();
        const rows: QuoteRowLite[] = json.rows ?? [];
        const merged = SYMBOLS.map((sym) => {
          const r = rows.find((x) => x.symbol === sym);
          if (!r) return { symbol: sym, price: null, changePercent: null, direction: null, state: 'unavailable' as const };
          return {
            symbol: sym,
            price: r.price,
            changePercent: r.changePercent,
            direction: directionOf(r.changePercent),
            state: r.freshness.state,
            detail: r.freshness.detail,
            clsLabel: r.clsLabel,
            quoteTime: r.quoteTime,
          };
        });
        if (!cancelled) {
          setFutures(merged);
          setFeedError(json.feedError ?? (res.ok ? null : `HTTP ${res.status}`));
        }
      } catch {
        if (!cancelled) {
          setFeedError('Quote feed unreachable');
          setFutures(PLACEHOLDERS.map((p) => ({ ...p, state: 'unavailable' as const })));
        }
      }
      if (!cancelled) setLoaded(true);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
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

  const dotColor = !clock
    ? 'bg-tv-border'
    : clock.powerHour
    ? 'bg-tv-amber'
    : clock.tradesOpen
    ? 'bg-tv-green'
    : 'bg-tv-red/60';

  const sessionColor = !clock
    ? 'text-tv-muted'
    : clock.powerHour
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
          {clock?.shortLabel ?? '\u00a0'}
        </span>
        <span className="text-tv-muted font-mono text-xs whitespace-nowrap">{etTime ? `${etTime} ET` : ''}</span>
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
        const dim = f.state === 'stale' || f.state === 'closed';
        const qt = f.quoteTime ? new Date(f.quoteTime).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : 'no time';
        return (
          <div
            key={f.symbol}
            className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 ${dim ? 'opacity-50' : ''}`}
            title={`${f.clsLabel ?? ''} · Yahoo Finance · last trade ${qt}${f.detail ? ` · ${f.detail}` : ''}`}
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
            {f.state === 'stale' && <span className="text-[9px] font-bold text-tv-amber">STALE</span>}
          </div>
        );
      })}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {feedError ? (
          <span className="text-[10px] font-bold text-tv-red" title={feedError}>FEED DISCONNECTED</span>
        ) : (
          <span className="text-[10px] text-gray-600" title="Yahoo Finance quotes are delayed. Hover a symbol for its last trade time.">Yahoo · delayed</span>
        )}
        <span className="text-[10px] text-tv-purple/70 font-bold tracking-widest">TRADEVI</span>
      </div>
    </div>
  );
}
