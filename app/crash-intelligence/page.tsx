'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LearnBox from '@/components/ui/LearnBox';
import DataUnavailable from '@/components/ui/DataUnavailable';
import CrashSubnav from '@/components/crash/CrashSubnav';
import BreadthImport, { loadImports } from '@/components/crash/BreadthImport';
import TodayBox from '@/components/crash/TodayBox';
import StartHere from '@/components/crash/StartHere';
import { DetailedOnly, MoreInDetailed, SimpleOnly, ViewToggle } from '@/components/crash/ViewMode';
import Term from '@/components/ui/Term';
import { marketSummary } from '@/lib/crash/plainEnglish';
import {
  DirectionTag,
  LabelBadge,
  Meter,
  Pill,
  RegimeBadge,
  SectionTitle,
  Stat,
  TONE_TEXT,
  fmtDate,
  fmtEt,
  pctFmt,
  qualityTone,
  riskTone,
  scoreTone,
  usd,
} from '@/components/crash/ui';
import type { MarketView } from '@/lib/crash/market';
import type { CategoryResult, IndicatorReading } from '@/lib/crash/riskScore';
import type { HuntResult } from '@/lib/crash/hunter';
import { REGIME_BLURB } from '@/lib/crash/regime';
import type { LevelSeries } from '@/lib/crash/series';

type HuntResponse = HuntResult & { error?: string };

function indicator(view: MarketView, id: string): IndicatorReading | undefined {
  return view.score.indicators.find((i) => i.id === id);
}

function IndicatorRow({ r }: { r: IndicatorReading }) {
  const tone = riskTone(r.risk);
  return (
    <div className="grid grid-cols-12 gap-2 items-start py-2 border-t border-white/[0.04] first:border-t-0">
      <div className="col-span-12 sm:col-span-5">
        <div className="text-xs text-gray-200" title={r.about}>
          {r.label}
        </div>
        <div className="text-[11px] text-tv-muted">{r.interpretation}</div>
      </div>
      <div className="col-span-4 sm:col-span-2 font-mono text-xs text-white">{r.display}</div>
      <div className="col-span-4 sm:col-span-2">
        <Meter value={r.risk} tone={tone} title={r.risk == null ? 'Unavailable' : `Risk reading ${(r.risk * 100).toFixed(0)} / 100`} />
        <div className={`text-[10px] mt-0.5 ${TONE_TEXT[tone]}`}>{r.risk == null ? 'missing' : `risk ${(r.risk * 100).toFixed(0)}`}</div>
      </div>
      <div className="col-span-4 sm:col-span-1">
        <DirectionTag d={r.direction5} label={r.direction5 ? '5d' : undefined} />
      </div>
      <div className="col-span-12 sm:col-span-2 text-[10px] text-tv-muted leading-tight">
        {r.source ?? '—'}
        {r.asOf && <div>as of {fmtDate(r.asOf)}</div>}
        {r.revisable && <div className="text-tv-amber">revisable, no vintage</div>}
      </div>
    </div>
  );
}

function CategoryCard({ c, readings }: { c: CategoryResult; readings: IndicatorReading[] }) {
  const tone = riskTone(c.risk);
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">{c.label}</h3>
          <p className="text-[11px] text-tv-muted">
            Weight {c.weight} · {c.clustersAvailable} of {c.clustersTotal} signal groups have data
          </p>
        </div>
        <div className="text-right">
          {c.insufficient ? (
            <Pill tone="gray">Insufficient data</Pill>
          ) : (
            <>
              <div className={`font-mono font-bold ${TONE_TEXT[tone]}`}>{c.points?.toFixed(1)} pts</div>
              <DirectionTag d={c.direction5} />
            </>
          )}
        </div>
      </div>
      <div className="mt-2">
        <Meter value={c.risk} tone={tone} />
      </div>
      <div className="mt-2">
        {readings.map((r) => (
          <IndicatorRow key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}

const CAT_PLAIN: Record<string, { name: string; about: string }> = {
  breadth: { name: 'How many stocks are joining in', about: 'Breadth: are most stocks and sectors healthy, or only a few big names?' },
  technical: { name: 'Price trends', about: 'Is the S&P 500 above its averages and holding its lows?' },
  volatility: { name: 'Fear and volatility', about: 'How nervous is the options market, and how much are prices swinging?' },
  credit: { name: 'Credit markets', about: 'Are lenders demanding more to lend to risky companies?' },
  macro: { name: 'Rates and the economy', about: 'Yield curve, financial stress indexes, interest-rate shocks and the dollar.' },
};

function statusWord(risk: number | null): string {
  if (risk == null) return 'No data';
  if (risk >= 0.6) return 'Warning';
  if (risk >= 0.3) return 'Watch';
  return 'Calm';
}

function CategoryBars({ view }: { view: MarketView }) {
  return (
    <div className="card">
      <SectionTitle title="What is driving the score" subtitle="Five areas, each worth up to 20 points. Longer red bars mean more warning signs." />
      <div className="space-y-3">
        {view.score.categories.map((c) => {
          const tone = riskTone(c.risk);
          const plain = CAT_PLAIN[c.id];
          return (
            <div key={c.id}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-white font-semibold">{plain?.name ?? c.label}</span>
                <span className={`font-semibold ${TONE_TEXT[tone]}`}>
                  {statusWord(c.risk)}
                  {!c.insufficient && c.points != null ? ` · ${c.points.toFixed(0)} pts` : ''}
                </span>
              </div>
              <div className="mt-1">
                <Meter value={c.risk} tone={tone} />
              </div>
              <div className="text-[11px] text-tv-muted mt-0.5">{plain?.about}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <MoreInDetailed what="all 30 readings behind these bars" />
      </div>
    </div>
  );
}

function ScoreHistory({ view }: { view: MarketView }) {
  const data = view.history.filter((h) => h.score != null);
  if (data.length < 5) return <p className="text-xs text-tv-muted">Not enough history to chart yet.</p>;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF4D6A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#FF4D6A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#222738" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#8B93A7', fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={30} />
          <YAxis domain={[0, 100]} tick={{ fill: '#8B93A7', fontSize: 10 }} ticks={[0, 20, 40, 60, 80, 100]} />
          {[20, 40, 60, 80].map((y) => (
            <ReferenceLine key={y} y={y} stroke="#2c3247" strokeDasharray="2 4" />
          ))}
          <Tooltip
            contentStyle={{ background: '#10131C', border: '1px solid #222738', fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
            formatter={(v: number) => [v.toFixed(1), 'Risk score']}
          />
          <Area type="monotone" dataKey="score" stroke="#FF4D6A" strokeWidth={2} fill="url(#riskFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PutSummary({ view }: { view: MarketView }) {
  const [hunt, setHunt] = useState<HuntResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch('/api/crash/puts?symbol=SPY&horizon=short')
      .then((r) => r.json())
      .then((j) => alive && setHunt(j))
      .catch((e) => alive && setHunt({ error: String(e) } as HuntResponse))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  const top = hunt?.rows?.filter((r) => r.setup.label === 'STRONG WATCH' || r.setup.label === 'WATCH').slice(0, 3) ?? [];
  return (
    <div className="card">
      <SectionTitle title="Put opportunities (SPY, 14–60 DTE)" subtitle="From Put Hunter's default filters" right={<Link href="/put-hunter" className="text-xs text-tv-purple hover:text-white">Open Put Hunter →</Link>} />
      {loading ? (
        <div className="skeleton h-20" />
      ) : !hunt || hunt.error ? (
        <DataUnavailable reason={hunt?.error ?? 'Scan failed'} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Puts scanned" value={hunt.scanned} />
            <Stat label="Passed filters" value={hunt.passing} />
            <Stat label="Watch or better" value={top.length ? hunt.rows.filter((r) => r.setup.label === 'STRONG WATCH' || r.setup.label === 'WATCH').length : 0} tone={top.length ? 'green' : 'gray'} />
          </div>
          {hunt.noTrade ? (
            <div className="rounded-xl border border-tv-border bg-white/[0.03] p-3">
              <div className="font-bold text-white text-sm">NO TRADE</div>
              <p className="text-xs text-tv-muted mt-0.5">{hunt.noTradeReason} The scanner does not force a trade when the evidence isn&apos;t there.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {top.map((r) => (
                <li key={r.ev.contract.symbol} className="flex items-center justify-between gap-2 text-xs bg-white/[0.03] rounded-lg px-2 py-1.5">
                  <span className="font-mono text-white">
                    SPY {r.ev.contract.strike}P {fmtDate(r.ev.contract.expiration)}
                  </span>
                  <span className="text-tv-muted">{usd(r.ev.costAtAsk)} at ask</span>
                  <span className={TONE_TEXT[qualityTone(r.ev.quality)]}>Q {r.ev.quality}</span>
                  <LabelBadge label={r.setup.label} />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-tv-muted">
            Source {hunt.source} · fetched {fmtEt(hunt.fetchedAt)} · market regime {view.regime.regime}
          </p>
        </div>
      )}
    </div>
  );
}

export default function CrashIntelligencePage() {
  const [view, setView] = useState<MarketView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imports, setImports] = useState<LevelSeries[]>([]);

  const load = useCallback(async (list: LevelSeries[], refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crash/market${refresh ? '?refresh=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imported: list }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      setView(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const list = loadImports();
    setImports(list);
    load(list);
  }, [load]);

  const byCat = useMemo(() => {
    const m = new Map<string, IndicatorReading[]>();
    for (const r of view?.score.indicators ?? []) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    return m;
  }, [view]);

  const vix = view ? indicator(view, 'vix_level') : undefined;
  const term = view ? indicator(view, 'vix_term_structure') : undefined;
  const rv = view ? indicator(view, 'realized_vol') : undefined;
  const breadthCat = view?.score.categories.find((c) => c.id === 'breadth');
  const creditCat = view?.score.categories.find((c) => c.id === 'credit');
  const hy = view ? indicator(view, 'hy_oas') : undefined;
  const sectors = view ? indicator(view, 'sector_participation_50') : undefined;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Crash Intelligence</h1>
            <p className="text-sm text-gray-500 mt-1">
              How risky is the stock market right now, and is protection still cheap? Start with the summary below.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ViewToggle />
            <button className="btn text-xs inline-flex items-center gap-1.5" onClick={() => load(imports, true)} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
        <CrashSubnav />
      </div>

      <StartHere />

      <LearnBox
        summary="a transparent 0–100 score of accumulated risk signals, and what stage the market seems to be in."
        items={[
          { term: 'Risk score', text: 'Counts how many defined warning signs are present across breadth, price structure, volatility, credit and macro. It is not a probability of a crash.' },
          { term: 'Coverage', text: 'How much of the score is backed by real data. Missing data is never counted as "no risk" — it is left out and shown in gray.' },
          { term: 'Regime', text: 'The stage the market looks to be in. PRE-CRASH WATCH is the interesting one: several independent problems while volatility is still cheap.' },
          { term: 'Direction', text: 'Whether each reading got worse or better over the last 5 sessions.' },
          { term: 'Late entry', text: 'Once panic arrives, puts are expensive. The scanner tries to tell an early entry from chasing.' },
        ]}
      />

      {loading && !view && (
        <div className="grid sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      )}
      {error && <DataUnavailable reason={error} />}

      {view && (
        <>
          <TodayBox
            sentences={marketSummary(view)}
            footer={
              <>
                As of the {fmtDate(view.score.asOf)} close · {pctFmt(view.score.coverage, 0)} of the data available · updated {fmtEt(view.generatedAt)}. Research only, not a forecast.
              </>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card">
              <div className="label"><Term k="riskScore">Crash risk score</Term></div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`font-mono text-4xl font-black ${TONE_TEXT[scoreTone(view.score.score)]}`}>{view.score.score == null ? '—' : Math.round(view.score.score)}</span>
                <span className="text-tv-muted text-sm">/ 100</span>
              </div>
              <div className="text-xs text-gray-300 mt-1">{view.score.band ?? 'Not enough data'}</div>
              <div className="text-[11px] text-tv-muted mt-1">
                <Term k="coverage">Coverage</Term> {pctFmt(view.score.coverage, 0)} · confidence {view.score.confidence} · as of {fmtDate(view.score.asOf)} close
              </div>
              <div className="text-[10px] text-tv-muted mt-1">Accumulated risk signals, not a probability. Updated {fmtEt(view.generatedAt)}.</div>
            </div>

            <div className="card">
              <div className="label"><Term k="regime">Market regime</Term></div>
              <div className="mt-2">
                <RegimeBadge regime={view.regime.regime} insufficient={view.regime.insufficient} large />
              </div>
              <p className="text-xs text-gray-300 mt-2">{view.regime.insufficient ? 'Too little data reached Tradevi to judge the market. Check the data sources list below.' : REGIME_BLURB[view.regime.regime]}</p>
              <ul className="mt-1 space-y-0.5">
                {view.regime.why.map((w) => (
                  <li key={w} className="text-[11px] text-tv-muted">
                    · {w}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <div className="label"><Term k="preCrash">Pre-crash watch</Term></div>
              <div className="mt-2 text-sm font-bold text-white">
                {view.regime.regime === 'PRE-CRASH WATCH' ? 'ACTIVE' : 'Not active'}
              </div>
              <p className="text-[11px] text-tv-muted mt-1">
                Needs 3+ independent categories deteriorating while VIX is subdued and SPY is still near its high.
              </p>
              <div className="mt-2 text-[11px] text-gray-300">
                Deteriorating now: {view.regime.facts.deteriorating.length ? view.regime.facts.deteriorating.join(', ') : 'none'}
              </div>
              <div className="text-[11px] text-gray-300">Volatility subdued: {view.regime.facts.subduedVol == null ? 'unknown' : view.regime.facts.subduedVol ? 'yes' : 'no'}</div>
            </div>

            <DetailedOnly>
            <div className="card">
              <div className="label">Volatility</div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Stat label={<Term k="vix">VIX</Term>} value={vix?.display ?? '—'} tone={riskTone(vix?.risk)} sub={view.regime.facts.vixPercentile != null ? `${Math.round(view.regime.facts.vixPercentile * 100)}th pct (1y)` : undefined} />
                <Stat label={<Term k="vixTerm">VIX/VIX3M</Term>} value={term?.display ?? '—'} tone={riskTone(term?.risk)} sub={term?.interpretation} />
                <Stat label={<Term k="realizedVol">SPY 20d RV</Term>} value={rv?.display ?? '—'} tone={riskTone(rv?.risk)} />
              </div>
            </div>

            <div className="card">
              <div className="label">Market breadth</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Stat label="Category" value={breadthCat?.insufficient ? 'n/a' : `${breadthCat?.points?.toFixed(1)} pts`} tone={riskTone(breadthCat?.risk)} sub={`${breadthCat?.clustersAvailable ?? 0}/${breadthCat?.clustersTotal ?? 0} groups`} />
                <Stat label="Sectors > 50d" value={sectors?.display ?? '—'} tone={riskTone(sectors?.risk)} />
              </div>
            </div>

            <div className="card">
              <div className="label">Credit stress</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Stat label="Category" value={creditCat?.insufficient ? 'n/a' : `${creditCat?.points?.toFixed(1)} pts`} tone={riskTone(creditCat?.risk)} sub={`${creditCat?.clustersAvailable ?? 0}/${creditCat?.clustersTotal ?? 0} groups`} />
                <Stat label={<Term k="oas">High-yield OAS</Term>} value={hy?.status === 'ok' ? hy.display.split(' ')[0] : '—'} tone={riskTone(hy?.risk)} sub={hy?.status === 'ok' ? hy.display.split(' ').slice(1).join(' ') : hy?.missingReason} />
              </div>
            </div>
            </DetailedOnly>
          </div>

          <SimpleOnly>
            <CategoryBars view={view} />
          </SimpleOnly>

          <PutSummary view={view} />

          <div className="card">
            <SectionTitle title="Score history" subtitle="Last 120 sessions, recomputed with today's method on data available each day" />
            <ScoreHistory view={view} />
          </div>

          <SimpleOnly>
            {view.catalysts[0] && (
              <div className="card text-xs text-gray-300">
                <span className="label">Next big scheduled event</span>
                <div className="mt-1">
                  <span className="text-white font-semibold">{view.catalysts[0].title}</span> on {view.catalysts[0].at ? fmtEt(view.catalysts[0].at) : fmtDate(view.catalysts[0].date)}. {view.catalysts[0].relevance}
                </div>
              </div>
            )}
          </SimpleOnly>

          <DetailedOnly>
          <div className="grid gap-3 lg:grid-cols-2">
            {view.score.categories.map((c) => (
              <CategoryCard key={c.id} c={c} readings={byCat.get(c.id) ?? []} />
            ))}
          </div>

          <div className="card">
            <SectionTitle title="Upcoming catalysts" subtitle="Scheduled events that can move volatility. None is assumed to cause a selloff." />
            {view.catalystError && <p className="text-[11px] text-tv-amber mb-2">Weekly calendar unavailable: {view.catalystError}. FOMC dates still shown.</p>}
            {view.catalysts.length === 0 ? (
              <p className="text-xs text-tv-muted">No scheduled high-impact events found.</p>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {view.catalysts.slice(0, 14).map((c) => (
                  <li key={`${c.date}-${c.title}`} className="py-2 grid grid-cols-12 gap-2 text-xs">
                    <span className="col-span-4 sm:col-span-2 font-mono text-gray-300">{c.at ? fmtEt(c.at) : fmtDate(c.date)}</span>
                    <span className="col-span-8 sm:col-span-4 text-white">
                      {c.title} <Pill tone={c.impact === 'High' ? 'amber' : 'gray'}>{c.impact}</Pill>
                    </span>
                    <span className="col-span-12 sm:col-span-5 text-tv-muted">{c.relevance}</span>
                    <span className="col-span-12 sm:col-span-1 text-[10px] text-tv-muted">{c.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <BreadthImport
            imports={imports}
            onChange={(list) => {
              setImports(list);
              load(list);
            }}
          />

          <details className="card">
            <summary className="cursor-pointer text-sm font-bold text-white">Data sources and freshness ({view.series.length} series{view.errors.length ? `, ${view.errors.length} unavailable` : ''})</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-tv-muted text-left">
                  <tr>
                    <th className="py-1 pr-2">Series</th>
                    <th className="py-1 pr-2">Source</th>
                    <th className="py-1 pr-2">Latest</th>
                    <th className="py-1 pr-2">Freshness</th>
                    <th className="py-1">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {view.series.map((s) => (
                    <tr key={s.id} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 text-gray-200">{s.label}</td>
                      <td className="py-1 pr-2 text-tv-muted">{s.source}</td>
                      <td className="py-1 pr-2 font-mono text-gray-300">{s.lastDate ?? '—'}</td>
                      <td className="py-1 pr-2 text-tv-muted">{s.freshness}</td>
                      <td className="py-1 text-tv-muted">
                        {s.revisable && !s.vintage ? 'Revisable; first-release vintages need FRED_API_KEY. ' : ''}
                        {s.license ?? ''}
                      </td>
                    </tr>
                  ))}
                  {view.errors.map((e) => (
                    <tr key={e.id} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 text-gray-400">{e.id}</td>
                      <td className="py-1 pr-2 text-tv-red" colSpan={4}>
                        Unavailable: {e.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          </DetailedOnly>
        </>
      )}
    </div>
  );
}
