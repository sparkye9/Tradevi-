/**
 * Deterministic checks for Crash Intelligence: pricing, point-in-time guard,
 * risk score coverage rules, regimes, contract evaluation, setups, sizing,
 * TradingView CSV parsing. Synthetic series only — never presented as market data.
 * Run: npx tsx scripts/check-crash.ts
 */
import { americanPrice, blackScholes, impliedVolAmerican } from '../lib/crash/pricing';
import { PointInTime, type Bar, type LevelSeries, type MarketDataset } from '../lib/crash/series';
import { computeRiskScore } from '../lib/crash/riskScore';
import { classifyRegime, regimeFacts } from '../lib/crash/regime';
import { evaluateContract, type PutContract } from '../lib/crash/contracts';
import { SHORT_TERM_FILTERS } from '../lib/crash/config';
import { evaluateSetup } from '../lib/crash/setup';
import { runScenarios } from '../lib/crash/scenarios';
import { sizePosition, exposureByGroup } from '../lib/crash/sizing';
import { parseTradingViewCsv } from '../lib/crash/providers/tradingview';
import { parseCboeCsv, parseFredCsv, parseTreasuryCsv } from '../lib/crash/providers/fetchers';
import { parseGreeksStamp } from '../lib/crash/providers/chains';
import { runSection as historyChecks } from './check-crash-history';

let failed = 0;
export function check(name: string, cond: boolean) {
  if (cond) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

// ─── Pricing ────────────────────────────────────────────────────────────────
const bsPut = blackScholes({ type: 'put', S: 100, K: 100, T: 1, r: 0.05, q: 0, sigma: 0.2 });
check('BS put 100/100/1y/5%/20% = 5.5735', near(bsPut.price, 5.5735, 0.001));
const bsCall = blackScholes({ type: 'call', S: 100, K: 100, T: 1, r: 0.05, q: 0, sigma: 0.2 });
check('BS call = 10.4506', near(bsCall.price, 10.4506, 0.001));
check('put-call parity', near(bsCall.price - bsPut.price, 100 - 100 * Math.exp(-0.05), 1e-6));
check('BS put delta in (−1, 0)', bsPut.delta < 0 && bsPut.delta > -1);
const amPut = americanPrice({ type: 'put', S: 100, K: 100, T: 1, r: 0.05, q: 0, sigma: 0.2 }, 400);
check('American put ≈ 6.09 (early-exercise premium over BS)', near(amPut, 6.09, 0.02) && amPut > bsPut.price);
const amCallNoDiv = americanPrice({ type: 'call', S: 100, K: 100, T: 1, r: 0.05, q: 0, sigma: 0.2 }, 400);
check('American call without dividends ≈ European', near(amCallNoDiv, bsCall.price, 0.03));
const iv = impliedVolAmerican({ type: 'put', S: 500, K: 470, T: 30 / 365, r: 0.045, q: 0.012 }, americanPrice({ type: 'put', S: 500, K: 470, T: 30 / 365, r: 0.045, q: 0.012, sigma: 0.22 }, 150), 150);
check('implied vol round-trips (22%)', iv != null && near(iv, 0.22, 0.002));
check('implied vol null below intrinsic', impliedVolAmerican({ type: 'put', S: 90, K: 100, T: 0.1, r: 0.04, q: 0 }, 5) === null);

// ─── Synthetic dataset ──────────────────────────────────────────────────────
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function dates(n: number, start = '2020-01-01'): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T12:00:00Z`);
  while (out.length < n) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}
const D = dates(600);
function barsFrom(path: (i: number) => number, seed: number): Bar[] {
  const r = rng(seed);
  return D.map((date, i) => {
    const c = path(i) * (1 + (r() - 0.5) * 0.004);
    return { date, open: c, high: c * 1.003, low: c * 0.997, close: c, volume: 1e6 * (1 + r()) };
  });
}
function bars(id: string, b: Bar[]) {
  return { kind: 'bars' as const, meta: { id, label: id, source: 'synthetic', unit: '$', freshness: 'test' }, bars: b };
}
function level(id: string, f: (i: number) => number, availLag = 0): LevelSeries {
  return { kind: 'level', meta: { id, label: id, source: 'synthetic', unit: 'x', freshness: 'test' }, points: D.map((date, i) => ({ date, value: f(i), availableOn: availLag ? D[Math.min(D.length - 1, i + availLag)] : undefined })) };
}

const calmUp = (i: number) => 300 * (1 + i * 0.0006);
const calm: MarketDataset = {
  errors: [],
  series: {
    SPY: bars('SPY', barsFrom(calmUp, 1)),
    QQQ: bars('QQQ', barsFrom(calmUp, 2)),
    IWM: bars('IWM', barsFrom(calmUp, 3)),
    RSP: bars('RSP', barsFrom(calmUp, 4)),
    VIX: level('VIX', () => 13),
    VIX3M: level('VIX3M', () => 16),
  },
};
const sCalm = computeRiskScore(calm);
check('calm market scores low', sCalm.score != null && sCalm.score < 20);
check('calm market: partial coverage reported, not treated as full', sCalm.coverage < 0.7 && sCalm.coverage > 0);
check('missing credit category is insufficient, not zero', sCalm.categories.find((c) => c.id === 'credit')!.insufficient === true && sCalm.categories.find((c) => c.id === 'credit')!.risk === null);
check('missing indicators carry a reason', sCalm.indicators.filter((i) => i.status === 'missing').every((i) => !!i.missingReason));
const fCalm = regimeFacts(calm, sCalm.asOf, 'close', sCalm);
check('calm market regime is NORMAL', classifyRegime(fCalm, sCalm.score).regime === 'NORMAL');

// Narrowing market: SPY flat near highs, small caps and equal-weight fall, credit widens, VIX still low.
const narrow: MarketDataset = {
  errors: [],
  series: {
    ...calm.series,
    SPY: bars('SPY', barsFrom((i) => 300 * (1 + Math.min(i, 520) * 0.0006), 1)),
    IWM: bars('IWM', barsFrom((i) => (i < 520 ? calmUp(i) : calmUp(520) * (1 - (i - 520) * 0.0015)), 3)),
    RSP: bars('RSP', barsFrom((i) => (i < 520 ? calmUp(i) : calmUp(520) * (1 - (i - 520) * 0.0008)), 4)),
    XLF: bars('XLF', barsFrom((i) => (i < 520 ? calmUp(i) : calmUp(520) * (1 - (i - 520) * 0.0015)), 5)),
    HYG: bars('HYG', barsFrom((i) => (i < 520 ? 80 : 80 * (1 - (i - 520) * 0.0008)), 6)),
    IEF: bars('IEF', barsFrom(() => 100, 7)),
    LQD: bars('LQD', barsFrom((i) => (i < 520 ? 110 : 110 * (1 - (i - 520) * 0.0004)), 8)),
    HY_OAS: level('HY_OAS', (i) => (i < 520 ? 3.2 : 3.2 + (i - 520) * 0.02), 1),
    IG_OAS: level('IG_OAS', (i) => (i < 520 ? 1.0 : 1.0 + (i - 520) * 0.006), 1),
    T10Y3M: level('T10Y3M', (i) => (i < 300 ? 1 : i < 450 ? -0.8 : -0.8 + (i - 450) * 0.01), 1),
    STLFSI: level('STLFSI', (i) => (i < 520 ? -0.5 : -0.5 + (i - 520) * 0.02), 5),
    NFCI: level('NFCI', (i) => (i < 520 ? -0.5 : -0.5 + (i - 520) * 0.01), 5),
    ...Object.fromEntries(
      ['XLK', 'XLF2', 'XLV', 'XLY', 'XLP', 'XLE', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC'].map((sym, k) => {
        const id = sym === 'XLF2' ? 'XLF' : sym;
        const defensive = id === 'XLU' || id === 'XLP' || id === 'XLV';
        const path = (i: number) => (i < 520 ? calmUp(i) : defensive ? calmUp(i) * (1 + (i - 520) * 0.001) : calmUp(520) * (1 - (i - 520) * 0.0012));
        return [id, bars(id, barsFrom(path, 20 + k))];
      }),
    ),
  },
};
const sNarrow = computeRiskScore(narrow);
check('narrowing market scores higher than calm', (sNarrow.score ?? 0) > (sCalm.score ?? 0) + 10);
check('HY spread widening reads as high risk', (sNarrow.indicators.find((i) => i.id === 'hy_oas')!.risk ?? 0) >= 0.9);
check('HY spread deteriorating versus 60 sessions of calm', computeRiskScore(narrow, { asOf: D[545] }).indicators.find((i) => i.id === 'hy_oas')!.direction5 === 'deteriorating');
const fNarrow = regimeFacts(narrow, sNarrow.asOf, 'close', sNarrow);
const rNarrow = classifyRegime(fNarrow, sNarrow.score);
if (process.env.DEBUG_CRASH) console.log(JSON.stringify({ score: sNarrow.score, cats: sNarrow.categories.map((c) => [c.id, c.risk]), facts: fNarrow }, null, 1));
check(`narrowing + low VIX → PRE-CRASH WATCH (got ${rNarrow.regime})`, rNarrow.regime === 'PRE-CRASH WATCH');

// Panic: VIX 45.
const panic: MarketDataset = { errors: [], series: { ...narrow.series, VIX: level('VIX', (i) => (i < 590 ? 14 : 45)), VIX3M: level('VIX3M', (i) => (i < 590 ? 17 : 35)) } };
const sPanic = computeRiskScore(panic);
check('VIX 45 → PANIC / LATE ENTRY', classifyRegime(regimeFacts(panic, sPanic.asOf, 'close', sPanic), sPanic.score).regime === 'PANIC / LATE ENTRY');

// ─── Point-in-time guard ────────────────────────────────────────────────────
const cut = D[400];
const pit = new PointInTime(narrow, cut, 'close');
check('no bar after the as-of date', pit.bars('SPY').every((b) => b.date <= cut) && pit.bars('SPY').length === 401);
const pitOpen = new PointInTime(narrow, cut, 'open');
check('"open" cut excludes that day’s bar', pitOpen.bars('SPY').every((b) => b.date < cut));
check('FRED value dated D (published D+1) hidden on D', pit.latest('HY_OAS')!.date === D[399]);
check('weekly value hidden until its release', pit.latest('STLFSI')!.date === D[395]);
const futureLeak = computeRiskScore(narrow, { asOf: D[450] });
const truncated: MarketDataset = { errors: [], series: Object.fromEntries(Object.entries(narrow.series).map(([k, s]) => [k, s.kind === 'bars' ? { ...s, bars: s.bars.filter((b) => b.date <= D[450]) } : { ...s, points: s.points.filter((p) => p.date <= D[450]) }])) };
check('score on day D is identical whether or not future data exists', futureLeak.score === computeRiskScore(truncated, { asOf: D[450] }).score);

// ─── Contract evaluation ────────────────────────────────────────────────────
const now = new Date('2026-11-20T18:00:00Z');
const put: PutContract = {
  symbol: 'SPY261218P00600000', underlying: 'SPY', type: 'put', strike: 600, expiration: '2026-12-18', dte: 28,
  bid: 0.18, ask: 0.22, last: 0.2, volume: 500, openInterest: 4000, delta: -0.12, gamma: 0.004, theta: -0.006, vega: 0.25, iv: 0.19,
  greeksUpdatedAt: '2026-11-20T17:30:00Z', source: 'test',
};
const ctx = { underlyingPrice: 660, realizedVol20: 0.12, atmIv: 0.14, sessionOpen: true, now };
const ev = evaluateContract(put, ctx, SHORT_TERM_FILTERS);
check('mid = 0.20', near(ev.mid ?? 0, 0.2, 1e-9));
check('cost at mid = $20 per contract', near(ev.costAtMid ?? 0, 20, 1e-9));
check('breakeven at mid = strike − 0.20', near(ev.breakevenAtMid ?? 0, 599.8, 1e-9));
check('decline to breakeven measured at the ask', near(ev.declineToBreakeven ?? 0, 1 - 599.78 / 660, 1e-9));
check('spread 20% passes 25% max', ev.passes && near(ev.spreadPct ?? 0, 0.2, 1e-9));
check('theta dollars/day = −$0.60', near(ev.thetaDollarsPerDay ?? 0, -0.6, 1e-9));
check('+5 vol points ≈ +$125 from vega', near(ev.vegaGain5 ?? 0, 125, 1e-9));
check('quality is 0–100', ev.quality != null && ev.quality >= 0 && ev.quality <= 100);
check('moneyness deep OTM', ev.moneyness === 'Deep OTM');
const zeroBid = evaluateContract({ ...put, bid: 0 }, ctx, SHORT_TERM_FILTERS);
check('zero bid is rejected', !zeroBid.passes && zeroBid.rejections.some((r) => r.startsWith('Zero bid')));
const noGreeks = evaluateContract({ ...put, vega: null }, ctx, SHORT_TERM_FILTERS);
check('missing Greeks → rejected and unscored', !noGreeks.passes && noGreeks.quality === null);
const stale = evaluateContract({ ...put, greeksUpdatedAt: '2026-11-20T14:00:00Z' }, ctx, SHORT_TERM_FILTERS);
check('stale Greeks rejected during the session', stale.rejections.some((r) => r.startsWith('Stale Greeks')));
const wide = evaluateContract({ ...put, bid: 0.1, ask: 0.3 }, ctx, SHORT_TERM_FILTERS);
check('100% spread rejected', wide.rejections.some((r) => r.startsWith('Spread')));

// ─── Setups ─────────────────────────────────────────────────────────────────
const scen = runScenarios({ type: 'put', S: 660, K: 600, dte: 28, entry: 0.22, mid: 0.2, iv: 0.19, r: 0.045, q: 0.012, holdDays: 14, steps: 120 }, [-0.1, 0, 0.05], [0, 5]);
check('scenario max loss = premium paid', near(scen.maxLoss, 22, 1e-9));
check('expiration payoff at −10% is intrinsic', near(scen.expiry[0].value, Math.max(600 - 594, 0), 1e-9));
check('IV +5 raises value (same price, today)', scen.now[3].value > scen.now[2].value);
check('flat price, hold 14d loses to decay', scen.hold[2].pnl < 0);
check('model reproduces the mid at entry', scen.ivSource === 'mid-implied' && near(scen.now.find((c) => c.priceShock === 0 && c.ivShock === 0)!.value, 0.2, 0.002));
const sNormal = evaluateSetup({ marketScore: sCalm.score, regime: 'NORMAL', facts: fCalm, ev, scenario: scen, catalystsBeforeExpiry: 0 });
check('NORMAL regime never gives STRONG WATCH', sNormal.label !== 'STRONG WATCH');
const sPre = evaluateSetup({ marketScore: 55, regime: 'PRE-CRASH WATCH', facts: fNarrow, ev, scenario: scen, catalystsBeforeExpiry: 1 });
check('every label has why and risks', sPre.why.length > 0 && sPre.risks.length > 0 && sPre.risks[0].includes('expire worthless'));
const sLate = evaluateSetup({ marketScore: 85, regime: 'PANIC / LATE ENTRY', facts: fNarrow, ev, catalystsBeforeExpiry: 0 });
check('panic regime → LATE ENTRY', sLate.label === 'LATE ENTRY');
check('rejected contract → AVOID', evaluateSetup({ marketScore: 55, regime: 'PRE-CRASH WATCH', facts: fNarrow, ev: zeroBid, catalystsBeforeExpiry: 0 }).label === 'AVOID');

// ─── Sizing ─────────────────────────────────────────────────────────────────
const sz = sizePosition(0.22, { accountEquity: 2000, maxRiskPerTrade: 50, feePerContract: 0.65 });
check('affordable contracts within $50 budget = 2', sz.affordable === 2);
check('default sizing is one contract, not "as many as cheap allows"', near(sz.premiumAtRisk, 22.65, 1e-9));
const ex = exposureByGroup([{ id: 'a', underlying: 'SPY', description: '', contracts: 1, premiumPerShare: 0.2 }, { id: 'b', underlying: 'QQQ', description: '', contracts: 1, premiumPerShare: 0.3 }], { accountEquity: 2000, maxRiskPerTrade: 50, feePerContract: 0.65 });
check('SPY and QQQ puts grouped as one correlated bet', ex.length === 1 && ex[0].count === 2 && !!ex[0].warning);

// ─── Parsers ────────────────────────────────────────────────────────────────
const tv = parseTradingViewCsv('time,open,high,low,close\n1731974400,60,61,59,60.5\n1732060800,58,59,57,57.2\n');
check('TradingView CSV parsed (unix seconds)', tv.length === 2 && tv[1].value === 57.2);
let threw = false;
try { parseTradingViewCsv('a,b\n1,2'); } catch { threw = true; }
check('TradingView CSV without time/close is refused', threw);
check('Cboe CSV parsed', parseCboeCsv('DATE,OPEN,HIGH,LOW,CLOSE\n01/02/1990,17.24,17.24,17.24,17.24\n01/03/1990,18.19,18.19,18.19,18.19').length === 2);
check('FRED CSV skips "." values', parseFredCsv('observation_date,BAMLH0A0HYM2\n2026-11-18,3.01\n2026-11-19,.\n2026-11-20,3.05').length === 2);
check('Treasury CSV parsed', parseTreasuryCsv('Date,"1 Mo","3 Mo","2 Yr","10 Yr"\n11/20/2026,4.1,4.0,3.6,4.2').get('2026-11-20')?.['10 Yr'] === 4.2);
check('Greeks stamp read as New York time', parseGreeksStamp('2026-11-20 14:59:08', new Date('2026-11-20T21:00:00Z')) === '2026-11-20T19:59:08.000Z');
check('future Greeks stamp treated as unknown', parseGreeksStamp('2026-11-21 14:59:08', new Date('2026-11-20T21:00:00Z')) === null);

historyChecks(check);

if (failed) {
  console.error(`\n${failed} crash check(s) failed`);
  process.exit(1);
}
console.log('\nAll crash checks passed');
