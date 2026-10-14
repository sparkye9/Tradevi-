/** Prop-firm engine checks (called from check-trading.ts). */
import { consistency, drawdown, planPayout, dailyLossRemaining, cmeSessionDate, summarize, blankRules, unverifiedRules, type DayRecord, type AccountProfile } from '../lib/propFirm';

export function runSection(check: (name: string, cond: boolean) => void): void {
  const days = (xs: number[]): DayRecord[] => xs.map((realized, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, realized }));

  // ─── Consistency ──────────────────────────────────────────────────────────
  {
    // Best 600, net 1500 (600+400+500), threshold 30% → 40%, non-compliant.
    const c = consistency(days([600, 400, 500]), { formula: 'best_day_over_net_profit', thresholdPct: 30, resetsOnPayout: false });
    check('consistency: 600 / 1500 = 40%', c.pct === 40 && c.compliant === false);
    check('consistency: need 600/0.30 − 1500 = $500 more', c.additionalProfitNeeded === 500);
    check('consistency: at ≤ $600/day that is 1 more day', c.minAdditionalDays === 1);
    // cap above best = 0.3·1500/0.7 = 642.86 ≥ 600 → one day up to 642.86 works.
    check('consistency: largest next day that still works = $642.86', c.maxNextDayProfit === 642.86);
  }
  {
    // Net vs gross differ when there are losing days: best 600, wins 1500, losses −500.
    const d = days([600, 400, 500, -500]);
    const net = consistency(d, { formula: 'best_day_over_net_profit', thresholdPct: 50, resetsOnPayout: false });
    const gross = consistency(d, { formula: 'best_day_over_gross_profit', thresholdPct: 50, resetsOnPayout: false });
    check('consistency: net formula = 600 / 1000 = 60%', net.pct === 60 && net.compliant === false);
    check('consistency: gross formula = 600 / 1500 = 40%', gross.pct === 40 && gross.compliant === true);
  }
  {
    const c = consistency(days([300, 300, 300, 300]), { formula: 'best_day_over_net_profit', thresholdPct: 30, resetsOnPayout: false });
    check('consistency: 300 / 1200 = 25% compliant, nothing needed', c.pct === 25 && c.compliant === true && c.additionalProfitNeeded === 0);
    // A new big day becomes the best: max d with d/(1200+d) ≤ 0.3 → 514.29.
    check('consistency: a next day above $514.29 would break it', c.maxNextDayProfit === 514.29);
  }
  {
    const c = consistency(days([-200, -100]), { formula: 'best_day_over_net_profit', thresholdPct: 30, resetsOnPayout: false });
    check('consistency: undefined with no profit (null, not 0%)', c.pct === null && c.compliant === null);
    const big = consistency(days([1000, 100]), { formula: 'best_day_over_net_profit', thresholdPct: 30, resetsOnPayout: false });
    // need 1000/0.3 − 1100 = 2233.33; cap above best = 0.3·1100/0.7 = 471 < 1000; 1000 ≤ 0.3·2100? no → null.
    check('consistency: no single day can fix a dominant best day', big.maxNextDayProfit === null && big.additionalProfitNeeded === 2233.33 && big.minAdditionalDays === 3);
  }

  // ─── Drawdown ─────────────────────────────────────────────────────────────
  {
    const s = drawdown(50_000, days([500, -300]), { type: 'static', amount: 2000, basis: 'balance', stopTrailingAtOffset: null });
    check('static: floor stays 48,000', s.floor === 48_000 && s.remaining === 2200 && !s.breachedOn);
  }
  {
    // EOD trailing $2,000, stops at start+100. Closes 51,000 → 52,500 → 52,000.
    const e = drawdown(50_000, days([1000, 1500, -500]), { type: 'trailing_eod', amount: 2000, basis: 'balance', stopTrailingAtOffset: 100 });
    check('EOD trailing: HWM is highest close 52,500', e.highWater === 52_500);
    check('EOD trailing: floor capped at 50,100 (stops trailing)', e.floor === 50_100 && e.trailingStopped);
    check('EOD trailing: remaining = 52,000 − 50,100 = 1,900', e.remaining === 1900);
  }
  {
    const e = drawdown(50_000, days([1000, -200]), { type: 'trailing_eod', amount: 2000, basis: 'balance', stopTrailingAtOffset: null });
    check('EOD trailing w/o lock: floor 49,000 after a 51,000 close, never down', e.floor === 49_000 && e.timeline[1].floor === 49_000);
  }
  {
    // Intraday trailing: day 1 peaked +1,800 open profit but closed +300.
    const d: DayRecord[] = [{ date: '2026-09-01', realized: 300, peakUnrealized: 1800, troughUnrealized: -100 }];
    const i = drawdown(50_000, d, { type: 'trailing_intraday', amount: 2000, basis: 'equity', stopTrailingAtOffset: null });
    check('intraday trailing: HWM uses the 51,800 intraday peak', i.highWater === 51_800 && i.floor === 49_800);
    check('intraday trailing: remaining only 500 despite +300 day', i.remaining === 500);
    const noPeak = drawdown(50_000, [{ date: '2026-09-01', realized: 300 }], { type: 'trailing_intraday', amount: 2000, basis: 'balance', stopTrailingAtOffset: null });
    check('intraday trailing: missing peak data is warned about', noPeak.warnings.some((w) => /HIGHER than shown/.test(w)));
  }
  {
    const b = drawdown(50_000, [{ date: '2026-09-01', realized: -1500, troughUnrealized: -2100 }], { type: 'static', amount: 2000, basis: 'equity', stopTrailingAtOffset: null });
    check('equity basis: intraday low through the floor is a breach even if close is above', b.breachedOn === '2026-09-01');
    const bb = drawdown(50_000, [{ date: '2026-09-01', realized: -1500, troughUnrealized: -2100 }], { type: 'static', amount: 2000, basis: 'balance', stopTrailingAtOffset: null });
    check('balance basis: same day is not a breach', bb.breachedOn === null);
  }
  {
    const p = drawdown(50_000, days([3000]), { type: 'trailing_eod', amount: 2000, basis: 'balance', stopTrailingAtOffset: null }, [{ date: '2026-09-05', amount: 1000 }]);
    check('payout lowers balance, floor unchanged, warning shown', p.currentBalance === 52_000 && p.floor === 51_000 && p.remaining === 1000 && p.warnings.some((w) => /Payouts/.test(w)));
  }

  // ─── Daily loss ───────────────────────────────────────────────────────────
  const dl = dailyLossRemaining(-400, -200, 1000);
  check('daily loss: −400 realized −200 open = 600 used, 400 left', dl.used === 600 && dl.remaining === 400 && !dl.breached);

  // ─── Payout ───────────────────────────────────────────────────────────────
  {
    const p = planPayout({
      startingBalance: 50_000, balance: 53_000,
      rule: { bufferAboveStart: 1000, minPayout: 500, maxPayout: 1500, maxPctOfProfit: 50, profitSplitPct: 90 },
      floor: 50_100, consistencyOk: true, qualifyingDays: 5, minQualifyingDays: 5,
    });
    // above buffer 2000; 50% of 3000 = 1500; max 1500 → 1500. Split 90% → 1350. After 51,500 → room 1,400.
    check('payout: eligible gross 1,500 (caps applied)', p.eligible && p.grossWithdrawable === 1500);
    check('payout: trader receives 1,350 at 90%', p.traderReceives === 1350);
    check('payout: balance after 51,500, room 1,400', p.balanceAfter === 51_500 && p.drawdownRoomAfter === 1400);
  }
  {
    const p = planPayout({
      startingBalance: 50_000, balance: 50_800,
      rule: { bufferAboveStart: 1000, minPayout: 500, maxPayout: null, maxPctOfProfit: null, profitSplitPct: 90 },
      floor: null, consistencyOk: false, qualifyingDays: 3, minQualifyingDays: 5,
    });
    check('payout: below buffer → not eligible, $200 still needed', !p.eligible && p.profitNeededForBuffer === 200 && p.grossWithdrawable === 0);
    check('payout: lists every blocking reason', p.reasons.length === 4);
    check('payout: never promises approval', p.steps.some((s) => /not a promise/.test(s)));
  }

  // ─── Session date ─────────────────────────────────────────────────────────
  check('CME session: 7 PM ET Mon belongs to Tue', cmeSessionDate(new Date('2026-10-12T23:00:00Z')) === '2026-10-13');
  check('CME session: 4 PM ET Mon stays Mon', cmeSessionDate(new Date('2026-10-12T20:00:00Z')) === '2026-10-12');
  check('CME session: across DST (Nov 2, 7 PM EST) → Nov 3', cmeSessionDate(new Date('2026-11-03T00:00:00Z')) === '2026-11-03');

  // ─── Summary + verification flags ─────────────────────────────────────────
  {
    const rules = blankRules();
    rules.profitTarget = { value: 3000, source: 'firm site', verifiedOn: null, verified: false };
    rules.drawdown = { value: { type: 'trailing_eod', amount: 2000, basis: 'balance', stopTrailingAtOffset: 100 }, source: 'x', verifiedOn: '2026-10-01', verified: true };
    const acct: AccountProfile = { id: 'a', firm: 'Other', accountType: '50K', label: 't', phase: 'evaluation', startingBalance: 50_000, rules, days: days([1000, 500]), payouts: [], createdAt: '' };
    const s = summarize(acct, '2026-09-02');
    check('summary: profit target set but unconfirmed is flagged UNVERIFIED', unverifiedRules(rules).includes('Profit target') && s.unverified.length === 1);
    check('summary: $1,500 to target', s.profitToTarget === 1500 && /1,500\.00 to the profit target/.test(s.nextMilestone));
    check('summary: blank rules are not invented (no daily loss calc)', s.dailyLoss === null && s.consistency === null);
  }
}
