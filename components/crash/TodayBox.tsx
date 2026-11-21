'use client';
import type { ReactNode } from 'react';
import type { Sentence } from '@/lib/crash/plainEnglish';

const DOT: Record<Sentence['tone'], string> = { green: 'bg-tv-green', amber: 'bg-tv-amber', red: 'bg-tv-red', gray: 'bg-gray-500' };

/** The plain-English answer at the top of each crash page. */
export default function TodayBox({ title = 'Today in plain English', sentences, footer }: { title?: string; sentences: Sentence[]; footer?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-tv-purple/30 bg-tv-purple/[0.07] p-4" aria-label={title}>
      <h2 className="text-sm font-bold text-white">{title}</h2>
      <ul className="mt-2 space-y-1.5">
        {sentences.map((s, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-200 leading-relaxed">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.tone]}`} aria-hidden />
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-3 text-[11px] text-tv-muted">{footer}</div>}
    </section>
  );
}
