'use client';
import type { ReactNode } from 'react';

/** Number input that keeps the raw text while typing and reports a parsed number (or null). */
export function NumberField({
  label, value, onChange, step = 'any', min, hint, suffix, id,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: string | number;
  min?: number;
  hint?: string;
  suffix?: string;
  id?: string;
}) {
  const fid = id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={fid} className="block space-y-1">
      <span className="label">{label}{suffix ? ` (${suffix})` : ''}</span>
      <input
        id={fid}
        type="number"
        inputMode="decimal"
        className="input"
        step={step}
        min={min}
        value={value ?? ''}
        onChange={(e) => {
          const t = e.target.value;
          if (t === '') return onChange(null);
          const n = Number(t);
          onChange(Number.isFinite(n) ? n : null);
        }}
      />
      {hint && <span className="block text-[10px] text-gray-600">{hint}</span>}
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  const fid = `t-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={fid} className="block space-y-1">
      <span className="label">{label}</span>
      <input id={fid} type={type} className="input font-sans" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'muted'; sub?: ReactNode }) {
  const color = tone === 'good' ? 'text-tv-green' : tone === 'bad' ? 'text-tv-red' : tone === 'warn' ? 'text-tv-amber' : tone === 'muted' ? 'text-gray-500' : 'text-white';
  return (
    <div className="rounded-xl border border-tv-border bg-tv-bg/60 p-3 min-w-0">
      <div className="label truncate">{label}</div>
      <div className={`font-mono font-semibold text-sm mt-1 ${color} break-words`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

/** Numbered calculation trail so every result can be checked by hand. */
export function Steps({ steps, title = 'How this was calculated' }: { steps: string[]; title?: string }) {
  if (!steps.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-500 hover:text-gray-300">{title}</summary>
      <ol className="mt-2 list-decimal pl-5 space-y-1 text-gray-400 font-mono">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </details>
  );
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'info' | 'good'; children: ReactNode }) {
  const cls =
    tone === 'bad' ? 'border-tv-red/40 bg-tv-red/10 text-red-200'
    : tone === 'info' ? 'border-tv-blue/30 bg-tv-blue/5 text-blue-100'
    : tone === 'good' ? 'border-tv-green/30 bg-tv-green/5 text-emerald-100'
    : 'border-tv-amber/30 bg-tv-amber/5 text-amber-100';
  return <div role={tone === 'bad' ? 'alert' : undefined} className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${cls}`}>{children}</div>;
}

export const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
