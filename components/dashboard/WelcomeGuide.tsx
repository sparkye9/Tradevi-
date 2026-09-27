'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, CandlestickChart, LineChart, Timer, CalendarDays, NotebookPen, X } from 'lucide-react';

const DISMISS_KEY = 'tradevi-guide-dismissed';

const TOUR = [
  { href: '/futures', icon: CandlestickChart, title: 'Futures', text: 'Weekly → Daily → 4H trend stack for the micro index futures, with the level that proves the idea wrong.' },
  { href: '/stocks', icon: LineChart, title: 'Stocks', text: 'Scans a watchlist for names with volume and trend lined up. Swing, intraday and options views.' },
  { href: '/power-hour', icon: Timer, title: 'Power Hour', text: 'What to watch in the last hour of the regular session, when volume comes back.' },
  { href: '/calendar', icon: CalendarDays, title: 'Calendar', text: 'Upcoming economic prints (CPI, jobs, Fed) that can move the whole market.' },
  { href: '/journal', icon: NotebookPen, title: 'Journal', text: 'Log practice trades and see your win rate. Saved in your browser only.' },
];

const TERMS = [
  { term: 'LOOK', text: 'Trend and location agree — worth studying on a chart. Not a buy signal.' },
  { term: 'WAIT', text: 'Trend is there but price is in the wrong spot. Patience.' },
  { term: 'NO TRADE', text: 'Nothing lines up. Standing aside is a position.' },
  { term: 'HH / HL', text: 'Higher highs and higher lows = uptrend. Lower highs / lower lows = downtrend.' },
  { term: 'Premium / discount', text: 'Upper / lower half of the recent range. Buy low in uptrends, sell high in downtrends.' },
  { term: 'Invalidation', text: 'The price where the idea is wrong. Know it before you think about profit.' },
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
            <div className="text-[10px] uppercase tracking-[0.18em] text-tv-purple">Welcome · free &amp; open</div>
            <h2 className="text-xl md:text-2xl font-bold text-white mt-1">Learn to read the market — no sign-up needed</h2>
            <p className="text-sm text-gray-400 mt-1 max-w-2xl">
              Tradevi pulls delayed market data and shows you how a trader would size up the day: trend, location, and
              the level that invalidates the idea. It never places trades and it is not financial advice.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 mt-5">
        {TOUR.map(({ href, icon: Icon, title, text }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-tv-border bg-black/20 p-3 hover:border-tv-purple/50 hover:bg-tv-purple/5 transition-colors"
          >
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <Icon size={15} className="text-tv-purple" />
              {title}
              <span className="ml-auto text-tv-purple opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </div>
            <p className="text-xs text-tv-muted mt-1.5 leading-relaxed">{text}</p>
          </Link>
        ))}
      </div>

      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs font-semibold text-tv-purple hover:text-white select-none">
          Key terms used on this page
        </summary>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-3">
          {TERMS.map(({ term, text }) => (
            <div key={term} className="text-xs leading-relaxed">
              <dt className="inline font-mono font-bold text-white">{term}</dt>
              <dd className="inline text-tv-muted"> — {text}</dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={dismiss}
          className="text-xs font-semibold text-white bg-tv-purple/80 hover:bg-tv-purple rounded-lg px-4 py-2 transition-colors"
        >
          Got it — show me the dashboard
        </button>
        <span className="text-[11px] text-gray-600">Reopen anytime with “Quick tour” at the top of the dashboard.</span>
      </div>
    </section>
  );
}
