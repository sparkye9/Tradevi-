'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban, Check, Circle, Eye, Hourglass } from 'lucide-react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import TradingViewAlerts from '@/components/dashboard/TradingViewAlerts';
import { useAccountJournal } from '@/hooks/useAccountJournal';
import { journalEdge } from '@/lib/journal';
import { marketClock, sessionFlow } from '@/lib/powerHour';
import { stockQuality } from '@/lib/stockQuality';
import { useTradeviStore } from '@/store/tradeviStore';
import UpcomingPrints from '@/components/calendar/UpcomingPrints';
import FuturesToggle from '@/components/dashboard/FuturesToggle';
import { useDeskQuote } from '@/components/ui/BibleVerse';
import type { FinvizQuote, FinvizFuture, FinvizResult } from '@/lib/finviz';
import {
  DESK_FUTURES,
  DISPLAY_INSTRUMENTS,
  type DeskInstrument,
  type TrendBiasStackResult,
} from '@/lib/trendBias';

const TV_SYMBOL: Record<DeskInstrument, string> = Object.fromEntries(
  DESK_FUTURES.map((row) => [row.instrument, row.tv]),
) as Record<DeskInstrument, string>;

async function fetchStack(instrument: DeskInstrument): Promise<
  { gated: true } | { error: string } | { stack: TrendBiasStackResult }
> {
  const res = await fetch(`/api/trend-bias?instrument=${instrument}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return { gated: true };
  const json = await res.json();
  if (res.status === 401 || res.status === 403) return { gated: true };
  if (!res.ok) return { error: json.error ?? 'Stack unavailable' };
  return { stack: json as TrendBiasStackResult };
}

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

function QualityRing({ score, label }: { score: number; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = label === 'TRADE' ? '#22E38A' : label === 'WAIT' ? '#F5C15C' : '#8B93A7';
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 88 88" className="h-24 w-24 -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#222738" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white font-bold font-mono text-sm">{score}</span>
        <span className="text-[9px] text-tv-muted tracking-widest">/100</span>
      </div>
    </div>
  );
}

function SentimentBar({ bias }: { bias: 'up' | 'down' | 'range' | null }) {
  const pos = bias === 'up' ? 82 : bias === 'down' ? 18 : 50;
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-tv-muted mb-1.5">
        <span className="text-tv-red">Bearish</span>
        <span>Sentiment</span>
        <span className="text-tv-green">Bullish</span>
      </div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-tv-red/80 via-tv-amber/50 to-tv-green/80">
        <span
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-tv-panel shadow-glow-purple"
          style={{ left: `${pos}%` }}
        />
      </div>
      <p className="text-[11px] text-tv-muted mt-2">Daily HH/HL bias from the stack — not a poll or flow gauge.</p>
    </div>
  );
}

function stackChecks(stack: TrendBiasStackResult): { label: string; on: boolean }[] {
  const weekly = stack.reads.Weekly.bias;
  const daily = stack.reads.Daily.bias;
  const fourH = stack.reads['4H'].bias;
  const aligned = weekly === daily && daily === fourH && weekly !== 'range';
  const zoneOk =
    (stack.suggestion.action === 'LOOK_LONG' && stack.levels.Daily.zone === 'discount') ||
    (stack.suggestion.action === 'LOOK_SHORT' && stack.levels.Daily.zone === 'premium');
  return [
    { label: `Weekly ${weekly}`, on: weekly !== 'range' },
    { label: `Daily ${daily}`, on: daily !== 'range' },
    { label: `4H ${fourH}`, on: fourH !== 'range' },
    { label: 'W / D / 4H stacked', on: aligned },
    { label: `Daily ${stack.levels.Daily.zone}`, on: zoneOk },
    { label: 'Quality is a look', on: stack.quality.label === 'TRADE' },
  ];
}

export default function Desk() {
  const { watchlist, rvolThreshold } = useTradeviStore();
  const journal = useAccountJournal();
  const edge = journalEdge(journal.entries);
  const quote = useDeskQuote();
  const [session, setSession] = useState(() => marketClock());

  useEffect(() => {
    const id = setInterval(() => setSession(marketClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [instrument, setInstrument] = useState<DeskInstrument>('MNQ');
  const [stacks, setStacks] = useState<Partial<Record<DeskInstrument, TrendBiasStackResult>>>({});
  const [stackError, setStackError] = useState('');
  const [indexData, setIndexData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [watchlistData, setWatchlistData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [futuresData, setFuturesData] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingInstrument, setLoadingInstrument] = useState<DeskInstrument | null>('MNQ');
  const [gated, setGated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTape() {
      const [idxRes, wlRes, futRes] = await Promise.allSettled([
        fetch(`/api/finviz/screener?tickers=${INDEX_TICKERS.join(',')}`).then((r) => r.json()),
        fetch(`/api/finviz/screener?tickers=${watchlist.join(',')}`).then((r) => r.json()),
        fetch('/api/finviz/futures').then((r) => r.json()),
      ]);
      if (cancelled) return;
      if (idxRes.status === 'fulfilled') setIndexData(idxRes.value);
      if (wlRes.status === 'fulfilled') setWatchlistData(wlRes.value);
      if (futRes.status === 'fulfilled') setFuturesData(futRes.value);
    }
    loadTape();
    const id = setInterval(loadTape, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watchlist]);

  useEffect(() => {
    let cancelled = false;
    async function loadSelected(isRefresh = false) {
      if (!isRefresh) setLoadingInstrument(instrument);
      const result = await fetchStack(instrument).catch(() => ({ gated: true as const }));
      if (cancelled) return;
      if ('gated' in result && result.gated) {
        setGated(true);
        setStackError('');
      } else if ('stack' in result) {
        setGated(false);
        setStacks((prev) => ({ ...prev, [instrument]: result.stack }));
        setStackError('');
      } else if ('error' in result) {
        setStackError(result.error);
      }
      setLoading(false);
      setLoadingInstrument(null);
    }
    loadSelected(false);
    const id = setInterval(() => loadSelected(true), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [instrument]);

  useEffect(() => {
    if (gated !== false) return;
    let cancelled = false;
    async function loadRest() {
      const rest = DISPLAY_INSTRUMENTS.filter((inst) => inst !== instrument);
      const results = await Promise.all(
        rest.map(async (inst) => ({ inst, result: await fetchStack(inst).catch(() => ({ error: 'Fetch failed' })) })),
      );
      if (cancelled) return;
      setStacks((prev) => {
        const next = { ...prev };
        for (const { inst, result } of results) {
          if ('stack' in result) next[inst] = result.stack;
        }
        return next;
      });
    }
    loadRest();
    return () => {
      cancelled = true;
    };
    // Load the other four once after the first selected stack. Re-run if the gate lifts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated]);

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
    .slice(0, 4);

  const stack = stacks[instrument] ?? null;
  const tape = (futuresData?.data ?? []).find(
    (f) => f.symbol === DESK_FUTURES.find((row) => row.instrument === instrument)?.tape,
  );
  const vix = (futuresData?.data ?? []).find((f) => f.symbol === 'VIX');
  const action: Action = stack ? actionFromStack(stack) : 'WAIT';
  const heroBias = stack
    ? biasWord(stack)
    : tape?.direction === 'up'
    ? 'BULLISH'
    : tape?.direction === 'down'
    ? 'BEARISH'
    : 'MIXED';
  const heroWhy = stack
    ? stack.quality.headline
    : gated
    ? `Sign in for the ${instrument} stack. This page will not guess a look from delayed tape.`
    : stackError || `Waiting on the ${instrument} stack.`;

  const actionWrap =
    action === 'LOOK'
      ? 'border-tv-green/30 bg-tv-green/10'
      : action === 'WAIT'
      ? 'border-tv-amber/30 bg-tv-amber/10'
      : 'border-tv-border bg-tv-panel';
  const actionColor =
    action === 'LOOK' ? 'text-tv-green' : action === 'WAIT' ? 'text-tv-amber' : 'text-gray-200';
  const ActionIcon = action === 'LOOK' ? Eye : action === 'WAIT' ? Hourglass : Ban;

  const waitPhrase =
    action !== 'WAIT'
      ? null
      : stack?.suggestion.action === 'LOOK_LONG'
      ? 'WAITING FOR DISCOUNT'
      : stack?.suggestion.action === 'LOOK_SHORT'
      ? 'WAITING FOR PREMIUM'
      : 'WAIT';
  const preferred =
    !stack ? '—' : stack.suggestion.action === 'LOOK_LONG' ? 'LONG' : stack.suggestion.action === 'LOOK_SHORT' ? 'SHORT' : 'STAND DOWN';
  const preferredColor =
    preferred === 'LONG' ? 'text-tv-green' : preferred === 'SHORT' ? 'text-tv-red' : 'text-tv-muted';

  const dailyBias = stack?.reads.Daily.bias ?? null;
  const regime = dailyBias === 'range' || dailyBias == null ? 'Range' : 'Trending';
  const flow = sessionFlow(session);
  const checks = stack ? stackChecks(stack) : [];

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-8 w-3/4 max-w-xl" />
            <div className="skeleton h-4 w-48" />
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-[0.18em] text-tv-purple mb-2">Market brief</div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white leading-tight">
              {instrument}: {heroBias}
              <span className="text-gray-500">, </span>
              <span className={actionColor}>
                {action === 'LOOK' ? 'LOOK' : action === 'WAIT' ? waitPhrase : 'NO TRADE'}
              </span>
            </h1>
            <p className="text-sm text-tv-muted mt-2 max-w-2xl">{heroWhy}</p>
          </>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <span className={`pill ${regime === 'Trending' ? 'border-tv-green/30 text-tv-green bg-tv-green/10' : 'border-tv-border text-tv-muted'}`}>
            {regime}
          </span>
          <span className="pill border-tv-blue/30 text-tv-blue bg-tv-blue/10">
            VIX {vix?.changePercent != null ? `${vix.changePercent >= 0 ? '+' : ''}${vix.changePercent.toFixed(1)}%` : '—'}
          </span>
          <span className="pill border-tv-purple/30 text-tv-purple bg-tv-purple/10">{session.session}</span>
          <span className="pill border-tv-border text-tv-muted">Delayed Yahoo</span>
        </div>
        <div className="mt-4">
          <div className="label mb-2">Futures</div>
          <FuturesToggle
            selected={instrument}
            onSelect={setInstrument}
            futures={futuresData?.data ?? []}
            stacks={stacks}
            loadingInstrument={loadingInstrument}
          />
          <p className="text-[11px] text-tv-muted mt-2">
            Tape refreshes about every minute. Toggle a micro to load its HH/HL stack. Delayed — not a live last-sale.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)] gap-4">
        <div className="space-y-4">
          <div className={`border rounded-2xl p-5 ${actionWrap}`}>
            <div className="flex items-start gap-4">
              <div className={`rounded-xl p-3 ${action === 'WAIT' ? 'bg-tv-amber/15' : action === 'LOOK' ? 'bg-tv-green/15' : 'bg-white/5'}`}>
                <ActionIcon size={28} className={actionColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="label mb-1">Best action right now</div>
                <div className={`text-4xl md:text-5xl font-black tracking-tight ${actionColor}`}>{action}</div>
                <p className="text-sm mt-2 opacity-80 max-w-xl">
                  {stack
                    ? stack.suggestion.headline
                    : gated
                    ? `The stack is behind the login. Futures is where the invalidation lives.`
                    : 'No stack read yet — do not invent a look.'}
                </p>
                <div className="mt-4">
                  {stack ? (
                    <TradingViewButton symbol={TV_SYMBOL[instrument]} label={`Confirm ${instrument} on TradingView`} />
                  ) : (
                    <Link
                      href={gated ? '/login' : '/futures'}
                      className="inline-flex items-center text-xs font-semibold text-tv-purple hover:text-white"
                    >
                      {gated ? 'Sign in for the stack →' : 'Open Futures →'}
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-white/10">
              <SentimentBar bias={dailyBias} />
            </div>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="label">Today&apos;s board</span>
              <Link href="/futures" className="text-[11px] text-tv-purple hover:text-white">
                Futures →
              </Link>
            </div>
            {watchlistData?.sourceError ? (
              <div className="px-4 pb-4">
                <DataUnavailable reason={watchlistData.sourceError} />
              </div>
            ) : loading ? (
              <div className="px-4 pb-4 space-y-2">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-tv-muted border-y border-tv-border">
                      <th className="py-2 px-4 font-medium">Setup</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium">Quality</th>
                      <th className="py-2 px-3 font-medium">Side</th>
                      <th className="py-2 px-4 font-medium">Key level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DESK_FUTURES.map((row) => {
                      const rowStack = stacks[row.instrument];
                      const rowTape = (futuresData?.data ?? []).find((f) => f.symbol === row.tape);
                      const rowAction: Action = rowStack ? actionFromStack(rowStack) : 'WAIT';
                      const rowSide = !rowStack
                        ? '—'
                        : rowStack.suggestion.action === 'LOOK_LONG'
                        ? 'LONG'
                        : rowStack.suggestion.action === 'LOOK_SHORT'
                        ? 'SHORT'
                        : 'STAND DOWN';
                      const selected = row.instrument === instrument;
                      return (
                        <tr
                          key={row.instrument}
                          className={`border-b border-tv-border/80 cursor-pointer ${selected ? 'bg-tv-purple/10' : 'hover:bg-white/[0.03]'}`}
                          onClick={() => setInstrument(row.instrument)}
                        >
                          <td className="py-2.5 px-4 font-mono font-bold text-white">
                            {row.instrument}
                            <span className="text-[10px] text-tv-muted ml-2 font-sans font-normal">{row.name}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            {rowStack ? (
                              <span
                                className={`pill ${
                                  rowAction === 'LOOK'
                                    ? 'border-tv-green/30 text-tv-green bg-tv-green/10'
                                    : rowAction === 'WAIT'
                                    ? 'border-tv-amber/30 text-tv-amber bg-tv-amber/10'
                                    : 'border-tv-border text-tv-muted'
                                }`}
                              >
                                {rowAction}
                              </span>
                            ) : (
                              <span className="text-xs text-tv-muted font-mono">
                                {rowTape?.changePercent != null
                                  ? `${rowTape.changePercent >= 0 ? '+' : ''}${rowTape.changePercent.toFixed(2)}%`
                                  : '—'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-tv-muted">
                            {rowStack ? `${rowStack.quality.score}/100` : '—'}
                          </td>
                          <td
                            className={`py-2.5 px-3 font-semibold ${
                              rowSide === 'LONG' ? 'text-tv-green' : rowSide === 'SHORT' ? 'text-tv-red' : 'text-tv-muted'
                            }`}
                          >
                            {rowSide}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs text-gray-300">
                            {rowStack
                              ? `Inv ${fmtLevel(rowStack.levels.Daily.invalidation)}`
                              : rowTape?.price != null
                              ? rowTape.price.toLocaleString()
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {looks.map(({ q, quality }) => (
                      <tr key={q.symbol} className="border-b border-tv-border/80 last:border-0">
                        <td className="py-2.5 px-4 font-mono font-bold text-white">{q.symbol}</td>
                        <td className="py-2.5 px-3">
                          <span className="pill border-tv-green/30 text-tv-green bg-tv-green/10">LOOK</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-tv-muted">{quality.score}/100</td>
                        <td className={`py-2.5 px-3 font-semibold ${quality.side === 'long' ? 'text-tv-green' : 'text-tv-red'}`}>
                          {quality.side.toUpperCase()}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs text-gray-300">
                          {q.price != null ? `$${q.price.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-4 py-2 text-[10px] text-gray-600">Quality is the engine score, not a letter grade. Confirm structure on TradingView.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card space-y-3">
              <span className="label">Market snapshot</span>
              <div className={`text-2xl font-black ${regime === 'Trending' ? 'text-tv-green' : 'text-tv-amber'}`}>{regime}</div>
              <p className="text-xs text-tv-muted">
                Daily bias {dailyBias ?? '—'}. Tape {condition} on SPY/QQQ/IWM/GLD SMA 20 — four names, not market breadth.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-tv-muted">Tape</div>
                  <div className="text-white font-semibold">{condition}</div>
                </div>
                <div>
                  <div className="text-tv-muted">Conviction</div>
                  <div className="text-white font-semibold capitalize">{stack?.suggestion.conviction ?? '—'}</div>
                </div>
              </div>
            </div>

            <div className="card space-y-3">
              <span className="label">Session flow</span>
              <div className="space-y-2">
                {flow.map((step) => (
                  <div key={step.venue} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full ${step.active ? 'bg-tv-purple' : 'bg-tv-border'}`} />
                      <span className={`text-sm ${step.active ? 'text-white' : 'text-tv-muted'}`}>{step.venue}</span>
                    </div>
                    <span className="text-[10px] text-gray-600 font-mono whitespace-nowrap">{step.active ? 'Open' : '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            <UpcomingPrints compact />
          </div>

          {quote && (
            <div className="rounded-2xl border border-tv-purple/25 bg-tv-purple/10 p-5">
              <p className="text-sm italic text-gray-200 leading-relaxed">&ldquo;{quote.text}&rdquo;</p>
              <p className="text-[11px] text-tv-purple mt-2">— {quote.ref}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <span className="label">Tradevi intelligence</span>
              {stack && <SourceTag source={`Yahoo (${stack.dataSymbol})`} lastUpdated={stack.asOf} />}
            </div>
            {loading ? (
              <div className="skeleton h-32 w-full" />
            ) : stack ? (
              <>
                <div className="flex items-center gap-4">
                  <QualityRing score={stack.quality.score} label={stack.quality.label} />
                  <div>
                    <div className="text-xs text-tv-muted">{instrument} setup</div>
                    <div className={`text-lg font-bold ${preferredColor}`}>{preferred === 'STAND DOWN' ? 'NO LOOK' : `${preferred} SETUP`}</div>
                    <div className="text-[11px] text-tv-muted mt-1">{stack.quality.label.replace('_', ' ')} · {stack.quality.score}/100</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {checks.map((row) => (
                    <div key={row.label} className="flex items-center gap-2 text-sm">
                      {row.on ? (
                        <Check size={14} className="text-tv-green shrink-0" />
                      ) : (
                        <Circle size={14} className="text-gray-600 shrink-0" />
                      )}
                      <span className={row.on ? 'text-gray-200' : 'text-tv-muted'}>{row.label}</span>
                    </div>
                  ))}
                </div>
                {(action === 'WAIT' || action === 'NO TRADE') && (
                  <div className="rounded-xl border border-tv-amber/20 bg-tv-amber/5 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-tv-amber mb-1">
                      {action === 'WAIT' ? 'Why wait?' : 'Why stand down?'}
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{stack.quality.headline}</p>
                  </div>
                )}
                <p className="text-[10px] text-gray-600">
                  Checks are HH/HL stack + dealing-range zone. CHOCH / BOS / FVG are not computed here.
                </p>
              </>
            ) : (
              <p className="text-sm text-tv-muted">
                {gated ? `Sign in to load the ${instrument} stack.` : 'Intelligence needs the stack. It will not invent a setup.'}
              </p>
            )}
          </div>

          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="label">Quick game plan · {instrument}</span>
              <Link href="/futures" className="text-[11px] text-tv-purple hover:text-white">
                Full stack →
              </Link>
            </div>
            {loading ? (
              <div className="skeleton h-20 w-full" />
            ) : stack ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-tv-muted">Preferred</span>
                  <span className={`font-bold ${preferredColor}`}>{preferred}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-tv-muted">Last</span>
                  <span className="text-white">{fmtLevel(stack.lastPrice)}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-tv-muted">Daily zone</span>
                  <span className="text-gray-200 capitalize">{stack.levels.Daily.zone}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-tv-muted">Invalidation</span>
                  <span className="text-tv-red">{fmtLevel(stack.levels.Daily.invalidation)}</span>
                </div>
                {stack.swingSetup && (
                  <>
                    <div className="flex justify-between font-mono">
                      <span className="text-tv-muted">Entry</span>
                      <span className="text-white">{fmtLevel(stack.swingSetup.entry)}</span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-tv-muted">Stop</span>
                      <span className="text-tv-red">{fmtLevel(stack.swingSetup.stop)}</span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-tv-muted">TP1</span>
                      <span className="text-tv-green">{fmtLevel(stack.swingSetup.tp1)}</span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-tv-muted">TP2</span>
                      <span className="text-tv-green">{fmtLevel(stack.swingSetup.tp2)}</span>
                    </div>
                  </>
                )}
                {stack.suggestion.playbook[0] && (
                  <p className="text-xs text-tv-muted pt-2 border-t border-tv-border leading-relaxed">
                    {stack.suggestion.playbook[0]}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-tv-muted">
                {gated ? 'Sign in to load invalidation and the playbook.' : `Game plan needs the ${instrument} stack.`}
              </p>
            )}
          </div>

          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="label">Your edge</span>
              <Link href="/journal" className="text-[11px] text-tv-purple hover:text-white">
                Journal →
              </Link>
            </div>
            {journal.loading ? (
              <div className="skeleton h-16 w-full" />
            ) : journal.error.startsWith('Sign in') ? (
              <p className="text-sm text-tv-muted">
                <Link href="/login" className="text-tv-purple hover:text-white">
                  Sign in
                </Link>{' '}
                so win rate stays on your account.
              </p>
            ) : journal.error && journal.entries.length === 0 ? (
              <p className="text-sm text-tv-muted">Log trades in Journal. Stats stay on your account.</p>
            ) : edge.totalTrades === 0 ? (
              <p className="text-sm text-tv-muted">No closed trades yet. The journal is how this box gets a memory.</p>
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
                        edge.totalPnL > 0 ? 'text-tv-green' : edge.totalPnL < 0 ? 'text-tv-red' : 'text-white'
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

      <p className="text-[11px] text-gray-600 text-center">
        Protect your capital. Structure confirmed on TradingView only — CHOCH, BOS, FVG, VWAP not computed here.
      </p>
    </div>
  );
}
