'use client';
import { useEffect, useState } from 'react';
import LearnBox from '@/components/ui/LearnBox';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { friendlyDataError } from '@/lib/friendlyError';
import { MARKET_UNIVERSE } from '@/lib/marketUniverse';
import { DRAW_NAMES, type Draw, type SelectorBias, type SelectorItem } from '@/lib/selector';
import type { SelectorResponse } from '@/lib/selectorData';
import LabelPill, { LABEL_STYLE } from '@/components/selector/LabelPill';

const REFRESH_MS = 15 * 60 * 1000;

const BIAS_STYLE: Record<SelectorBias, string> = {
  Bullish: 'text-tv-green',
  Bearish: 'text-tv-red',
  Neutral: 'text-tv-amber',
};

function fmtPx(n: number): string {
  const places = n >= 1000 ? 0 : n >= 100 ? 1 : n >= 10 ? 2 : 4;
  return n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET';
  } catch {
    return iso;
  }
}

function DrawLine({ draw, unit, prefix }: { draw: Draw | null; unit: string; prefix?: string }) {
  if (!draw) return <span className="text-tv-muted">No untaken draw</span>;
  return (
    <span>
      {prefix && <span className="text-tv-muted">{prefix} </span>}
      <span className="text-gray-200">{DRAW_NAMES[draw.type]}</span>{' '}
      <span className="font-mono text-white">{fmtPx(draw.price)}</span>{' '}
      <span className="font-mono text-tv-muted">
        {draw.distance_atr.toFixed(1)} {unit} {draw.side}
      </span>
    </span>
  );
}

function InstrumentRow({ item, rank, unit }: { item: SelectorItem; rank: number; unit: string }) {
  const tv = MARKET_UNIVERSE.find((u) => u.symbol === item.symbol)?.tv ?? `${item.symbol}1!`;
  return (
    <div className={`card card-hover border ${LABEL_STYLE[item.label].wrap}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-tv-muted w-5 shrink-0">{rank}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-white text-lg leading-none">{item.symbol}</span>
              <span className="text-xs text-tv-muted">{item.display}</span>
              <LabelPill label={item.label} />
            </div>
            <div className="text-[11px] text-tv-muted mt-1">
              Trade as <span className="font-mono text-gray-300">{item.trade_as}</span>
              {item.roll_gap_flag && <span className="ml-2 text-tv-amber">· roll gap</span>}
              {item.inside_day && <span className="ml-2 text-tv-muted">· inside {item.timeframe === 'weekly' ? 'week' : 'day'}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-2xl font-black text-white leading-none">{item.score}</div>
          <div className={`text-[11px] font-semibold mt-1 ${BIAS_STYLE[item.bias]}`}>{item.bias}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="label">ER10</div>
          <div className="value text-sm">{item.er10.toFixed(2)}</div>
        </div>
        <div>
          <div className="label">ADX14</div>
          <div className="value text-sm">{item.adx14.toFixed(0)}</div>
        </div>
        <div>
          <div className="label">ATR14</div>
          <div className="value text-sm">{fmtPx(item.atr14)}</div>
        </div>
      </div>

      <div className="mt-3 text-xs space-y-1">
        <div>
          <span className="label mr-2">Target</span>
          <DrawLine draw={item.target_draw} unit={unit} />
        </div>
        {item.bias === 'Neutral' && item.alt_draw && (
          <div>
            <span className="label mr-2">Other side</span>
            <DrawLine draw={item.alt_draw} unit={unit} />
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-1">
        {item.reasons.map((r) => (
          <li key={r} className="text-xs text-gray-300 leading-relaxed">
            • {r}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] text-gray-600 font-mono">last {fmtPx(item.last_close)} · bar {item.last_bar_date}</span>
        <TradingViewButton symbol={tv} label={`Check ${item.symbol} on TradingView`} />
      </div>
    </div>
  );
}

function ErrorList({ errors }: { errors: SelectorResponse['errors'] }) {
  if (!errors?.length) return null;
  return (
    <div className="space-y-2">
      {errors.map((e) => (
        <DataUnavailable key={`${e.symbol}-${e.error}`} reason={`${e.display} (${e.symbol}): ${e.error}`} />
      ))}
    </div>
  );
}

function useSelector(view: 'daily' | 'weekly') {
  const [data, setData] = useState<SelectorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/selector/${view}`);
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) throw new Error('Selector unavailable right now');
        const json = (await res.json()) as SelectorResponse;
        if (cancelled) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fetch failed');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [view]);
  return { data, error, loading };
}

export default function MarketSelectorPage() {
  const daily = useSelector('daily');
  const weekly = useSelector('weekly');
  const tradeCount = daily.data?.items.filter((i) => i.label === 'Trade').length ?? 0;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Market Selector</h1>
        <p className="text-sm text-gray-500 mt-1">
          Which futures market is clean and has somewhere to go today. Ranked by trend cleanliness (ER10, ADX14)
          and the nearest untaken liquidity draw, on daily bars. Daily view refreshes before the US open; weekly
          view on Sunday evening.
        </p>
      </div>

      <LearnBox
        summary="a ranking of futures by how clean the trend is and how close the next liquidity target sits."
        items={[
          { term: 'ER10', text: 'Efficiency ratio: net move over 10 days divided by the total path. 0.40+ is a clean trend, under 0.25 is chop.' },
          { term: 'ADX14', text: 'Trend strength. 25+ is trending, under 18 is chop.' },
          { term: 'Bias', text: 'Bullish when last week closed above the prior week’s midpoint AND price is above the daily 20 EMA. Bearish when both are the opposite. Otherwise Neutral.' },
          { term: 'Draw', text: 'An untaken liquidity level: prior week or month high/low, or equal highs/lows that price has not traded through yet. The target is the nearest one in the bias direction.' },
          { term: 'Distance', text: 'How far the draw is in ATR units. 0.5 to 2.0 ATR gets full reachability points; too close or too far scores less.' },
          { term: 'Score', text: 'ER 30 · ADX 20 · Reachability 25 · Bias clarity 15 · Not an inside day 10. Trade ≥ 65, Watch 45–64, Avoid < 45.' },
        ]}
        learnHref="/learn"
      />

      {/* ── Today ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white">Today&apos;s ranking</h2>
            <p className="text-xs text-tv-muted">
              Last updated {fmtTime(daily.data?.updated_at)} · next recompute {daily.data?.next_recompute ?? '—'} ·{' '}
              {tradeCount} Trade-rated
            </p>
          </div>
          {daily.data && <SourceTag source="Yahoo (daily bars)" lastUpdated={daily.data.updated_at} />}
        </div>
        {daily.loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-40 w-full rounded-2xl" />
            ))}
          </div>
        )}
        {daily.error && <DataUnavailable reason={daily.error} />}
        {daily.data && <ErrorList errors={daily.data.errors} />}
        {daily.data && daily.data.items.length === 0 && !daily.loading && (
          <div className="card text-sm text-gray-300">
            {friendlyDataError(daily.data.errors[0]?.error ?? 'no data')}
          </div>
        )}
        {daily.data && daily.data.items.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {daily.data.items.map((item, i) => (
              <InstrumentRow key={item.symbol} item={item} rank={i + 1} unit="ATR" />
            ))}
          </div>
        )}
      </section>

      {/* ── This week ── */}
      <section className="space-y-3 border-t border-tv-border pt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white">This week&apos;s top 3</h2>
            <p className="text-xs text-tv-muted">
              Same metrics on weekly bars (ER10 and ADX14 over weeks; draws are prior month high/low and weekly equal highs/lows).
              Recomputes {weekly.data?.next_recompute ?? 'Sunday 6:00 PM ET'} · last updated {fmtTime(weekly.data?.updated_at)}
            </p>
          </div>
        </div>
        {weekly.loading && <div className="skeleton h-40 w-full rounded-2xl" />}
        {weekly.error && <DataUnavailable reason={weekly.error} />}
        {weekly.data && <ErrorList errors={weekly.data.errors} />}
        {weekly.data && (weekly.data.top3?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {weekly.data.top3!.map((item, i) => (
              <InstrumentRow key={item.symbol} item={item} rank={i + 1} unit="wATR" />
            ))}
          </div>
        )}
        {weekly.data && weekly.data.items.length > 3 && (
          <details className="group">
            <summary className="cursor-pointer select-none text-xs text-tv-purple hover:text-white">
              Full weekly ranking ({weekly.data.items.length})
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-tv-muted border-y border-tv-border">
                    <th className="py-2 px-2 font-medium">#</th>
                    <th className="py-2 px-2 font-medium">Market</th>
                    <th className="py-2 px-2 font-medium">Label</th>
                    <th className="py-2 px-2 font-medium">Score</th>
                    <th className="py-2 px-2 font-medium">Bias</th>
                    <th className="py-2 px-2 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.data.items.map((item, i) => (
                    <tr key={item.symbol} className="border-b border-tv-border/80">
                      <td className="py-2 px-2 font-mono text-tv-muted">{i + 1}</td>
                      <td className="py-2 px-2 font-mono font-bold text-white">
                        {item.symbol} <span className="text-[10px] text-tv-muted font-sans font-normal">{item.trade_as}</span>
                      </td>
                      <td className="py-2 px-2"><LabelPill label={item.label} /></td>
                      <td className="py-2 px-2 font-mono text-gray-200">{item.score}</td>
                      <td className={`py-2 px-2 ${BIAS_STYLE[item.bias]}`}>{item.bias}</td>
                      <td className="py-2 px-2 text-xs"><DrawLine draw={item.target_draw} unit="wATR" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <p className="text-[11px] text-gray-600 text-center pt-2">
        Informational only. Shows market conditions and likely liquidity targets, not trade recommendations.
      </p>
    </div>
  );
}
