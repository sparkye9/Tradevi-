'use client';
import { useEffect, useState } from 'react';
import { marketClock, SESSION_HOURS, type MarketClock } from '@/lib/powerHour';

const STEPS = SESSION_HOURS.map((row) => row.venue);

export default function SessionStrip() {
  const [clock, setClock] = useState<MarketClock>(() => marketClock());

  useEffect(() => {
    const id = setInterval(() => setClock(marketClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full border-b border-[#1a1a1a] bg-[#0b0b0b] px-3 md:px-4 py-2 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-2 min-w-max">
        {STEPS.map((venue, i) => {
          const on =
            venue === 'Power Hour' ? clock.powerHour : clock.venues.includes(venue);
          return (
            <div key={venue} className="flex items-center gap-2">
              {i > 0 && <span className="w-6 h-px bg-[#222] shrink-0" />}
              <div
                className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-widest uppercase whitespace-nowrap ${
                  on
                    ? clock.powerHour && venue === 'Power Hour'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-[#1e1e1e] text-gray-600'
                }`}
              >
                {venue}
              </div>
            </div>
          );
        })}
        {clock.holidayName && (
          <span className="text-[10px] font-semibold tracking-widest uppercase text-amber-400/80 ml-1 whitespace-nowrap">
            {clock.holidayName}
          </span>
        )}
        <span className="text-[10px] text-gray-600 font-mono ml-2 whitespace-nowrap">
          {clock.clock}
          {!clock.tradesOpen ? ' · closed' : clock.holidayName ? ' · cash closed' : ''}
        </span>
      </div>
    </div>
  );
}
