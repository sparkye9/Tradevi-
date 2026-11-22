'use client';
/**
 * Shared Crash Intelligence visuals. Colour rules (kept consistent on every
 * page): green = favourable contract quality or improving conditions,
 * amber = caution / developing risk, red = significant downside risk or a
 * poor contract, gray = unavailable or unconfirmed. Market risk and contract
 * quality are always labelled, never shown as a bare colour.
 */
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Direction } from '@/lib/crash/riskScore';
import type { Regime } from '@/lib/crash/regime';
import type { SetupLabel } from '@/lib/crash/setup';

export type Tone = 'green' | 'amber' | 'red' | 'gray';

export const TONE_TEXT: Record<Tone, string> = { green: 'text-tv-green', amber: 'text-tv-amber', red: 'text-tv-red', gray: 'text-tv-muted' };
export const TONE_BG: Record<Tone, string> = { green: 'bg-tv-green', amber: 'bg-tv-amber', red: 'bg-tv-red', gray: 'bg-gray-600' };
export const TONE_SOFT: Record<Tone, string> = {
  green: 'bg-tv-green/10 border-tv-green/30 text-tv-green',
  amber: 'bg-tv-amber/10 border-tv-amber/30 text-tv-amber',
  red: 'bg-tv-red/10 border-tv-red/30 text-tv-red',
  gray: 'bg-white/[0.03] border-tv-border text-tv-muted',
};

/** Market-risk reading (0–1): higher is more dangerous. */
export function riskTone(risk: number | null | undefined): Tone {
  if (risk == null) return 'gray';
  if (risk >= 0.6) return 'red';
  if (risk >= 0.3) return 'amber';
  return 'green';
}

/** Market risk score (0–100). */
export function scoreTone(score: number | null | undefined): Tone {
  return riskTone(score == null ? null : score / 100);
}

/** Contract quality / setup (0–100): higher is better. */
export function qualityTone(q: number | null | undefined): Tone {
  if (q == null) return 'gray';
  if (q >= 65) return 'green';
  if (q >= 45) return 'amber';
  return 'red';
}

export const REGIME_TONE: Record<Regime, Tone> = {
  NORMAL: 'green',
  'EARLY WARNING': 'amber',
  'ELEVATED RISK': 'amber',
  'PRE-CRASH WATCH': 'red',
  'BREAKDOWN CONFIRMED': 'red',
  'VOLATILITY EXPANSION': 'red',
  'PANIC / LATE ENTRY': 'red',
};

export const LABEL_STYLE: Record<SetupLabel, string> = {
  'STRONG WATCH': 'bg-tv-green/15 border-tv-green/40 text-tv-green',
  WATCH: 'bg-tv-blue/15 border-tv-blue/40 text-tv-blue',
  WAIT: 'bg-tv-amber/10 border-tv-amber/30 text-tv-amber',
  AVOID: 'bg-white/[0.04] border-tv-border text-gray-400',
  'IN A FALL': 'bg-tv-amber/15 border-tv-amber/40 text-tv-amber',
  'LATE ENTRY': 'bg-tv-red/10 border-tv-red/30 text-tv-red',
};

export function Pill({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_SOFT[tone]} ${className}`}>{children}</span>;
}

export function LabelBadge({ label }: { label: SetupLabel }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide ${LABEL_STYLE[label]}`}>{label}</span>;
}

export function RegimeBadge({ regime, large = false, insufficient = false }: { regime: Regime; large?: boolean; insufficient?: boolean }) {
  if (insufficient) {
    return <span className={`inline-flex rounded-lg border font-bold tracking-wide ${TONE_SOFT.gray} ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'}`}>INSUFFICIENT DATA</span>;
  }
  return (
    <span className={`inline-flex rounded-lg border font-bold tracking-wide ${TONE_SOFT[REGIME_TONE[regime]]} ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'}`}>{regime}</span>
  );
}

/** Horizontal 0–1 bar. Gray and empty when unavailable. */
export function Meter({ value, tone, title }: { value: number | null; tone: Tone; title?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden" title={title}>
      {value != null && <div className={`h-full ${TONE_BG[tone]}`} style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }} />}
    </div>
  );
}

export function DirectionTag({ d, label }: { d: Direction | null; label?: string }) {
  if (!d) return <span className="text-[11px] text-tv-muted">—</span>;
  const map = {
    deteriorating: { Icon: ArrowUpRight, cls: 'text-tv-red', text: 'Deteriorating' },
    improving: { Icon: ArrowDownRight, cls: 'text-tv-green', text: 'Improving' },
    flat: { Icon: ArrowRight, cls: 'text-tv-muted', text: 'Steady' },
  }[d];
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${map.cls}`}>
      <map.Icon size={12} />
      {label ?? map.text}
    </span>
  );
}

export function fmtEt(iso: string | null | undefined, withDate = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      ...(withDate ? { month: 'short', day: 'numeric' } : {}),
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET'
  );
}

export function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export const usd = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? '—' : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const pctFmt = (n: number | null | undefined, digits = 1, signed = false) =>
  n == null || !Number.isFinite(n) ? '—' : `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(digits)}%`;

/** Small "estimate" disclaimer used next to every modeled number. */
export function EstimateNote({ children }: { children?: ReactNode }) {
  return <p className="text-[11px] text-tv-muted">{children ?? 'Model estimates, not executable prices. Real fills depend on the bid, ask and liquidity at the time.'}</p>;
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-tv-muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'gray' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`font-mono font-bold text-lg leading-tight ${tone === 'gray' ? 'text-white' : TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="text-[11px] text-tv-muted mt-0.5">{sub}</div>}
    </div>
  );
}
