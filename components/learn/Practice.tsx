'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';

interface Question {
  prompt: string;
  choices: string[];
  answer: string;
  explain: string;
}

// ── Options math: fresh numbers every time ─────────────────────────────────

function rnd(min: number, max: number, step = 1): number {
  const n = Math.floor((max - min) / step) + 1;
  return min + Math.floor(Math.random() * n) * step;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function withChoices(answer: string, wrong: string[]): string[] {
  const uniq = Array.from(new Set(wrong.filter((w) => w !== answer))).slice(0, 3);
  return shuffle([answer, ...uniq]);
}

const MATH_GENERATORS: (() => Question)[] = [
  () => {
    const k = rnd(20, 200, 5);
    const p = rnd(0.5, 6, 0.25);
    const answer = usd(k + p);
    return {
      prompt: `You buy a $${k} call for $${p.toFixed(2)}. What stock price do you need at expiration to break even?`,
      choices: withChoices(answer, [usd(k - p), usd(k), usd(k + 2 * p)]),
      answer,
      explain: `Call breakeven = strike + premium = ${k} + ${p.toFixed(2)} = ${answer}. Above that you profit; below it you lose some or all of the premium.`,
    };
  },
  () => {
    const k = rnd(20, 200, 5);
    const p = rnd(0.5, 6, 0.25);
    const answer = usd(k - p);
    return {
      prompt: `You buy a $${k} put for $${p.toFixed(2)}. What is your breakeven at expiration?`,
      choices: withChoices(answer, [usd(k + p), usd(k), usd(p)]),
      answer,
      explain: `Put breakeven = strike − premium = ${k} − ${p.toFixed(2)} = ${answer}. The stock has to fall below it for you to profit.`,
    };
  },
  () => {
    const p = rnd(0.2, 8, 0.05);
    const n = rnd(1, 5);
    const answer = usd(p * 100 * n);
    return {
      prompt: `An option is quoted at $${p.toFixed(2)}. How much does it cost to buy ${n} contract${n > 1 ? 's' : ''}?`,
      choices: withChoices(answer, [usd(p * n), usd(p * 10 * n), usd(p * 100)]),
      answer,
      explain: `Quotes are per share and one contract covers 100 shares: ${p.toFixed(2)} × 100 × ${n} = ${answer}. Beginners often think it costs ${usd(p * n)} — it doesn't.`,
    };
  },
  () => {
    const s = rnd(30, 250, 1);
    const k = s + rnd(-15, 15, 5);
    const kind = Math.random() < 0.5 ? 'call' : 'put';
    const itm = kind === 'call' ? s > k : s < k;
    const answer = s === k ? 'At the money' : itm ? 'In the money' : 'Out of the money';
    return {
      prompt: `The stock is at $${s}. Is a $${k} ${kind} in, at, or out of the money?`,
      choices: ['In the money', 'At the money', 'Out of the money'],
      answer,
      explain:
        kind === 'call'
          ? `A call is in the money when the stock is above the strike (it lets you buy below market). $${s} vs $${k} → ${answer.toLowerCase()}.`
          : `A put is in the money when the stock is below the strike (it lets you sell above market). $${s} vs $${k} → ${answer.toLowerCase()}.`,
    };
  },
  () => {
    const k = rnd(40, 150, 5);
    const s = k + rnd(-12, 12, 1);
    const kind = Math.random() < 0.5 ? 'call' : 'put';
    const intrinsic = kind === 'call' ? Math.max(0, s - k) : Math.max(0, k - s);
    const answer = usd(intrinsic);
    return {
      prompt: `At expiration the stock closes at $${s}. What is a $${k} ${kind} worth per share?`,
      choices: withChoices(answer, [usd(Math.abs(s - k)), usd(0), usd(intrinsic + 2), usd(Math.max(0, intrinsic - 1))]),
      answer,
      explain:
        intrinsic > 0
          ? `At expiration an option is worth only its intrinsic value: ${kind === 'call' ? `${s} − ${k}` : `${k} − ${s}`} = ${answer} per share (${usd(intrinsic * 100)} per contract).`
          : `It finishes out of the money, so it expires worthless — $0. This is the most common outcome for cheap out-of-the-money options.`,
    };
  },
  () => {
    const p = rnd(1, 5, 0.5);
    const answer = usd(p * 100);
    return {
      prompt: `You buy one call for $${p.toFixed(2)} and the stock crashes. What is the most you can lose?`,
      choices: withChoices(answer, ['Unlimited', usd(p), usd(p * 1000)]),
      answer,
      explain: `When you buy an option, the most you can lose is what you paid: ${p.toFixed(2)} × 100 = ${answer}. (Selling options is different — losses there can be much larger.)`,
    };
  },
];

// ── Concept + read-the-setup questions ─────────────────────────────────────

const CONCEPTS: Question[] = [
  {
    prompt: 'You think a stock will go UP soon. Which option would you buy?',
    choices: ['A call', 'A put'],
    answer: 'A call',
    explain: 'Calls gain value as the stock rises. Puts gain value as it falls.',
  },
  {
    prompt: 'Nothing happens to the stock for two weeks. What usually happens to the option you bought?',
    choices: ['It loses value', 'It gains value', 'It stays exactly the same'],
    answer: 'It loses value',
    explain: 'Theta (time decay). Every day that passes removes some time value, and the decay speeds up close to expiration.',
  },
  {
    prompt: 'An option has delta 0.40. The stock rises $1. Roughly how much does the option price change?',
    choices: ['About +$0.40 per share', 'About +$1.00 per share', 'About +$40 per share', 'It does not change'],
    answer: 'About +$0.40 per share',
    explain: 'Delta ≈ option price change per $1 stock move. 0.40 × $1 = $0.40 per share, or about $40 per contract.',
  },
  {
    prompt: 'Bid is $1.00 and ask is $1.60. What is the problem?',
    choices: ['The spread is wide — you lose money just getting in and out', 'Nothing, that is normal for every option', 'The option is free'],
    answer: 'The spread is wide — you lose money just getting in and out',
    explain: 'Buy at the ask ($1.60), sell right away at the bid ($1.00) and you are down 37% instantly. Liquid options have tight spreads.',
  },
  {
    prompt: 'Implied volatility is very high right before an earnings report. After the report, IV usually…',
    choices: ['Drops sharply', 'Rises even more', 'Stays the same'],
    answer: 'Drops sharply',
    explain: '“IV crush”: once the news is out, the uncertainty premium disappears. Option buyers can lose money even when they guessed the direction right.',
  },
  {
    prompt: 'Weekly, daily and 4-hour trends are all UP, and price has pulled back into the DISCOUNT half of the range. What does the desk say?',
    choices: ['LOOK (long)', 'WAIT', 'NO TRADE'],
    answer: 'LOOK (long)',
    explain: 'Trend is stacked up and price is in a good spot to buy. Still just a LOOK: confirm on the chart and know your invalidation.',
  },
  {
    prompt: 'All three trends are UP, but price is in the PREMIUM (top) half of the range. What does the desk say?',
    choices: ['LOOK (long)', 'WAIT', 'NO TRADE'],
    answer: 'WAIT',
    explain: 'Right trend, wrong location. Chasing price at the top of the range gives a poor entry — wait for a pullback.',
  },
  {
    prompt: 'Weekly is UP, daily is DOWN, and 4-hour is a RANGE. What does the desk say?',
    choices: ['LOOK (long)', 'LOOK (short)', 'NO TRADE'],
    answer: 'NO TRADE',
    explain: 'The timeframes disagree. When the trend is not stacked, standing aside is the disciplined choice.',
  },
  {
    prompt: 'Before you enter any trade, what should you already know?',
    choices: ['Where you will get out if you are wrong', 'How much you will make', 'What your friends think'],
    answer: 'Where you will get out if you are wrong',
    explain: 'Invalidation first, profit second. That is how you keep one bad trade from wiping out many good ones.',
  },
];

type Mode = 'math' | 'concepts';

function nextQuestion(mode: Mode, last?: Question): Question {
  if (mode === 'math') {
    return MATH_GENERATORS[Math.floor(Math.random() * MATH_GENERATORS.length)]();
  }
  const pool = CONCEPTS.filter((q) => q.prompt !== last?.prompt);
  const q = pool[Math.floor(Math.random() * pool.length)];
  return { ...q, choices: shuffle(q.choices) };
}

export default function Practice() {
  const [mode, setMode] = useState<Mode>('math');
  const [q, setQ] = useState<Question | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  // Questions are random, so build them in the browser only.
  useEffect(() => {
    setQ(nextQuestion(mode));
    setPicked(null);
  }, [mode]);

  const pick = useCallback(
    (choice: string) => {
      if (!q || picked) return;
      setPicked(choice);
      setScore((s) => ({ right: s.right + (choice === q.answer ? 1 : 0), total: s.total + 1 }));
    },
    [q, picked],
  );

  const next = () => {
    setQ((cur) => nextQuestion(mode, cur ?? undefined));
    setPicked(null);
  };

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['math', 'Options math'],
            ['concepts', 'Concepts & reading setups'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === m ? 'bg-tv-purple/15 text-tv-purple border-tv-purple/40' : 'text-gray-500 border-tv-border hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-tv-muted">
          <span className="font-mono">
            Score {score.right}/{score.total}
          </span>
          {score.total > 0 && (
            <button onClick={() => setScore({ right: 0, total: 0 })} className="hover:text-white" aria-label="Reset score">
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>

      {!q ? (
        <div className="skeleton h-32 w-full" />
      ) : (
        <>
          <p className="text-base text-white font-medium leading-relaxed">{q.prompt}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {q.choices.map((c) => {
              const isAnswer = c === q.answer;
              const isPicked = c === picked;
              const state = !picked
                ? 'border-tv-border hover:border-tv-purple/60 hover:bg-tv-purple/5 text-gray-200'
                : isAnswer
                ? 'border-tv-green/50 bg-tv-green/10 text-tv-green'
                : isPicked
                ? 'border-tv-red/50 bg-tv-red/10 text-tv-red'
                : 'border-tv-border text-gray-600';
              return (
                <button
                  key={c}
                  onClick={() => pick(c)}
                  disabled={!!picked}
                  className={`flex items-center gap-2 text-left rounded-xl border px-3 py-2.5 text-sm transition-colors ${state}`}
                >
                  {picked && isAnswer && <Check size={15} className="shrink-0" />}
                  {picked && isPicked && !isAnswer && <X size={15} className="shrink-0" />}
                  <span>{c}</span>
                </button>
              );
            })}
          </div>
          {picked && (
            <div
              className={`rounded-xl border p-3 text-sm leading-relaxed ${
                picked === q.answer ? 'border-tv-green/30 bg-tv-green/5' : 'border-tv-amber/30 bg-tv-amber/5'
              }`}
            >
              <span className={`font-semibold ${picked === q.answer ? 'text-tv-green' : 'text-tv-amber'}`}>
                {picked === q.answer ? 'Correct. ' : 'Not quite. '}
              </span>
              <span className="text-gray-300">{q.explain}</span>
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={next}
              className="text-xs font-semibold text-white bg-tv-purple/80 hover:bg-tv-purple rounded-lg px-4 py-2 transition-colors"
            >
              {picked ? 'Next question →' : 'Skip →'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
