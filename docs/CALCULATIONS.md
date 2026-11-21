# TRADEVI — Calculation Reference

Every number Tradevi shows is listed here with its formula, inputs, and the file that computes it. Tests live in `scripts/check-engines.ts` and `scripts/check-trading.ts` (plus `check-propfirm.ts` and `check-structure.ts`). Run them with `npm test`.

---

## 1. Contract specifications — `lib/contracts.ts`

Source: CME Group contract specifications, entered on 2026-10-13. Point value = tick value ÷ tick size.

| Contract | Tick | Tick value | Point value | Price series used |
|---|---|---|---|---|
| ES / MES | 0.25 | $12.50 / $1.25 | $50 / $5 | ES=F |
| NQ / MNQ | 0.25 | $5.00 / $0.50 | $20 / $2 | NQ=F |
| YM / MYM | 1 | $5.00 / $0.50 | $5 / $0.50 | YM=F |
| RTY / M2K | 0.10 | $5.00 / $0.50 | $50 / $5 | RTY=F |
| GC / MGC | 0.10 | $10.00 / $1.00 | $100 / $10 | GC=F |
| SI / SIL (1,000 oz) | 0.005 | $25.00 / $5.00 | $5,000 / $1,000 | SI=F |
| CL / MCL | 0.01 | $10.00 / $1.00 | $1,000 / $100 | CL=F |
| NG | 0.001 | $10.00 | $10,000 | NG=F |
| 6E / M6E | 0.00005 / 0.0001 | $6.25 / $1.25 | $125,000 / $12,500 | 6E=F |
| ZN | 1/64 = 0.015625 | $15.625 | $1,000 | ZN=F |

A micro contract reads the full-size contract's price series. The price is the same index, but volume is not.

## 2. Position size — `lib/futuresRisk.ts`

All money is handled in integer **mills** ($0.001), so every tick value is exact. ZN's $15.625 tick is 15,625 mills.

```
stopTicks     = |entry − stop| / tickSize          (rounded UP if off the tick grid, with a warning)
riskPerCt     = stopTicks × tickValue + slippageTicks × tickValue + feesRoundTrip
budget        = balance × risk%      or   fixed $
maxContracts  = floor(budget / riskPerCt)          (never rounded up)
estimatedLoss = contracts × riskPerCt              (warns when > budget)
targetTicks   = |target − entry| / tickSize        (rounded DOWN if off-grid)
netPerCt      = targetTicks × tickValue − feesRoundTrip   (target assumed a resting limit, no slippage)
R:R gross     = targetTicks / stopTicks
R:R net       = netPerCt / riskPerCt
```

Worked example (tested): MNQ, long 21000, stop 20980, 1% of $50,000. The stop is 80 ticks × $0.50 = $40. The budget is $500. floor(500 / 40) = **12** contracts, which risks $480. Adding $1.24 fees and 2 ticks of slippage makes it $42.24 per contract, so **11** contracts.

## 3. Prop firm engine — `lib/propFirm.ts`

No firm's rules ship with Tradevi. Every rule is user-entered, with a source, a verification date and a `verified` flag.

### Consistency (selectable formula)

- `best_day_over_net_profit`: `best winning day ÷ Σ all days (losses included) × 100`
- `best_day_over_gross_profit`: `best winning day ÷ Σ winning days × 100`

With threshold `t`:

- **Profit needed** (if future days stay ≤ the current best): `X = best / t − denominator`.
- **Fewest more days**: `ceil(X / best)`.
- **Largest next day that keeps you compliant.** A day `d` bigger than the current best becomes the new best, so the limit is `d ≤ t·denom / (1 − t)`. The engine reports `max(best, that)` when you are compliant. When no single day can fix the ratio, it reports `null`.
- The window is days since the last payout when "resets on payout" is ticked.

Example (tested): days 600, 400, 500 at 30%. 600 / 1500 = 40%. Needed = 600 / 0.3 − 1500 = **$500**. That is at least 1 day, and the next day must be ≤ **$642.86**.

### Drawdown

- **Static**: floor = start − amount.
- **End-of-day trailing**: HWM = max(start, closing balances). Floor = HWM − amount.
- **Intraday trailing**: HWM also includes each day's peak open equity (`open balance + peak unrealized`). Missing peaks trigger a warning that the true floor may be higher.
- **Stops trailing at start + X**: floor = min(HWM − amount, start + X).
- The floor **never moves down**.
- **Balance basis**: the breach test uses the closing balance. **Equity basis**: it also tests the day's lowest open equity. The intraday low is tested against the floor as it stood at the day's open, because the order of peak and trough within a day is unknown.
- Payouts lower the balance. The floor is left unchanged, and a warning says some firms reset it.

### Payout planner

```
withdrawable  = balance − (start + buffer)
capped by     = maxPctOfProfit × (balance − start), maxPayout, your request
gross         = floor to the cent; 0 unless every requirement passes
you receive   = gross × split%
balanceAfter  = balance − gross
roomAfter     = balanceAfter − floor
```

Blocking reasons are all listed: below the buffer, below the minimum, consistency, qualifying days. The plan always states it is not a promise of approval.

### Trading date

CME session date: 18:00 ET and later counts as the next calendar date. This is computed with `Intl` in `America/New_York`, so it is DST-correct.

## 4. Backtest — `lib/backtest.ts`

Daily dealing-range engine, walked forward bar by bar.

- **No lookahead.** A setup at bar *i* uses bars ≤ *i*. Pivots need 2 confirming bars.
- **Fill.** The limit fills when a later bar's range contains the entry (within 10 bars, or it is cancelled).
- **Fill bar.** Only the stop can trigger. Targets count from the next bar.
- **Same bar hits stop and target.** Counted as the stop.
- **Time stop** after N bars. Closed at that bar's close (marked to market).
- **One position at a time.** The next signal waits until the slowest exit rule is flat.
- **Costs (optional).** `R_net = R_gross − (fees / pointValue + slippageTicks × tickSize if a market exit) / risk`.
- **Metrics.**
  - Win = R > 0, loss = R < 0, scratch = 0.
  - Expectancy = mean R.
  - PF = Σwins / |Σlosses|.
  - Max DD on the cumulative R curve.
  - Longest losing streak.
  - Monthly R by exit month.
  - Average planned R:R.
  - In-sample = first 70% of fills by date, out-of-sample = the last 30%.
- **Sample-size warning** below 30 filled trades.
- **Weekly filter** uses ISO Monday weeks on New York dates.

## 5. Market structure — `lib/structure.ts`

| Signal | Rule |
|---|---|
| Swing | Fractal pivot, strictly above or below `strength` bars each side. Known `strength` bars later. Internal = 2, external = 5. |
| HH / LH / HL / LL | The swing compared with the previous swing of the same kind. |
| BOS | Close (default) or wick beyond the latest confirmed swing, in the trend direction. The first break from "range" is a BOS. |
| CHOCH | The first such break against the current trend. It flips the trend. |
| Consolidation | No break within `rangeLookback` bars (30). |
| FVG | Bullish: `low[i+1] > high[i−1]`. Bearish mirror. Size ≥ 0.1 × ATR14. |
| FVG state | Partial = a later wick enters. Mitigated = traded through. Invalidated = a close beyond the far edge. |
| Equal highs / lows | Consecutive swings within 0.1 × ATR14, not traded through since. |
| Sweep | A bar beyond a level that closes back on the original side. |
| Liquidity | PDH/PDL and PWH/PWL by CME session date. Overnight = 18:00–09:30. Asia 18:00–04:00, London 03:00–12:00, NY 08:00–17:00 ET. |
| 4H bars | 1H bars bucketed from the 18:00 ET open (18–22, 22–02, …). DST-safe. |
| Forming bar | Dropped before analysis. |
| MTF score | Weights 1D 3, 4H 2.5, 1H 2, 15m 1.5, 5m 1, 1m 0.5. Score = Σ(±w) / Σw. Leaning when \|score\| ≥ 0.35. Stale timeframes do not vote. HTF/LTF disagreement is listed as a conflict. |

## 6. Setup generator — `lib/setupEngine.ts`

The setup types (Pullback, Breakout, Liquidity sweep, Reversal) and their rules are printed on each card (`SETUP_RULES`).

- Stop = invalidation ± 0.1 × 15m ATR, rounded to the tick.
- TP1 / TP2 = the nearest untaken liquidity levels beyond the zone.
- R:R is measured from the zone midpoint.

Score weights, totalling 100:

| Factor | Points |
|---|---|
| HTF alignment | 25 |
| 15m structure | 15 |
| Liquidity target | 15 |
| Volatility | 10 |
| Room ≥ 1R | 10 |
| Session | 10 |
| News | 10 |
| R:R | 5 |

The score is a **checklist total, not a probability**. A setup with missing or stale 15m/5m data, or with no target, cannot be Confirmed.

## 7. Power Hour — `lib/powerHourEngine.ts`

The default window is entry 14:38–14:45 and exit 15:15–15:20 ET. It is editable. CANDIDATE needs all 8 rules to pass:

1. Cash session open, not a holiday or early-close day.
2. Newest closed 5m bar ≤ 20 min old.
3. No high-impact USD event from 30 min before the entry window to the end of the exit window. A calendar outage counts as a fail.
4. 5m trend is directional.
5. Price is on the trend side of RTH VWAP.
6. 15m trend is not opposing.
7. Today's RTH range is 0.5–2.0 × the prior 5-session average.
8. R:R ≥ 1.5 to the nearest opposing liquidity.

**Definitions used by the rules:**

- **VWAP** = Σ(typical price × volume) / Σ volume over today's 09:30+ bars. It is null when the feed carries no volume.
- **Entry zone** = from max(VWAP, last 5m swing low) up 0.5 × 5m ATR for a long (mirror for a short).
- **CONFIRMED** = a 5m bar *closing* inside the entry window beyond the zone's far edge, without touching invalidation, **and** still leaving ≥ 1.5R from that close to the target. A late confirmation that leaves less reward stays CANDIDATE.

## 7a. Intraday Power Hour backtest — `lib/powerHourBacktest.ts`

Input: 1-minute bars (Databento `ohlcv-1m` CSV, parsed by `lib/databentoCsv.ts`). If a file holds several contracts, the one with the most volume each session is used; prices are not back-adjusted.

- 5m and 15m bars are aggregated from the 1m bars, aligned to the clock.
- For each session, `powerHour()` (the live function) runs at every 5m close inside the entry window, using only the bars that existed at that moment.
- **Entry**: at the confirmation bar's close, plus slippage. The trade is skipped if less than 1.5R remains after slippage.
- **Exit**: managed on 1m bars from the next minute. If one minute touches both stop and target, it counts as the stop. Otherwise the position is flat at the last 1m close by the end of the exit window.
- **Limits**: at most one trade per day. Holidays and early closes are skipped.
- **News**: the news rule is **not** applied, because no historical calendar is available, and the report says so.
- **Output**:
  - Outcome per day: traded, NO TRADE, candidate never confirmed, no data, or holiday.
  - How often each rule blocked a trade.
  - Win rate, expectancy, PF, max DD, losing streak and $ per contract.
  - Split into the first 70% and last 30% of trades.
  - Monthly table.

## 8. Readiness grade (existing) — `lib/readiness.ts`

Unchanged, except for one rule: when the calendar feed is down and there is no manual event list, the news gate now **fails** (WAIT). See `lib/readinessConfig.ts` → `news.failClosedWhenUnavailable`.

## 9. Quote freshness — `lib/quoteFreshness.ts`

| State | Meaning |
|---|---|
| unavailable | No price or timestamp, or no feed exists (XAUUSD, NAS100 / US30 CFDs). |
| closed | The market is shut by schedule. |
| stale | The market is open but the last trade is > 30 min old. |
| delayed | The provider reports a delay, or does not say. |
| live | The provider reports 0 delay and the quote is fresh. |

Only `live` and `delayed` are usable in calculations.

## 9a. Stock quote freshness — `lib/marketData/freshness.ts`

US stocks and ETFs are judged against the equity session calendar (`lib/marketData/session.ts`: pre-market 4:00–9:30, regular 9:30–16:00 or 13:00 on early-close days, after-hours until 20:00 or 17:00, all America/New_York so DST is handled), the security registry (`lib/securities/registry.ts`) and the listing venue (`lib/securities/exchanges.ts`). Futures, FX and crypto rows stay on §9.

| State | When | Usable |
|---|---|---|
| inactive | A reviewed registry record says the ticker was delisted, acquired, merged or renamed. Checked first, so a fresh-looking quote cannot revive it. | No |
| unverified | Venue unknown, or not on the US equity calendar (e.g. SET). | No |
| unavailable | No valid price or timestamp, or the timestamp is further in the future than the skew limit. | No |
| live | Regular session, provider delay is 0, age ≤ live limit. | Yes |
| delayed | Within the session's age limit, but delayed, delay not stated, or older than the live limit. | Yes |
| closed | Market shut (or extended hours with no extended trade, or the open-grace window) and the last trade is from the latest completed session. | Yes |
| stale | Anything outside the limits below. | No |

A quote whose provider venue disagrees with the registry's reviewed venue is also not usable (`exchangeMismatch`).

### Limits

Defaults live in `DEFAULT_FRESHNESS_LIMITS`. Each can be set by environment variable (whole numbers; an invalid value is ignored with a warning) or passed to `resolveFreshnessLimits(overrides)` (an invalid value throws).

| Limit | Default | Env var | Meaning |
|---|---|---|---|
| regularMaxAgeSec | 900 (15 min) | `MARKET_DATA_REGULAR_MAX_AGE_SEC` | Regular session: older is stale. |
| extendedMaxAgeSec | 3600 (60 min) | `MARKET_DATA_EXTENDED_MAX_AGE_SEC` | Pre/after-hours: max age of an extended-hours trade. |
| liveMaxAgeSec | 60 | `MARKET_DATA_LIVE_MAX_AGE_SEC` | Regular session: at or under this, with 0 delay, is live. Must be ≤ regularMaxAgeSec. |
| openGraceSec | 300 (5 min) | `MARKET_DATA_OPEN_GRACE_SEC` | After 9:30, the prior close is "awaiting first trade", not stale. |
| closedMaxSessionsBehind | 0 | `MARKET_DATA_CLOSED_MAX_SESSIONS_BEHIND` | Market shut: completed sessions the last trade may lag. |
| maxFutureSkewSec | 120 | `MARKET_DATA_MAX_FUTURE_SKEW_SEC` | Future timestamps up to this are clamped to age 0; beyond is rejected. |
| maxDeclaredDelaySec | 1200 (20 min) | `MARKET_DATA_MAX_DECLARED_DELAY_SEC` | A provider-declared delay above this is stale. |

Limits are inclusive: a quote exactly at the limit is still within it. Tests: `scripts/check-market-data.ts`.
