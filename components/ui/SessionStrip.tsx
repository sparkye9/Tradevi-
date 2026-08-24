'use client';
import { useEffect, useState } from 'react';
import { marketClock, sessionFlow, type MarketClock } from '@/lib/powerHour';

export default function SessionStrip() {
  const [clock, setClock] = useState<MarketClock>(() => marketClock());

  useEffect(() => {
    const id = setInterval(() => setClock(marketClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  const steps = sessionFlow(clock);

  return (
    <div className="w-full border-b border-tv-border bg-[#080A10] px-3 md:px-4 py-2.5 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-0 min-w-max">
        {steps.map((step, i) => (
          <div key={step.venue} className="flex items-center">
            {i > 0 && (
              <span className={`w-8 h-px ${step.active || steps[i - 1].active ? 'bg-tv-purple/50' : 'bg-tv-border'}`} />
            )}
            <div
              className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-widest uppercase whitespace-nowrap ${
                step.active
                  ? step.venue === 'Power Hour'
                    ? 'border-tv-amber/40 bg-tv-amber/10 text-tv-amber'
                    : 'border-tv-purple/40 bg-tv-purple/10 text-tv-purple'
                  : 'border-tv-border text-gray-600'
              }`}
            >
              {step.venue}
            </div>
          </div>
        ))}
        {clock.holidayName && (
          <span className="text-[10px] font-semibold tracking-widest uppercase text-tv-amber/80 ml-3 whitespace-nowrap">
            {clock.holidayName}
          </span>
        )}
        <span className="text-[10px] text-tv-muted font-mono ml-3 whitespace-nowrap">
          {clock.clock}
          {!clock.tradesOpen ? ' · closed' : clock.holidayName ? ' · cash closed' : ''}
        </span>
      </div>
    </div>
  );
}
