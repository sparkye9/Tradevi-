/**
 * Prop firm account engine: consistency, drawdown and payout math.
 *
 * Tradevi ships NO firm's rules. Every number comes from the account profile
 * the user fills in from their firm's current rules page, and every rule
 * carries its own source, verification date and a `verified` flag. Anything
 * unverified is shown as UNVERIFIED in the UI and the result says so.
 *
 * Firms define the same words differently (what counts as "profit", whether
 * the trailing drawdown uses intraday equity, whether it stops trailing, when
 * a trading day starts). The formulas below are selectable per profile; they
 * are not assumptions about any specific firm.
 */

// ─── Profile shape ──────────────────────────────────────────────────────────

export interface Rule<T> {
  value: T | null;
  /** Where the value came from (URL or "help center article, 2026-10-01"). */
  source: string;
  /** YYYY-MM-DD the user last checked it against the firm. */
  verifiedOn: string | null;
  /** User confirmed it matches the firm's current published rule. */
  verified: boolean;
  notes?: string;
}

export type DrawdownType = 'static' | 'trailing_eod' | 'trailing_intraday';

export interface DrawdownRule {
  type: DrawdownType;
  /** Distance from the high-water mark (or from start, for static), in $. */
  amount: number;
  /** What a breach is measured on: closing balance or intraday equity low. */
  basis: 'balance' | 'equity';
  /**
   * Trailing stops once the floor reaches start + this offset (e.g. 0 or 100).
   * null = keeps trailing forever. Ignored for static.
   */
  stopTrailingAtOffset: number | null;
}

export type ConsistencyFormula =
  /** Largest profitable day ÷ net profit of all days in the window × 100. */
  | 'best_day_over_net_profit'
  /** Largest profitable day ÷ sum of profitable days only × 100. */
  | 'best_day_over_gross_profit';

export interface ConsistencyRule {
  formula: ConsistencyFormula;
  /** Maximum allowed percentage, e.g. 30 means the best day must be ≤ 30%. */
  thresholdPct: number;
  /** Only count days since the last payout. */
  resetsOnPayout: boolean;
}

export interface PayoutRule {
  /** Balance must stay ≥ start + buffer after the withdrawal. */
  bufferAboveStart: number;
  minPayout: number | null;
  maxPayout: number | null;
  /** Max share of profit (balance − start) withdrawable, e.g. 50. null = no cap. */
  maxPctOfProfit: number | null;
  /** Trader's share of the gross payout, e.g. 90. */
  profitSplitPct: number;
}

export interface AccountRules {
  profitTarget: Rule<number>;
  drawdown: Rule<DrawdownRule>;
  dailyLossLimit: Rule<number>;
  consistency: Rule<ConsistencyRule>;
  minTradingDays: Rule<number>;
  /** A day only "qualifies" toward the day count when realized P&L ≥ this. */
  qualifyingDayMinProfit: Rule<number>;
  payout: Rule<PayoutRule>;
}

export interface DayRecord {
  /** Trading date (firm's definition — usually the CME session date). */
  date: string;
  /** Realized P&L for the day, after fees. */
  realized: number;
  /** Highest intraday equity relative to the day's opening balance (≥ 0), if known. */
  peakUnrealized?: number | null;
  /** Lowest intraday equity relative to the day's opening balance (≤ 0), if known. */
  troughUnrealized?: number | null;
}

export interface PayoutRecord {
  date: string;
  amount: number;
}

export interface AccountProfile {
  id: string;
  firm: string;
  accountType: string;
  label: string;
  phase: 'evaluation' | 'funded';
  startingBalance: number;
  rules: AccountRules;
  days: DayRecord[];
  payouts: PayoutRecord[];
  /** Open-position P&L right now, if the user enters it. */
  unrealizedNow?: number | null;
  createdAt: string;
}

export function emptyRule<T>(value: T | null = null): Rule<T> {
  return { value, source: '', verifiedOn: null, verified: false };
}

export function blankRules(): AccountRules {
  return {
    profitTarget: emptyRule<number>(),
    drawdown: emptyRule<DrawdownRule>(),
    dailyLossLimit: emptyRule<number>(),
    consistency: emptyRule<ConsistencyRule>(),
    minTradingDays: emptyRule<number>(),
    qualifyingDayMinProfit: emptyRule<number>(),
    payout: emptyRule<PayoutRule>(),
  };
}

/** Firms offered as starting labels. Names only — no rules are pre-filled. */
export const KNOWN_FIRMS = ['My Funded Futures', 'Lucid Trading', 'Hyperprop', 'Tradeify', 'Other'] as const;

/** Rules that are set but not confirmed by the user. */
export function unverifiedRules(rules: AccountRules): string[] {
  const labels: Record<keyof AccountRules, string> = {
    profitTarget: 'Profit target',
    drawdown: 'Drawdown',
    dailyLossLimit: 'Daily loss limit',
    consistency: 'Consistency',
    minTradingDays: 'Minimum trading days',
    qualifyingDayMinProfit: 'Qualifying day minimum',
    payout: 'Payout rules',
  };
  return (Object.keys(labels) as (keyof AccountRules)[])
    .filter((k) => rules[k].value != null && !rules[k].verified)
    .map((k) => labels[k]);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Trading date ───────────────────────────────────────────────────────────

/**
 * CME session date for a timestamp: the futures day runs 6:00 PM ET → 5:00 PM
 * ET, so anything at or after 6 PM ET belongs to the next calendar date.
 * Many prop firms use this definition; confirm yours.
 */
export function cmeSessionDate(at: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const ymd = `${p.year}-${p.month}-${p.day}`;
  if (Number(p.hour) < 18) return ymd;
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Consistency ────────────────────────────────────────────────────────────

export interface ConsistencyResult {
  formula: ConsistencyFormula;
  thresholdPct: number;
  daysCounted: number;
  bestDay: { date: string; amount: number } | null;
  netProfit: number;
  grossProfit: number;
  /** Denominator actually used by the formula. */
  denominator: number;
  /** null when the formula is undefined (no profit yet). */
  pct: number | null;
  compliant: boolean | null;
  /** Extra profit needed (spread over days no bigger than the current best) to get under the threshold. */
  additionalProfitNeeded: number;
  /** Fewest more days needed if each future day is ≤ the current best day. */
  minAdditionalDays: number | null;
  /**
   * Largest single next-day profit that keeps (or makes) you compliant. A day
   * above the current best becomes the new best, so this is not unlimited.
   * null when no single day can make you compliant.
   */
  maxNextDayProfit: number | null;
  steps: string[];
}

export function consistency(days: DayRecord[], rule: ConsistencyRule): ConsistencyResult {
  const t = rule.thresholdPct / 100;
  const steps: string[] = [];
  const wins = days.filter((d) => d.realized > 0);
  const best = wins.reduce<{ date: string; amount: number } | null>((b, d) => (!b || d.realized > b.amount ? { date: d.date, amount: d.realized } : b), null);
  const net = r2(days.reduce((s, d) => s + d.realized, 0));
  const gross = r2(wins.reduce((s, d) => s + d.realized, 0));
  const denom = rule.formula === 'best_day_over_net_profit' ? net : gross;
  const denomName = rule.formula === 'best_day_over_net_profit' ? 'net profit (all days, losses included)' : 'gross profit (winning days only)';

  const base = { formula: rule.formula, thresholdPct: rule.thresholdPct, daysCounted: days.length, bestDay: best, netProfit: net, grossProfit: gross, denominator: denom, steps };

  if (!best || denom <= 0 || t <= 0 || t >= 1) {
    steps.push(!best ? 'No profitable day yet — consistency is not defined.' : denom <= 0 ? `The ${denomName} is ${usd(denom)} — the ratio is not defined until it is positive.` : 'Threshold must be between 0 and 100%.');
    return { ...base, pct: null, compliant: null, additionalProfitNeeded: 0, minAdditionalDays: null, maxNextDayProfit: null };
  }

  const pct = r2((best.amount / denom) * 100);
  const compliant = pct <= rule.thresholdPct + 1e-9;
  steps.push(`Best day = ${usd(best.amount)} (${best.date}).`);
  steps.push(`Denominator = ${denomName} = ${usd(denom)} over ${days.length} day(s).`);
  steps.push(`Consistency = ${usd(best.amount)} ÷ ${usd(denom)} × 100 = ${pct}% (limit ${rule.thresholdPct}%).`);

  // Need best / (denom + X) ≤ t  →  X ≥ best / t − denom (if future days stay ≤ best).
  const needed = compliant ? 0 : r2(best.amount / t - denom);
  const minDays = needed > 0 ? Math.ceil(needed / best.amount - 1e-9) : 0;
  if (!compliant) {
    steps.push(`Profit needed = ${usd(best.amount)} ÷ ${rule.thresholdPct}% − ${usd(denom)} = ${usd(needed)}, assuming no future day beats ${usd(best.amount)}.`);
    steps.push(`At most ${usd(best.amount)} per day, that is at least ${minDays} more profitable day(s).`);
  }

  // Largest next day d: if d ≤ best → need best ≤ t(denom + d) ; if d > best → need d ≤ t(denom + d) → d ≤ t·denom/(1−t).
  const capAboveBest = (t * denom) / (1 - t);
  let maxNext: number | null;
  if (capAboveBest >= best.amount) maxNext = r2(capAboveBest);
  else if (best.amount <= t * (denom + best.amount)) maxNext = best.amount;
  else maxNext = null;
  if (maxNext != null) steps.push(`A single next day above ${usd(maxNext)} would break the limit (it becomes the new best day).`);
  else steps.push('No single next day can bring you under the limit — it takes several smaller days.');

  return { ...base, pct, compliant, additionalProfitNeeded: needed, minAdditionalDays: compliant ? 0 : minDays, maxNextDayProfit: maxNext };
}

// ─── Drawdown ───────────────────────────────────────────────────────────────

export interface DrawdownDay {
  date: string;
  closingBalance: number;
  highWater: number;
  floor: number;
  /** Lowest value the breach is measured on that day. */
  testedValue: number;
  breached: boolean;
}

export interface DrawdownResult {
  type: DrawdownType;
  currentBalance: number;
  currentEquity: number;
  highWater: number;
  floor: number;
  /** Distance from today's tested value (equity or balance) to the floor. */
  remaining: number;
  trailingStopped: boolean;
  breachedOn: string | null;
  timeline: DrawdownDay[];
  warnings: string[];
  steps: string[];
}

export function drawdown(
  startingBalance: number,
  days: DayRecord[],
  rule: DrawdownRule,
  payouts: PayoutRecord[] = [],
  unrealizedNow: number | null = null,
): DrawdownResult {
  const warnings: string[] = [];
  const steps: string[] = [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const payByDate = new Map<string, number>();
  for (const p of payouts) payByDate.set(p.date, (payByDate.get(p.date) ?? 0) + p.amount);

  const lock = rule.stopTrailingAtOffset == null ? null : startingBalance + rule.stopTrailingAtOffset;
  let balance = startingBalance;
  let hwm = startingBalance;
  let floor = startingBalance - rule.amount;
  let breachedOn: string | null = null;
  const timeline: DrawdownDay[] = [];
  let missingIntraday = false;

  const trail = (candidateHwm: number) => {
    if (rule.type === 'static') return;
    hwm = Math.max(hwm, candidateHwm);
    let f = hwm - rule.amount;
    if (lock != null) f = Math.min(f, lock);
    floor = Math.max(floor, f); // the floor never moves down
  };

  for (const d of sorted) {
    const open = balance;
    // The order of a day's peak and trough is unknown, so the intraday low is
    // tested against the floor as it stood at the open, and the close against
    // the floor after today's trailing.
    const floorAtOpen = floor;
    if (rule.type === 'trailing_intraday') {
      if (d.peakUnrealized == null) missingIntraday = true;
      trail(open + Math.max(0, d.peakUnrealized ?? 0, d.realized));
    }
    const low = rule.basis === 'equity' && d.troughUnrealized != null ? open + Math.min(0, d.troughUnrealized) : null;
    if (rule.basis === 'equity' && d.troughUnrealized == null) missingIntraday = true;
    balance = r2(open + d.realized);
    const tested = Math.min(balance, low ?? balance);
    const breached = (low != null && low <= floorAtOpen + 1e-9) || balance <= floor + 1e-9;
    if (breached && !breachedOn) breachedOn = d.date;
    if (rule.type === 'trailing_eod') trail(balance);
    const paid = payByDate.get(d.date) ?? 0;
    if (paid) balance = r2(balance - paid);
    timeline.push({ date: d.date, closingBalance: balance, highWater: r2(hwm), floor: r2(floor), testedValue: r2(tested), breached });
  }
  // Payouts on dates with no trading record.
  for (const p of payouts) if (!sorted.some((d) => d.date === p.date)) balance = r2(balance - p.amount);

  const equity = r2(balance + (unrealizedNow ?? 0));
  if (rule.type === 'trailing_intraday' && unrealizedNow != null && unrealizedNow > 0) trail(equity);
  const testedNow = rule.basis === 'equity' ? equity : balance;
  const remaining = r2(testedNow - floor);
  if (remaining <= 0 && !breachedOn) breachedOn = 'now';

  if (missingIntraday) {
    warnings.push(
      rule.type === 'trailing_intraday'
        ? 'Intraday peaks are missing for some days. An intraday trailing drawdown trails your highest open equity, so the real floor may be HIGHER than shown — enter each day\'s peak open profit.'
        : 'Intraday equity lows are missing for some days; the breach check fell back to closing balance.',
    );
  }
  if (payouts.length) warnings.push('Payouts lower the balance but this model leaves the floor where it was. Some firms move or reset the drawdown after a payout — check your firm\'s rule.');

  const typeName = rule.type === 'static' ? 'Static' : rule.type === 'trailing_eod' ? 'End-of-day trailing' : 'Intraday trailing';
  steps.push(`${typeName} drawdown of ${usd(rule.amount)} measured on ${rule.basis === 'equity' ? 'intraday equity' : 'balance'}.`);
  if (rule.type === 'static') steps.push(`Floor = start ${usd(startingBalance)} − ${usd(rule.amount)} = ${usd(floor)}, fixed.`);
  else {
    steps.push(`High-water mark = ${usd(hwm)} (${rule.type === 'trailing_eod' ? 'highest closing balance' : 'highest intraday equity entered'}).`);
    steps.push(`Floor = ${usd(hwm)} − ${usd(rule.amount)}${lock != null ? `, capped at ${usd(lock)} (trailing stops there)` : ''} = ${usd(floor)}. The floor never moves down.`);
  }
  steps.push(`Remaining = ${rule.basis === 'equity' ? 'equity' : 'balance'} ${usd(testedNow)} − floor ${usd(floor)} = ${usd(remaining)}.`);

  return {
    type: rule.type,
    currentBalance: balance,
    currentEquity: equity,
    highWater: r2(hwm),
    floor: r2(floor),
    remaining,
    trailingStopped: rule.type !== 'static' && lock != null && floor >= lock - 1e-9,
    breachedOn,
    timeline,
    warnings,
    steps,
  };
}

// ─── Daily loss limit ───────────────────────────────────────────────────────

export function dailyLossRemaining(todayRealized: number, todayUnrealized: number | null, limit: number): { used: number; remaining: number; breached: boolean } {
  const used = Math.max(0, -(todayRealized + Math.min(0, todayUnrealized ?? 0)));
  return { used: r2(used), remaining: r2(limit - used), breached: used >= limit };
}

// ─── Payout planner ─────────────────────────────────────────────────────────

export interface PayoutPlan {
  eligible: boolean;
  reasons: string[];
  profit: number;
  /** Balance − (start + buffer). Negative = profit still needed. */
  aboveBuffer: number;
  profitNeededForBuffer: number;
  grossWithdrawable: number;
  traderReceives: number;
  balanceAfter: number;
  floorAfter: number | null;
  drawdownRoomAfter: number | null;
  capApplied: string | null;
  steps: string[];
}

export function planPayout(opts: {
  startingBalance: number;
  balance: number;
  rule: PayoutRule;
  /** Floor from the drawdown engine (unchanged by the payout in this model). */
  floor: number | null;
  consistencyOk: boolean | null;
  qualifyingDays: number;
  minQualifyingDays: number | null;
  requested?: number | null;
}): PayoutPlan {
  const { startingBalance: start, balance, rule, floor } = opts;
  const steps: string[] = [];
  const reasons: string[] = [];
  const profit = r2(balance - start);
  const bufferLine = start + rule.bufferAboveStart;
  const aboveBuffer = r2(balance - bufferLine);

  steps.push(`Profit = balance ${usd(balance)} − start ${usd(start)} = ${usd(profit)}.`);
  steps.push(`Required buffer: balance must stay ≥ ${usd(start)} + ${usd(rule.bufferAboveStart)} = ${usd(bufferLine)}.`);
  steps.push(`Withdrawable before caps = ${usd(balance)} − ${usd(bufferLine)} = ${usd(Math.max(0, aboveBuffer))}.`);

  let gross = Math.max(0, aboveBuffer);
  let capApplied: string | null = null;
  if (rule.maxPctOfProfit != null) {
    const cap = Math.max(0, profit) * (rule.maxPctOfProfit / 100);
    if (gross > cap) { gross = cap; capApplied = `${rule.maxPctOfProfit}% of profit`; }
    steps.push(`Cap: ${rule.maxPctOfProfit}% of profit = ${usd(cap)}.`);
  }
  if (rule.maxPayout != null) {
    if (gross > rule.maxPayout) { gross = rule.maxPayout; capApplied = `maximum payout ${usd(rule.maxPayout)}`; }
    steps.push(`Cap: maximum payout ${usd(rule.maxPayout)}.`);
  }
  if (opts.requested != null && opts.requested > 0 && opts.requested < gross) {
    gross = opts.requested;
    steps.push(`You asked for ${usd(opts.requested)}.`);
  }
  gross = Math.floor(gross * 100) / 100; // never round a withdrawal up

  if (aboveBuffer <= 0) reasons.push(`Balance is ${usd(-aboveBuffer)} short of the buffer line.`);
  if (rule.minPayout != null && gross < rule.minPayout) reasons.push(`Withdrawable ${usd(gross)} is below the minimum payout ${usd(rule.minPayout)}.`);
  if (opts.consistencyOk === false) reasons.push('Consistency rule is not met.');
  if (opts.consistencyOk == null) reasons.push('Consistency could not be evaluated (no rule or no profit).');
  if (opts.minQualifyingDays != null && opts.qualifyingDays < opts.minQualifyingDays) {
    reasons.push(`${opts.qualifyingDays} of ${opts.minQualifyingDays} qualifying trading days.`);
  }
  const eligible = reasons.length === 0 && gross > 0;
  if (!eligible) gross = 0;

  const traderReceives = r2(gross * (rule.profitSplitPct / 100));
  const balanceAfter = r2(balance - gross);
  steps.push(`Gross payout = ${usd(gross)}${capApplied ? ` (limited by ${capApplied})` : ''}. Your ${rule.profitSplitPct}% split = ${usd(traderReceives)} before taxes/fees.`);
  steps.push(`Balance after = ${usd(balanceAfter)}.`);
  const roomAfter = floor == null ? null : r2(balanceAfter - floor);
  if (floor != null) steps.push(`Drawdown room after = ${usd(balanceAfter)} − floor ${usd(floor)} = ${usd(roomAfter!)} (floor assumed unchanged by the payout).`);
  steps.push('This is an estimate from the rules you entered. It is not a promise the firm will approve the payout.');

  return {
    eligible,
    reasons,
    profit,
    aboveBuffer,
    profitNeededForBuffer: aboveBuffer < 0 ? r2(-aboveBuffer) : 0,
    grossWithdrawable: gross,
    traderReceives,
    balanceAfter,
    floorAfter: floor,
    drawdownRoomAfter: roomAfter,
    capApplied,
    steps,
  };
}

// ─── Account summary ────────────────────────────────────────────────────────

export interface AccountSummary {
  balance: number;
  realized: number;
  unrealized: number | null;
  profitTarget: number | null;
  profitToTarget: number | null;
  drawdown: DrawdownResult | null;
  dailyLoss: ReturnType<typeof dailyLossRemaining> | null;
  consistency: ConsistencyResult | null;
  qualifyingDays: number;
  minTradingDays: number | null;
  payout: PayoutPlan | null;
  nextMilestone: string;
  unverified: string[];
  missing: string[];
}

export function summarize(acct: AccountProfile, today: string): AccountSummary {
  const R = acct.rules;
  const realized = r2(acct.days.reduce((s, d) => s + d.realized, 0));
  const paid = r2(acct.payouts.reduce((s, p) => s + p.amount, 0));
  const balance = r2(acct.startingBalance + realized - paid);
  const missing: string[] = [];

  const dd = R.drawdown.value ? drawdown(acct.startingBalance, acct.days, R.drawdown.value, acct.payouts, acct.unrealizedNow ?? null) : null;
  if (!dd) missing.push('Drawdown rule');

  const todayRec = acct.days.find((d) => d.date === today);
  const dl = R.dailyLossLimit.value != null ? dailyLossRemaining(todayRec?.realized ?? 0, acct.unrealizedNow ?? null, R.dailyLossLimit.value) : null;

  const lastPayout = [...acct.payouts].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;
  const cRule = R.consistency.value;
  const cDays = cRule?.resetsOnPayout && lastPayout ? acct.days.filter((d) => d.date > lastPayout) : acct.days;
  const cons = cRule ? consistency(cDays, cRule) : null;

  const minProfit = R.qualifyingDayMinProfit.value ?? 0;
  const qualifyingDays = acct.days.filter((d) => (R.qualifyingDayMinProfit.value == null ? d.realized !== 0 : d.realized >= minProfit)).length;
  const target = R.profitTarget.value;
  const profit = r2(balance - acct.startingBalance);

  const payout = acct.phase === 'funded' && R.payout.value
    ? planPayout({
        startingBalance: acct.startingBalance,
        balance,
        rule: R.payout.value,
        floor: dd?.floor ?? null,
        consistencyOk: cons ? cons.compliant : cRule ? null : true,
        qualifyingDays,
        minQualifyingDays: R.minTradingDays.value,
      })
    : null;
  if (acct.phase === 'funded' && !R.payout.value) missing.push('Payout rules');

  let next = 'Enter your firm\'s rules to see the next milestone.';
  if (dd?.breachedOn) next = `Drawdown floor breached (${dd.breachedOn}). Contact your firm.`;
  else if (acct.phase === 'evaluation' && target != null) {
    next = profit >= target
      ? R.minTradingDays.value != null && qualifyingDays < R.minTradingDays.value
        ? `Target reached — ${R.minTradingDays.value - qualifyingDays} more qualifying day(s) needed.`
        : cons && cons.compliant === false
        ? `Target reached — consistency needs ${usd(cons.additionalProfitNeeded)} more.`
        : 'Target and listed requirements met — confirm with your firm.'
      : `${usd(target - profit)} to the profit target.`;
  } else if (payout) {
    next = payout.eligible ? `Payout of up to ${usd(payout.grossWithdrawable)} looks eligible under your entered rules — confirm with your firm.` : payout.reasons[0] ?? next;
  }

  return {
    balance,
    realized,
    unrealized: acct.unrealizedNow ?? null,
    profitTarget: target,
    profitToTarget: target != null ? r2(Math.max(0, target - profit)) : null,
    drawdown: dd,
    dailyLoss: dl,
    consistency: cons,
    qualifyingDays,
    minTradingDays: R.minTradingDays.value,
    payout,
    nextMilestone: next,
    unverified: unverifiedRules(R),
    missing,
  };
}
