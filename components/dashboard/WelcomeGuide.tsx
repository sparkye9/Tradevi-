'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, GraduationCap, CandlestickChart, LineChart, Layers, Timer, CalendarDays, X } from 'lucide-react';

const DISMISS_KEY = 'tradevi-guide-dismissed';

const PAGES = [
  { href: '/learn', icon: GraduationCap, title: 'Learn', text: 'Options 101 — calls, puts, the Greeks, a payoff calculator and practice quiz.' },
  { href: '/futures', icon: CandlestickChart, title: 'Futures', text: 'Weekly, daily and 4-hour trend on the index futures, with entry, stop and targets.' },
  { href: '/stocks', icon: LineChart, title: 'Stocks', text: 'Scans a watchlist for stocks where volume and trend line up.' },
  { href: '/options', icon: Layers, title: 'Options chains', text: 'Look up any ticker and read its calls and puts in plain English.' },
  { href: '/power-hour', icon: Timer, title: 'Power Hour', text: 'Which market session is open and what to watch in the last hour.' },
  { href: '/calendar', icon: CalendarDays, title: 'Calendar', text: 'Economic reports this week that can move the whole market.' },
];

export default function WelcomeGuide() {
  const params = useSearchParams();
  const router = useRouter();
  const forced = params.get('guide') === '1';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forced) {
      setOpen(true);
      return;
    }
    try {
      setOpen(window.localStorage.getItem(DISMISS_KEY) !== '1');
    } catch {
      setOpen(true);
    }
  }, [forced]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage blocked — it will just show again next visit.
    }
    if (forced) router.replace('/');
  }

  if (!open) return null;

  return (
    <section className="rounded-2xl border border-tv-purple/30 bg-gradient-to-br from-tv-purple/15 via-tv-panel to-tv-panel p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-tv-purple/20 p-2.5 text-tv-purple shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-white">Welcome to Tradevi</h2>
            <p className="text-sm text-gray-400 mt-1 max-w-3xl leading-relaxed">
              Tradevi is a trading-education dashboard. It reads the market the way a trader would — trend, where price
              sits in its range, and the level that proves an idea wrong — and explains it in plain language so you can
              learn how futures, stocks and options setups are judged. It does not place trades.
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Close welcome guide"
          className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5 shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-4">
        {PAGES.map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Link href={href} className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/5">
              <Icon size={15} className="text-tv-purple mt-0.5 shrink-0" />
              <span className="text-sm">
                <span className="font-semibold text-white group-hover:text-tv-purple">{title}</span>
                <span className="text-tv-muted"> — {text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={dismiss}
          className="text-xs font-semibold text-white bg-tv-purple/80 hover:bg-tv-purple rounded-lg px-4 py-2 transition-colors"
        >
          Got it
        </button>
        <span className="text-[11px] text-gray-600">Reopen anytime with “About this site” at the top of the dashboard.</span>
      </div>
    </section>
  );
}
