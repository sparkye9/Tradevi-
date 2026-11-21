import Link from 'next/link';
import CrashSubnav from '@/components/crash/CrashSubnav';
import { GLOSSARY } from '@/lib/glossary';

const PAGES = [
  {
    href: '/crash-intelligence',
    name: 'Crash Intelligence',
    question: 'How risky is the market right now?',
    look: ['The plain-English summary at the top', 'The Crash Risk Score (0–100, higher = more warning signs)', 'The market stage (regime) and whether PRE-CRASH WATCH is active'],
  },
  {
    href: '/crash-setups',
    name: 'Put Setups',
    question: 'Do today’s conditions match a put rule that worked before?',
    look: ['A red “Conditions present today” badge means a rule is firing', 'Its track record: how many past 10% drops it warned about, and its false alarms', 'Live contracts appear under a setup only when it fires'],
  },
  {
    href: '/put-hunter',
    name: 'Put Hunter',
    question: 'Is there a put worth buying, and what could I lose?',
    look: ['Only rows labelled WATCH or STRONG WATCH', 'Cost (the most you can lose) and “pays off below” (breakeven)', 'Tap a row for what it might be worth if the market falls 5%, 10% or 15%'],
  },
  {
    href: '/crash-simulator',
    name: 'Crash Simulator',
    question: 'Would this have worked in 2008 or 2020?',
    look: ['Pick a past crash and press Play', 'Watch the score day by day without seeing the future', 'Decide, then reveal what happened. Results marked THEORETICAL are model prices'],
  },
];

const ROUTINE = [
  'Open Crash Intelligence once a day and read the summary.',
  'Under 40 and no setup firing: nothing to do. Most days are like this.',
  '50 or higher, or a setup firing: open Put Setups to see which rule matches and how it did before.',
  'Then open Put Hunter. Look only at WATCH or better. NO TRADE means wait.',
  'Before buying anything, decide the dollar amount you can lose completely. Every put can expire worthless.',
];

export default function CrashGuidePage() {
  const terms = Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">How to use the crash tools</h1>
          <p className="text-sm text-gray-400 mt-1">Four pages, one question each. Use them in this order.</p>
        </div>
        <CrashSubnav />
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        {PAGES.map((p, i) => (
          <li key={p.href} className="card">
            <div className="text-[11px] font-bold uppercase tracking-wider text-tv-purple">Step {i + 1}</div>
            <Link href={p.href} className="text-base font-bold text-white hover:text-tv-purple">
              {p.name} →
            </Link>
            <p className="text-sm text-gray-200 mt-1">“{p.question}”</p>
            <ul className="mt-2 space-y-1">
              {p.look.map((l) => (
                <li key={l} className="text-xs text-tv-muted">
                  · {l}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section className="card">
        <h2 className="text-sm font-bold text-white">A simple daily routine</h2>
        <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-gray-200">
          {ROUTINE.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2 className="text-sm font-bold text-white">Simple and Detailed views</h2>
        <p className="mt-1 text-sm text-gray-200">
          Every crash page opens in Simple view: the answer and the few numbers that matter. Switch to Detailed (top right of each page) for every reading, its source and its date, the full contract table with the Greeks, and the simulator’s research tools. Labels that warn you, such as THEORETICAL, NO TRADE or missing data, show in both views.
        </p>
      </section>

      <section className="card border-tv-amber/30">
        <h2 className="text-sm font-bold text-white">Read this before buying any put</h2>
        <ul className="mt-2 space-y-1 text-sm text-gray-200">
          <li>· Every put can expire worthless. Only spend what you can lose completely.</li>
          <li>· A high score is a warning, not a prediction. Markets often recover without crashing.</li>
          <li>· Once fear is high (PANIC / LATE ENTRY), puts are expensive. Buying then often means paying for a drop that already happened.</li>
          <li>· Tradevi is for research and education. It never places orders and gives no personal financial advice.</li>
        </ul>
      </section>

      <section className="card">
        <h2 className="text-sm font-bold text-white">Glossary</h2>
        <p className="text-xs text-tv-muted mt-0.5">On every page, words with a dotted underline show these definitions when tapped.</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {terms.map((t) => (
            <div key={t.term}>
              <dt className="text-sm font-semibold text-white">{t.term}</dt>
              <dd className="text-xs text-gray-300 mt-0.5">
                {t.short}
                {'example' in t && t.example ? <span className="block text-tv-muted mt-0.5">Example: {t.example}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
