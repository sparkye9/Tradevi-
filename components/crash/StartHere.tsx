'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

const KEY = 'tradevi.crash.startHere.v1';

const STEPS = [
  { title: 'Read the summary first', text: 'The purple “Today in plain English” box answers the main question in a few sentences. Everything below it is the evidence.' },
  { title: 'Check the score once a day', text: 'Crash Intelligence scores warning signs from 0 to 100. Under 40 is quiet. Look at the other pages only when it is 50 or higher, or a setup is firing.' },
  { title: 'Then look for a put', text: 'Put Setups says whether today matches a rule that worked before. Put Hunter lists the actual contracts, what each costs and where it starts paying off.' },
  { title: 'Cheap tail puts', text: 'Put Hunter’s “Cheap tail puts” button lists low-cost, far-out puts that can multiply in a fear spike. Most expire worthless, so only use money you can lose completely.' },
];

/**
 * A four-step first-visit guide, shown once per browser and skippable.
 * "How to use" in the crash menu has the full version any time.
 */
export default function StartHere() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(KEY) !== 'done');
    } catch {
      setShow(false);
    }
  }, []);
  const done = () => {
    try {
      window.localStorage.setItem(KEY, 'done');
    } catch {
      /* storage blocked */
    }
    setShow(false);
  };
  if (!show) return null;
  const s = STEPS[step];
  return (
    <section className="rounded-2xl border border-tv-blue/40 bg-tv-blue/[0.08] p-4" aria-label="Start here">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-tv-blue">
          Start here · step {step + 1} of {STEPS.length}
        </div>
        <button type="button" onClick={done} className="text-tv-muted hover:text-white" aria-label="Close the guide">
          <X size={16} />
        </button>
      </div>
      <h2 className="mt-1 text-base font-bold text-white">{s.title}</h2>
      <p className="mt-1 text-sm text-gray-200">{s.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {step > 0 && (
          <button type="button" className="btn text-xs" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary text-xs" onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="btn btn-primary text-xs" onClick={done}>
            Got it
          </button>
        )}
        <button type="button" className="text-xs text-tv-muted hover:text-white" onClick={done}>
          Skip
        </button>
        <Link href="/crash-guide" className="ml-auto text-xs text-tv-blue hover:text-white" onClick={done}>
          Full guide →
        </Link>
      </div>
    </section>
  );
}
