'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryKey } from '@/lib/glossary';

/**
 * A word with a dotted underline that explains itself when tapped or
 * hovered. Definitions come from lib/glossary.ts so every page says the
 * same thing. `example` overrides the glossary example with today's number.
 */
export default function Term({ k, children, example }: { k: GlossaryKey; children?: ReactNode; example?: string }) {
  const g = GLOSSARY[k] as { term: string; short: string; example?: string };
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const ex = example ?? g.example;
  return (
    <span ref={ref} className="relative inline normal-case tracking-normal" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="underline decoration-dotted decoration-tv-purple/70 underline-offset-2 cursor-help text-inherit font-inherit"
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          // Open, never toggle: a tap or click also fires mouseenter first,
          // so toggling here closed the popover the moment it opened.
          // Outside click and Escape close it.
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children ?? g.term}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 block w-64 max-w-[80vw] rounded-lg border border-tv-purple/30 bg-[#141826] p-2.5 text-left text-xs font-normal leading-relaxed text-gray-200 shadow-xl"
        >
          <span className="block font-semibold text-white">{g.term}</span>
          <span className="block mt-0.5">{g.short}</span>
          {ex && <span className="block mt-1 text-tv-muted">Example: {ex}</span>}
        </span>
      )}
    </span>
  );
}
