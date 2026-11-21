/**
 * Crash Intelligence indicators.
 *
 * Each indicator reads only through a PointInTime view, returns its raw
 * value, a 0–1 risk reading and a plain-English interpretation, or null when
 * its inputs are missing. Indicators that measure the same thing share a
 * `cluster`; the score counts each cluster once (see riskScore.ts), which is
 * how correlated readings are kept from being double-counted.
 */
import type { CategoryId } from './config';
import { PointInTime, change, pctChange, percentileRank, ramp, ratioCloses, realizedVol, sma } from './series';

export interface IndicatorValue {
  value: number;
  display: string;
  risk: number;
  interpretation: string;
}

export interface IndicatorDef {
  id: string;
  category: CategoryId;
  cluster: string;
  label: string;
  /** Series ids read; the first missing one makes the indicator "missing". */
  needs: string[];
  /** One line on what the indicator is and why it matters. */
  about: string;
  compute(p: PointInTime): IndicatorValue | null;
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const signedPct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const bp = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} bp`;

export const SECTOR_ETFS = ['XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLE', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC'];

/** Relative performance of a vs b over `lookback` sessions, as a decimal. */
function relPerf(p: PointInTime, a: string, b: string, lookback: number): number | null {
  const r = ratioCloses(p.bars(a), p.bars(b));
  return pctChange(r, lookback);
}

function drawdownFromHigh(closes: number[], window = 252): number | null {
  if (closes.length < 60) return null;
  const w = closes.slice(-window);
  const hi = Math.max(...w);
  return hi > 0 ? 1 - w[w.length - 1] / hi : null;
}

/** Share of available sector ETFs closing above their `period`-day SMA. */
function sectorParticipation(p: PointInTime, period: number): { share: number; n: number } | null {
  let above = 0;
  let n = 0;
  for (const s of SECTOR_ETFS) {
    const c = p.closes(s);
    const m = sma(c, period);
    if (m == null) continue;
    n++;
    if (c[c.length - 1] > m) above++;
  }
  return n >= 6 ? { share: above / n, n } : null;
}

function trendRisk(closes: number[]): { risk: number; parts: string[] } | null {
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  if (s50 == null || s200 == null) return null;
  const last = closes[closes.length - 1];
  let risk = 0;
  const parts: string[] = [];
  if (last < s50) {
    risk += 0.35;
    parts.push('below 50-day');
  }
  if (last < s200) {
    risk += 0.45;
    parts.push('below 200-day');
  }
  if (s50 < s200) {
    risk += 0.2;
    parts.push('50-day under 200-day');
  }
  return { risk: Math.min(1, risk), parts };
}

export const INDICATORS: IndicatorDef[] = [
  // ─── Breadth ────────────────────────────────────────────────────────────
  {
    id: 'breadth_pct_above_50',
    category: 'breadth',
    cluster: 'participation',
    label: '% of S&P 500 above 50-day',
    needs: ['BREADTH_50'],
    about: 'Share of index members above their 50-day average. Imported from TradingView (CSV or alert) or Finviz.',
    compute(p) {
      const l = p.latest('BREADTH_50');
      if (!l) return null;
      const v = l.value > 1 ? l.value / 100 : l.value;
      return {
        value: v,
        display: pct(v, 0),
        risk: ramp(v, 0.7, 0.3),
        interpretation: v < 0.4 ? 'Most stocks are below their 50-day average.' : v > 0.6 ? 'Participation is broad.' : 'Participation is mixed.',
      };
    },
  },
  {
    id: 'breadth_pct_above_200',
    category: 'breadth',
    cluster: 'participation_long',
    label: '% of S&P 500 above 200-day',
    needs: ['BREADTH_200'],
    about: 'Long-term participation. Imported from TradingView (CSV or alert) or Finviz.',
    compute(p) {
      const l = p.latest('BREADTH_200');
      if (!l) return null;
      const v = l.value > 1 ? l.value / 100 : l.value;
      return {
        value: v,
        display: pct(v, 0),
        risk: ramp(v, 0.7, 0.35),
        interpretation: v < 0.5 ? 'Fewer than half of stocks are in long-term uptrends.' : 'Long-term participation is healthy.',
      };
    },
  },
  {
    id: 'sector_participation_50',
    category: 'breadth',
    cluster: 'participation',
    label: 'Sectors above 50-day (11 SPDR ETFs)',
    needs: ['XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLE'],
    about: 'Free breadth proxy: how many sector ETFs are above their 50-day average. Uses ETFs, so no survivorship bias.',
    compute(p) {
      const r = sectorParticipation(p, 50);
      if (!r) return null;
      return {
        value: r.share,
        display: `${Math.round(r.share * r.n)} of ${r.n}`,
        risk: ramp(r.share, 0.8, 0.3),
        interpretation: r.share <= 0.4 ? 'Most sectors have lost their 50-day trend.' : r.share >= 0.7 ? 'Most sectors are trending up.' : 'Sector participation is narrowing.',
      };
    },
  },
  {
    id: 'sector_participation_200',
    category: 'breadth',
    cluster: 'participation_long',
    label: 'Sectors above 200-day',
    needs: ['XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLE'],
    about: 'Long-term version of the sector breadth proxy.',
    compute(p) {
      const r = sectorParticipation(p, 200);
      if (!r) return null;
      return {
        value: r.share,
        display: `${Math.round(r.share * r.n)} of ${r.n}`,
        risk: ramp(r.share, 0.8, 0.35),
        interpretation: r.share <= 0.5 ? 'Half or more of sectors are below their 200-day.' : 'Most sectors remain in long-term uptrends.',
      };
    },
  },
  {
    id: 'equal_vs_cap_weight',
    category: 'breadth',
    cluster: 'leadership',
    label: 'Equal-weight vs cap-weight (RSP/SPY, 50 sessions)',
    needs: ['RSP', 'SPY'],
    about: 'When the average stock lags the index, a few mega-caps are carrying it — a classic narrow-leadership divergence.',
    compute(p) {
      const rel = relPerf(p, 'RSP', 'SPY', 50);
      if (rel == null) return null;
      const dd = drawdownFromHigh(p.closes('SPY'));
      const nearHigh = dd != null && dd < 0.03;
      const base = ramp(rel, 0.01, -0.04);
      const risk = Math.min(1, base * (nearHigh ? 1.2 : 1));
      return {
        value: rel,
        display: signedPct(rel),
        risk,
        interpretation:
          rel < -0.02 && nearHigh
            ? 'Divergence: SPY is near its high while the average stock lags.'
            : rel < -0.02
              ? 'The average stock is lagging the index.'
              : 'Leadership is broad enough.',
      };
    },
  },
  {
    id: 'small_caps_relative',
    category: 'breadth',
    cluster: 'index_divergence',
    label: 'Small caps vs S&P 500 (IWM/SPY, 50 sessions)',
    needs: ['IWM', 'SPY'],
    about: 'Small caps often weaken first when financing conditions tighten.',
    compute(p) {
      const rel = relPerf(p, 'IWM', 'SPY', 50);
      if (rel == null) return null;
      return {
        value: rel,
        display: signedPct(rel),
        risk: ramp(rel, 0.01, -0.07),
        interpretation: rel < -0.04 ? 'Small caps are breaking down relative to large caps.' : rel < 0 ? 'Small caps are lagging slightly.' : 'Small caps are keeping pace.',
      };
    },
  },
  {
    id: 'dow_relative',
    category: 'breadth',
    cluster: 'index_divergence',
    label: 'Dow vs S&P 500 (DIA/SPY, 50 sessions)',
    needs: ['DIA', 'SPY'],
    about: 'Relative weakness in the industrial / value-heavy Dow.',
    compute(p) {
      const rel = relPerf(p, 'DIA', 'SPY', 50);
      if (rel == null) return null;
      return {
        value: rel,
        display: signedPct(rel),
        risk: ramp(rel, 0.01, -0.05),
        interpretation: rel < -0.03 ? 'The Dow is lagging the S&P 500.' : 'The Dow is in line with the S&P 500.',
      };
    },
  },
  {
    id: 'defensive_vs_cyclical',
    category: 'breadth',
    cluster: 'rotation',
    label: 'Defensives vs cyclicals ((XLU+XLP)/(XLY+XLK), 20 sessions)',
    needs: ['XLU', 'XLP', 'XLY', 'XLK'],
    about: 'Money rotating into utilities and staples while discretionary and tech weaken is a risk-off tell.',
    compute(p) {
      const d = [p.bars('XLU'), p.bars('XLP')];
      const c = [p.bars('XLY'), p.bars('XLK')];
      const m = (rows: { date: string; close: number }[][]) => {
        const maps = rows.map((r) => new Map(r.map((b) => [b.date, b.close])));
        return rows[0].filter((b) => maps.every((mm) => mm.has(b.date))).map((b) => ({ date: b.date, close: maps.reduce((s, mm) => s + (mm.get(b.date) ?? 0), 0) }));
      };
      const rel = pctChange(ratioCloses(m(d), m(c)), 20);
      if (rel == null) return null;
      return {
        value: rel,
        display: signedPct(rel),
        risk: ramp(rel, -0.01, 0.06),
        interpretation: rel > 0.03 ? 'Defensive sectors are outperforming cyclicals.' : 'No defensive rotation.',
      };
    },
  },
  {
    id: 'net_new_highs',
    category: 'breadth',
    cluster: 'highs_lows',
    label: 'Net new 52-week highs (NYSE/Nasdaq)',
    needs: ['NET_NEW_HIGHS'],
    about: 'New highs minus new lows. Imported from TradingView (CSV or alert).',
    compute(p) {
      const l = p.latest('NET_NEW_HIGHS');
      if (!l) return null;
      return {
        value: l.value,
        display: Math.round(l.value).toString(),
        risk: ramp(l.value, 100, -200),
        interpretation: l.value < 0 ? 'More stocks are making new lows than new highs.' : 'New highs outnumber new lows.',
      };
    },
  },

  // ─── Price structure ────────────────────────────────────────────────────
  {
    id: 'spy_trend',
    category: 'technical',
    cluster: 'trend',
    label: 'SPY trend (50 / 200-day)',
    needs: ['SPY'],
    about: 'Position of SPY against its 50- and 200-day averages.',
    compute(p) {
      const t = trendRisk(p.closes('SPY'));
      if (!t) return null;
      return { value: t.risk, display: t.parts.length ? t.parts.join(', ') : 'above both', risk: t.risk, interpretation: t.parts.length ? `SPY is ${t.parts.join(', ')}.` : 'SPY is above its 50- and 200-day averages.' };
    },
  },
  {
    id: 'qqq_trend',
    category: 'technical',
    cluster: 'trend',
    label: 'QQQ trend (50 / 200-day)',
    needs: ['QQQ'],
    about: 'Position of QQQ against its 50- and 200-day averages.',
    compute(p) {
      const t = trendRisk(p.closes('QQQ'));
      if (!t) return null;
      return { value: t.risk, display: t.parts.length ? t.parts.join(', ') : 'above both', risk: t.risk, interpretation: t.parts.length ? `QQQ is ${t.parts.join(', ')}.` : 'QQQ is above its 50- and 200-day averages.' };
    },
  },
  {
    id: 'spy_drawdown',
    category: 'technical',
    cluster: 'drawdown',
    label: 'SPY drawdown from 52-week high',
    needs: ['SPY'],
    about: 'How far SPY has fallen from its highest close of the past year.',
    compute(p) {
      const dd = drawdownFromHigh(p.closes('SPY'));
      if (dd == null) return null;
      return { value: dd, display: `−${pct(dd)}`, risk: ramp(dd, 0.02, 0.15), interpretation: dd < 0.03 ? 'SPY is near its high.' : dd >= 0.1 ? 'SPY is in a correction.' : 'SPY is pulling back.' };
    },
  },
  {
    id: 'distribution_days',
    category: 'technical',
    cluster: 'distribution',
    label: 'SPY distribution days (last 25 sessions)',
    needs: ['SPY'],
    about: 'Days SPY fell at least 0.2% on higher volume than the day before — institutional selling.',
    compute(p) {
      const b = p.bars('SPY');
      if (b.length < 27) return null;
      let n = 0;
      for (let i = b.length - 25; i < b.length; i++) {
        const r = b[i].close / b[i - 1].close - 1;
        if (r <= -0.002 && b[i].volume > b[i - 1].volume && b[i].volume > 0) n++;
      }
      return { value: n, display: `${n}`, risk: ramp(n, 2, 7), interpretation: n >= 5 ? 'Heavy distribution: repeated high-volume selling.' : n >= 3 ? 'Some distribution is building.' : 'Little distribution.' };
    },
  },
  {
    id: 'downside_volume',
    category: 'technical',
    cluster: 'distribution',
    label: 'SPY down-day vs up-day volume (20 sessions)',
    needs: ['SPY'],
    about: 'Average volume on down days divided by average volume on up days.',
    compute(p) {
      const b = p.bars('SPY');
      if (b.length < 22) return null;
      let up = 0, upN = 0, dn = 0, dnN = 0;
      for (let i = b.length - 20; i < b.length; i++) {
        if (b[i].volume <= 0) continue;
        if (b[i].close >= b[i - 1].close) { up += b[i].volume; upN++; } else { dn += b[i].volume; dnN++; }
      }
      if (!upN || !dnN) return null;
      const ratio = dn / dnN / (up / upN);
      return { value: ratio, display: `${ratio.toFixed(2)}×`, risk: ramp(ratio, 1.0, 1.6), interpretation: ratio > 1.25 ? 'Selling days carry noticeably more volume.' : 'Volume is balanced.' };
    },
  },
  {
    id: 'structure_break',
    category: 'technical',
    cluster: 'structure',
    label: 'SPY structure (lower low / failed breakout)',
    needs: ['SPY'],
    about: 'A close below the prior 50-session low, or a fresh 52-week high that failed within 15 sessions.',
    compute(p) {
      const c = p.closes('SPY');
      if (c.length < 260) return null;
      const last = c[c.length - 1];
      const prior50Low = Math.min(...c.slice(-51, -1));
      const lowerLow = last < prior50Low;
      const yearHi = Math.max(...c.slice(-252));
      const hiIdx = c.length - 252 + c.slice(-252).indexOf(yearHi);
      const failed = c.length - 1 - hiIdx <= 15 && last < yearHi * 0.97;
      const risk = lowerLow ? 1 : failed ? 0.6 : 0;
      return {
        value: risk,
        display: lowerLow ? 'lower low' : failed ? 'failed breakout' : 'intact',
        risk,
        interpretation: lowerLow ? 'SPY closed below its 50-session low: structure is broken.' : failed ? 'A recent new high has already failed by more than 3%.' : 'No broken structure.',
      };
    },
  },

  // ─── Volatility ─────────────────────────────────────────────────────────
  {
    id: 'vix_level',
    category: 'volatility',
    cluster: 'vix',
    label: 'VIX level',
    needs: ['VIX'],
    about: 'The market’s 30-day implied volatility for the S&P 500.',
    compute(p) {
      const l = p.latest('VIX');
      if (!l) return null;
      return { value: l.value, display: l.value.toFixed(2), risk: ramp(l.value, 13, 32), interpretation: l.value < 15 ? 'Volatility is subdued.' : l.value > 25 ? 'Volatility is elevated.' : 'Volatility is moderate.' };
    },
  },
  {
    id: 'vix_change',
    category: 'volatility',
    cluster: 'vix_momentum',
    label: 'VIX change (5 sessions)',
    needs: ['VIX'],
    about: 'A fast rise in VIX means protection is being repriced.',
    compute(p) {
      const ch = pctChange(p.closes('VIX'), 5);
      if (ch == null) return null;
      return { value: ch, display: signedPct(ch, 0), risk: ramp(ch, 0.05, 0.5), interpretation: ch > 0.25 ? 'VIX is spiking.' : ch < -0.1 ? 'VIX is falling.' : 'VIX is steady.' };
    },
  },
  {
    id: 'vix_term_structure',
    category: 'volatility',
    cluster: 'term_structure',
    label: 'VIX / VIX3M (term structure)',
    needs: ['VIX', 'VIX3M'],
    about: 'Above 1.0 the curve is inverted: near-term fear exceeds longer-term fear.',
    compute(p) {
      const a = p.latest('VIX');
      const b = p.latest('VIX3M');
      if (!a || !b || b.value <= 0 || a.date !== b.date) return null;
      const r = a.value / b.value;
      return { value: r, display: r.toFixed(2), risk: ramp(r, 0.85, 1.05), interpretation: r >= 1 ? 'Inverted: near-term stress.' : r > 0.92 ? 'Flattening.' : 'Normal contango.' };
    },
  },
  {
    id: 'realized_vol',
    category: 'volatility',
    cluster: 'realized',
    label: 'SPY 20-day realized volatility',
    needs: ['SPY'],
    about: 'How much SPY has actually been moving, annualised.',
    compute(p) {
      const rv = realizedVol(p.closes('SPY'), 20);
      if (rv == null) return null;
      return { value: rv, display: pct(rv), risk: ramp(rv, 0.1, 0.35), interpretation: rv > 0.25 ? 'SPY is moving violently.' : rv < 0.12 ? 'SPY is calm.' : 'SPY movement is normal.' };
    },
  },
  {
    id: 'skew_index',
    category: 'volatility',
    cluster: 'skew',
    label: 'Cboe SKEW index',
    needs: ['SKEW'],
    about: 'Price of far out-of-the-money S&P puts versus normal. High values mean tail protection is in demand (and dearer).',
    compute(p) {
      const l = p.latest('SKEW');
      if (!l) return null;
      return { value: l.value, display: l.value.toFixed(1), risk: ramp(l.value, 120, 155), interpretation: l.value > 145 ? 'Tail protection is expensive.' : 'Tail protection is not unusually priced.' };
    },
  },

  // ─── Credit & financial stress ──────────────────────────────────────────
  {
    id: 'hy_oas',
    category: 'credit',
    cluster: 'high_yield',
    label: 'High-yield spread (ICE BofA OAS)',
    needs: ['HY_OAS'],
    about: 'Extra yield junk bonds pay over Treasuries. Widening means lenders are getting nervous.',
    compute(p) {
      const v = p.closes('HY_OAS');
      if (v.length < 61) return null;
      const last = v[v.length - 1];
      const ch = change(v, 60) ?? 0;
      const risk = Math.max(ramp(last, 3.0, 7.0), ramp(ch, 0.1, 1.2));
      return { value: last, display: `${last.toFixed(2)}% (${bp(ch)} / 60d)`, risk, interpretation: ch > 0.5 ? 'High-yield spreads are widening fast.' : last > 5 ? 'High-yield spreads are wide.' : 'High-yield credit is calm.' };
    },
  },
  {
    id: 'hyg_vs_treasuries',
    category: 'credit',
    cluster: 'high_yield',
    label: 'Junk bonds vs Treasuries (HYG/IEF, 50 sessions)',
    needs: ['HYG', 'IEF'],
    about: 'Market-priced version of the high-yield spread, updated intraday.',
    compute(p) {
      const rel = relPerf(p, 'HYG', 'IEF', 50);
      if (rel == null) return null;
      return { value: rel, display: signedPct(rel), risk: ramp(rel, 0.01, -0.05), interpretation: rel < -0.02 ? 'Junk bonds are underperforming Treasuries.' : 'Junk bonds are holding up.' };
    },
  },
  {
    id: 'ig_oas',
    category: 'credit',
    cluster: 'investment_grade',
    label: 'Investment-grade spread (ICE BofA OAS)',
    needs: ['IG_OAS'],
    about: 'Spread on high-quality corporate bonds.',
    compute(p) {
      const v = p.closes('IG_OAS');
      if (v.length < 61) return null;
      const last = v[v.length - 1];
      const ch = change(v, 60) ?? 0;
      const risk = Math.max(ramp(last, 0.9, 2.0), ramp(ch, 0.05, 0.45));
      return { value: last, display: `${last.toFixed(2)}% (${bp(ch)} / 60d)`, risk, interpretation: ch > 0.2 ? 'Investment-grade spreads are widening.' : 'Investment-grade credit is calm.' };
    },
  },
  {
    id: 'baa_aaa',
    category: 'credit',
    cluster: 'investment_grade',
    label: 'Moody’s Baa − Aaa yield gap',
    needs: ['BAA', 'AAA'],
    about: 'Quality spread inside investment grade; long history back to the 1980s.',
    compute(p) {
      const a = p.levels('BAA');
      const b = new Map(p.levels('AAA').map((x) => [x.date, x.value]));
      const gaps = a.filter((x) => b.has(x.date)).map((x) => x.value - (b.get(x.date) ?? 0));
      if (gaps.length < 61) return null;
      const last = gaps[gaps.length - 1];
      const ch = change(gaps, 60) ?? 0;
      return { value: last, display: `${last.toFixed(2)} pts (${bp(ch)} / 60d)`, risk: Math.max(ramp(last, 0.7, 1.6), ramp(ch, 0.05, 0.4)), interpretation: last > 1.2 ? 'Lower-rated corporates are paying up.' : 'Quality spread is normal.' };
    },
  },
  {
    id: 'lqd_vs_treasuries',
    category: 'credit',
    cluster: 'investment_grade',
    label: 'Corporate bonds vs Treasuries (LQD/IEF, 50 sessions)',
    needs: ['LQD', 'IEF'],
    about: 'Market-priced version of the investment-grade spread.',
    compute(p) {
      const rel = relPerf(p, 'LQD', 'IEF', 50);
      if (rel == null) return null;
      return { value: rel, display: signedPct(rel), risk: ramp(rel, 0.005, -0.03), interpretation: rel < -0.015 ? 'Corporate bonds are lagging Treasuries.' : 'Corporate bonds are in line.' };
    },
  },
  {
    id: 'financials_relative',
    category: 'credit',
    cluster: 'financials',
    label: 'Banks vs market (XLF/SPY and KRE/SPY, 50 sessions)',
    needs: ['XLF', 'SPY'],
    about: 'Financial-sector weakness often leads credit trouble (2007, 2023).',
    compute(p) {
      const a = relPerf(p, 'XLF', 'SPY', 50);
      const b = p.has('KRE') ? relPerf(p, 'KRE', 'SPY', 50) : null;
      if (a == null) return null;
      const worst = b == null ? a : Math.min(a, b);
      return {
        value: worst,
        display: b == null ? `XLF ${signedPct(a)}` : `XLF ${signedPct(a)}, KRE ${signedPct(b)}`,
        risk: ramp(worst, 0.01, -0.1),
        interpretation: worst < -0.05 ? 'Financial stocks are underperforming sharply.' : worst < 0 ? 'Financials are lagging a little.' : 'Financials are keeping pace.',
      };
    },
  },

  // ─── Macro & liquidity ──────────────────────────────────────────────────
  {
    id: 'yield_curve',
    category: 'macro',
    cluster: 'curve',
    label: 'Yield curve (10y − 3m, with re-steepening)',
    needs: ['T10Y3M'],
    about: 'An inverted curve has preceded recessions; the danger zone is often when it re-steepens out of inversion.',
    compute(p) {
      const v = p.closes('T10Y3M');
      if (v.length < 260) return null;
      const last = v[v.length - 1];
      const minYear = Math.min(...v.slice(-260));
      const resteep = minYear < -0.25 && last - minYear > 0.5;
      const risk = resteep ? 0.9 : last < 0 ? 0.6 : ramp(last, 1.0, 0);
      return { value: last, display: `${last.toFixed(2)} pts${resteep ? ' (re-steepening)' : ''}`, risk, interpretation: resteep ? 'The curve is re-steepening out of inversion.' : last < 0 ? 'The curve is inverted.' : 'The curve is positively sloped.' };
    },
  },
  {
    id: 'yield_curve_2s10s',
    category: 'macro',
    cluster: 'curve',
    label: 'Yield curve (10y − 2y)',
    needs: ['T10Y2Y'],
    about: 'Second curve measure; shares a cluster with 10y − 3m so the curve counts once.',
    compute(p) {
      const v = p.closes('T10Y2Y');
      if (v.length < 260) return null;
      const last = v[v.length - 1];
      const minYear = Math.min(...v.slice(-260));
      const resteep = minYear < -0.2 && last - minYear > 0.4;
      const risk = resteep ? 0.85 : last < 0 ? 0.55 : ramp(last, 0.8, 0);
      return { value: last, display: `${last.toFixed(2)} pts${resteep ? ' (re-steepening)' : ''}`, risk, interpretation: resteep ? '2s10s is re-steepening out of inversion.' : last < 0 ? '2s10s is inverted.' : '2s10s is positive.' };
    },
  },
  {
    id: 'financial_stress_index',
    category: 'macro',
    cluster: 'conditions',
    label: 'St. Louis Fed Financial Stress Index',
    needs: ['STLFSI'],
    about: 'Weekly composite of 18 market series; 0 is average stress.',
    compute(p) {
      const l = p.latest('STLFSI');
      if (!l) return null;
      return { value: l.value, display: l.value.toFixed(2), risk: ramp(l.value, -0.8, 1.5), interpretation: l.value > 0 ? 'Financial stress is above average.' : 'Financial stress is below average.' };
    },
  },
  {
    id: 'nfci',
    category: 'macro',
    cluster: 'conditions',
    label: 'Chicago Fed National Financial Conditions Index',
    needs: ['NFCI'],
    about: 'Weekly; positive means tighter-than-average financial conditions.',
    compute(p) {
      const l = p.latest('NFCI');
      if (!l) return null;
      return { value: l.value, display: l.value.toFixed(2), risk: ramp(l.value, -0.6, 0.4), interpretation: l.value > 0 ? 'Financial conditions are tight.' : 'Financial conditions are loose.' };
    },
  },
  {
    id: 'rate_shock',
    category: 'macro',
    cluster: 'rates',
    label: '10-year Treasury yield change (60 sessions)',
    needs: ['DGS10'],
    about: 'A fast rise in long yields tightens conditions for every asset (2022).',
    compute(p) {
      const ch = change(p.closes('DGS10'), 60);
      if (ch == null) return null;
      return { value: ch, display: bp(ch), risk: ramp(Math.abs(ch), 0.25, 1.0), interpretation: ch > 0.5 ? 'Long yields are rising quickly.' : ch < -0.5 ? 'Long yields are falling quickly (flight to safety?).' : 'Rates are stable.' };
    },
  },
  {
    id: 'dollar_spike',
    category: 'macro',
    cluster: 'dollar',
    label: 'US dollar (UUP, 20 sessions)',
    needs: ['UUP'],
    about: 'A sharp dollar rally drains global liquidity.',
    compute(p) {
      const ch = pctChange(p.closes('UUP'), 20);
      if (ch == null) return null;
      return { value: ch, display: signedPct(ch), risk: ramp(ch, 0.01, 0.05), interpretation: ch > 0.03 ? 'The dollar is surging.' : 'The dollar is stable.' };
    },
  },
];

/** VIX percentile within its trailing year, for regime and cheapness checks. */
export function vixPercentile(p: PointInTime): number | null {
  return percentileRank(p.closes('VIX'), 252);
}

export { drawdownFromHigh };
