'use client';
import { Pill, pctFmt } from '@/components/crash/ui';
import Term from '@/components/ui/Term';
import { signalLine } from '@/lib/crash/plainEnglish';
import type { HistoricalPayoff, LearnedPick } from '@/lib/crash/analogs';
import type { SignalStats } from '@/lib/crash/history/signals';

export interface AnalogResponse {
  error?: string;
  symbol: string;
  horizon: string;
  underlyingSeries: string;
  volSeries: string;
  holdSessions: number;
  today: { date: string; score: number | null; vix: number | null; regime: string };
  tolerance: { score: number; vixPct: number; sameStage: boolean };
  days: number;
  episodes: number;
  first: string | null;
  last: string | null;
  stats: { pDrop5in20: number | null; pDrop10in20: number | null; pVolUp10ptsInHold: number | null; medianRetHold: number | null };
  payoffs: Record<string, HistoricalPayoff>;
  learned: LearnedPick;
  label: 'THEORETICAL';
}

export interface SetupsResponse {
  error?: string;
  setups?: { def: { id: string; name: string; horizon: string }; firing: boolean; evidence: { signal: SignalStats; outOfSample: SignalStats } | null }[];
}

const yr = (d: string | null) => (d ? d.slice(0, 4) : '—');

export const multFmt = (x: number) => (x >= 10 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`);

/** Compact cell for a contract's historical payoff. */
export function HistoryCell({ p }: { p: HistoricalPayoff | undefined }) {
  if (!p) return <span className="text-tv-muted">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className={`font-bold ${p.meanMultiple >= 1 ? 'text-tv-green' : 'text-gray-300'}`}>avg {multFmt(p.meanMultiple)}</span>
      <div className="text-[10px] text-tv-muted">paid {pctFmt(p.hitRate, 0)} of the time</div>
    </span>
  );
}

/**
 * What history says about today: similar past days, what followed them, the
 * contract shape that paid best (tuned on early years, checked on later
 * ones), and which put rules are firing.
 */
export default function HistoryPanel({ hist, loading, setups, symbol }: { hist: AnalogResponse | null; loading: boolean; setups: SetupsResponse | null; symbol: string }) {
  const firing = (setups?.setups ?? []).filter((s) => s.firing);
  const holdLabel = hist ? (hist.holdSessions === 5 ? 'a week' : `${hist.holdSessions} sessions`) : '';
  return (
    <section className="rounded-2xl border border-tv-blue/30 bg-tv-blue/[0.06] p-4 space-y-3" aria-label="What history says">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-white">What history says about days like today</h2>
        <Pill tone="amber">THEORETICAL re-pricing</Pill>
      </div>

      {loading && !hist && <p className="text-xs text-tv-muted">Loading about 20 years of history. The first load can take a minute.</p>}
      {hist?.error && <p className="text-xs text-tv-amber">History is unavailable right now ({hist.error}). The scan above still works; rankings use the standard rules.</p>}

      {hist && !hist.error && (
        <>
          {hist.days > 0 ? (
            <ul className="space-y-1 text-sm text-gray-200">
              <li>
                <b>{hist.days.toLocaleString()} past days</b> looked like today ({hist.episodes} separate episodes, {yr(hist.first)}–{yr(hist.last)}): <Term k="riskScore">score</Term> within {hist.tolerance.score} points, <Term k="vix">VIX</Term> within {Math.round(hist.tolerance.vixPct * 100)}%{hist.tolerance.sameStage ? ', same market stage' : ''}.
              </li>
              <li>
                Afterwards {hist.underlyingSeries} fell 5% or more within 20 sessions <b>{pctFmt(hist.stats.pDrop5in20, 0)}</b> of the time, and 10% or more <b>{pctFmt(hist.stats.pDrop10in20, 0)}</b>. {hist.volSeries} rose 10+ points within {holdLabel} <b>{pctFmt(hist.stats.pVolUp10ptsInHold, 0)}</b> of the time.
              </li>
              {hist.learned.best && (
                <li>
                  In this scan, the puts that paid best after those days were <b>{hist.learned.best.label}</b> (chosen on days before {hist.learned.splitDate.slice(0, 4)}).{' '}
                  {hist.learned.heldUp === true ? 'That held up on the days since.' : hist.learned.heldUp === false ? 'It did not hold up on the days since, so treat it with care.' : 'Too few later days to check it.'}{' '}
                  Rows in that group are tagged <Pill tone="green">History&apos;s pick</Pill>.
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-tv-muted">No past days were close enough to today to learn from.</p>
          )}
          <p className="text-[11px] text-tv-muted">
            The &ldquo;History&rdquo; column re-prices each put on what {hist.underlyingSeries} and {hist.volSeries} actually did over {holdLabel} after each similar day. The moves are real; the option prices are a model, because real past option quotes aren&apos;t loaded. Rows are ranked by that average.
          </p>
        </>
      )}

      <div className="border-t border-white/[0.06] pt-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-tv-muted mb-1">Put rules firing today ({symbol})</div>
        {!setups && <p className="text-xs text-tv-muted">Checking the rules…</p>}
        {setups?.error && <p className="text-xs text-tv-muted">Rules unavailable right now.</p>}
        {setups && !setups.error && !firing.length && <p className="text-xs text-gray-300">None of the {setups.setups?.length ?? 0} rules is firing today.</p>}
        <ul className="space-y-1">
          {firing.map((s) => (
            <li key={s.def.id} className="text-xs text-gray-200">
              <Pill tone="red">FIRING</Pill> <b>{s.def.name}</b> <span className="text-tv-muted">· {s.def.horizon}</span>
              {s.evidence && <div className="text-[11px] text-tv-muted ml-1 mt-0.5">All history: {signalLine(s.evidence.signal)} Years it wasn&apos;t tuned on: {signalLine(s.evidence.outOfSample)}</div>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
