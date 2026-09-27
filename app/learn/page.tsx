import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import PayoffCalculator from '@/components/learn/PayoffCalculator';
import Practice from '@/components/learn/Practice';

export const metadata: Metadata = {
  title: 'Options 101 · Tradevi',
  description: 'A plain-English intro to options: calls, puts, strikes, premium, the Greeks, a payoff calculator and practice questions.',
};

const SECTIONS = [
  { id: 'basics', label: 'What is an option?' },
  { id: 'contract', label: 'Reading a contract' },
  { id: 'money', label: 'In / out of the money' },
  { id: 'price', label: 'What moves the price' },
  { id: 'calculator', label: 'Payoff calculator' },
  { id: 'chain', label: 'Reading a chain' },
  { id: 'risk', label: 'Beginner risk rules' },
  { id: 'practice', label: 'Practice' },
  { id: 'glossary', label: 'Glossary' },
];

const GREEKS = [
  {
    name: 'Delta',
    plain: 'How much the option moves when the stock moves $1.',
    example: 'Delta 0.50 → stock +$1, option about +$0.50 per share (+$50 per contract). Calls: 0 to 1. Puts: 0 to −1.',
  },
  {
    name: 'Theta',
    plain: 'How much value the option loses each day from time passing.',
    example: 'Theta −0.05 → about $5 per contract gone per day if nothing else changes. It speeds up in the last few weeks.',
  },
  {
    name: 'Implied volatility (IV)',
    plain: 'How big a move the market expects. Higher IV = pricier options.',
    example: 'IV jumps before earnings and often collapses right after (“IV crush”).',
  },
  {
    name: 'Gamma',
    plain: 'How fast delta itself changes as the stock moves.',
    example: 'High gamma near expiration means option prices can swing wildly on small stock moves.',
  },
  {
    name: 'Vega',
    plain: 'How much the option price changes when IV changes by 1 point.',
    example: 'Vega 0.10 → IV up 1 point, option about +$0.10 per share.',
  },
];

const GLOSSARY: [string, string][] = [
  ['Ask', 'The lowest price a seller will accept. You usually buy here.'],
  ['Assignment', 'When an option seller is required to fulfill the contract (buy or sell the shares).'],
  ['At the money (ATM)', 'Strike is right at (or very near) the current stock price.'],
  ['Bid', 'The highest price a buyer will pay. You usually sell here.'],
  ['Breakeven', 'Stock price at expiration where the trade neither makes nor loses money.'],
  ['Call', 'The right to BUY 100 shares at the strike price before expiration.'],
  ['Contract', 'One option. Covers 100 shares of the stock.'],
  ['Exercise', 'Using the option: actually buying (call) or selling (put) the shares at the strike.'],
  ['Expiration', 'The last day the option exists. After that it is gone.'],
  ['In the money (ITM)', 'The option has intrinsic value: a call with strike below the stock price, or a put with strike above it.'],
  ['Intrinsic value', 'What the option would be worth if it expired right now.'],
  ['Open interest (OI)', 'Number of contracts currently open. Higher = more liquid.'],
  ['Out of the money (OTM)', 'No intrinsic value yet. Cheaper, but more likely to expire worthless.'],
  ['Premium', 'The price of the option, quoted per share. Multiply by 100 for one contract.'],
  ['Put', 'The right to SELL 100 shares at the strike price before expiration.'],
  ['Spread (bid/ask)', 'The gap between bid and ask. A hidden cost on every trade.'],
  ['Strike', 'The fixed price in the contract where you can buy (call) or sell (put) the shares.'],
  ['Time value', 'The part of the premium above intrinsic value — the price of possibility. Shrinks to zero by expiration.'],
  ['Volume', 'Contracts traded today.'],
];

function Section({ id, title, kicker, children }: { id: string; title: string; kicker: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-tv-purple">{kicker}</div>
        <h2 className="text-xl font-bold text-white mt-1">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Callout({ tone = 'purple', children }: { tone?: 'purple' | 'amber' | 'green'; children: ReactNode }) {
  const cls =
    tone === 'amber'
      ? 'border-tv-amber/30 bg-tv-amber/5'
      : tone === 'green'
      ? 'border-tv-green/30 bg-tv-green/5'
      : 'border-tv-purple/30 bg-tv-purple/5';
  return <div className={`rounded-xl border p-4 text-sm text-gray-300 leading-relaxed ${cls}`}>{children}</div>;
}

export default function LearnPage() {
  return (
    <div className="max-w-4xl space-y-10">
      <header className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-tv-purple">Learn · Options 101</div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Options, in plain English</h1>
        <p className="text-gray-400 max-w-2xl">
          A 15-minute walkthrough of how stock options work — then try the payoff calculator and practice questions. No
          sign-up, nothing to buy. Education only, not financial advice.
        </p>
        <nav className="flex flex-wrap gap-1.5 pt-1">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-1 rounded-full text-xs border border-tv-border text-gray-400 hover:text-white hover:border-tv-purple/50"
            >
              <span className="text-tv-purple font-mono mr-1">{i + 1}</span>
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="basics" kicker="Step 1" title="What is an option?">
        <p className="text-sm text-gray-300 leading-relaxed">
          An option is a contract that gives you the <strong className="text-white">right, but not the obligation</strong>, to
          buy or sell 100 shares of a stock at a fixed price, until a set date. You pay for that right up front — that
          payment is the <strong className="text-white">premium</strong>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-tv-green/30 bg-tv-green/5 p-4 space-y-1.5">
            <div className="text-tv-green font-bold">Call = right to BUY</div>
            <p className="text-sm text-gray-300">You make money if the stock goes <strong>up</strong>.</p>
            <p className="text-xs text-tv-muted">
              Like paying a small deposit to lock in today&apos;s price on concert tickets. If prices soar, your deposit is worth a
              lot. If not, you only lose the deposit.
            </p>
          </div>
          <div className="rounded-xl border border-tv-red/30 bg-tv-red/5 p-4 space-y-1.5">
            <div className="text-tv-red font-bold">Put = right to SELL</div>
            <p className="text-sm text-gray-300">You make money if the stock goes <strong>down</strong>.</p>
            <p className="text-xs text-tv-muted">
              Like insurance on your phone. You pay a premium; if the phone (stock) gets smashed, the policy pays out. If
              nothing bad happens, the premium is gone.
            </p>
          </div>
        </div>
        <Callout>
          <strong className="text-white">Buyers vs. sellers.</strong> This page focuses on <em>buying</em> options, where the most
          you can lose is the premium you paid. Every option also has a seller on the other side, who collects the premium
          but can lose much more. Selling options is an advanced topic — learn buying first.
        </Callout>
      </Section>

      <Section id="contract" kicker="Step 2" title="Reading an option contract">
        <div className="rounded-xl border border-tv-border bg-tv-surface p-4 font-mono text-lg md:text-2xl text-white flex flex-wrap gap-x-3 gap-y-1">
          <span className="text-tv-blue">AAPL</span>
          <span className="text-tv-amber">Jan 16</span>
          <span className="text-tv-purple">$200</span>
          <span className="text-tv-green">Call</span>
          <span className="text-gray-500">@</span>
          <span className="text-white">$3.50</span>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <li><span className="text-tv-blue font-mono font-bold">AAPL</span> <span className="text-gray-400">— the underlying stock</span></li>
          <li><span className="text-tv-amber font-mono font-bold">Jan 16</span> <span className="text-gray-400">— expiration date</span></li>
          <li><span className="text-tv-purple font-mono font-bold">$200</span> <span className="text-gray-400">— strike price</span></li>
          <li><span className="text-tv-green font-mono font-bold">Call</span> <span className="text-gray-400">— type (call or put)</span></li>
          <li className="sm:col-span-2">
            <span className="text-white font-mono font-bold">$3.50</span>{' '}
            <span className="text-gray-400">
              — the premium, <strong className="text-white">per share</strong>. One contract = 100 shares, so it actually costs{' '}
              <strong className="text-white">$350</strong>.
            </span>
          </li>
        </ul>
        <Callout tone="amber">
          <strong className="text-tv-amber">The #1 beginner mistake:</strong> seeing “$3.50” and thinking the option costs $3.50.
          Always multiply by 100.
        </Callout>
      </Section>

      <Section id="money" kicker="Step 3" title="In, at, or out of the money">
        <p className="text-sm text-gray-300">Say the stock trades at <strong className="text-white">$100</strong>:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-tv-muted border-b border-tv-border">
                <th className="py-2 pr-3 font-medium">Strike</th>
                <th className="py-2 pr-3 font-medium">Call at that strike</th>
                <th className="py-2 font-medium">Put at that strike</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-tv-border/60">
                <td className="py-2 pr-3 font-mono">$90</td>
                <td className="py-2 pr-3"><span className="text-tv-green font-semibold">In the money</span> — worth at least $10</td>
                <td className="py-2"><span className="text-tv-muted">Out of the money</span></td>
              </tr>
              <tr className="border-b border-tv-border/60">
                <td className="py-2 pr-3 font-mono">$100</td>
                <td className="py-2 pr-3 text-tv-amber">At the money</td>
                <td className="py-2 text-tv-amber">At the money</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono">$110</td>
                <td className="py-2 pr-3"><span className="text-tv-muted">Out of the money</span></td>
                <td className="py-2"><span className="text-tv-green font-semibold">In the money</span> — worth at least $10</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-400">
          Out-of-the-money options are cheap because they need a big move to pay off. Most of them expire worthless.
        </p>
      </Section>

      <Section id="price" kicker="Step 4" title="What moves an option's price">
        <p className="text-sm text-gray-300 leading-relaxed">
          Premium = <strong className="text-white">intrinsic value</strong> (what it&apos;s worth if exercised now) +{' '}
          <strong className="text-white">time value</strong> (the price of the chance it becomes worth more). Time value melts to
          zero by expiration. The “Greeks” measure what pushes the price around:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {GREEKS.map((g) => (
            <div key={g.name} className="card space-y-1">
              <div className="text-white font-semibold">{g.name}</div>
              <p className="text-sm text-gray-300">{g.plain}</p>
              <p className="text-xs text-tv-muted">{g.example}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="calculator" kicker="Step 5 · Try it" title="Payoff calculator">
        <p className="text-sm text-gray-400">
          Change the numbers and drag the slider to see what the trade would be worth on expiration day.
        </p>
        <PayoffCalculator />
      </Section>

      <Section id="chain" kicker="Step 6" title="Reading an options chain">
        <p className="text-sm text-gray-300 leading-relaxed">
          A chain lists every strike and expiration for one stock. The{' '}
          <Link href="/options" className="text-tv-purple hover:text-white underline">
            Options chains
          </Link>{' '}
          page shows real ones for stocks the scanner likes. What to check, in order:
        </p>
        <ol className="space-y-2 text-sm text-gray-300 list-decimal pl-5">
          <li><strong className="text-white">Expiration</strong> — more time costs more but gives the idea room to work.</li>
          <li><strong className="text-white">Strike</strong> — closer to the stock price = higher delta, more expensive, more likely to pay off.</li>
          <li><strong className="text-white">Bid / ask spread</strong> — tight (a few cents) is good. Wide spreads quietly eat your money.</li>
          <li><strong className="text-white">Volume &amp; open interest</strong> — hundreds or more means it&apos;s easy to get in and out.</li>
          <li><strong className="text-white">Delta</strong> — a quick read on how much the option tracks the stock.</li>
          <li><strong className="text-white">IV</strong> — high means you are paying up for the expected move.</li>
        </ol>
      </Section>

      <Section id="risk" kicker="Step 7" title="Beginner risk rules">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            ['Paper trade first', 'Practice with fake money (most brokers offer a simulator) until you understand how prices move.'],
            ['Only risk what you can lose', 'Assume any option you buy can go to $0 — because many do.'],
            ['Size small', 'Many traders risk 1–2% of their account on a single trade. One bad trade should never hurt much.'],
            ['Know your exit first', 'Decide where you are wrong before you enter. Write it down.'],
            ['Watch time decay', 'Very short-dated options (0–7 days) can lose value extremely fast.'],
            ['Check the calendar', 'Earnings and big economic reports can crush IV or gap the stock past your stop.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-tv-border bg-tv-surface p-3">
              <div className="text-white font-semibold">{title}</div>
              <p className="text-gray-400 mt-1">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="practice" kicker="Step 8 · Quiz yourself" title="Practice">
        <p className="text-sm text-gray-400">
          Options-math questions use new numbers every time. “Concepts &amp; reading setups” covers the Greeks and how this
          site&apos;s LOOK / WAIT / NO TRADE calls work.
        </p>
        <Practice />
      </Section>

      <Section id="glossary" kicker="Reference" title="Glossary">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {GLOSSARY.map(([term, def]) => (
            <div key={term} className="text-sm">
              <dt className="font-semibold text-white">{term}</dt>
              <dd className="text-gray-400">{def}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <p className="text-[11px] text-gray-600 border-t border-tv-border pt-4">
        Educational material only. Not financial advice. Options involve significant risk and are not suitable for every
        investor — read the OCC&apos;s “Characteristics and Risks of Standardized Options” before trading them.
      </p>
    </div>
  );
}
