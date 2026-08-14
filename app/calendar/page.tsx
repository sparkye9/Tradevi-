'use client';
import { useEffect, useMemo, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import {
  FF_CALENDAR_PAGE,
  eventPrinted,
  etTimeLabel,
  groupByEtDay,
  type CalendarEvent,
  type CalendarImpact,
  type CalendarResult,
} from '@/lib/economicCalendar';

const IMPACTS: CalendarImpact[] = ['High', 'Medium', 'Low', 'Holiday'];

function impactClass(impact: CalendarImpact): string {
  switch (impact) {
    case 'High':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'Medium':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'Holiday':
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    default:
      return 'bg-[#1a1a1a] text-gray-500 border-[#2a2a2a]';
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-gray-600">{label}</div>
      <div className="font-mono text-xs text-gray-200 mt-0.5">{value || '—'}</div>
    </div>
  );
}

function EventRow({ e, now }: { e: CalendarEvent; now: Date }) {
  const printed = eventPrinted(e.at, now);
  return (
    <div
      className={`grid grid-cols-[5.5rem_3.5rem_1fr] md:grid-cols-[6rem_3.5rem_1fr_5.5rem_5.5rem_5.5rem] gap-2 items-start py-2.5 px-3 border-b border-[#1a1a1a] last:border-0 ${
        printed ? 'opacity-60' : ''
      } ${e.impact === 'High' && !printed ? 'bg-red-500/[0.04]' : ''}`}
    >
      <div className="font-mono text-xs text-gray-300 whitespace-nowrap">{etTimeLabel(e.at)}</div>
      <div className="font-mono text-xs text-white">{e.country}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-100">{e.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${impactClass(e.impact)}`}>
            {e.impact}
          </span>
          {printed && <span className="text-[10px] uppercase tracking-widest text-gray-600">printed</span>}
        </div>
        <div className="md:hidden mt-1 grid grid-cols-3 gap-2">
          <Stat label="Actual" value={e.actual} />
          <Stat label="Forecast" value={e.forecast} />
          <Stat label="Previous" value={e.previous} />
        </div>
      </div>
      <div className="hidden md:block">
        <Stat label="Actual" value={e.actual} />
      </div>
      <div className="hidden md:block">
        <Stat label="Forecast" value={e.forecast} />
      </div>
      <div className="hidden md:block">
        <Stat label="Previous" value={e.previous} />
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [data, setData] = useState<CalendarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [usdOnly, setUsdOnly] = useState(false);
  const [impacts, setImpacts] = useState<Set<CalendarImpact>>(() => new Set<CalendarImpact>(['High', 'Medium']));
  const [now, setNow] = useState(() => new Date());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar');
      const json = await res.json();
      setData(json);
    } catch {
      setData({
        events: [],
        source: 'Forex Factory (weekly export)',
        lastUpdated: new Date().toISOString(),
        weekNote: '',
        sourceError: 'Fetch failed',
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  function toggleImpact(impact: CalendarImpact) {
    setImpacts((prev) => {
      const next = new Set(prev);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      if (next.size === 0) next.add(impact);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const events = data?.events ?? [];
    return events.filter((e) => impacts.has(e.impact) && (!usdOnly || e.country === 'USD'));
  }, [data, impacts, usdOnly]);

  const groups = useMemo(() => groupByEtDay(filtered), [filtered]);

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Economic calendar</h1>
        <p className="text-sm text-gray-500 mt-1">
          This week’s prints from Forex Factory. Times in America/New_York. Not a live last-sale or official
          government feed — confirm the number on Forex Factory before you size a trade.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-[#111111] border border-[#1e1e1e] rounded-2xl">
        {IMPACTS.map((impact) => {
          const on = impacts.has(impact);
          return (
            <button
              key={impact}
              onClick={() => toggleImpact(impact)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                on ? impactClass(impact) : 'text-gray-600 border-[#2a2a2a]'
              }`}
            >
              {impact}
            </button>
          );
        })}
        <button
          onClick={() => setUsdOnly((p) => !p)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
            usdOnly
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'text-gray-600 border-[#2a2a2a]'
          }`}
        >
          USD only
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:text-white disabled:opacity-50"
        >
          {loading ? 'Loading...' : '↻ Refresh'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {data && <SourceTag source={data.source} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {data?.sourceError && (
        <DataUnavailable
          reason={data.sourceError}
          href={FF_CALENDAR_PAGE}
          linkLabel="Open Forex Factory calendar"
        />
      )}

      {!loading && !data?.sourceError && groups.length === 0 && (
        <div className="border border-gray-500/30 bg-[#141414] rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">This week</div>
          <div className="text-xl font-black text-gray-200">No events in this filter</div>
          <p className="text-sm text-gray-400 mt-1">
            The export is this week only. Turn on Low, or wait for Forex Factory to publish next week.
          </p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="rounded-2xl border border-[#1e1e1e] overflow-hidden bg-[#111111]">
          <div className="px-4 py-2.5 border-b border-[#1e1e1e] flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">{group.label}</h2>
            <span className="text-xs text-gray-600">{group.events.length}</span>
          </div>
          <div className="hidden md:grid grid-cols-[6rem_3.5rem_1fr_5.5rem_5.5rem_5.5rem] gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-600 border-b border-[#1a1a1a]">
            <span>Time</span>
            <span>FX</span>
            <span>Event</span>
            <span>Actual</span>
            <span>Forecast</span>
            <span>Previous</span>
          </div>
          {group.events.map((e, i) => (
            <EventRow key={`${e.at}-${e.title}-${e.country}-${i}`} e={e} now={now} />
          ))}
        </section>
      ))}

      <div className="text-xs text-gray-500 p-4 rounded-2xl bg-[#111111] border border-[#1e1e1e] space-y-2">
        <p>{data?.weekNote}</p>
        <a
          href={FF_CALENDAR_PAGE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300"
        >
          Verify on Forex Factory →
        </a>
        <p className="text-gray-700">
          No LIVE badge. A row marked printed means the scheduled time has passed — not that we have the official
          number.
        </p>
      </div>
    </div>
  );
}
