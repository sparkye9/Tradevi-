# Crash Intelligence, Put Hunter and the Crash Simulator

Research and decision support only. Tradevi never places orders, and none of
the scores below is a probability of a crash or of a winning trade.

- **Crash Intelligence** (`/crash-intelligence`): a 0–100 Market Crash Risk
  Score, the market regime, every indicator behind them, catalysts and data
  freshness.
- **Put Hunter** (`/put-hunter`): scans Tradier put chains for SPY, QQQ, IWM,
  DIA or any ticker, in three horizons (14–60 DTE, 60–120 DTE, LEAPS 120+),
  and scores each contract three separate ways.
- **Crash Simulator** (`/crash-simulator`): historical replay of the same
  engine (second pull request).

Code: pure engines in `lib/crash/` (no network), providers in
`lib/crash/providers/`, routes in `app/api/crash/`. Tests:
`npx tsx scripts/check-crash.ts` (part of `npm test`).

---

## 1. Market Crash Risk Score (0–100)

```
indicator risk (0–1) → cluster risk = mean of its available indicators
                      → category risk = mean of its available clusters
score = 100 × Σ(weight × category risk) / Σ(weight of scored categories)
```

| Category | Weight | Clusters (each counts once) |
| --- | ---: | --- |
| Market breadth | 20 | participation (50-day), long participation (200-day), leadership (RSP/SPY), index divergence (IWM, DIA vs SPY), rotation (defensives vs cyclicals), new highs vs lows |
| Price structure | 20 | trend (SPY, QQQ vs 50/200-day), drawdown, distribution (distribution days, down-volume ratio), structure (lower low / failed breakout) |
| Volatility & skew | 20 | VIX level, VIX momentum, term structure (VIX/VIX3M), realized volatility, skew (Cboe SKEW) |
| Credit & financial stress | 20 | high yield (HY OAS, HYG/IEF), investment grade (IG OAS, Baa−Aaa, LQD/IEF), financials (XLF, KRE vs SPY) |
| Macro & liquidity | 20 | curve (10y−3m, 10y−2y, with re-steepening), financial conditions (STLFSI, NFCI), rates (10-year 60-day change), dollar (UUP) |

**Double counting.** Indicators that measure the same thing share a cluster,
and a cluster counts once however many of its indicators have data. Some
overlap remains across categories (the St. Louis Fed index contains credit
spreads and VIX); it is documented rather than hidden.

**Missing data is never zero risk.** A missing indicator is left out and shown
gray with the reason. A category with fewer than half of its clusters is
"insufficient data" and left out of the score. The score always comes with a
coverage figure (weighted share of clusters with data) and a confidence
(high ≥ 80%, medium ≥ 55%, low otherwise). With no data at all the score is
blank and the regime shows INSUFFICIENT DATA, never NORMAL.

**Direction.** Each indicator's risk reading is recomputed 5 and 20 sessions
earlier; a change above 0.05 is "deteriorating" or "improving".

**Bands.** 0–19 Normal · 20–39 Early warnings · 40–59 Elevated · 60–79 High ·
80–100 Severe.

**Calibration.** Every threshold (the `ramp` anchors in
`lib/crash/indicators.ts`, the weights and bands in `lib/crash/config.ts`) is
a starting judgment, not a fitted value. The Crash Simulator is where they are
tested: thresholds may be tuned only on the in-sample years, and results on
the held-out years are reported separately.

## 2. Market regime

A separate rule set (first match wins), in `lib/crash/regime.ts`:

| Regime | Rule (defaults in `DEFAULT_REGIME_CONFIG`) |
| --- | --- |
| PANIC / LATE ENTRY | VIX ≥ 35, or VIX in the top 5% of its past year with VIX ≥ VIX3M |
| VOLATILITY EXPANSION | VIX up ≥ 40% in 10 sessions and ≥ 20, or VIX ≥ VIX3M |
| BREAKDOWN CONFIRMED | SPY below its 200-day and below its 50-session low, or ≥ 10% off its 52-week high |
| PRE-CRASH WATCH | ≥ 3 non-volatility categories with risk ≥ 0.45, while VIX ≤ 20 (or in the lower half of its year), and SPY < 7% off its high |
| ELEVATED RISK | score ≥ 40 |
| EARLY WARNING | score ≥ 20, or 2 categories deteriorating |
| NORMAL | none of the above |

PRE-CRASH WATCH is the "underpriced protection" state the spec asks for:
several independent problems while volatility has not repriced.

## 3. Put Hunter

### Screening (adjustable on the page)

| | Short term | Long term | LEAPS |
| --- | --- | --- | --- |
| Premium ($/share) | 0.05–0.50 | 0.05–3.00 | 0.05–25 |
| DTE | 14–60 | 60–120 | 120–800 |
| \|Delta\| | 0.10–0.36 | 0.10–0.36 | 0.10–0.50 |
| Min open interest | 100 | 100 | 100 |
| Min volume | 10 | 10 | 0 |
| Max spread (ask−bid)/mid | 25% | 25% | 25% |

Always rejected, with the reason shown: no two-sided quote, zero bid, crossed
quote, missing Greeks or IV, Greeks older than 90 minutes during the regular
session, no underlying price. Yahoo's fallback chain (delayed, no Greeks) is
never scored.

### Numbers shown for every contract

Cost = premium × 100 (at the ask, before fees). Max loss = that cost.
Breakeven at expiry = strike − premium (at the ask; the mid version is in the
detail). Decline to breakeven = 1 − breakeven / price. Standard moves to
breakeven = that decline ÷ (IV × √(DTE/365)). Theta $/day = theta × 100 and as
a share of the mid. Vega gain for +5 / +10 vol points = vega × 5 (10) × 100.
IV ÷ 20-day realized volatility. Skew = this put's IV − the ATM put's IV at the
same expiry.

Example from the spec: a $0.20 put costs $20 per contract before fees, the
most it can lose is $20, and its expiration breakeven is the strike − $0.20.

### Contract Quality (0–100)

| Component | Weight | 0 → 1 |
| --- | ---: | --- |
| Liquidity & spread | 20 | spread 25% → 5% (half), OI 100 → 5,000 (quarter), volume 10 → 1,000 (quarter) |
| Cost of waiting (theta) | 20 | 6% → 1.5% of premium per day |
| Volatility upside (vega per $) | 15 | 3% → 15% of premium per vol point |
| Distance to breakeven | 20 | 3 → 1 standard moves |
| Time for the thesis | 10 | full credit 30–90 DTE; less below 30 (gamma/expiry risk) and beyond 90 |
| Price of volatility | 15 | IV/RV 2.0 → 1.1 (70%), skew 15 → 3 points (30%) |

Components that can't be computed are left out and the rest re-weighted.
Highest gamma is deliberately not rewarded.

### Trade Setup (0–100) and labels

Setup = market risk (30) + regime fit (20) + volatility still cheap (15) +
contract quality (25) + high-impact catalyst before expiry (5) + modeled
payoff for a −10% move with IV +5 at the hold date (5).

| Label | Rule |
| --- | --- |
| AVOID | rejected by a filter, or quality < 40, or setup < 35 |
| LATE ENTRY | regime PANIC, or VOLATILITY EXPANSION with VIX in its top decile / IV ≥ 1.8× realized |
| STRONG WATCH | setup ≥ 70 and quality ≥ 60 |
| WATCH | setup ≥ 55 |
| WAIT | setup ≥ 35 |

Every label carries its own Why and Risks list built from the actual readings.
When nothing reaches WATCH the page shows **NO TRADE**.

## 4. Scenarios and pricing

`lib/crash/pricing.ts`: Black-Scholes-Merton (cross-check) and a
Cox-Ross-Rubinstein binomial tree with early exercise (used for all scenario
values, since SPY/QQQ/IWM/DIA and US equity options are American-style).

- The model IV is backed out of the contract's mid with the American tree, so
  the model starts exactly at the market price; the vendor IV is used only if
  that fails.
- Grid: price −15, −10, −5, −2, 0, +2, +5% × IV −10, 0, +5, +10, +20 points, at
  a chosen hold date; expiration payoff (intrinsic only) shown separately.
- Skew: shocks are sticky-moneyness and proportional to the live put smile, so
  deep OTM puts don't all reprice identically. Without a smile, a flat add.
- Rate: latest 3-month T-bill. Dividends: a continuous-yield estimate per ETF
  (`DIVIDEND_YIELD_ESTIMATE`).
- Limits: no discrete dividends, constant volatility over the option's life,
  small tree error, no liquidity. All values are labelled estimates.

## 5. Sizing and exposure

You set account equity, max risk per idea and fee per contract (kept in your
browser). Shown: cost per contract, contracts that fit the budget, premium at
risk, % of account, warnings above 5%. Default is one contract; cheapness is
never a reason to buy more. The exposure tracker groups SPY, QQQ, IWM, DIA and
single-stock puts as one "US equity sell-off" bet.

## 6. Data sources

| Data | Source | Freshness / notes |
| --- | --- | --- |
| Option chains, Greeks, IV | Tradier (`TRADIER_TOKEN`) | Greeks vendor-computed; age from `updated_at`, read as New York time (`TRADIER_GREEKS_TZ=UTC` to change) |
| Underlying price | Tradier quotes | real-time for account holders |
| ETF daily bars | Yahoo chart API, Stooq fallback | ~15–20 min delayed / end of day; split-adjusted, not dividend-adjusted |
| VIX, VIX3M, VIX9D, SKEW, VXN, RVX | Cboe history CSVs, latest day from Yahoo | official close; latest day delayed |
| HY / IG OAS, Moody's Baa & Aaa, Treasury yields and curves, STLFSI, NFCI | FRED (keyless CSV) or FRED API with `FRED_API_KEY` | about one business day behind; ICE series history on FRED may be limited by licensing; with a key, NFCI and STLFSI use ALFRED first-release vintages |
| Same-day yield curve | U.S. Treasury par yield CSV | published after each session; extends FRED's yields |
| Breadth (% above MA, net new highs) | TradingView CSV import, or TradingView alert webhook | optional; no history beyond what you import |
| FOMC dates | Federal Reserve calendar, typed into `lib/crash/catalysts.ts` | update yearly |
| Weekly data releases | Forex Factory weekly export (existing) | this week only |
| Earnings dates | none | not available free; not shown |

TradingView has no data API and its terms forbid scraping, so Tradevi uses
only (a) chart CSV exports you load yourself and (b) alerts you send to
`/api/tradingview/webhook`, for example on `INDEX:S5FI` with the message
`{"secret":"…","symbol":"{{ticker}}","close":"{{close}}"}`.

## 7. Daily chain recording

`/api/crash/snapshot` saves SPY, QQQ, IWM and DIA puts (7–130 DTE, plus
monthlies to 800 DTE, |delta| 0.01–0.70) into the Supabase table
`crash_option_snapshots` (see `supabase/schema.sql`). Vercel Cron calls it at
19:50 and 20:50 UTC on weekdays; the route records only between 3:30 and
4:15 PM ET, so exactly one run records each day across daylight-saving
changes. It needs `CRON_SECRET`, Supabase keys and `TRADIER_TOKEN`; without
them it refuses. This builds genuine history from the day it is switched on.

## 8. Limitations and what would remove them

- **IV rank / percentile per contract**: needs historical option IV. Not shown.
  The daily recorder starts that history; a purchased dataset (cheapest found:
  ORATS historical, about $599 one-time, 2007 onward) would backfill it.
- **Historical options backtests**: same dependency; until then the simulator
  marks options results HISTORICAL OPTIONS DATA UNAVAILABLE or THEORETICAL.
- **Breadth**: free breadth uses sector-ETF proxies; true % above MA and
  advance/decline need TradingView imports or a paid feed.
- **Live verification**: the engines are tested on synthetic series; the live
  pages need the keys above and a network that reaches Yahoo, Cboe, FRED,
  Treasury.gov and Tradier.

## 9. Setup checklist

1. Existing: `TRADIER_TOKEN`.
2. Optional, free: `FRED_API_KEY` (first-release vintages).
3. Optional, for daily chain recording: run the new block of
   `supabase/schema.sql`, set `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` on Vercel.
4. Optional: TradingView breadth via CSV import or the alert webhook.
