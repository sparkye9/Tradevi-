'use client';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LearnBox from '@/components/ui/LearnBox';
import CrashSubnav from '@/components/crash/CrashSubnav';
import TodayBox from '@/components/crash/TodayBox';
import Term from '@/components/ui/Term';
import { ViewToggle, useViewMode } from '@/components/crash/ViewMode';
import { Pill, RegimeBadge, fmtDate, pctFmt, usd } from '@/components/crash/ui';
import type { Sentence } from '@/lib/crash/plainEnglish';
import type { Regime } from '@/lib/crash/regime';
import type { SmallRow } from '@/app/api/crash/small-account/route';

interface Traj {
  current: { peakDate: string; peak: number; last: number; lastDate: string; depth: number; sessions: number; path: number[] } | null;
  episodes: { id: string; label: string; peakDate: string; troughDate: string; depth: number; sessionsToTrough: number; path: number[] }[];
  fromHere: {
    used: { id: string; label: string; reachedOn: number }[];
    horizons: { sessions: number; label: string; median: number | null; worst: number | null }[];
    median: number[];
    worst: number[];
    best: number[];
  };
  scenario: { label: string; troughFromPeak: number; path: number[]; basedOn: string; depthFactor: number; speedFactor: number } | null;
}
interface Resp {
  error?: string;
  budget: number;
  asOf: string | null;
  regime: Regime;
  score: number | null;
  symbols: { symbol: string; beta: number | null; price: number | null; scanned: number }[];
  rows: SmallRow[];
  totalRows: number;
  errors: { symbol: string; error: string }[];
  trajectory: Traj;
}

const FUND_NAME: Record<string, string> = {
  SPY: 'S&P 500',
  QQQ: 'Nasdaq 100',
  IWM: 'Small caps',
  DIA: 'Dow 30',
  XLF: 'Banks & finance',
  HYG: 'Junk bonds',
  EEM: 'Emerging markets',
  XLE: 'Energy',
};
const EP_COLORS = ['#6b7280', '#9ca3af', '#64748b', '#78716c', '#a1a1aa', '#94a3b8', '#737373', '#71717a', '#52525b'];
const mult = (x: number) => (x <= 0.005 ? '0×' : x >= 10 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`);
const multTone = (x: number) => (x >= 3 ? 'text-tv-green font-bold' : x >= 1 ? 'text-tv-green' : x > 0 ? 'text-gray-300' : 'text-tv-muted');
const PATH_LABEL = { median: 'Typical past crash', worstPast: 'Worst past crash', worseThanEver: 'Worse than ever' } as const;

function summary(d: Resp): Sentence[] {
  const out: Sentence[] = [];
  const t = d.trajectory;
  if (t.current) out.push({ text: `SPY is ${pctFmt(-t.current.depth, 1)} below its high of ${fmtDate(t.current.peakDate)}, ${t.current.sessions} trading days into this fall.`, tone: t.current.depth <= -0.1 ? 'red' : 'amber' });
  const h3 = t.fromHere.horizons.find((h) => h.sessions === 63);
  if (t.fromHere.used.length && h3 && h3.median != null && h3.worst != null)
    out.push({ text: `${t.fromHere.used.length} past crashes fell this far. Over the next 3 months, the typical one fell another ${pctFmt(-h3.median, 0)} and the worst another ${pctFmt(-h3.worst, 0)}.`, tone: 'gray' });
  if (t.scenario) out.push({ text: `Your "worse than ever" scenario takes SPY to ${pctFmt(-t.scenario.troughFromPeak, 0)} below its high, deeper and faster than ${t.scenario.basedOn}. It is a stress test, not a forecast.`, tone: 'red' });
  const best = d.rows[0];
  if (best) {
    const need = best.spyDrop != null ? ` (about a ${pctFmt(best.spyDrop, 0)} SPY fall)` : '';
    out.push({ text: `With ${usd(d.budget, 0)}, the put that needs the smallest fall is the ${best.underlying} $${best.strike} put expiring ${fmtDate(best.expiration)} for ${usd(best.cost, 0)}. It pays off if ${best.underlying} falls ${pctFmt(best.fundDrop ?? 0, 1)} by then${need}.`, tone: 'green' });
  } else out.push({ text: `No put costs ${usd(d.budget, 0)} or less with a working bid right now.`, tone: 'gray' });
  out.push({ text: 'Every one of these can expire worthless. Only use money you can lose completely.', tone: 'amber' });
  return out;
}

function TrajectoryChart({ t }: { t: Traj }) {
  const [show, setShow] = useState<Record<string, boolean>>({});
  const data = useMemo(() => {
    const cur = t.current;
    const start = cur?.sessions ?? 0;
    const len = Math.max(...t.episodes.map((e) => e.path.length), start + t.fromHere.median.length, start + (t.scenario?.path.length ?? 0), 1);
    const rows: Record<string, number | null>[] = [];
    for (let x = 0; x < Math.min(len, 401); x++) {
      const r: Record<string, number | null> = { x };
      for (const e of t.episodes) r[e.id] = e.path[x] != null ? e.path[x] * 100 : null;
      if (cur) r.today = cur.path[x] != null ? cur.path[x] * 100 : null;
      const k = x - start;
      r.median = k >= 0 && t.fromHere.median[k] != null ? t.fromHere.median[k] * 100 : null;
      r.worst = k >= 0 && t.fromHere.worst[k] != null ? t.fromHere.worst[k] * 100 : null;
      r.scen = k >= 0 && t.scenario?.path[k] != null ? t.scenario.path[k] * 100 : null;
      rows.push(r);
    }
    return rows;
  }, [t]);
  const minY = Math.floor(Math.min(-60, (t.scenario?.troughFromPeak ?? 0) * 100 - 5) / 10) * 10;
  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#ffffff10" />
          <XAxis dataKey="x" type="number" domain={[0, 400]} tick={{ fill: '#888', fontSize: 11 }} label={{ value: 'trading days since the peak', position: 'insideBottom', offset: -4, fill: '#777', fontSize: 11 }} />
          <YAxis domain={[minY, 5]} tick={{ fill: '#888', fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={44} />
          <ReferenceLine y={0} stroke="#ffffff30" />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 12 }} formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n]} labelFormatter={(x) => `Day ${x} after the peak`} />
          <Legend wrapperStyle={{ fontSize: 11 }} onClick={(e) => setShow((s) => ({ ...s, [String(e.dataKey)]: s[String(e.dataKey)] === false }))} />
          {t.episodes.map((e, i) => (
            <Line key={e.id} dataKey={e.id} name={`${e.label} (${pctFmt(e.depth, 0)})`} stroke={EP_COLORS[i % EP_COLORS.length]} strokeWidth={1} dot={false} isAnimationActive={false} hide={show[e.id] === false} connectNulls={false} />
          ))}
          <Line dataKey="median" name="From here: typical past crash" stroke="#f5b942" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="worst" name="From here: worst past crash" stroke="#f97316" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
          {t.scenario && <Line dataKey="scen" name="Worse than ever (your scenario)" stroke="#ef4444" strokeDasharray="2 3" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
          {t.current && <Line dataKey="today" name="Today's fall" stroke="#a78bfa" strokeWidth={3} dot={false} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SmallAccountPage() {
  const [mode] = useViewMode();
  const [budget, setBudget] = useState(50);
  const [custom, setCustom] = useState('');
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'need' | 'worseThanEver' | 'cheap'>('need');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/crash/small-account?budget=${budget}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({ error: r.status === 504 ? 'it took too long; reload in a minute' : `HTTP ${r.status}` }))) as Resp;
        if (alive) setD(j);
      })
      .catch((e) => alive && setD({ error: e instanceof Error ? e.message : String(e) } as Resp))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [budget]);

  const rows = useMemo(() => {
    const rs = [...(d?.rows ?? [])];
    const m = (r: SmallRow, id: string) => r.paths.find((p) => p.id === id)?.atExpiry ?? 0;
    if (sortBy === 'worseThanEver') rs.sort((a, b) => m(b, 'worseThanEver') - m(a, 'worseThanEver'));
    else if (sortBy === 'cheap') rs.sort((a, b) => a.cost - b.cost);
    return rs;
  }, [d, sortBy]);
  const detailed = mode === 'detailed';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-white">Small account</h1>
            <p className="text-sm text-tv-muted">What can $25–$50 buy in a falling market, and where could this fall go? Research only. Tradevi never places orders.</p>
          </div>
          <ViewToggle />
        </div>
        <CrashSubnav />
      </div>

      <LearnBox
        summary="every put here costs your budget or less per contract, and every one can go to zero."
        items={[
          { term: 'Why other funds', text: 'With $50, SPY puts are far below today’s price. Cheaper funds like XLF (banks) or HYG (junk bonds) have puts much closer to their price for the same money.' },
          { term: 'Needs', text: 'How far the fund must fall by expiration for the put to be worth more than you paid, and roughly what SPY fall that has matched (using how much the fund moves with SPY, its beta).' },
          { term: 'Past crashes', text: 'Measured in % from each crash’s own high, so 2008 and today line up even though prices are much higher now.' },
          { term: 'Worse than ever', text: 'Your stress scenario: deeper and faster than the worst crash in the data. Nobody can know how deep this one goes; it sits next to history so you can compare.' },
          { term: 'At expiry', text: 'What the put would be worth at expiration on each path, as a multiple of what you paid. Only intrinsic value is counted, so earlier exits on a fear spike can be worth more.' },
        ]}
      />

      <div className="card flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-tv-muted mr-1">Budget per trade</span>
        {[25, 50].map((b) => (
          <button key={b} onClick={() => setBudget(b)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${budget === b ? 'bg-tv-purple/20 text-tv-purple border-tv-purple/40' : 'border-tv-border text-gray-300'}`}>
            {usd(b, 0)}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(custom);
            if (Number.isFinite(n) && n >= 5 && n <= 500) setBudget(Math.round(n));
          }}
          className="flex items-center gap-1"
        >
          <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="numeric" placeholder="Other $" className="input w-24 text-sm" aria-label="Other budget in dollars" />
          <button className="px-2 py-1.5 rounded-lg text-xs border border-tv-border text-gray-300">Set</button>
        </form>
        {d && !d.error && (
          <span className="ml-auto flex items-center gap-2 text-xs text-tv-muted">
            <RegimeBadge regime={d.regime} /> risk score {d.score != null ? Math.round(d.score) : '—'}
          </span>
        )}
      </div>

      {loading && !d && <p className="text-sm text-tv-muted">Scanning 8 funds and loading about 30 years of SPY history. The first load can take a minute.</p>}
      {d?.error && <p className="text-sm text-tv-amber">Unavailable right now ({d.error}).</p>}

      {d && !d.error && (
        <>
          <TodayBox sentences={summary(d)} />

          <section className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white">Today’s fall next to past crashes (SPY)</h2>
              <Pill tone="gray">% from each crash’s own high</Pill>
              {d.trajectory.scenario && <Pill tone="red">Red dotted line = your scenario, not a forecast</Pill>}
            </div>
            <TrajectoryChart t={d.trajectory} />
            <p className="text-[11px] text-tv-muted">
              Grey lines are real SPY closes in past falls of 18% or more. The purple line is today. Dashed lines start from today and show what the past crashes that fell this far did next. The red dotted line is the worse-than-ever scenario: {d.trajectory.scenario ? `${d.trajectory.scenario.depthFactor}× as deep as ${d.trajectory.scenario.basedOn} and ${d.trajectory.scenario.speedFactor}× as fast` : 'not available'}. Tap a name in the legend to hide it.
            </p>
            {detailed && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-tv-muted">
                    <tr className="text-left">
                      <th className="py-1 pr-2">Further fall from here</th>
                      {d.trajectory.fromHere.horizons.map((h) => (
                        <th key={h.sessions} className="py-1 pr-2 text-right">{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2">Typical past crash</td>
                      {d.trajectory.fromHere.horizons.map((h) => (
                        <td key={h.sessions} className="py-1 pr-2 text-right font-mono">{pctFmt(h.median, 1)}</td>
                      ))}
                    </tr>
                    <tr className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2">Worst past crash</td>
                      {d.trajectory.fromHere.horizons.map((h) => (
                        <td key={h.sessions} className="py-1 pr-2 text-right font-mono">{pctFmt(h.worst, 1)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-tv-muted">Based on: {d.trajectory.fromHere.used.map((u) => u.label).join(', ') || 'none'}.</p>
              </div>
            )}
          </section>

          <section className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white">
                Puts for {usd(d.budget, 0)} or less ({d.totalRows} found across {d.symbols.length} funds)
              </h2>
              <div className="flex gap-1 text-xs">
                {(
                  [
                    ['need', 'Smallest fall needed'],
                    ['worseThanEver', 'Best in your scenario'],
                    ['cheap', 'Cheapest'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} onClick={() => setSortBy(k)} className={`px-2 py-1 rounded-md border ${sortBy === k ? 'border-tv-purple/40 text-tv-purple bg-tv-purple/10' : 'border-tv-border text-gray-400'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-tv-muted">
                  <tr className="text-left">
                    <th className="py-2 pr-2">Put</th>
                    <th className="py-2 pr-2 text-right"><Term k="cost">Cost</Term></th>
                    <th className="py-2 pr-2 text-right">Needs a fall of</th>
                    <th className="py-2 pr-2 text-right">Chance worthless</th>
                    {(['median', 'worstPast', 'worseThanEver'] as const).map((id) => (
                      <th key={id} className={`py-2 pr-2 text-right ${id === 'worseThanEver' ? 'text-tv-red' : ''}`}>{PATH_LABEL[id]}<div className="normal-case font-normal">at expiry</div></th>
                    ))}
                    {detailed && <th className="py-2 pr-2 text-right">Δ · IV · OI · beta</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, detailed ? 80 : 25).map((r) => (
                    <tr key={r.symbol} className="border-t border-white/[0.04]">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <span className="text-white font-semibold">{r.underlying} ${r.strike} put</span>
                        {r.thin && <span className="ml-1 inline-flex rounded-full border border-tv-amber/40 bg-tv-amber/10 px-1.5 text-[10px] font-semibold text-tv-amber">Thin</span>}
                        <div className="text-[11px] text-tv-muted">{FUND_NAME[r.underlying] ?? r.underlying} · expires {fmtDate(r.expiration)} · {r.dte} days</div>
                      </td>
                      <td className="py-2 pr-2 text-right font-mono">
                        {usd(r.cost, 0)}
                        <div className="text-[11px] text-tv-muted">{r.contracts > 1 ? `${r.contracts} fit your budget` : `ask ${usd(r.ask)}`}</div>
                      </td>
                      <td className="py-2 pr-2 text-right font-mono">
                        {r.underlying} {pctFmt(r.fundDrop, 1)}
                        {r.underlying !== 'SPY' && r.spyDrop != null && <div className="text-[11px] text-tv-muted">≈ SPY {pctFmt(r.spyDrop, 0)}</div>}
                        {r.underlying !== 'SPY' && r.spyDrop == null && <div className="text-[11px] text-tv-amber">doesn’t move with SPY</div>}
                      </td>
                      <td className="py-2 pr-2 text-right font-mono">{pctFmt(r.chanceWorthless, 0)}</td>
                      {(['median', 'worstPast', 'worseThanEver'] as const).map((id) => {
                        const p = r.paths.find((x) => x.id === id);
                        return (
                          <td key={id} className={`py-2 pr-2 text-right font-mono ${p ? multTone(p.atExpiry) : ''}`}>
                            {p ? mult(p.atExpiry) : '—'}
                            {detailed && p && p.best > p.atExpiry + 0.05 && <div className="text-[10px] text-tv-muted">best on the way {mult(p.best)}</div>}
                          </td>
                        );
                      })}
                      {detailed && (
                        <td className="py-2 pr-2 text-right font-mono text-[11px] text-gray-300 whitespace-nowrap">
                          {r.delta?.toFixed(3) ?? '—'} · {r.iv != null ? `${Math.round(r.iv * 100)}%` : '—'} · {r.openInterest?.toLocaleString() ?? '—'} · {r.beta?.toFixed(2) ?? '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-tv-muted">
              Cost is at the ask: one contract, the most you can lose. “At expiry” values follow each path to the expiration date and count intrinsic value only (THEORETICAL): they are not forecasts, and a put can be sold earlier during a fear spike for more. Funds other than SPY are moved by their beta to SPY, measured over the past year.
              {d.errors.length > 0 && ` Unavailable now: ${d.errors.map((e) => e.symbol).join(', ')}.`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
