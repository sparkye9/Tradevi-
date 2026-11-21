'use client';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Simple / Detailed view for the crash pages. Simple (the default) shows the
 * answer and the few numbers that matter; Detailed shows every reading,
 * table and control. The choice is kept in this browser and shared by all
 * crash pages. Labels such as THEORETICAL, UNMET and missing-data notes are
 * never placed inside <DetailedOnly>.
 */
export type ViewMode = 'simple' | 'detailed';
const KEY = 'tradevi.crash.viewMode.v1';
const EVENT = 'tradevi:viewmode';

function read(): ViewMode {
  try {
    return window.localStorage.getItem(KEY) === 'detailed' ? 'detailed' : 'simple';
  } catch {
    return 'simple';
  }
}

export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>('simple');
  useEffect(() => {
    setMode(read());
    const on = () => setMode(read());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const set = (m: ViewMode) => {
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
    setMode(m);
    window.dispatchEvent(new Event(EVENT));
  };
  return [mode, set];
}

export function ViewToggle() {
  const [mode, setMode] = useViewMode();
  return (
    <div className="inline-flex rounded-full border border-tv-border p-0.5 text-xs" role="group" aria-label="View">
      {(['simple', 'detailed'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          className={`px-3 py-1 rounded-full font-semibold transition-colors ${mode === m ? 'bg-tv-purple/25 text-white' : 'text-tv-muted hover:text-white'}`}
          onClick={() => setMode(m)}
        >
          {m === 'simple' ? 'Simple' : 'Detailed'}
        </button>
      ))}
    </div>
  );
}

export function DetailedOnly({ children }: { children: ReactNode }) {
  const [mode] = useViewMode();
  return mode === 'detailed' ? <>{children}</> : null;
}

export function SimpleOnly({ children }: { children: ReactNode }) {
  const [mode] = useViewMode();
  return mode === 'simple' ? <>{children}</> : null;
}

/** A line telling Simple-view users that more is one click away. */
export function MoreInDetailed({ what }: { what: string }) {
  const [mode, setMode] = useViewMode();
  if (mode === 'detailed') return null;
  return (
    <button type="button" className="text-xs text-tv-purple hover:text-white" onClick={() => setMode('detailed')}>
      Show {what} (Detailed view) →
    </button>
  );
}
