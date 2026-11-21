'use client';
import Term from '@/components/ui/Term';
import { DetailedOnly } from '@/components/crash/ViewMode';
import { useMemo, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { IV_SHOCKS, PRICE_SHOCKS } from '@/lib/crash/config';
import type { HuntRow } from '@/lib/crash/hunter';
import { runScenarios } from '@/lib/crash/scenarios';
import { sizePosition, type RiskBudget } from '@/lib/crash/sizing';
import { EstimateNote, LabelBadge, Meter, SectionTitle, TONE_TEXT, fmtDate, fmtEt, pctFmt, qualityTone, scoreTone, usd } from './ui';

type EntryMode = 'ask' | 'mid' | 'custom';

function cellTone(pnlPct: number): string {
  if (pnlPct >= 1) return 'bg-tv-green/25 text-tv-green';
  if (pnlPct >= 0) return 'bg-tv-green/10 text-tv-green';
  if (pnlPct > -0.5) return 'bg-tv-amber/10 text-tv-amber';
  return 'bg-tv-red/10 text-tv-red';
}

export default function ContractDetail({
  row,
  S,
  riskFree,
  dividendYield,
  budget,
  onClose,
  onTrack,
  market,
}: {
  market: { score: number | null; regime: string; coverage: number };
  row: HuntRow;
  S: number;
  riskFree: number;
  dividendYield: number;
  budget: RiskBudget;
  onClose: () => void;
  onTrack: (contracts: number, premium: number) => void;
}) {
  const { ev, setup } = row;
  const c = ev.contract;
  const [entryMode, setEntryMode] = useState<EntryMode>('ask');
  const [custom, setCustom] = useState<string>(ev.mid?.toFixed(2) ?? '');
  const [holdDays, setHoldDays] = useState<number>(Math.min(21, Math.round(c.dte / 2)));
  const [contracts, setContracts] = useState<number>(1);

  const entry = entryMode === 'ask' ? c.ask ?? 0 : entryMode === 'mid' ? ev.mid ?? 0 : Number(custom) || 0;
  const scen = useMemo(() => {
    if (!(entry > 0) || c.iv == null) return null;
    return runScenarios({ type: 'put', S, K: c.strike, dte: c.dte, entry, mid: ev.mid, iv: c.iv, r: riskFree, q: dividendYield, smile: row.smile, holdDays, steps: 120 }, PRICE_SHOCKS, IV_SHOCKS);
  }, [entry, c.iv, c.strike, c.dte, S, ev.mid, riskFree, dividendYield, row.smile, holdDays]);
  const size = sizePosition(entry, budget, contracts);

  const greeks = [
    { k: 'Delta', v: c.delta?.toFixed(3), help: `If ${c.underlying} falls $1, this put gains about ${usd(Math.abs(c.delta ?? 0) * 100)} per contract. ${ev.moneyness ?? ''}.` },
    { k: 'Gamma', v: c.gamma?.toFixed(4), help: 'How fast delta grows as the price nears the strike. High gamma close to expiry also means fast losses if the move does not come.' },
    { k: 'Theta', v: ev.thetaDollarsPerDay != null ? `${usd(ev.thetaDollarsPerDay)}/day` : '—', help: `The cost of waiting: about ${pctFmt(ev.thetaPctPerDay)} of the premium per day, and it speeds up near expiry.` },
    { k: 'Vega', v: c.vega?.toFixed(3), help: `If implied volatility rises 5 points, about +${usd(ev.vegaGain5)}; 10 points, about +${usd(ev.vegaGain10)} per contract, other things equal.` },
    { k: 'IV', v: pctFmt(c.iv), help: ev.ivVsRealized != null ? `${ev.ivVsRealized.toFixed(2)}× the last 20 days' realized move. Below ~1.2× means protection is not priced richly.` : 'No realized-volatility comparison available.' },
    { k: 'Skew', v: ev.skewPts != null ? `${ev.skewPts >= 0 ? '+' : ''}${ev.skewPts.toFixed(1)} pts` : '—', help: 'This put’s IV minus the at-the-money put at the same expiry. A large premium means downside protection is already expensive.' },
  ];

  const grid = scen?.hold ?? [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Contract detail">
      <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative h-full w-full max-w-3xl overflow-y-auto bg-[#0B0E16] border-l border-tv-border p-4 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white font-mono">
                {c.underlying} {c.strike} put · {fmtDate(c.expiration)}
              </h2>
              <LabelBadge label={setup.label} />
            </div>
            <p className="text-xs text-tv-muted mt-1">
              {c.dte} days to expiry · {c.symbol} · {c.source}, Greeks {c.greeksUpdatedAt ? fmtEt(c.greeksUpdatedAt) : 'time unknown'}
            </p>
          </div>
          <button className="p-1 text-gray-400 hover:text-white" onClick={onClose} aria-label="Close detail">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card !p-3"><div className="label"><Term k="bidask">Bid / Ask</Term></div><div className="value">{usd(c.bid)} / {usd(c.ask)}</div><div className="text-[11px] text-tv-muted">Mid {usd(ev.mid)} (not a guaranteed fill)</div></div>
          <div className="card !p-3"><div className="label">Cost per contract</div><div className="value">{usd(ev.costAtAsk)}</div><div className="text-[11px] text-tv-muted">at the ask, before fees</div></div>
          <div className="card !p-3"><div className="label"><Term k="breakeven">Breakeven at expiry</Term></div><div className="value">{usd(ev.breakevenAtAsk)}</div><div className="text-[11px] text-tv-muted">{pctFmt(ev.declineToBreakeven)} below {usd(S)}</div></div>
          <div className="card !p-3"><div className="label">Max loss</div><div className="value text-tv-red">{usd(ev.costAtAsk)}</div><div className="text-[11px] text-tv-muted">if it expires worthless</div></div>
        </div>

        <div className="rounded-xl border border-tv-border bg-white/[0.02] p-3 text-xs text-gray-300 leading-relaxed">
          In plain English: this put costs {usd(c.ask)} per share, so one contract (100 shares) costs {usd(ev.costAtAsk)} plus fees if you buy at the ask. That
          {' '}{usd(ev.costAtAsk)} is the most you can lose. At expiration it only pays off if {c.underlying} is below {usd(ev.breakevenAtAsk)} (the {c.strike} strike minus the
          premium), a fall of {pctFmt(ev.declineToBreakeven)}
          {ev.sigmasToBreakeven != null ? `, which is about ${ev.sigmasToBreakeven.toFixed(1)} times the move the option market expects by then` : ''}. Before expiry its value also
          depends on time left and implied volatility, so the scenarios below are not the same as the expiration payoff.
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card">
            <div className="label"><Term k="riskScore">Market risk</Term></div>
            <div className={`font-mono text-2xl font-black ${TONE_TEXT[scoreTone(market.score)]}`}>{market.score == null ? '—' : Math.round(market.score)}</div>
            <div className="text-[11px] text-tv-muted">{market.regime} · coverage {pctFmt(market.coverage, 0)}</div>
          </div>
          <div className="card">
            <div className="label"><Term k="quality">Contract quality</Term></div>
            <div className={`font-mono text-2xl font-black ${TONE_TEXT[qualityTone(ev.quality)]}`}>{ev.quality ?? '—'}</div>
          </div>
          <div className="card">
            <div className="label"><Term k="setup">Trade setup</Term></div>
            <div className={`font-mono text-2xl font-black ${TONE_TEXT[qualityTone(setup.setup)]}`}>{setup.setup ?? '—'}</div>
          </div>
        </div>
        <p className="text-[11px] text-tv-muted -mt-3">Three separate evaluations. None of them is a probability of winning.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card">
            <h3 className="text-sm font-bold text-white mb-1">Why {setup.label}</h3>
            <ul className="space-y-1">{setup.why.map((w) => <li key={w} className="text-xs text-gray-300">· {w}</li>)}</ul>
          </div>
          <div className="card">
            <h3 className="text-sm font-bold text-white mb-1">Risks</h3>
            <ul className="space-y-1">{setup.risks.map((w) => <li key={w} className="text-xs text-gray-300">· {w}</li>)}</ul>
          </div>
        </div>

        <div className="card">
          <SectionTitle title="Greeks, explained" />
          <div className="grid gap-2 sm:grid-cols-2">
            {greeks.map((g) => (
              <div key={g.k} className="rounded-lg bg-white/[0.03] p-2">
                <div className="flex justify-between text-xs"><span className="text-gray-300">{g.k}</span><span className="font-mono text-white">{g.v ?? '—'}</span></div>
                <p className="text-[11px] text-tv-muted mt-0.5">{g.help}</p>
              </div>
            ))}
          </div>
        </div>

        <DetailedOnly>
        <div className="card">
          <SectionTitle title="Quality breakdown" />
          <div className="space-y-2">
            {ev.components.map((p) => (
              <div key={p.id} className="grid grid-cols-12 gap-2 items-center text-xs">
                <span className="col-span-5 text-gray-300">{p.label} <span className="text-tv-muted">({p.weight})</span></span>
                <span className="col-span-3"><Meter value={p.score} tone={qualityTone(p.score == null ? null : p.score * 100)} /></span>
                <span className="col-span-4 text-[11px] text-tv-muted">{p.detail}</span>
              </div>
            ))}
          </div>
        </div>

        </DetailedOnly>

        <div className="card space-y-3">
          <SectionTitle title="Scenarios" subtitle={`Estimated value after ${holdDays} days (${scen ? scen.daysRemainingAtHold : '—'} days left), American binomial model`} />
          <div className="flex flex-wrap gap-3 items-end text-xs">
            <label className="space-y-1">
              <span className="label block">Entry price</span>
              <select className="input text-xs" value={entryMode} onChange={(e) => setEntryMode(e.target.value as EntryMode)}>
                <option value="ask">Buy at ask {usd(c.ask)}</option>
                <option value="mid">Buy at mid {usd(ev.mid)} (may not fill)</option>
                <option value="custom">Limit price…</option>
              </select>
            </label>
            {entryMode === 'custom' && (
              <label className="space-y-1">
                <span className="label block">Limit $/share</span>
                <input className="input text-xs w-24" value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" />
              </label>
            )}
            <label className="space-y-1">
              <span className="label block">Days held</span>
              <input type="range" min={0} max={Math.max(0, c.dte - 1)} value={holdDays} onChange={(e) => setHoldDays(Number(e.target.value))} />
              <span className="text-gray-300 ml-2">{holdDays}d</span>
            </label>
          </div>
          {!scen ? (
            <p className="text-xs text-tv-muted">Scenarios need a positive entry price and the contract&apos;s IV.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="text-tv-muted">
                      <th className="text-left py-1 pr-2 font-sans">Price move ↓ / IV change →</th>
                      {IV_SHOCKS.map((v) => <th key={v} className="py-1 px-1 text-right">{v > 0 ? `+${v}` : v} pts</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PRICE_SHOCKS.map((ps) => (
                      <tr key={ps} className="border-t border-white/[0.04]">
                        <td className="py-1 pr-2 text-gray-300 font-sans">{ps === 0 ? 'Unchanged' : `${ps > 0 ? '+' : ''}${(ps * 100).toFixed(0)}% (${usd(S * (1 + ps), 0)})`}</td>
                        {IV_SHOCKS.map((vs) => {
                          const cell = grid.find((x) => x.priceShock === ps && x.ivShock === vs)!;
                          return (
                            <td key={vs} className={`py-1 px-1 text-right rounded ${cellTone(cell.pnlPct)}`} title={`Value ${usd(cell.value * 100)} · IV used ${pctFmt(cell.ivUsed)}`}>
                              {usd(cell.pnl, 0)}
                              <div className="text-[10px] opacity-80">{pctFmt(cell.pnlPct, 0, true)}</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="label mb-1">At expiration (intrinsic value only)</div>
                <div className="flex flex-wrap gap-1.5">
                  {scen.expiry.map((x) => (
                    <span key={x.priceShock} className={`rounded px-2 py-1 text-[11px] font-mono ${cellTone(x.pnlPct)}`}>
                      {x.priceShock === 0 ? 'flat' : `${x.priceShock > 0 ? '+' : ''}${(x.priceShock * 100).toFixed(0)}%`}: {usd(x.pnl, 0)}
                    </span>
                  ))}
                </div>
              </div>
              <EstimateNote>
                Estimates per contract, before fees. Model IV {pctFmt(scen.baseIv)} ({scen.ivSource === 'mid-implied' ? 'backed out of the mid' : 'vendor IV'}), skew model {scen.skewModel}, rate {pctFmt(riskFree, 2)},
                dividend yield {pctFmt(dividendYield)} (estimate). The model treats dividends as a continuous yield and volatility as constant, and cannot see liquidity, so real prices
                will differ. Being right on direction is not enough: compare the flat and IV −10 columns.
              </EstimateNote>
            </>
          )}
        </div>

        <div className="card space-y-2">
          <SectionTitle title="Position size and risk" subtitle={`Account ${usd(budget.accountEquity, 0)} · max ${usd(budget.maxRiskPerTrade, 0)} per idea · ${usd(budget.feePerContract)} fee per contract`} />
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label className="space-y-1">
              <span className="label block">Contracts</span>
              <input className="input text-xs w-20" type="number" min={1} value={contracts} onChange={(e) => setContracts(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
            </label>
            <div><div className="label">Cost / contract</div><div className="value">{usd(size.costPerContract)}</div></div>
            <div><div className="label">Fits your budget</div><div className="value">{size.affordable}</div></div>
            <div><div className="label">Premium at risk</div><div className="value text-tv-red">{usd(size.premiumAtRisk)}</div></div>
            <div><div className="label">% of account</div><div className="value">{pctFmt(size.pctOfEquity)}</div></div>
          </div>
          {size.warnings.map((w) => <p key={w} className="text-xs text-tv-amber">{w}</p>)}
          <p className="text-[11px] text-tv-muted">Only risk money you can afford to lose entirely. Cheap premiums are not a reason to buy more contracts. Tradevi never places orders.</p>
          <button className="btn text-xs inline-flex items-center gap-1.5" onClick={() => onTrack(contracts, entry)}>
            <Plus size={14} /> Add to exposure tracker
          </button>
        </div>
      </div>
    </div>
  );
}
