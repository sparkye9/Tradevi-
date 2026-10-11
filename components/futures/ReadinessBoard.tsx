'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DataUnavailable from '@/components/ui/DataUnavailable';
import SourceTag from '@/components/ui/SourceTag';
import LabelPill from '@/components/selector/LabelPill';
import { GradePill, STATUS_STYLE, readinessReason } from '@/components/futures/TrendBiasStack';
import type { ReadinessBoard as ReadinessBoardData, ReadinessBoardItem } from '@/lib/readinessBoard';
import type { SelectorItem } from '@/lib/selector';
import type { SelectorResponse } from '@/lib/selectorData';
import { MARKET_UNIVERSE } from '@/lib/marketUniverse';
import { fmtPrice } from '@/lib/formatters';

const REFRESH_MS = 5 * 60 * 1000;
const TOGGLE_KEY = 'tradevi.futures.tradeOnly';

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET';
  } catch {
    return iso;
  }
}

const fmtPx = fmtPrice;

/** Selector items are keyed by the universe symbol (NQ); readiness by the desk instrument (MNQ). */
function selectorFor(item: ReadinessBoardItem, selector: SelectorResponse | null): SelectorItem | null {
  if (!selector) return null;
  const u = MARKET_UNIVERSE.find((row) => row.readinessInstrument === item.instrument);
  return selector.items.find((s) => s.symbol === (u?.symbol ?? item.instrument)) ?? null;
}

function Row({
  item,
  sel,
  selected,
  onSelect,
}: {
  item: ReadinessBoardItem;
  sel: SelectorItem | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const style = STATUS_STYLE[item.status];
  const avoid = sel?.label === 'Avoid';
  const reasons = item.status === 'READY' ? [] : readinessReason(item);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border p-3.5 transition-colors ${
        selected ? 'border-tv-purple/50 bg-tv-purple/10' : `${style.border} bg-tv-surface hover:bg-tv-panel`
      } ${avoid ? 'opacity-50 hover:opacity-80' : ''}`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-white text-base leading-none">{item.instrument}</span>
            <span className="text-[11px] text-tv-muted">{item.display}</span>
            <span className={`pill ${style.pill}`}>{item.status}</span>
            <GradePill grade={item.grade} score={item.score} status={item.status} />
            {sel ? (
              <LabelPill label={sel.label} title={`Selector ${sel.score}/100 · ${sel.bias}`} />
            ) : (
              <span className="pill border-tv-border text-gray-600" title="Selector label unavailable">selector —</span>
            )}
          </div>
          <div className="text-[11px] text-tv-muted mt-1 font-mono">
            last {fmtPx(item.lastPrice)} · {item.side ? item.side.toUpperCase() : 'no side'} · data{' '}
            {item.data_age_minutes == null ? '—' : `${item.data_age_minutes} min`}
            {sel?.target_draw && (
              <span className="font-sans">
                {' '}· draw {sel.target_draw.type.replace(/_/g, ' ')} {sel.target_draw.distance_atr.toFixed(1)} ATR {sel.target_draw.side}
              </span>
            )}
          </div>
          {reasons.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {reasons.map((r) => (
                <li key={r} className="text-xs text-gray-300">
                  • {r}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-tv-muted">Trade as</div>
          <div className="font-mono text-xs text-gray-200">{item.tradeAs}</div>
        </div>
      </div>
    </button>
  );
}

export default function ReadinessBoard({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (instrument: string) => void;
}) {
  const [board, setBoard] = useState<ReadinessBoardData | null>(null);
  const [selector, setSelector] = useState<SelectorResponse | null>(null);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tradeOnly, setTradeOnly] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TOGGLE_KEY);
      if (saved === '0') setTradeOnly(false);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle(next: boolean) {
    setTradeOnly(next);
    try {
      window.localStorage.setItem(TOGGLE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [b, s] = await Promise.allSettled([
        fetch('/api/readiness').then(async (r) => {
          const ct = r.headers.get('content-type') ?? '';
          if (!ct.includes('application/json')) throw new Error('Readiness unavailable right now');
          return (await r.json()) as ReadinessBoardData;
        }),
        fetch('/api/selector/daily').then(async (r) => {
          const ct = r.headers.get('content-type') ?? '';
          if (!ct.includes('application/json')) throw new Error('Selector unavailable right now');
          return (await r.json()) as SelectorResponse;
        }),
      ]);
      if (cancelled) return;
      if (b.status === 'fulfilled') {
        setBoard(b.value);
        setBoardError(null);
      } else setBoardError(b.reason instanceof Error ? b.reason.message : 'Fetch failed');
      if (s.status === 'fulfilled' && s.value.items.length > 0) {
        setSelector(s.value);
        setSelectorError(null);
      } else {
        setSelector(null);
        setSelectorError(
          s.status === 'fulfilled' ? s.value.errors?.[0]?.error ?? 'Selector returned no instruments' : s.reason instanceof Error ? s.reason.message : 'Fetch failed',
        );
      }
      setLoading(false);
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    const items = board?.items ?? [];
    return items.map((item) => ({ item, sel: selectorFor(item, selector) }));
  }, [board, selector]);

  const filterActive = tradeOnly && selector !== null;
  const visible = filterActive ? rows.filter((r) => r.sel?.label === 'Trade') : rows;
  const tradeCount = rows.filter((r) => r.sel?.label === 'Trade').length;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">Readiness board</h2>
          <p className="text-xs text-tv-muted">
            Hard gates (session, news, data age) then a 0–100 score. A ≥ 75 READY · B 60–74 WATCH · C &lt; 60 WAIT. Selector label from{' '}
            <Link href="/market-selector" className="text-tv-purple hover:text-white">
              Market Selector
            </Link>
            . Tap a market to load its stack below.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {board && <SourceTag source={board.source} lastUpdated={board.updated_at} />}
          <label className={`inline-flex items-center gap-2 text-xs ${selector ? 'text-gray-200' : 'text-gray-600'} cursor-pointer select-none`}>
            <input
              type="checkbox"
              className="accent-[#8B7CFF] h-4 w-4"
              checked={tradeOnly}
              disabled={!selector}
              onChange={(e) => toggle(e.target.checked)}
            />
            Only show today&apos;s Trade-rated markets
          </label>
        </div>
      </div>

      {boardError && <DataUnavailable reason={boardError} />}
      {selectorError && (
        <DataUnavailable reason={`Selector labels unavailable (${selectorError}). Showing every market without a selector label.`} />
      )}
      {board?.errors.map((e) => (
        <DataUnavailable key={e.instrument} reason={`${e.display} (${e.instrument}): ${e.error}`} />
      ))}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && rows.length > 0 && (
        <div className="card text-sm text-gray-300 flex items-center justify-between gap-3 flex-wrap">
          <span>No Trade-rated markets today ({tradeCount} of {rows.length}). Readiness still runs for every market.</span>
          <button type="button" onClick={() => toggle(false)} className="text-xs font-semibold text-tv-purple hover:text-white">
            Show all markets →
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {visible.map(({ item, sel }) => (
            <Row key={item.instrument} item={item} sel={sel} selected={selected === item.instrument} onSelect={() => onSelect(item.instrument)} />
          ))}
        </div>
      )}

      {board && (
        <p className="text-[10px] text-gray-600">
          Readiness updated {fmtTime(board.updated_at)} · selector {selector ? `updated ${fmtTime(selector.updated_at)}` : 'unavailable'} · Avoid-rated markets are dimmed, not hidden, when the filter is off.
        </p>
      )}
    </section>
  );
}
