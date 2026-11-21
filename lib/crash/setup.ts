/**
 * Trade Setup score (0–100) and the final label for one put.
 *
 * Three separate evaluations are shown side by side and never merged:
 * Market Risk (is the environment dangerous?), Contract Quality (is this a
 * well-built contract?) and Trade Setup (does this contract fit this
 * environment right now?). None of them is a probability of winning.
 */
import type { EvaluatedContract } from './contracts';
import type { Regime, RegimeFacts } from './regime';
import type { ScenarioResult } from './scenarios';

export type SetupLabel = 'STRONG WATCH' | 'WATCH' | 'WAIT' | 'AVOID' | 'LATE ENTRY';

export const LABEL_ORDER: SetupLabel[] = ['STRONG WATCH', 'WATCH', 'WAIT', 'LATE ENTRY', 'AVOID'];

/** How well a regime suits buying puts as an early entry (0–1). */
export const REGIME_FIT: Record<Regime, number> = {
  NORMAL: 0.1,
  'EARLY WARNING': 0.5,
  'ELEVATED RISK': 0.65,
  'PRE-CRASH WATCH': 1,
  'BREAKDOWN CONFIRMED': 0.75,
  'VOLATILITY EXPANSION': 0.45,
  'PANIC / LATE ENTRY': 0.1,
};

export interface SetupInput {
  marketScore: number | null;
  regime: Regime;
  facts: RegimeFacts;
  ev: EvaluatedContract;
  scenario?: ScenarioResult | null;
  /** High-impact scheduled events before this contract expires. */
  catalystsBeforeExpiry: number;
}

export interface SetupResult {
  setup: number | null;
  label: SetupLabel;
  why: string[];
  risks: string[];
  parts: { id: string; label: string; weight: number; score: number | null }[];
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Model P/L % for a −10% move with IV +5 points at the hold date (a "plausible stress" cell). */
export function stressReturn(s: ScenarioResult | null | undefined): number | null {
  if (!s) return null;
  const c = s.hold.find((x) => Math.abs(x.priceShock + 0.1) < 1e-9 && x.ivShock === 5);
  return c ? c.pnlPct : null;
}

export function evaluateSetup(inp: SetupInput): SetupResult {
  const { ev, facts, regime } = inp;
  const volCheap =
    facts.vixPercentile == null && ev.ivVsRealized == null
      ? null
      : clamp(
          (facts.vixPercentile != null ? 1 - facts.vixPercentile : 0.5) * 0.5 +
            (ev.ivVsRealized != null ? clamp((2 - ev.ivVsRealized) / 0.9) : 0.5) * 0.5,
        );
  const stress = stressReturn(inp.scenario);
  const parts = [
    { id: 'market', label: 'Market risk', weight: 30, score: inp.marketScore == null ? null : clamp(inp.marketScore / 70) },
    { id: 'regime', label: 'Regime fit', weight: 20, score: REGIME_FIT[regime] },
    { id: 'vol', label: 'Volatility still cheap', weight: 15, score: volCheap },
    { id: 'quality', label: 'Contract quality', weight: 25, score: ev.quality == null ? null : ev.quality / 100 },
    { id: 'catalyst', label: 'Catalyst before expiry', weight: 5, score: clamp(inp.catalystsBeforeExpiry / 2) },
    { id: 'payoff', label: 'Modeled stress payoff', weight: 5, score: stress == null ? null : clamp(stress / 3) },
  ];
  const avail = parts.filter((p) => p.score != null);
  const w = avail.reduce((s, p) => s + p.weight, 0);
  const setup = w ? Math.round((100 * avail.reduce((s, p) => s + p.weight * (p.score as number), 0)) / w) : null;

  const why: string[] = [];
  const risks: string[] = ['The contract can expire worthless; the whole premium is at risk.'];
  if (inp.marketScore != null) why.push(`Market risk score ${Math.round(inp.marketScore)}.`);
  why.push(`Regime: ${regime}.`);
  if (facts.deteriorating.length) why.push(`Deteriorating: ${facts.deteriorating.join(', ')}.`);
  if (facts.subduedVol) why.push(`Volatility is still subdued (VIX ${facts.vix?.toFixed(1) ?? '—'}).`);
  if (ev.quality != null) why.push(`Contract quality ${ev.quality}.`);
  if (ev.thetaPctPerDay != null && ev.thetaPctPerDay <= 0.03) why.push(`Theta is manageable: ${(ev.thetaPctPerDay * 100).toFixed(1)}% of premium a day.`);
  if (ev.sigmasToBreakeven != null && ev.sigmasToBreakeven <= 1.5) why.push(`Breakeven needs a ${((ev.declineToBreakeven ?? 0) * 100).toFixed(1)}% fall, about ${ev.sigmasToBreakeven.toFixed(1)} standard moves.`);
  if (stress != null) why.push(`Model estimate if the underlying falls 10% and IV rises 5 points by the hold date: ${stress >= 0 ? '+' : ''}${Math.round(stress * 100)}%.`);

  if (regime === 'NORMAL' || regime === 'EARLY WARNING') risks.push('No confirmed market breakdown.');
  if (facts.subduedVol) risks.push('Volatility may stay subdued and premiums may bleed.');
  risks.push('The underlying may keep rising.');
  if (ev.sigmasToBreakeven != null && ev.sigmasToBreakeven > 2) risks.push(`Breakeven is ${ev.sigmasToBreakeven.toFixed(1)} standard moves away.`);
  for (const f of ev.flags) risks.push(f + '.');

  let label: SetupLabel;
  const lateVol = (facts.vixPercentile != null && facts.vixPercentile >= 0.9) || (ev.ivVsRealized != null && ev.ivVsRealized >= 1.8 && facts.vix != null && facts.vix >= 25);
  if (!ev.passes || ev.quality == null || ev.quality < 40) {
    label = 'AVOID';
    if (!ev.passes) risks.unshift(...ev.rejections.map((r) => r + '.'));
    else risks.unshift('Contract quality is poor.');
  } else if (regime === 'PANIC / LATE ENTRY' || (regime === 'VOLATILITY EXPANSION' && lateVol)) {
    label = 'LATE ENTRY';
    risks.unshift('Protection is already expensive; the early opportunity may have passed.');
  } else if (setup != null && setup >= 70 && ev.quality >= 60) label = 'STRONG WATCH';
  else if (setup != null && setup >= 55) label = 'WATCH';
  else if (setup != null && setup >= 35) label = 'WAIT';
  else label = 'AVOID';

  return { setup, label, why, risks, parts };
}
