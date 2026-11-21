/**
 * Live put Setups: today's market checked against entry rules whose
 * thresholds come from the historical replay, each shown with its track
 * record. Puts only. Research flags, not recommendations: a firing setup
 * means "this rule's conditions are present today", and the evidence beside
 * it says how often that rule preceded a decline and how its theoretical
 * trades did in and out of sample.
 *
 * Score thresholds are taken from the most recent walk-forward fold, so they
 * were chosen using only history before the latest test window.
 */
import { LEAPS_FILTERS, LONG_TERM_FILTERS, SHORT_TERM_FILTERS, type ScreenFilters } from '../config';
import { huntPuts, type HuntResult } from '../hunter';
import { buildDataset } from '../providers/dataset';
import { buildMarketView } from '../market';
import { DEFAULT_DECLINE } from './events';
import { THEORETICAL_MODEL } from './theoretical';
import { theoreticalPricer, theoreticalSnapshot } from './pricers';
import { DEFAULT_EVAL, evaluateSignal, isOn, ruleLabel, splitEvaluate, walkForward, type SignalRule, type SignalStats } from './signals';
import { DEFAULT_LAB, STRATEGIES, runStrategy, type PeriodStats, type StrategyDef } from './strategies';
import { scoreDate } from './timeline';
import { eventsFor, getHistory } from './service';

export interface SetupDef {
  id: string;
  name: string;
  horizon: 'Short term (14–60 DTE)' | 'Long term (60–120 DTE)' | 'LEAPS (120+ DTE)';
  strategy: StrategyDef['id'];
  filters: ScreenFilters;
  about: string;
}

export const LIVE_SETUPS: SetupDef[] = [
  { id: 'early-long', name: 'Early warning, long-dated puts', horizon: 'Long term (60–120 DTE)', strategy: 'F', filters: { ...LONG_TERM_FILTERS, maxPremium: 5, minAbsDelta: 0.15, maxAbsDelta: 0.35 }, about: 'Several independent categories deteriorating while volatility is still subdued. Time for the thesis, protection not yet repriced.' },
  { id: 'early-leaps', name: 'Early warning, LEAPS', horizon: 'LEAPS (120+ DTE)', strategy: 'F', filters: { ...LEAPS_FILTERS, maxDte: 400 }, about: 'Same early-warning conditions with the most time. Costs more and moves less per point.' },
  { id: 'elevated-short', name: 'Elevated risk, cheap short-dated puts', horizon: 'Short term (14–60 DTE)', strategy: 'A', filters: SHORT_TERM_FILTERS, about: 'Risk score at or above its replay-validated threshold; low-premium puts. High chance of expiring worthless.' },
  { id: 'elevated-long', name: 'Elevated risk, longer-dated puts', horizon: 'Long term (60–120 DTE)', strategy: 'C', filters: { ...LONG_TERM_FILTERS, maxPremium: 15, minAbsDelta: 0.2, maxAbsDelta: 0.35 }, about: 'Risk score at or above its replay-validated threshold; more time and more capital.' },
  { id: 'breakdown-short', name: 'Breakdown confirmed, short-dated puts', horizon: 'Short term (14–60 DTE)', strategy: 'E', filters: { ...SHORT_TERM_FILTERS, maxPremium: 5, minDte: 21 }, about: 'Price structure has broken; later and more expensive than an early entry, with less false-alarm risk.' },
];

export interface SetupEvidence {
  rule: string;
  thresholdSource: string;
  signal: SignalStats;
  inSample: SignalStats;
  outOfSample: SignalStats;
  walkForward: { declines: number; warned: number; falseAlarms: number; hitRate: number | null } | null;
  theoretical: { all: PeriodStats; inSample: PeriodStats; outOfSample: PeriodStats; label: 'THEORETICAL' } | null;
  splitDate: string;
}

export interface LiveSetup {
  def: SetupDef;
  rule: SignalRule;
  firing: boolean;
  today: { date: string; score: number | null; regime: string; insufficient: boolean };
  distance: string;
  evidence: SetupEvidence | null;
  contracts: HuntResult['rows'];
  hunt: Pick<HuntResult, 'source' | 'error' | 'noTradeReason' | 'scanned' | 'passing' | 'fetchedAt'> | null;
}

const SPLIT = '2016-01-01';
let evidenceCache: { at: number; p: Promise<Map<string, { rule: SignalRule; ev: SetupEvidence }>> } | null = null;

async function buildEvidence(): Promise<Map<string, { rule: SignalRule; ev: SetupEvidence }>> {
  const h = await getHistory();
  const events = eventsFor(h, DEFAULT_DECLINE);
  const wf = walkForward(h.timeline, events, { candidates: [25, 30, 35, 40, 45, 50, 55, 60], trainYears: 6, testYears: 2, defaultMin: 40 });
  const lastFold = wf.folds[wf.folds.length - 1];
  const validatedMin = lastFold ? lastFold.chosenMin : 40;
  const out = new Map<string, { rule: SignalRule; ev: SetupEvidence }>();
  const labCache = new Map<string, ReturnType<typeof runStrategy>>();
  for (const s of LIVE_SETUPS) {
    const base = STRATEGIES.find((x) => x.id === s.strategy)!;
    const rule: SignalRule = base.entry.kind === 'score' ? { kind: 'score', min: validatedMin } : base.entry;
    const rep = evaluateSignal(h.timeline, events, rule, DEFAULT_EVAL);
    const split = splitEvaluate(h.timeline, events, rule, SPLIT, DEFAULT_EVAL);
    const key = `${s.strategy}|${JSON.stringify(s.filters)}`;
    let lab = labCache.get(key);
    if (!lab) {
      lab = runStrategy({
        def: { ...base, entry: rule, filters: s.filters },
        settings: { ...DEFAULT_LAB, to: h.sessions[h.sessions.length - 1] ?? DEFAULT_LAB.to, splitDate: SPLIT },
        data: h.data,
        timeline: h.timeline,
        events,
        sessions: h.sessions,
        chain: (sym, date, a, b) => theoreticalSnapshot(h.data, sym, date, a, b, THEORETICAL_MODEL),
        pricer: (_snap, ev) => theoreticalPricer(h.data, 'SPY', ev.contract.strike, ev.contract.expiration, THEORETICAL_MODEL),
      });
      labCache.set(key, lab);
    }
    out.set(s.id, {
      rule,
      ev: {
        rule: ruleLabel(rule),
        thresholdSource: rule.kind === 'score' ? (lastFold ? `Walk-forward: chosen on ${lastFold.trainFrom.slice(0, 4)}–${lastFold.trainTo.slice(0, 4)} only${lastFold.defaulted ? ' (no decline in that window, default kept)' : ''}` : 'Default (not enough history for walk-forward)') : 'Regime rule (no fitted threshold)',
        signal: rep.stats,
        inSample: split.inSample,
        outOfSample: split.outOfSample,
        walkForward: rule.kind === 'score' ? wf.combined : null,
        theoretical: lab.stats.trades ? { all: lab.stats, inSample: lab.inSample, outOfSample: lab.outOfSample, label: 'THEORETICAL' } : null,
        splitDate: SPLIT,
      },
    });
  }
  return out;
}

export function setupEvidence(): Promise<Map<string, { rule: SignalRule; ev: SetupEvidence }>> {
  if (evidenceCache && Date.now() - evidenceCache.at < 6 * 3600_000) return evidenceCache.p;
  const p = buildEvidence();
  evidenceCache = { at: Date.now(), p };
  p.catch(() => {
    if (evidenceCache?.p === p) evidenceCache = null;
  });
  return p;
}

export interface LiveSetupsResult {
  market: { score: number | null; regime: string; insufficient: boolean; asOf: string; why: string[] };
  setups: LiveSetup[];
  evidenceError?: string;
}

export async function liveSetups(symbol: string, evidenceWaitMs = 240_000): Promise<LiveSetupsResult> {
  const live = await buildDataset({ scope: 'live' });
  const market = await buildMarketView(live);
  const today = scoreDate(live, market.score.asOf);
  let evidence: Map<string, { rule: SignalRule; ev: SetupEvidence }> | null = null;
  let evidenceError: string | undefined;
  try {
    // The first build replays the whole history; don't let it time the request out.
    evidence = await Promise.race([setupEvidence(), new Promise<null>((r) => setTimeout(() => r(null), evidenceWaitMs))]);
    if (!evidence) evidenceError = 'The historical evidence is still being computed. Reload in a minute.';
  } catch (e) {
    evidenceError = e instanceof Error ? e.message : String(e);
  }
  const setups: LiveSetup[] = [];
  const huntCache = new Map<string, HuntResult>();
  for (const def of LIVE_SETUPS) {
    const base = STRATEGIES.find((x) => x.id === def.strategy)!;
    const rule = evidence?.get(def.id)?.rule ?? base.entry;
    const firing = isOn(today, rule);
    const distance =
      rule.kind === 'score'
        ? today.score == null
          ? 'Score unavailable'
          : `Score ${Math.round(today.score)} vs threshold ${rule.min}`
        : `Regime is ${today.insufficient ? 'INSUFFICIENT DATA' : today.regime}; needs ${rule.regimes.join(' or ')}`;
    let hunt: HuntResult | null = null;
    if (firing) {
      const key = JSON.stringify(def.filters);
      hunt = huntCache.get(key) ?? (await huntPuts({ symbol, filters: def.filters, market, data: live, catalysts: market.catalysts }));
      huntCache.set(key, hunt);
    }
    setups.push({
      def,
      rule,
      firing,
      today: { date: today.date, score: today.score, regime: today.regime, insufficient: today.insufficient },
      distance,
      evidence: evidence?.get(def.id)?.ev ?? null,
      contracts: hunt ? hunt.rows.filter((r) => r.setup.label === 'STRONG WATCH' || r.setup.label === 'WATCH').slice(0, 5) : [],
      hunt: hunt ? { source: hunt.source, error: hunt.error, noTradeReason: hunt.noTradeReason, scanned: hunt.scanned, passing: hunt.passing, fetchedAt: hunt.fetchedAt } : null,
    });
  }
  return {
    market: { score: market.score.score, regime: market.regime.regime, insufficient: market.regime.insufficient, asOf: market.score.asOf, why: market.regime.why },
    setups,
    evidenceError,
  };
}
