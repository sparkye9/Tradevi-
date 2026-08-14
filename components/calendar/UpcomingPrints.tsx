'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { etTimeLabel, upcomingHighImpact, type CalendarResult } from '@/lib/economicCalendar';

export default function UpcomingPrints() {
  const [data, setData] = useState<CalendarResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/calendar')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            events: [],
            source: 'Forex Factory',
            lastUpdated: new Date().toISOString(),
            weekNote: '',
            sourceError: 'Fetch failed',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const next = data ? upcomingHighImpact(data.events, new Date(), 4) : [];

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="label">High-impact prints</span>
        <Link href="/calendar" className="text-[11px] text-emerald-400 hover:text-emerald-300">
          Calendar →
        </Link>
      </div>
      {data?.sourceError ? (
        <p className="text-sm text-gray-500">Calendar feed is down. Check Forex Factory directly.</p>
      ) : !data ? (
        <div className="skeleton h-16 w-full" />
      ) : next.length === 0 ? (
        <p className="text-sm text-gray-500">No high-impact prints left in this week’s export.</p>
      ) : (
        <div className="space-y-2">
          {next.map((e, i) => (
            <div key={`${e.at}-${e.title}-${i}`} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{e.title}</div>
                <div className="text-[11px] text-gray-500 font-mono">
                  {e.country} · {etTimeLabel(e.at)}
                </div>
              </div>
              <span className="text-[10px] font-bold tracking-wide text-red-300 shrink-0">HIGH</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
