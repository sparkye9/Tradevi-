'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import TradingViewAlerts from '@/components/dashboard/TradingViewAlerts';
import VerdictBadge from '@/components/stocks/VerdictBadge';
import { useAccountJournal } from '@/hooks/useAccountJournal';
import { journalEdge } from '@/lib/journal';
import { marketClock } from '@/lib/powerHour';
import { stockQuality, type StockQuality } from '@/lib/stockQuality';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizFuture, FinvizResult } from '@/lib/finviz';
import type { TrendBiasStackResult } from '@/lib/trendBias';

const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'GLD'];

type Action = 'WAIT' | 'LOOK' | 'NO TRADE';

function fmtLevel(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function actionFromStack(stack: TrendBiasStackResult): Action {
  if (stack.quality.label === 'WAIT') return 'WAIT';
  if (stack.quality.label === 'NO_TRADE' || stack.suggestion.action === 'STAND_DOWN') return 'NO TRADE';
  return 'LOOK';
}

function biasWord(stack: TrendBiasStackResult): string {
  const bias = stack.reads.Daily.bias;
  if (bias === 'up') return 'BULLISH';
  if (bias === 'down') return 'BEARISH';
  return 'RANGE';
}

function LookRow({ q, quality }: { q: FinvizQuote; quality: StockQuality }) {
  const chgColor = (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#1a1a1a] last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-white">{q.symbol}</span>
          <VerdictBadge quality={quality} />
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">{quality.headline}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`font-mono text-xs ${chgColor}`}>
          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
        </span>
        <TradingViewButton symbol={q.symbol} label="Confirm" />
      </div>
    </div>
  );
}

export default function Desk() {
  const { watchlist, rvolThreshold } = useTradeviStore();
  const journal = useAccountJournal();
  const edge = journalEdge(journal.entries);
  const [session, setSession] = useState(() => marketClock());

  useEffect(() => {
    const id = setInterval(() => setSession(marketClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [stack, setStack] = useState<TrendBiasStackResult | null>(null);
  const [stackError, setStackError] = useState('');
  const [indexData, setIndexData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [watchlistData, setWatchlistData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [futuresData, setFuturesData] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [idxRes, wlRes, futRes, stackRes] = await Promise.allSettled([
        fetch(`/api/finviz/screener?tickers=${INDEX_TICKERS.join(',')}`).then((r) => r.json()),
        fetch(`/api/finviz/screener?tickers=${watchlist.join(',')}`).then((r) => r.json()),
        fetch('/api/finviz/futures').then((r) => r.json()),
        fetch('/api/trend-bias?instrument=MNQ')
          .then(async (r) => {
            const ct = r.headers.get('content-type') ?? '';
            if (!ct.includes('application/json')) return { gated: true };
            const json = await r.json();
            if (r.status === 401 || r.status === 403) return { gated: true };
            if (!r.ok) return { error: json.error ?? 'Stack unavailable' };
            return { stack: json as TrendBiasStackResult };
          })
          .catch(() => ({ gated: true })),
      ]);
      if (cancelled) return;
      if (idxRes.status === 'fulfilled') setIndexData(idxRes.value);
      if (wlRes.status === 'fulfilled') setWatchlistData(wlRes.value);
      if (futRes.status === 'fulfilled') setFuturesData(futRes.value);
      if (stackRes.status === 'fulfilled') {
        const value = stackRes.value as { gated?: boolean; error?: string; stack?: TrendBiasStackResult };
        if (value.gated) {
          setGated(true);
          setStack(null);
        } else if (value.stack) {
          setGated(false);
          setStack(value.stack);
          setStackError('');
        } else {
          setStackError(value.error ?? '');
        }
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [watchlist]);

  const quotes = indexData?.data ?? [];
  const aboveSma20 = quotes.filter((q) => q.sma20rel === 'above').length;
  const condition =
    quotes.length === 0
      ? '—'
      : aboveSma20 >= Math.ceil(quotes.length * 0.75)
      ? 'Risk-on'
      : aboveSma20 <= Math.floor(quotes.length * 0.25)
      ? 'Risk-off'
      : 'Mixed';

  const looks = [...(watchlistData?.data ?? [])]
    .map((q) => ({ q, quality: stockQuality(q, rvolThreshold) }))
    .filter((row) => row.quality.label === 'LOOK')
    .sort((a, b) => b.quality.score - a.quality.score)
    .slice(0, 5);

  const nq = (futuresData?.data ?? []).find((f) => f.symbol === 'NQ');
  const action: Action = stack
    ? actionFromStack(stack)
    : 'WAIT';
  const heroBias = stack ? biasWord(stack) : nq?.direction === 'up' ? 'BULLISH' : nq?.direction === 'down' ? 'BEARISH' : 'MIXED';
  const heroWhy = stack
    ? stack.quality.headline
    : gated
    ? 'Sign in for the MNQ stack. This page will not guess a look from delayed tape.'
    : stackError || 'Waiting on the MNQ stack.';

  const actionWrap =
    action === 'LOOK'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : action === 'WAIT'
      ? 'border-amber-500/30 bg-amber-500/10'
      : 'border-[#2a2a2a] bg-[#141414]';
  const actionColor =
    action === 'LOOK' ? 'text-emerald-300' : action === 'WAIT' ? 'text-amber-200' : 'text-gray-200';

  const preferred =
    !stack ? '—' : stack.suggestion.action === 'LOOK_LONG' ? 'LONG' : stack.suggestion.action === 'LOOK_SHORT' ? 'SHORT' : 'STAND DOWN';
  const preferredColor =
    preferred === 'LONG' ? 'text-emerald-400' : preferred === 'SHORT' ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-8 w-3/4 max-w-xl" />
            <div className="skeleton h-4 w-48" />
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2">Desk</div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white leading-tight">
              MNQ: {heroBias}
              <span className="text-gray-500"> · </span>
              <span className={actionColor}>{action === 'LOOK' ? 'LOOK' : action === 'WAIT' ? 'WAIT' : 'NO TRADE'}</span>
            </h1>
            <p className="text-sm text-gray-400 mt-2 max-w-2xl">{heroWhy}</p>
          </>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full border border-[#2a2a2a] text-gray-300">
            Tape {condition}
          </span>
          <span className="text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full border border-emerald-500/30 text-emerald-300">
            {session.session}
          </span>
          <span className="text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full border border-[#2a2a2a] text-gray-500">
            Delayed Yahoo
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)] gap-4">
        <div className="space-y-4">
          <div className={`border rounded-2xl p-5 ${actionWrap}`}>
            <div className="label mb-2">Best action right now</div>
            <div className={`text-4xl md:text-5xl font-black tracking-tight ${actionColor}`}>{action}</div>
            <p className="text-sm mt-3 opacity-80 max-w-xl">
              {stack
                ? stack.suggestion.headline
                : gated
                ? 'The stack is behind the login. Futures is where the invalidation lives.'
                : 'No stack read yet — do not invent a look.'}
            </p>
            <div className="mt-4">
              {stack ? (
                <TradingViewButton symbol="MNQ1!" label="Confirm MNQ on TradingView" />
              ) : (
                <Link
                  href={gated ? '/login' : '/futures'}
                  className="inline-flex items-center text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                >
                  {gated ? 'Sign in for the stack →' : 'Open Futures →'}
                </Link>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="label">Looks</span>
              <Link href="/stocks" className="text-[11px] text-emerald-400 hover:text-emerald-300">
                Stocks →
              </Link>
            </div>
            {watchlistData?.sourceError ? (
              <DataUnavailable reason={watchlistData.sourceError} />
            ) : loading ? (
              <div className="space-y-2">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            ) : looks.length === 0 ? (
              <p className="text-sm text-gray-500">NO TRADE — nothing on this watchlist cleared volume plus a side.</p>
            ) : (
              looks.map(({ q, quality }) => <LookRow key={q.symbol} q={q} quality={quality} />)
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="label">Game plan · MNQ</span>
              {stack && <SourceTag source={`Yahoo (${stack.dataSymbol})`} lastUpdated={stack.asOf} />}
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="skeleton h-6 w-24" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            ) : stack ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">Preferred</span>
                  <span className={`font-bold ${preferredColor}`}>{preferred}</span>
                </div>
                <div className="flex items-baseline justify-between font-mono text-sm">
                  <span className="text-xs text-gray-500">Last</span>
                  <span className="text-white">{fmtLevel(stack.lastPrice)}</span>
                </div>
                <div className="flex items-baseline justify-between font-mono text-sm">
                  <span className="text-xs text-gray-500">Daily zone</span>
                  <span className="text-gray-200 capitalize">{stack.levels.Daily.zone}</span>
                </div>
                <div className="flex items-baseline justify-between font-mono text-sm">
                  <span className="text-xs text-gray-500">Invalidation</span>
                  <span className="text-red-300">{fmtLevel(stack.levels.Daily.invalidation)}</span>
                </div>
                {stack.suggestion.playbook[0] && (
                  <p className="text-xs text-gray-400 pt-2 border-t border-[#1e1e1e] leading-relaxed">
                    {stack.suggestion.playbook[0]}
                  </p>
                )}
                <Link href="/futures" className="block text-[11px] text-emerald-400 hover:text-emerald-300 pt-1">
                  Full stack →
                </Link>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                {gated ? 'Sign in to load invalidation and the playbook.' : 'Game plan needs the MNQ stack.'}
              </p>
            )}
          </div>

          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="label">Your edge</span>
              <Link href="/journal" className="text-[11px] text-emerald-400 hover:text-emerald-300">
                Journal →
              </Link>
            </div>
            {journal.loading ? (
              <div className="skeleton h-16 w-full" />
            ) : journal.error.startsWith('Sign in') ? (
              <p className="text-sm text-gray-500">
                <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
                  Sign in
                </Link>{' '}
                so win rate and setup memory stay on your account.
              </p>
            ) : journal.error && journal.entries.length === 0 ? (
              <p className="text-sm text-gray-500">Log trades in Journal. Stats stay on your account.</p>
            ) : edge.totalTrades === 0 ? (
              <p className="text-sm text-gray-500">No closed trades yet. The journal is how this box gets a memory.</p>
            ) : (
              <>
                {edge.bestSetup && (
                  <p className="text-sm text-gray-300">
                    Best logged setup: <span className="text-white font-semibold">{edge.bestSetup}</span>
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="label">Win rate</div>
                    <div className="font-mono text-white mt-1">{edge.winRate.toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="label">W / L</div>
                    <div className="font-mono text-white mt-1">
                      {edge.wins} / {edge.losses}
                    </div>
                  </div>
                  <div>
                    <div className="label">Closed P&L</div>
                    <div
                      className={`font-mono mt-1 ${
                        edge.totalPnL > 0 ? 'text-emerald-400' : edge.totalPnL < 0 ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {edge.totalPnL > 0 ? '+' : ''}
                      {edge.totalPnL.toFixed(2)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <TradingViewAlerts />
        </div>
      </div>

      <p className="text-sm italic text-gray-600 text-center pt-2">
        Protect your capital. Wait for confirmation. Let the market come to you.
      </p>
      <p className="text-[11px] text-gray-700 text-center">
        Structure confirmed on TradingView only — CHOCH, BOS, FVG, VWAP not computed here.
      </p>
    </div>
  );
}
