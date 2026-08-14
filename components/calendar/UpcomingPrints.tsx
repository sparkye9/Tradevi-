'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { etTimeLabel, upcomingHighImpact, type CalendarEvent, type CalendarResult } from '@/lib/economicCalendar';

function impactDot(impact: string): string {
  if (impact === 'High') return 'bg-tv-red';
  if (impact === 'Medium') return 'bg-tv-amber';
  return 'bg-tv-muted';
}

export default function UpcomingPrints({ compact = false }: { compact?: boolean }) {
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

  const next: CalendarEvent[] = data ? upcomingHighImpact(data.events, new Date(), compact ? 3 : 4) : [];

  return (
    <div className="card space-y-3 h-full">
      <div className="flex items-center justify-between">
        <span className="label">Economic events</span>
        <Link href="/calendar" className="text-[11px] text-tv-purple hover:text-white">
          View calendar →
        </Link>
      </div>
      {data?.sourceError ? (
        <p className="text-sm text-tv-muted">Calendar feed is down. Check Forex Factory directly.</p>
      ) : !data ? (
        <div className="skeleton h-16 w-full" />
      ) : next.length === 0 ? (
        <p className="text-sm text-tv-muted">No high-impact prints left in this week’s export.</p>
      ) : (
        <div className="space-y-2.5">
          {next.map((e, i) => (
            <div key={`${e.at}-${e.title}-${i}`} className="flex items-start gap-2.5">
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${impactDot(e.impact)}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{e.title}</div>
                <div className="text-[11px] text-tv-muted font-mono">
                  {etTimeLabel(e.at)} · {e.country}
                </div>
              </div>
              <span
                className={`text-[10px] font-bold tracking-wide shrink-0 ${
                  e.impact === 'High' ? 'text-tv-red' : 'text-tv-amber'
                }`}
              >
                {e.impact}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
