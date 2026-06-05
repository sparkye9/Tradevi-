'use client';
import { useEffect, useState, useCallback } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useAlertsStore } from '@/store/alertsStore';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';
import type { AlertState } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VixData {
  price: number | null;
  changePercent: number | null;
  lastUpdated: string;
  error?: string;
}

interface QuoteRow {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  source: 'alpaca' | 'yahoo';
}

// ─── Futures Strip ────────────────────────────────────────────────────────────

const STRIP_SYMBOLS = ['ES', 'NQ', 'RTY'];

function FuturesStrip() {
  const [result, setResult] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/finviz/futures')
      .then((r) => r.json())
      .then((j) => { setResult(j); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const futures = (result?.data ?? []).filter((f) => STRIP_SYMBOLS.includes(f.symbol));

  return (
    <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Futures Strip</span>
        {result && <SourceTag source="Alpaca live, Yahoo fallback" lastUpdated={result.lastUpdated} />}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-[#1a1a1a] rounded-xl p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {futures.length === 0 ? (
            <p className="text-gray-500 text-sm col-span-3">Futures data unavailable.</p>
          ) : (
            futures.map((f) => {
              const up = f.direction === 'up';
              const down = f.direction === 'down';
              const chgColor = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-gray-500';
              const arrow = up ? '▲' : down ? '▼' : '=';
              const border = up
                ? 'border-emerald-500/20'
                : down
                ? 'border-red-500/20'
                : 'border-[#2a2a2a]';
              return (
                <div key={f.symbol} className={`bg-[#0f0f0f] border ${border} rounded-xl p-4 flex items-center justify-between`}>
                  <div>
                    <div className="text-white font-mono font-bold text-lg">{f.symbol}</div>
                    <div className="text-xs text-gray-600">{f.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-mono font-semibold">
                      {f.price !== null ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '--'}
                    </div>
                    <div className={`font-mono text-sm ${chgColor}`}>
                      {arrow}{' '}
                      {f.changePercent !== null
                        ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%`
                        : '--'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── VIX Panel ────────────────────────────────────────────────────────────────

function vixState(price: number): { label: string; color: string; description: string } {
  if (price < 15) return {
    label: 'LOW',
    color: 'text-emerald-400',
    description: 'Markets are calm. Institutions are not hedging heavily. Conditions favor trending, momentum setups.',
  };
  if (price <= 25) return {
    label: 'MODERATE',
    color: 'text-amber-400',
    description: 'Elevated uncertainty. Option premiums are higher. Be selective — favor high-quality setups near key levels.',
  };
  return {
    label: 'HIGH',
    color: 'text-red-400',
    description: 'Fear is elevated. Wide intraday swings are common. Reduce size, widen stops, or stand aside.',
  };
}

function VixPanel() {
  const [vix, setVix] = useState<VixData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/market/vix')
      .then((r) => r.json())
      .then((j) => { setVix(j); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const state = vix?.price != null ? vixState(vix.price) : null;

  return (
    <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">VIX</span>
        {vix && <SourceTag source="Yahoo Finance" lastUpdated={vix.lastUpdated} />}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-10 w-24 bg-[#222] rounded" />
          <div className="h-4 w-32 bg-[#1a1a1a] rounded" />
        </div>
      ) : vix?.price != null && state ? (
        <div className="space-y-2">
          <div className={`font-mono font-bold text-4xl ${state.color}`}>
            {vix.price.toFixed(2)}
          </div>
          <div className={`text-sm font-semibold tracking-widest ${state.color}`}>{state.label}</div>
          <p className="text-xs text-gray-500 leading-relaxed">{state.description}</p>
          {vix.changePercent != null && (
            <div className={`font-mono text-xs ${vix.changePercent >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {vix.changePercent >= 0 ? '+' : ''}{vix.changePercent.toFixed(2)}% today
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">VIX data unavailable.</p>
      )}
    </div>
  );
}

// ─── Market Sentiment ─────────────────────────────────────────────────────────

function SentimentPanel({ vixPrice, esDirection }: { vixPrice: number | null; esDirection: string | null }) {
  let sentiment: { label: string; color: string; border: string; description: string };

  if (vixPrice === null) {
    sentiment = {
      label: 'UNKNOWN',
      color: 'text-gray-500',
      border: 'border-[#2a2a2a]',
      description: 'Sentiment cannot be determined without VIX data.',
    };
  } else if (vixPrice < 15 && esDirection === 'up') {
    sentiment = {
      label: 'BULL',
      color: 'text-emerald-400',
      border: 'border-emerald-500/20',
      description: 'Low fear + rising futures. Conditions favor long bias setups at the open.',
    };
  } else if (vixPrice > 25 || esDirection === 'down') {
    sentiment = {
      label: 'BEAR',
      color: 'text-red-400',
      border: 'border-red-500/20',
      description: 'Elevated fear or falling futures. Favor defensive posture or put setups.',
    };
  } else {
    sentiment = {
      label: 'NEUTRAL',
      color: 'text-amber-400',
      border: 'border-amber-500/20',
      description: 'Mixed signals. Wait for confirmation at the open before committing direction.',
    };
  }

  return (
    <div className={`bg-[#111111] border ${sentiment.border} rounded-2xl p-5 space-y-3`}>
      <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Market Sentiment</span>
      <div className={`font-mono font-bold text-3xl ${sentiment.color}`}>{sentiment.label}</div>
      <p className="text-xs text-gray-500 leading-relaxed">{sentiment.description}</p>
      <p className="text-xs text-gray-700">Derived from VIX + ES futures direction. No extra fetch.</p>
    </div>
  );
}

// ─── Economic Events ──────────────────────────────────────────────────────────

const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const MOCK_EVENTS = [
  { time: '8:30 AM ET', impact: 'HIGH', name: 'Initial Jobless Claims' },
  { time: '10:00 AM ET', impact: 'MEDIUM', name: 'ISM Services PMI' },
  { time: '2:00 PM ET', impact: 'HIGH', name: 'FOMC Meeting Minutes' },
];

function EconPanel() {
  const impactColor = (impact: string) =>
    impact === 'HIGH' ? 'text-red-400 bg-red-500/10' : impact === 'MEDIUM' ? 'text-amber-400 bg-amber-500/10' : 'text-gray-400 bg-[#1a1a1a]';

  return (
    <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Economic Events</span>
        <span className="text-xs text-gray-600">Source: Finviz Elite</span>
      </div>

      <p className="text-xs text-gray-600 italic">
        Economic calendar data requires Finviz Elite subscription. Sample events shown for {today}.
      </p>

      <div className="space-y-2">
        {MOCK_EVENTS.map((ev, i) => (
          <div key={i} className="flex items-center gap-3 bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-3 py-2">
            <span className="text-xs text-gray-500 font-mono w-20 shrink-0">{ev.time}</span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${impactColor(ev.impact)}`}>{ev.impact}</span>
            <span className="text-sm text-gray-300">{ev.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Watchlist Panel ──────────────────────────────────────────────────────────

function WatchlistPanel() {
  const items = useWatchlistStore((s) => s.items);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [quotesSource, setQuotesSource] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadQuotes = useCallback(async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const syms = items.map((i) => i.symbol).join(',');
      const res = await fetch(`/api/market/quotes?symbols=${syms}`);
      const json = await res.json();
      setQuotes(json.quotes ?? []);
      setQuotesSource(json.source ?? '');
    } catch {
      // leave stale
    }
    setLoading(false);
  }, [items]);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  return (
    <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Watchlist</span>
        {quotesSource && <span className="text-xs text-gray-600 capitalize">{quotesSource}</span>}
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 text-sm">Add tickers to your watchlist to see live prices.</p>
      ) : loading ? (
        <div className="space-y-2">
          {items.map((_, i) => (
            <div key={i} className="h-10 bg-[#1a1a1a] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const q = quotes.find((r) => r.symbol === item.symbol);
            const up = (q?.changePercent ?? 0) >= 0;
            const chgColor = q?.changePercent != null ? (up ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500';
            return (
              <div key={item.symbol} className="flex items-center justify-between bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-3 py-2">
                <span className="text-white font-mono font-semibold">{item.symbol}</span>
                <div className="text-right">
                  <div className="text-white font-mono text-sm">
                    {q?.price != null ? `$${q.price.toFixed(2)}` : '--'}
                  </div>
                  <div className={`font-mono text-xs ${chgColor}`}>
                    {q?.changePercent != null
                      ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                      : '--'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

const ALERT_STATE_STYLE: Record<string, string> = {
  watching: 'text-amber-400 bg-amber-500/10',
  triggered: 'text-red-400 bg-red-500/10',
  trade_window_open: 'text-emerald-400 bg-emerald-500/10',
  reviewed: 'text-gray-400 bg-[#1a1a1a]',
};

function AlertsPanel() {
  const getActive = useAlertsStore((s) => s.getActive);
  const active = getActive();

  return (
    <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
      <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold block">Alerts</span>

      {active.length === 0 ? (
        <p className="text-gray-500 text-sm">No active alerts. Alerts log here when triggered.</p>
      ) : (
        <div className="space-y-2">
          {active.map((alert) => {
            const style = ALERT_STATE_STYLE[alert.state] ?? 'text-gray-400 bg-[#1a1a1a]';
            const label = (alert.state as AlertState).replace(/_/g, ' ').toUpperCase();
            return (
              <div key={alert.id} className="flex items-center justify-between bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-3 py-2">
                <div>
                  <span className="text-white font-mono font-semibold">{alert.symbol}</span>
                  <span className={`ml-2 text-xs uppercase ${alert.direction === 'call' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {alert.direction}
                  </span>
                  <div className="text-xs text-gray-600 mt-0.5">
                    ${alert.strike} · {alert.expiration}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page Shell ───────────────────────────────────────────────────────────────

export default function FuturesPage() {
  const [vix, setVix] = useState<VixData | null>(null);
  const [futuresResult, setFuturesResult] = useState<FinvizResult<FinvizFuture> | null>(null);

  useEffect(() => {
    fetch('/api/market/vix').then((r) => r.json()).then(setVix).catch(() => null);
    fetch('/api/finviz/futures').then((r) => r.json()).then(setFuturesResult).catch(() => null);
  }, []);

  const esDirection = (futuresResult?.data ?? []).find((f) => f.symbol === 'ES')?.direction ?? null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Futures</h1>
        <p className="text-sm text-gray-500 mt-1">Live market overview and session context.</p>
      </div>

      <FuturesStrip />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VixPanel />
        <SentimentPanel vixPrice={vix?.price ?? null} esDirection={esDirection} />
        <EconPanel />
        <WatchlistPanel />
        <div className="md:col-span-2">
          <AlertsPanel />
        </div>
      </div>
    </div>
  );
}
