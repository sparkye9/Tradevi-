/**
 * "Today in plain English": short sentences written from the live data by
 * fixed rules. Nothing here estimates or invents a value; a sentence is only
 * produced when the number behind it is present, and missing data is said
 * out loud instead of being skipped.
 */
import type { MarketView } from './market';
import type { HuntResult } from './hunter';
import { ACTIONABLE_LABELS } from './setup';
import type { CategoryId } from './config';
import type { Regime } from './regime';
import type { SignalStats } from './history/signals';

export type SentenceTone = 'green' | 'amber' | 'red' | 'gray';
export interface Sentence {
  text: string;
  tone: SentenceTone;
}

const CAT_NAME: Record<CategoryId, string> = {
  breadth: 'market breadth',
  technical: 'price trends',
  volatility: 'volatility',
  credit: 'credit markets',
  macro: 'rates and the economy',
};

export const REGIME_MEANING: Record<Regime, string> = {
  NORMAL: 'Nothing calls for protection now. Puts bought today are insurance you will usually not need.',
  'EARLY WARNING': 'Worth watching. At this stage protection is usually still cheap.',
  'ELEVATED RISK': 'Several warnings are present. Cautious investors typically respond with small, longer-dated puts.',
  'PRE-CRASH WATCH': 'This is the stage these tools are built for: warnings are piling up while protection is still cheap.',
  'BREAKDOWN CONFIRMED': 'The decline has started. Puts cost more now, so any position should be smaller.',
  'VOLATILITY EXPANSION': 'Fear is rising fast and puts are getting expensive quickly.',
  'PANIC / LATE ENTRY': 'Protection is now expensive. Buying puts here often means paying for a drop that already happened.',
};

function pct(x: number, digits = 0): string {
  return `${Math.abs(x * 100).toFixed(digits)}%`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function marketSummary(view: MarketView): Sentence[] {
  const out: Sentence[] = [];
  const s = view.score;
  const f = view.regime.facts;
  if (s.score == null) {
    out.push({ text: 'Not enough data reached Tradevi to score the market today.', tone: 'gray' });
  } else {
    const tone: SentenceTone = s.score >= 60 ? 'red' : s.score >= 30 ? 'amber' : 'green';
    out.push({ text: `Crash risk score: ${Math.round(s.score)} out of 100 warning points (${(s.band ?? 'unrated').toLowerCase()}).`, tone });
    if (s.coverage < 0.8) out.push({ text: `Only ${pct(s.coverage)} of the data arrived, so treat the score with extra care.`, tone: 'amber' });
  }

  if (f.spyDrawdown != null) {
    // drawdownFromHigh is a positive fraction (0.115 = 11.5% below the high).
    const dd = -Math.abs(f.spyDrawdown);
    const lower = f.spyLowerLow ? ', and it has broken below its recent lows' : '';
    if (dd <= -0.2) out.push({ text: `The S&P 500 (SPY) is in a bear market, ${pct(dd)} below its high${lower}.`, tone: 'red' });
    else if (dd <= -0.1) out.push({ text: `The S&P 500 (SPY) is in a correction, ${pct(dd)} below its high${lower}.`, tone: 'red' });
    else if (dd <= -0.05) out.push({ text: `The S&P 500 (SPY) has pulled back ${pct(dd)} from its high${lower}.`, tone: 'amber' });
    else out.push({ text: `The S&P 500 (SPY) is within ${pct(dd, 1)} of its high.`, tone: 'green' });
  }

  if (f.vix != null) {
    const v = f.vix.toFixed(0);
    const inverted = f.termRatio != null && f.termRatio > 1 ? ' Short-term fear is above longer-term fear, a sign of stress right now.' : '';
    if (f.vix >= 30) out.push({ text: `Fear is high (VIX ${v}).${inverted}`, tone: 'red' });
    else if (f.vix >= 20) out.push({ text: `Fear is elevated (VIX ${v}).${inverted}`, tone: 'amber' });
    else if (f.vix < 15) out.push({ text: `Fear is low (VIX ${v}), so protection is relatively cheap.${inverted}`, tone: 'green' });
    else out.push({ text: `Fear is normal (VIX ${v}).${inverted}`, tone: 'gray' });
  }

  const worse = s.categories.filter((c) => c.risk != null && c.risk >= 0.6).map((c) => CAT_NAME[c.id]);
  const calm = s.categories.filter((c) => c.risk != null && c.risk < 0.35).map((c) => CAT_NAME[c.id]);
  const missing = s.categories.filter((c) => c.risk == null).map((c) => CAT_NAME[c.id]);
  if (worse.length) out.push({ text: `Flashing warnings: ${list(worse)}.`, tone: 'red' });
  if (calm.length) {
    const credit = calm.includes('credit markets');
    out.push({ text: `Calm: ${list(calm)}.${credit ? ' Calm credit markets argue against a full financial crisis.' : ''}`, tone: 'green' });
  }
  if (missing.length) out.push({ text: `No data today for ${list(missing)}; left out of the score, not counted as safe.`, tone: 'gray' });

  if (!view.regime.insufficient) out.push({ text: `${cap(view.regime.regime.toLowerCase())} stage. ${REGIME_MEANING[view.regime.regime]}`, tone: view.regime.regime === 'NORMAL' ? 'green' : view.regime.regime === 'EARLY WARNING' || view.regime.regime === 'ELEVATED RISK' ? 'amber' : 'red' });
  else out.push({ text: 'Too little data to tell which stage the market is in.', tone: 'gray' });

  if (view.errors.length) out.push({ text: `${view.errors.length} of ${view.errors.length + view.series.length} data sources are unavailable right now and are left out.`, tone: 'gray' });
  return out;
}

const fmtDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const money = (n: number, d = 0) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export function huntSummary(hunt: HuntResult & { error?: string }, regime?: Regime | null): Sentence[] {
  if (hunt.error && !hunt.rows?.length) return [{ text: `Option prices are unavailable right now (${hunt.error}). No contracts can be judged until they return.`, tone: 'gray' }];
  if (hunt.mode === 'tail') return tailSummary(hunt, regime);
  const watch = hunt.rows.filter((r) => ACTIONABLE_LABELS.includes(r.setup.label));
  const falling = watch.length > 0 && watch.every((r) => r.setup.label === 'IN A FALL');
  const out: Sentence[] = [];
  if (hunt.noTrade || !watch.length) {
    out.push({ text: `No ${hunt.symbol} put passes the safety checks today (${hunt.scanned.toLocaleString()} checked). Nothing to buy; waiting is a valid answer.`, tone: 'gray' });
    if (hunt.noTradeReason) out.push({ text: hunt.noTradeReason, tone: 'gray' });
  } else {
    if (falling) {
      out.push({ text: `The market is already falling. ${hunt.passing.toLocaleString()} ${hunt.symbol} put${hunt.passing === 1 ? '' : 's'} pass the checks out of ${hunt.scanned.toLocaleString()}; these are candidates for riding the fall.`, tone: 'amber' });
      out.push({ text: 'These are IN A FALL candidates, not early warnings: puts cost more now, and a sharp bounce can wipe out most of the premium within days.', tone: 'red' });
    } else out.push({ text: `${watch.length} ${hunt.symbol} put${watch.length === 1 ? '' : 's'} worth a closer look, out of ${hunt.scanned.toLocaleString()} checked.`, tone: 'green' });
    const t = watch[0].ev;
    const c = t.contract;
    if (t.costAtAsk != null && t.breakevenAtAsk != null) {
      const drop = t.declineToBreakeven != null ? ` (a ${pct(t.declineToBreakeven, 1)} drop)` : '';
      out.push({ text: `${falling ? 'Top candidate' : 'Top pick'}: the $${c.strike} put expiring ${fmtDay(c.expiration)}. It costs ${money(t.costAtAsk)} per contract, which is the most you can lose, and makes money at expiration if ${c.underlying} is below ${money(t.breakevenAtAsk, 2)}${drop}.`, tone: 'gray' });
    }
  }
  if (regime === 'PANIC / LATE ENTRY' || regime === 'VOLATILITY EXPANSION') out.push({ text: 'Fear is already high, so every put costs more than usual today.', tone: 'amber' });
  return out;
}

function tailSummary(hunt: HuntResult, regime?: Regime | null): Sentence[] {
  const out: Sentence[] = [];
  const rows = hunt.rows.filter((r) => r.tail);
  if (!rows.length) {
    out.push({ text: `No cheap ${hunt.symbol} tail put passes the liquidity and price checks today (${hunt.scanned.toLocaleString()} checked).`, tone: 'gray' });
    return out;
  }
  out.push({ text: `${hunt.passing} cheap ${hunt.symbol} put${hunt.passing === 1 ? '' : 's'} pass${hunt.passing === 1 ? 'es' : ''} the checks, out of ${hunt.scanned.toLocaleString()}. These are tail bets: most expire worthless.`, tone: 'amber' });
  const t = rows[0];
  const c = t.ev.contract;
  const h = t.tail!.headline;
  if (c.ask != null) {
    out.push({ text: `Biggest multiplier: the $${c.strike} put expiring ${fmtDay(c.expiration)}, ${money(c.ask * 100)} per contract. If ${c.underlying} fell 5% and the VIX rose 10 points within ${t.tail!.holdDays} days, the model values it near ${money(h.value * 100)}, about ${h.multiple >= 10 ? Math.round(h.multiple) : h.multiple.toFixed(1)} times the cost.`, tone: 'green' });
  }
  if (t.tail!.chanceWorthless != null) out.push({ text: `The option market puts its chance of expiring worthless near ${pct(t.tail!.chanceWorthless)}.`, tone: 'red' });
  if (regime === 'PANIC / LATE ENTRY' || regime === 'VOLATILITY EXPANSION') out.push({ text: 'Fear is already high, so these cost more than on a calm day, and a further spike is needed to pay.', tone: 'amber' });
  return out;
}

export function signalLine(s: SignalStats): string {
  const lead = s.avgLeadDays != null ? `, on average ${Math.round(s.avgLeadDays)} days early` : '';
  return `Warned before ${s.warned} of ${s.declines} drops of 10% or more${lead}. ${s.falseAlarms} false alarm${s.falseAlarms === 1 ? '' : 's'}.`;
}
