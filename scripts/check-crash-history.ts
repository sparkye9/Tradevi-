/**
 * Historical Crash Simulator checks: decline detection, no look-ahead in the
 * reconstructed timeline, signal lead times / false alarms / walk-forward,
 * the theoretical reconstruction, the trade engine's fills and exits, the
 * options importer's validation and run reproducibility.
 * Synthetic series only — never presented as market data.
 */
import type { Bar, LevelSeries, MarketDataset } from '../lib/crash/series';
import { detectDeclines, RESEARCH_WINDOWS } from '../lib/crash/history/events';
import { buildTimeline, scoreDate, type TimelinePoint } from '../lib/crash/history/timeline';
import { evaluateSignal, walkForward, splitEvaluate, DEFAULT_EVAL } from '../lib/crash/history/signals';
import { monthlyExpirations, theoreticalChain, theoreticalContext, thirdFriday, THEORETICAL_MODEL } from '../lib/crash/history/theoretical';
import { historicalHunt } from '../lib/crash/history/funnel';
import { simulateTrade, DEFAULT_EXITS, type ContractPricer, type Quote } from '../lib/crash/history/trade';
import { detectFormat, normalizeRows, parseCsv, validateRows, occSymbol, parseOcc } from '../lib/crash/history/optionsImport';
import { compareManifests, makeManifest, validateDataset } from '../lib/crash/history/manifest';
import { STRATEGIES, DEFAULT_LAB, runStrategy } from '../lib/crash/history/strategies';
import { theoreticalPricer, theoreticalSnapshot } from '../lib/crash/history/pricers';
import { RESEARCH_SHORT_FILTERS as SHORT_TERM_FILTERS } from '../lib/crash/config';
import { classifyRegime, regimeFacts } from '../lib/crash/regime';
import { computeRiskScore } from '../lib/crash/riskScore';

type Check = (name: string, cond: boolean) => void;

function sessionsFrom(start: string, n: number): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T12:00:00Z`);
  while (out.length < n) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

export function runSection(check: Check) {
  const near = (a: number, b: number, e: number) => Math.abs(a - b) <= e;
  const D = sessionsFrom('2006-01-02', 1400);
  // Up 300 sessions, −15% over 40, recover to a new high, then −30% over 60, recover.
  const path = (i: number) => {
    if (i < 300) return 100 + i * 0.05;
    if (i < 340) return 115 * (1 - ((i - 300) / 40) * 0.15);
    if (i < 500) return 97.75 + ((i - 340) / 160) * 22;
    if (i < 800) return 119.75 + (i - 500) * 0.02;
    if (i < 860) return 125.75 * (1 - ((i - 800) / 60) * 0.3);
    return 88 + (i - 860) * 0.08;
  };
  const bars: Bar[] = D.map((date, i) => ({ date, open: path(i), high: path(i), low: path(i), close: path(i), volume: 1e6 }));

  // ── Declines ──
  const e10 = detectDeclines(bars, { threshold: 0.1, highWindow: 252 });
  const e20 = detectDeclines(bars, { threshold: 0.2, highWindow: 252 });
  check('10% definition finds both declines', e10.length === 2);
  check('20% definition finds only the deep one', e20.length === 1 && e20[0].maxDrawdown > 0.25);
  check('declines do not overlap', e10.every((e, i) => i === 0 || (e10[i - 1].endDate != null && e.crossDate > (e10[i - 1].endDate as string))));
  check('decline crosses after its peak', e10.every((e) => e.peakDate < e.crossDate && e.troughDate >= e.crossDate));
  check('research windows carry no outcome labels except hindsight-marked ones', RESEARCH_WINDOWS.every((w) => w.milestones.every((m) => !/bottom|low/i.test(m.text) || m.hindsight)));

  // ── Point-in-time timeline: scoring date d on full data == on data cut at d ──
  const vix = (i: number) => (i >= 800 && i < 900 ? 38 : 14);
  const lvl = (id: string, f: (i: number) => number, lag = 0): LevelSeries => ({ kind: 'level', meta: { id, label: id, source: 'synthetic', unit: 'x', freshness: lag ? 'Weekly' : 'daily' }, points: D.map((date, i) => ({ date, value: f(i), availableOn: lag ? D[Math.min(D.length - 1, i + lag)] : undefined })) });
  const barsSeries = (id: string, f: (i: number) => number) => ({ kind: 'bars' as const, meta: { id, label: id, source: 'synthetic', unit: '$', freshness: 'daily' }, bars: D.map((date, i) => ({ date, open: f(i), high: f(i), low: f(i), close: f(i), volume: 1e6 })) });
  const data: MarketDataset = {
    errors: [],
    series: {
      SPY: { kind: 'bars', meta: { id: 'SPY', label: 'SPY', source: 'synthetic', unit: '$', freshness: 'daily' }, bars },
      QQQ: barsSeries('QQQ', (i) => path(i) * 2),
      HYG: barsSeries('HYG', (i) => (i < 760 ? 80 : 80 - (i - 760) * 0.05)),
      IEF: barsSeries('IEF', () => 100),
      VIX: lvl('VIX', vix),
      VIX3M: lvl('VIX3M', (i) => vix(i) + 2),
      HY_OAS: lvl('HY_OAS', (i) => (i < 760 ? 3.5 : 3.5 + (i - 760) * 0.03), 1),
      STLFSI: lvl('STLFSI', (i) => (i < 760 ? -0.5 : -0.5 + (i - 760) * 0.02), 6),
      DGS3MO: lvl('DGS3MO', () => 4.5, 1),
      SKEW: lvl('SKEW', () => 125),
    },
  };
  const cut = (d: string): MarketDataset => ({
    errors: [],
    series: Object.fromEntries(Object.entries(data.series).map(([k, s]) => [k, s.kind === 'bars' ? { ...s, bars: s.bars.filter((b) => b.date <= d) } : { ...s, points: s.points.filter((p) => p.date <= d) }])),
  });
  for (const i of [310, 790, 830]) {
    const a = scoreDate(data, D[i]);
    const b = scoreDate(cut(D[i]), D[i]);
    check(`no look-ahead: ${D[i]} scores the same with future data removed`, a.score === b.score && a.regime === b.regime);
  }
  const weeklyVal = (d: MarketDataset, i: number) => computeRiskScore(d, { asOf: D[i] }).indicators.find((x) => x.id === 'financial_stress_index')?.value ?? null;
  check('weekly series not visible before its publication date', weeklyVal(data, 770) === weeklyVal(cut(D[770]), 770));
  const tl = buildTimeline(data, { from: D[260] });
  check('timeline covers every session from its start', tl.length === D.length - 260);
  check('timeline flags insufficient data instead of NORMAL when empty', scoreDate({ errors: [], series: {} }, D[10]).insufficient === true);
  const f830 = regimeFacts(data, D[830], 'close', computeRiskScore(data, { asOf: D[830] }));
  check('replay regime at the crash is a stress regime', ['PANIC / LATE ENTRY', 'VOLATILITY EXPANSION', 'BREAKDOWN CONFIRMED'].includes(classifyRegime(f830, null).regime));

  // ── Signals on a hand-built timeline ──
  const mk = (dates: string[], on: (i: number) => boolean): TimelinePoint[] =>
    dates.map((date, i) => ({ date, score: on(i) ? 60 : 10, categories: { breadth: null, technical: null, volatility: null, credit: null, macro: null }, regime: on(i) ? 'ELEVATED RISK' : 'NORMAL', insufficient: false, spy: null, vix: null }));
  const crossIdx = D.indexOf(e10[1].crossDate);
  // On for 40 sessions ending 10 before the second decline's crossing; a false alarm around session 600; one near the end (pending).
  const htl = mk(D, (i) => (i >= crossIdx - 50 && i < crossIdx - 10) || (i >= 600 && i < 610) || i >= D.length - 5);
  const rep = evaluateSignal(htl, e10, { kind: 'score', min: 40 }, DEFAULT_EVAL);
  const ev2 = rep.events.find((x) => x.event.crossDate === e10[1].crossDate)!;
  check('first warning found before the decline', ev2.firstWarning === D[crossIdx - 50] && ev2.warned);
  check('lead time measured in calendar days', ev2.leadDays != null && ev2.leadDays >= 65 && ev2.leadDays <= 75);
  check('checkpoint 30 days before shows the signal on', ev2.checkpoints.find((c) => c.daysBefore === 30)!.on === true);
  check('checkpoint 1 day before shows it off again', ev2.checkpoints.find((c) => c.daysBefore === 1)!.on === false);
  check('first decline (no warning) counted as missed', rep.stats.missed === 1 && rep.stats.warned === 1);
  check('isolated warning counted as a false alarm', rep.episodes.some((e) => e.start === D[600] && e.outcome === 'false alarm'));
  check('warning near the end of data is pending, not a false alarm', rep.episodes.some((e) => e.outcome === 'pending'));
  const sp = splitEvaluate(htl, e10, { kind: 'score', min: 40 }, D[700]);
  check('split: in-sample and out-of-sample count declines separately', sp.inSample.declines === 1 && sp.outOfSample.declines === 1);
  const wf = walkForward(htl, e10, { candidates: [30, 50, 70], trainYears: 2, testYears: 1, defaultMin: 40 });
  check('walk-forward test windows follow their training windows', wf.folds.length > 0 && wf.folds.every((f) => f.testFrom > f.trainTo));
  check('walk-forward test windows do not overlap', wf.folds.every((f, i) => i === 0 || f.testFrom > wf.folds[i - 1].testFrom));
  check('walk-forward keeps the default threshold when training has no decline', wf.folds.filter((f) => f.defaulted).every((f) => f.chosenMin === 40));

  // ── Theoretical reconstruction ──
  check('third Friday of March 2008 is the 21st', thirdFriday(2008, 2) === '2008-03-21');
  check('monthly expirations in 14–60 DTE', monthlyExpirations('2008-01-02', 14, 60).join(',') === '2008-01-18,2008-02-15');
  const ctx = theoreticalContext(data, 'SPY', D[790]);
  check('theoretical context builds from data on that date', !('error' in ctx));
  if (!('error' in ctx)) {
    const chain = theoreticalChain(ctx, 14, 60);
    check('theoretical contracts are labelled and have no OI/volume', chain.length > 20 && chain.every((c) => c.symbol.startsWith('THEO:') && c.source === 'THEORETICAL' && c.openInterest == null && c.volume == null));
    const one = chain.filter((c) => c.expiration === chain[0].expiration);
    const deep = one[0];
    const nearAtm = one[one.length - 1];
    check('model skew: further OTM strikes carry higher IV', (deep.iv ?? 0) > (nearAtm.iv ?? 0));
    check('pre-penny-pilot ticks ($0.05 under $3) in 2009', ctx.tick(1) === (D[790] >= THEORETICAL_MODEL.pennyPilotFrom ? 0.01 : 0.05));
    const ctxOld = theoreticalContext(data, 'SPY', D[100]);
    check('2006 quotes use $0.05 ticks', !('error' in ctxOld) && ctxOld.tick(1) === 0.05);
    const regimeNow = classifyRegime(regimeFacts(data, D[790], 'close', computeRiskScore(data, { asOf: D[790] })), null);
    const fun = historicalHunt({ kind: 'theoretical', date: D[790], symbol: 'SPY', contracts: chain, S: ctx.S, realizedVol20: 0.12, r: ctx.r, q: ctx.q, filters: SHORT_TERM_FILTERS, market: { score: 50, regime: regimeNow.regime, facts: regimeNow.facts }, catalystsBefore: () => 0 });
    if (process.env.DEBUG_CRASH) console.log('funnel', fun.stages.map((s) => s.count), Object.keys(fun.rejectionCounts).slice(0, 5));
    check('funnel stages never grow', fun.stages.every((s, i) => i === 0 || s.count <= fun.stages[i - 1].count));
    check('funnel says which checks it could not apply', fun.unchecked.includes('Open interest'));
    check('theoretical funnel never claims best liquidity', fun.picks.bestLiquidity === null);
  }
  check('no theoretical chain without a volatility index', 'error' in theoreticalContext({ errors: [], series: { SPY: data.series.SPY } }, 'SPY', D[790]));

  // ── Trade engine with a scripted pricer ──
  const T = sessionsFrom('2008-01-02', 40);
  const scripted = (mids: number[], spread = 0.02, S0 = 100): ContractPricer => ({
    kind: 'theoretical',
    symbol: 'SPY',
    strike: 95,
    expiration: T[30],
    quote: (d: string): Quote | null => {
      const i = T.indexOf(d);
      if (i < 0 || i >= mids.length) return null;
      return { date: d, S: S0 - i, bid: Math.max(0, mids[i] - spread / 2), ask: mids[i] + spread / 2, mid: mids[i], iv: 0.2 };
    },
  });
  const up = scripted([1, 1.2, 1.5, 2.2, 4.5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
  const t1 = simulateTrade({ pricer: up, sessions: T, entry: { method: 'ask' }, exitFill: 'bid', contracts: 2, feePerContract: 0.65, exits: { ...DEFAULT_EXITS, profitTarget: 2 } });
  check('buy at ask fills at the ask', t1.filled && near(t1.entryPremium!, 1.01, 1e-9));
  check('profit target exits at the first close past it', t1.exitReason === 'profit target' && t1.exitDate === T[4]);
  check('a jump past the target is flagged as a gap-through fill', t1.gapThrough === true);
  check('fees counted on entry and exit', near(t1.fees, 2.6, 1e-9));
  check('net P/L = (exit − entry) × 100 × contracts − fees', near(t1.net!, (4.49 - 1.01) * 200 - 2.6, 1e-6));
  const down = scripted([1, 0.9, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
  const t2 = simulateTrade({ pricer: down, sessions: T, entry: { method: 'ask' }, exitFill: 'bid', contracts: 1, feePerContract: 0, exits: { ...DEFAULT_EXITS, maxLoss: 0.5 } });
  check('stop fills at the next close, past the threshold (gap-through)', t2.exitReason === 'max loss' && t2.exitPremium! < 0.5 && t2.gapThrough);
  const t3 = simulateTrade({ pricer: up, sessions: T, entry: { method: 'limit', price: 0.5, limitDays: 3 }, exitFill: 'bid', contracts: 1, feePerContract: 0, exits: DEFAULT_EXITS });
  check('limit below the ask does not fill', !t3.filled && !!t3.unfilledReason);
  const t4 = simulateTrade({ pricer: up, sessions: T, entry: { method: 'ask' }, exitFill: 'bid', contracts: 1, feePerContract: 0, exits: { ...DEFAULT_EXITS, profitTarget: null, maxLoss: null, exitDaysBeforeExpiry: null } });
  check('held to expiration settles at intrinsic', t4.exitReason === 'expiration' && near(t4.exitPremium!, Math.max(95 - (100 - 30), 0), 1e-9));
  check('MFE ≥ final and MAE ≤ 0 recorded', t4.mfe != null && t4.mae != null && t4.mfe >= (t4.net ?? 0) && t4.mae <= 0.01);
  check('hold-to-expiry result reported alongside', t1.holdToExpiry != null && t1.holdToExpiry.value != null);

  // ── Strategy lab on the synthetic history ──
  const fullTl = buildTimeline(data, { from: D[260] });
  const labRep = runStrategy({
    def: { ...STRATEGIES[0], entry: { kind: 'regimes', regimes: ['PANIC / LATE ENTRY', 'VOLATILITY EXPANSION', 'BREAKDOWN CONFIRMED', 'ELEVATED RISK', 'EARLY WARNING', 'PRE-CRASH WATCH'] }, filters: { ...STRATEGIES[0].filters, maxPremium: 10 } },
    settings: { ...DEFAULT_LAB, from: D[260], to: D[D.length - 1], riskPerTrade: 5000 },
    data,
    timeline: fullTl,
    events: e10,
    sessions: D,
    chain: (sym, date, a, b) => theoreticalSnapshot(data, sym, date, a, b),
    pricer: (snap, ev) => theoreticalPricer(data, 'SPY', ev.contract.strike, ev.contract.expiration),
  });
  const filled = labRep.trades.filter((t) => t.result.filled);
  if (process.env.DEBUG_CRASH) console.log('lab', filled.length, labRep.skipped.slice(0, 3), filled.map((t) => [t.signalDate, t.contract.symbol, t.result.exitReason, Math.round(t.result.net ?? 0)]));
  check('lab produced theoretical trades only', filled.length > 0 && labRep.kinds.actual === 0 && labRep.kinds.theoretical === labRep.trades.length);
  check('one position at a time with a cooldown', filled.every((t, i) => i === 0 || (t.result.entryDate as string) > (filled[i - 1].result.exitDate as string)));
  check('equity curve ends at capital + net', near(labRep.stats.endingEquity, DEFAULT_LAB.initialCapital + labRep.stats.net, 1e-6));
  check('every decline is either captured or missed', labRep.capturedDeclines.length + labRep.missedDeclines.length === e10.filter((e) => e.crossDate >= D[260]).length);

  // ── Importer ──
  const hod = 'UnderlyingSymbol,UnderlyingPrice,Exchange,OptionSymbol,OptionExt,Type,Expiration,DataDate,Strike,Last,Bid,Ask,Volume,OpenInterest,IV,Delta,Gamma,Theta,Vega,AKA\n' +
    `SPY,140.5,*,SPY080321P00130000,,put,03/21/2008,02/15/2008,130,1.1,1.05,1.12,500,10000,0.31,-0.2,0.02,-0.05,0.15,\n` +
    `SPY,140.5,*,SPY080321P00130000,,put,03/21/2008,02/15/2008,130,1.1,1.05,1.12,500,10000,0.31,-0.2,0.02,-0.05,0.15,\n` +
    `SPY,140.5,*,SPY080321P00120000,,put,03/21/2008,02/15/2008,120,0.4,0.50,0.45,10,100,0.35,-0.1,0.01,-0.03,0.1,\n` +
    `SPY,140.5,*,SPY080321P00500000,,put,03/21/2008,02/15/2008,500,360,360,600,0,0,0.3,-1,0,0,0,\n` +
    `SPY,140.5,*,"BADSYM",,put,03/21/2008,02/15/2008,125,0.6,0.55,0.6,10,100,0.33,-0.15,0.01,-0.04,0.12,\n`;
  const recs = parseCsv(hod);
  check('CSV parser reads quoted fields', recs.length === 5 && recs[4].OptionSymbol === 'BADSYM');
  const fmt = detectFormat(Object.keys(recs[0]));
  check('vendor format detected from the header', fmt === 'historicaloptiondata');
  const norm = normalizeRows(recs, 'historicaloptiondata');
  check('dates normalized to YYYY-MM-DD', norm.rows[0].tradeDate === '2008-02-15' && norm.rows[0].expiration === '2008-03-21');
  const val = validateRows(norm.rows);
  check('validation keeps the one clean row', val.accepted.length === 1);
  check('duplicate, crossed, impossible and malformed rows rejected with reasons', !!val.report.rejections['Duplicate observation'] && !!val.report.rejections['Crossed quote'] && !!val.report.rejections['Impossible price (put above strike)'] && !!val.report.rejections['Invalid option symbol']);
  check('OCC symbols round-trip', parseOcc(occSymbol('SPY', '2008-03-21', 'put', 130))?.strike === 130);
  const cboe = parseCsv('underlying_symbol,quote_date,root,expiration,strike,option_type,open,high,low,close,trade_volume,bid_size_1545,bid_1545,ask_size_1545,ask_1545,underlying_bid_1545,underlying_ask_1545,implied_underlying_price_1545,active_underlying_price_1545,implied_volatility_1545,delta_1545,gamma_1545,theta_1545,vega_1545,rho_1545,open_interest\nXLF,2016-09-16,XLF1,2016-10-21,20,P,0,0,0,0.3,5,10,0.25,10,0.3,19.9,19.91,19.9,19.9,0.3,-0.3,0.1,-0.01,0.02,0,100');
  const cboeRows = validateRows(normalizeRows(cboe, 'cboe-datashop').rows);
  check('adjusted contract (root differs from underlying) rejected', cboeRows.accepted.length === 0 && !!cboeRows.report.rejections['Non-standard multiplier or deliverable (adjusted contract)']);

  // ── Reproducibility ──
  const m1 = makeManifest({ kind: 'evaluation', params: { a: 1 }, data, range: { from: D[0], to: D[900] }, options: { kind: 'none', source: '' }, result: { x: 1 } });
  const m2 = makeManifest({ kind: 'evaluation', params: { a: 1 }, data, range: { from: D[0], to: D[900] }, options: { kind: 'none', source: '' }, result: { x: 1 } });
  check('identical inputs give an identical manifest hash', compareManifests(m1, m2).sameData && compareManifests(m1, m2).sameResult === true);
  const revised: MarketDataset = { errors: [], series: { ...data.series, HY_OAS: { ...(data.series.HY_OAS as LevelSeries), points: (data.series.HY_OAS as LevelSeries).points.map((p, i) => (i === 500 ? { ...p, value: p.value + 1 } : p)) } } };
  const m3 = makeManifest({ kind: 'evaluation', params: { a: 1 }, data: revised, range: { from: D[0], to: D[900] }, options: { kind: 'none', source: '' } });
  check('a revised value is detected and named', !compareManifests(m1, m3).sameData && compareManifests(m1, m3).changedSeries.includes('HY_OAS'));
  const later = makeManifest({ kind: 'evaluation', params: { a: 1 }, data: cut(D[1000]), range: { from: D[0], to: D[900] }, options: { kind: 'none', source: '' } });
  check('new data after the run range does not break reproducibility', compareManifests(m1, later).sameData);
  const dupData: MarketDataset = { errors: [], series: { SPY: { kind: 'bars' as const, meta: data.series.SPY.meta, bars: [...bars.slice(0, 5), bars[4], ...bars.slice(5, 10)] } } };
  check('dataset validation flags duplicate dates', validateDataset(dupData).some((x) => x.issue === 'Duplicate dates'));
}
