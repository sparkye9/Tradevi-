'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import LearnBox from '@/components/ui/LearnBox';
import DataUnavailable from '@/components/ui/DataUnavailable';
import CrashSubnav from '@/components/crash/CrashSubnav';
import ContractDetail from '@/components/crash/ContractDetail';
import TodayBox from '@/components/crash/TodayBox';
import { ViewToggle, useViewMode } from '@/components/crash/ViewMode';
import Term from '@/components/ui/Term';
import { huntSummary } from '@/lib/crash/plainEnglish';
import { LabelBadge, Pill, RegimeBadge, TONE_TEXT, fmtDate, fmtEt, pctFmt, qualityTone, scoreTone, usd } from '@/components/crash/ui';
import { LEAPS_FILTERS, LONG_TERM_FILTERS, PUT_HUNTER_UNDERLYINGS, SHORT_TERM_FILTERS, type ScreenFilters } from '@/lib/crash/config';
import type { HuntResult, HuntRow } from '@/lib/crash/hunter';
import type { Regime } from '@/lib/crash/regime';
import { DEFAULT_BUDGET, exposureByGroup, type Position, type RiskBudget } from '@/lib/crash/sizing';

type Horizon = 'short' | 'long' | 'leaps';
type HuntResponse = HuntResult & { error?: string; market?: { score: number | null; band: string | null; coverage: number; regime: Regime; insufficient: boolean; why: string[]; asOf: string } };

const HORIZONS: { id: Horizon; label: string; filters: ScreenFilters }[] = [
  { id: 'short', label: 'Short term · 14–60 DTE', filters: SHORT_TERM_FILTERS },
  { id: 'long', label: 'Long term · 60–120 DTE', filters: LONG_TERM_FILTERS },
  { id: 'leaps', label: 'LEAPS · 120+ DTE', filters: LEAPS_FILTERS },
];

const FILTER_FIELDS: { key: keyof ScreenFilters; label: string; step: number; pct?: boolean }[] = [
  { key: 'minPremium', label: 'Min premium $/sh', step: 0.01 },
  { key: 'maxPremium', label: 'Max premium $/sh', step: 0.01 },
  { key: 'minDte', label: 'Min DTE', step: 1 },
  { key: 'maxDte', label: 'Max DTE', step: 1 },
  { key: 'minAbsDelta', label: 'Min |delta|', step: 0.01 },
  { key: 'maxAbsDelta', label: 'Max |delta|', step: 0.01 },
  { key: 'minOpenInterest', label: 'Min open interest', step: 10 },
  { key: 'minVolume', label: 'Min volume', step: 1 },
  { key: 'maxSpreadPct', label: 'Max spread %', step: 1, pct: true },
];

const BUDGET_KEY = 'tradevi.crash.budget.v1';
const POS_KEY = 'tradevi.crash.positions.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}

function SimpleRow({ r, onOpen }: { r: HuntRow; onOpen: () => void }) {
  const { ev, setup } = r;
  const c = ev.contract;
  return (
    <tr className="border-t border-white/[0.04] hover:bg-white/[0.03] cursor-pointer" onClick={onOpen}>
      <td className="py-2 pr-2"><LabelBadge label={setup.label} /></td>
      <td className="py-2 pr-2 text-white whitespace-nowrap">
        ${c.strike} put
        <div className="text-[11px] text-tv-muted">expires {fmtDate(c.expiration)} · {c.dte} days left</div>
      </td>
      <td className="py-2 pr-2 font-mono text-right">{usd(ev.costAtAsk, 0)}</td>
      <td className="py-2 pr-2 font-mono text-right whitespace-nowrap">{usd(ev.breakevenAtAsk)}<div className="text-[11px] text-tv-muted font-sans">{ev.declineToBreakeven != null ? `${pctFmt(ev.declineToBreakeven)} drop` : ''}</div></td>
      <td className="py-2 pr-2 font-mono text-right hidden sm:table-cell">{usd(ev.thetaDollarsPerDay, 0)}</td>
      <td className={`py-2 font-mono text-right font-bold ${TONE_TEXT[qualityTone(ev.quality)]}`}>{ev.quality ?? '—'}</td>
    </tr>
  );
}

function Row({ r, onOpen }: { r: HuntRow; onOpen: () => void }) {
  const { ev, setup } = r;
  const c = ev.contract;
  return (
    <tr className="border-t border-white/[0.04] hover:bg-white/[0.03] cursor-pointer" onClick={onOpen}>
      <td className="py-2 pr-2"><LabelBadge label={setup.label} /></td>
      <td className="py-2 pr-2 font-mono text-white whitespace-nowrap">
        {c.strike}P <span className="text-tv-muted">{fmtDate(c.expiration)}</span>
        <div className="text-[10px] text-tv-muted font-sans">{c.dte} DTE · {ev.moneyness}</div>
      </td>
      <td className="py-2 pr-2 font-mono text-right whitespace-nowrap">{usd(c.bid)} / {usd(c.ask)}<div className="text-[10px] text-tv-muted">mid {usd(ev.mid)}</div></td>
      <td className="py-2 pr-2 font-mono text-right">{usd(ev.costAtAsk)}</td>
      <td className="py-2 pr-2 font-mono text-right">{c.delta?.toFixed(2)}</td>
      <td className="py-2 pr-2 font-mono text-right hidden md:table-cell">{c.gamma?.toFixed(4)}</td>
      <td className="py-2 pr-2 font-mono text-right">{usd(ev.thetaDollarsPerDay)}<div className="text-[10px] text-tv-muted">{pctFmt(ev.thetaPctPerDay)}/d</div></td>
      <td className="py-2 pr-2 font-mono text-right hidden md:table-cell">+{usd(ev.vegaGain5, 0)}</td>
      <td className="py-2 pr-2 font-mono text-right">{pctFmt(c.iv)}</td>
      <td className="py-2 pr-2 font-mono text-right hidden lg:table-cell">{c.openInterest?.toLocaleString()}<div className="text-[10px] text-tv-muted">vol {c.volume?.toLocaleString()}</div></td>
      <td className="py-2 pr-2 font-mono text-right hidden lg:table-cell">{pctFmt(ev.spreadPct, 0)}</td>
      <td className="py-2 pr-2 font-mono text-right whitespace-nowrap">{usd(ev.breakevenAtAsk)}<div className="text-[10px] text-tv-muted">−{pctFmt(ev.declineToBreakeven)}</div></td>
      <td className={`py-2 pr-2 font-mono text-right font-bold ${TONE_TEXT[qualityTone(ev.quality)]}`}>{ev.quality ?? '—'}</td>
      <td className={`py-2 font-mono text-right font-bold ${TONE_TEXT[qualityTone(setup.setup)]}`}>{setup.setup ?? '—'}</td>
    </tr>
  );
}

export default function PutHunterPage() {
  const [mode] = useViewMode();
  const [symbol, setSymbol] = useState('SPY');
  const [input, setInput] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('short');
  const [filters, setFilters] = useState<ScreenFilters>(SHORT_TERM_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState<HuntResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<HuntRow | null>(null);
  const [budget, setBudget] = useState<RiskBudget>(DEFAULT_BUDGET);
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    setBudget(load(BUDGET_KEY, DEFAULT_BUDGET));
    setPositions(load(POS_KEY, [] as Position[]));
  }, []);

  const scan = useCallback(async (sym: string, f: ScreenFilters, h: Horizon) => {
    setLoading(true);
    setOpen(null);
    try {
      const qs = new URLSearchParams({ symbol: sym, horizon: h });
      for (const k of Object.keys(f) as (keyof ScreenFilters)[]) qs.set(k, String(f[k]));
      const res = await fetch(`/api/crash/puts?${qs}`);
      const j = (await res.json()) as HuntResponse;
      if (!res.ok && !j.error) j.error = `HTTP ${res.status}`;
      setData(j);
    } catch (e) {
      setData({ error: e instanceof Error ? e.message : String(e) } as HuntResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scan(symbol, filters, horizon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, horizon]);

  function chooseHorizon(h: Horizon) {
    const f = HORIZONS.find((x) => x.id === h)!.filters;
    setFilters(f);
    setHorizon(h);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const s = input.trim().toUpperCase();
    if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) setSymbol(s);
  }

  function updateBudget(k: keyof RiskBudget, v: number) {
    const b = { ...budget, [k]: v };
    setBudget(b);
    save(BUDGET_KEY, b);
  }

  function track(row: HuntRow, contracts: number, premium: number) {
    const p: Position = { id: `${row.ev.contract.symbol}-${Date.now()}`, underlying: row.ev.contract.underlying, description: `${row.ev.contract.underlying} ${row.ev.contract.strike}P ${row.ev.contract.expiration}`, contracts, premiumPerShare: premium };
    const next = [...positions, p];
    setPositions(next);
    save(POS_KEY, next);
  }

  const exposure = exposureByGroup(positions, budget);
  const rejections = Object.entries(data?.rejectionCounts ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Put Hunter</h1>
            <p className="text-sm text-gray-500 mt-1">
              Is there a put worth buying today, what does it cost, and where does it start paying off? Research only. Tradevi never places orders.
            </p>
          </div>
          <ViewToggle />
        </div>
        <CrashSubnav />
      </div>

      <LearnBox
        summary="cheap is not the same as good value — every put is scored on what the premium actually buys."
        items={[
          { term: 'Cost', text: 'Premium × 100. A $0.20 put costs $20 per contract before fees, and $20 is the most you can lose.' },
          { term: 'Breakeven', text: 'Strike minus the premium. The underlying must be below it at expiration for the put to make money if held to the end.' },
          { term: 'Theta', text: 'What waiting costs per day. Shown in dollars and as a share of the premium.' },
          { term: 'Vega', text: 'How much the put gains if implied volatility rises. Puts bought before fear arrives benefit twice: price and volatility.' },
          { term: 'Three scores', text: 'Market risk (environment), contract quality (the contract itself) and trade setup (fit between the two). None is a probability of winning.' },
          { term: 'NO TRADE', text: 'When nothing earns WATCH or better, the scanner says so instead of forcing a pick.' },
        ]}
      />

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PUT_HUNTER_UNDERLYINGS.map((s) => (
            <button key={s} className={`btn text-xs ${symbol === s ? 'btn-primary' : ''}`} onClick={() => setSymbol(s)}>
              {s}
            </button>
          ))}
          <form onSubmit={onSearch} className="flex items-center gap-1">
            <input className="input text-xs w-28" placeholder="Other ticker" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Search ticker" />
            <button className="btn text-xs" aria-label="Scan ticker"><Search size={14} /></button>
          </form>
          <div className="ml-auto flex flex-wrap gap-1">
            {HORIZONS.map((h) => (
              <button key={h.id} className={`btn text-xs ${horizon === h.id ? 'btn-primary' : ''}`} onClick={() => chooseHorizon(h.id)}>
                {h.label}
              </button>
            ))}
          </div>
        </div>
        <button className="text-xs text-tv-muted hover:text-white inline-flex items-center gap-1" onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal size={14} /> {showFilters ? 'Hide' : 'Adjust'} filters and risk budget
        </button>
        {showFilters && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {FILTER_FIELDS.map((fd) => (
                <label key={fd.key} className="space-y-1">
                  <span className="label block">{fd.label}</span>
                  <input
                    className="input text-xs w-full"
                    type="number"
                    step={fd.step}
                    value={fd.pct ? Math.round(filters[fd.key] * 100) : filters[fd.key]}
                    onChange={(e) => setFilters({ ...filters, [fd.key]: fd.pct ? Number(e.target.value) / 100 : Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-lg">
              <label className="space-y-1"><span className="label block">Account equity $</span><input className="input text-xs w-full" type="number" value={budget.accountEquity} onChange={(e) => updateBudget('accountEquity', Number(e.target.value))} /></label>
              <label className="space-y-1"><span className="label block">Max risk per idea $</span><input className="input text-xs w-full" type="number" value={budget.maxRiskPerTrade} onChange={(e) => updateBudget('maxRiskPerTrade', Number(e.target.value))} /></label>
              <label className="space-y-1"><span className="label block">Fee per contract $</span><input className="input text-xs w-full" type="number" step={0.05} value={budget.feePerContract} onChange={(e) => updateBudget('feePerContract', Number(e.target.value))} /></label>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary text-xs" onClick={() => scan(symbol, filters, horizon)}>Apply filters</button>
              <button className="btn text-xs" onClick={() => chooseHorizon(horizon)}>Reset to defaults</button>
            </div>
          </div>
        )}
      </div>

      {data?.market && (
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="label">Market risk</div>
            <div className={`font-mono font-bold text-xl ${TONE_TEXT[scoreTone(data.market.score)]}`}>{data.market.score == null ? '—' : Math.round(data.market.score)}<span className="text-xs text-tv-muted"> / 100</span></div>
          </div>
          <div>
            <div className="label">Regime</div>
            <RegimeBadge regime={data.market.regime} insufficient={data.market.insufficient} />
          </div>
          <div className="text-[11px] text-tv-muted flex-1 min-w-[200px]">{data.market.why.join(' · ')}</div>
          <div className="text-[11px] text-tv-muted">
            {data.symbol} {usd(data.underlyingPrice)} {data.underlyingQuoteTime ? `· last trade ${fmtEt(data.underlyingQuoteTime)}` : ''} · 20d realized vol {pctFmt(data.realizedVol20)}
          </div>
        </div>
      )}

      {!loading && data && <TodayBox sentences={huntSummary(data, data.market?.regime ?? null)} />}

      {loading && <div className="skeleton h-40" />}
      {!loading && data?.error && !data.rows?.length && <DataUnavailable reason={data.error} />}

      {!loading && data && !data.error && data.rows && (
        <>
          {data.noTrade && (
            <div className="rounded-2xl border border-tv-border bg-white/[0.03] p-4">
              <div className="text-lg font-black text-white tracking-wide">NO TRADE</div>
              <p className="text-sm text-tv-muted mt-1">{data.noTradeReason} The market does not owe us a crash; the scanner waits until the evidence supports a trade.</p>
            </div>
          )}
          <div className="card !p-0 overflow-hidden">
            <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-tv-muted">
                {data.scanned} puts scanned across {data.expirationsScanned.length} expirations · {data.passing} passed the filters · showing up to 60
              </div>
              <div className="text-[11px] text-tv-muted">Source {data.source} · fetched {fmtEt(data.fetchedAt)}</div>
            </div>
            {data.partialErrors.length > 0 && <p className="px-4 text-[11px] text-tv-amber">Some data missing: {data.partialErrors.slice(0, 3).join('; ')}</p>}
            <div className="overflow-x-auto mt-2">
              {mode === 'simple' ? (
                <table className="w-full text-xs">
                  <thead className="text-tv-muted text-[10px] uppercase tracking-wider">
                    <tr className="text-right">
                      <th className="text-left py-2 pl-4 pr-2"><Term k="watch">Verdict</Term></th>
                      <th className="text-left py-2 pr-2"><Term k="put">Contract</Term></th>
                      <th className="py-2 pr-2"><Term k="cost">Cost (max loss)</Term></th>
                      <th className="py-2 pr-2"><Term k="breakeven">Pays off below</Term></th>
                      <th className="py-2 pr-2 hidden sm:table-cell"><Term k="theta">Time cost / day</Term></th>
                      <th className="py-2 pr-4"><Term k="quality">Quality</Term></th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
                    {data.rows.slice(0, 15).map((r) => (
                      <SimpleRow key={r.ev.contract.symbol} r={r} onOpen={() => setOpen(r)} />
                    ))}
                    {!data.rows.length && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-tv-muted">No contracts passed the safety checks.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
              <table className="w-full text-xs">
                <thead className="text-tv-muted text-[10px] uppercase tracking-wider">
                  <tr className="text-right">
                    <th className="text-left py-2 pl-4 pr-2">Label</th>
                    <th className="text-left py-2 pr-2">Contract</th>
                    <th className="py-2 pr-2">Bid / Ask</th>
                    <th className="py-2 pr-2"><Term k="cost">Cost</Term></th>
                    <th className="py-2 pr-2"><Term k="delta">Δ</Term></th>
                    <th className="py-2 pr-2 hidden md:table-cell"><Term k="gamma">Γ</Term></th>
                    <th className="py-2 pr-2"><Term k="theta">Θ/day</Term></th>
                    <th className="py-2 pr-2 hidden md:table-cell"><Term k="vega">IV +5</Term></th>
                    <th className="py-2 pr-2"><Term k="iv">IV</Term></th>
                    <th className="py-2 pr-2 hidden lg:table-cell"><Term k="oi">OI</Term></th>
                    <th className="py-2 pr-2 hidden lg:table-cell"><Term k="spread">Spread</Term></th>
                    <th className="py-2 pr-2"><Term k="breakeven">Breakeven</Term></th>
                    <th className="py-2 pr-2"><Term k="quality">Quality</Term></th>
                    <th className="py-2 pr-4"><Term k="setup">Setup</Term></th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
                  {data.rows.map((r) => (
                    <Row key={r.ev.contract.symbol} r={r} onOpen={() => setOpen(r)} />
                  ))}
                  {!data.rows.length && (
                    <tr>
                      <td colSpan={14} className="py-6 text-center text-tv-muted">No contracts passed the filters. Try widening premium, DTE or delta.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              )}
            </div>
            <p className="px-4 py-3 text-[10px] text-tv-muted">{mode === 'simple' && data.rows.length > 15 ? `Showing the best 15 of ${data.rows.length}; Detailed view lists up to 60. ` : ''}Tap a row for Greeks, scenarios and sizing. Mid is not a guaranteed fill; cost and breakeven use the ask.</p>
          </div>

          {rejections.length > 0 && mode === 'detailed' && (
            <div className="card">
              <h3 className="text-sm font-bold text-white mb-2">Why contracts were rejected</h3>
              <div className="flex flex-wrap gap-1.5">
                {rejections.map(([k, n]) => (
                  <Pill key={k} tone="gray">{k.replace(/#/g, '…')} · {n}</Pill>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {positions.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-sm font-bold text-white">Exposure tracker</h3>
          <p className="text-[11px] text-tv-muted">Bearish positions on correlated underlyings are one bet, not several. Kept in this browser only.</p>
          {exposure.map((g) => (
            <div key={g.group} className="text-xs">
              <span className="text-white font-semibold">{g.group}</span>: {usd(g.premium)} at risk ({pctFmt(g.pctOfEquity)} of account)
              {g.warning && <div className="text-tv-amber">{g.warning}</div>}
            </div>
          ))}
          <ul className="space-y-1">
            {positions.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs bg-white/[0.03] rounded-lg px-2 py-1">
                <span className="font-mono text-gray-200">{p.contracts} × {p.description} @ {usd(p.premiumPerShare)}</span>
                <button
                  className="text-tv-muted hover:text-tv-red"
                  aria-label="Remove position"
                  onClick={() => {
                    const next = positions.filter((x) => x.id !== p.id);
                    setPositions(next);
                    save(POS_KEY, next);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && data?.underlyingPrice != null && (
        <ContractDetail
          row={open}
          S={data.underlyingPrice}
          riskFree={data.riskFree}
          dividendYield={data.dividendYield}
          budget={budget}
          market={{ score: data.market?.score ?? null, regime: data.market?.regime ?? 'NORMAL', coverage: data.market?.coverage ?? 0 }}
          onClose={() => setOpen(null)}
          onTrack={(n, prem) => track(open, n, prem)}
        />
      )}
    </div>
  );
}
