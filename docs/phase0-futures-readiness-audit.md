# Phase 0 audit: Futures readiness (WAIT / READY)

Date: 2026-10-11. No code was changed in this phase.

## 1. Repo map

**Correction to the spec:** the production app has no Python backend. Tradevi deploys as a single Next.js 14 app on Vercel; every futures computation runs in TypeScript inside Next.js API routes. The `backend/` FastAPI folder is unused legacy (it imports a `routers.scanner` module that does not exist, so it cannot even start, and it depends on Finnhub, Polygon and Alpaca keys). `scripts/swing_trend_bias.py` is a standalone validation script, not a service. Finviz Elite is not used for futures at all; the "Finviz futures" route reads Yahoo quotes.

| Piece | Where |
|---|---|
| Futures page route | `app/futures/page.tsx` → `components/futures/TrendBiasStack.tsx` (stack, quality banner, swing + 15m cards) and `components/futures/SessionBias.tsx` (Globex tape, separate from readiness) |
| Dashboard WAIT / LOOK / NO TRADE | `components/dashboard/Desk.tsx` (`actionFromStack`), `components/dashboard/FuturesToggle.tsx` |
| API | `app/api/trend-bias/route.ts` → `trendBiasStack()` |
| Readiness engine | `lib/trendBias.ts`: `classify`, `structureLevels`, `swingSuggestion`, `setupQuality` |
| Entry / stop / TP map | `lib/futuresSetups.ts`: `dealingRangeSetup`, `swingSetupFromDaily`, `intradaySetupFromLevels` |
| Data fetch | `lib/yahooChart.ts` `fetchYahooCandles(symbol, period, interval)` against Yahoo v8 chart API (keyless, delayed). Calls per instrument: weekly 2y, daily 1y, hourly 3mo (resampled to 4H in code), 15m 10d |
| Session clock (exists, not wired to readiness) | `lib/powerHour.ts` `marketClock()` |
| News calendar (exists, not wired to readiness) | `lib/economicCalendar.ts` `upcomingHighImpact()` (Forex Factory weekly JSON) |
| Backtest | `lib/backtest.ts`, `app/api/futures/backtest/route.ts` (daily only; no 4H replay) |

How a label is produced today (`setupQuality`):

1. `classify()` each of Weekly / Daily / 4H as `up`, `down` or `range` from the last two confirmed fractal pivots (k = 2 bars each side). Up needs HH **and** HL; down needs LH **and** LL; anything else is `range`.
2. `swingSuggestion()`: all three same direction = high conviction. Any `up` against any `down` = STAND_DOWN. Otherwise partial, dominant side.
3. `setupQuality()`: STAND_DOWN → NO_TRADE (score fixed at 12). Daily zone wrong for the side → WAIT (score capped at 35). Partial stack → WAIT (capped at 70). Only high conviction **and** correct zone → TRADE.
4. Dashboard maps TRADE → LOOK, WAIT → WAIT, NO_TRADE → NO TRADE. On the Futures page the banner prints "NO TRADE" for both WAIT and NO_TRADE; only the swing card says WAIT.

The score is cosmetic. The label is decided entirely by the gates, then a score is attached.

## 2. Gate table

| # | Condition | Threshold | Timeframe | Data source | Instrument-specific? | AND or scored? |
|---|---|---|---|---|---|---|
| 1 | Weekly structure is directional | last 2 fractal highs + lows (k=2) form HH+HL or LH+LL | Weekly (Yahoo native 1wk, 2y) | Yahoo chart, delayed | No | AND (range weakens to partial, conflict kills) |
| 2 | Daily structure is directional | same rule | Daily (1y) | Yahoo | No | AND |
| 3 | 4H structure is directional | same rule | 4H resampled from 1h (3mo) | Yahoo | No | AND |
| 4 | No conflict | no `up` on one TF while `down` on another | W / D / 4H | derived | No | AND → NO_TRADE |
| 5 | Fully stacked | Weekly = Daily = 4H, all directional | W / D / 4H | derived | No | AND → required for TRADE |
| 6 | Daily zone matches side | last price below daily equilibrium (long) or above (short); dead band ±0.15 % of price counts as equilibrium | Daily levels vs last 15m close | Yahoo 15m (delayed ~15–20 min), falls back to daily close | No (percent of price, not volatility) | AND → required for TRADE |
| 7 | Invalidation defined | last swing low (long) / high (short) exists | Daily | derived | No | Scored (+15) |
| 8 | Enough swing history | every TF has ≥ 2 highs and ≥ 2 lows | all | derived | No | Scored (−10 / +5) |
| 9 | Swing card LOOK | R:R to TP1 ≥ 1.0, i.e. price deeper than the midpoint of the discount/premium half | Daily | last 15m close | No | AND (separate card status, not the label) |
| 10 | 15m intraday LOOK | 15m HH/HL bias + price deep in the 15m discount/premium half | 15m | Yahoo 15m delayed | No | AND (intraday card only) |
| — | Session window | none | — | `marketClock` exists but unused | — | not applied |
| — | News blackout | none | — | calendar exists but unused | — | not applied |
| — | Data freshness | none | — | no bar-age check anywhere | — | not applied |

## 3. Pass-rate estimate (last 60 sessions)

Live Yahoo history cannot be fetched from this environment: the network policy denies `query1.finance.yahoo.com` and `query2.finance.yahoo.com` (403 on CONNECT). Stooq and Forex Factory are denied too. To still answer the question, the exact production functions (`classify`, `structureLevels`, `swingSuggestion`, `setupQuality`, `swingSetupFromDaily`) were replayed over synthetic hourly price paths with the same fetch windows as the live code (2y weekly, 1y daily, 3mo 4H). Model: regime-switching random walk, daily vol 1.3 % (NQ-like), drift regimes of ±0.15 %/day or flat, switching every 5–25 days. 200 paths × 60 sessions. Script: `audit-sim.ts` in the session scratchpad (not committed).

| Condition | Pass rate | Strong-trend variant (±0.4 %/day) |
|---|---|---|
| Weekly directional | 67 % | 59 % |
| Daily directional | 66 % | 67 % |
| 4H directional | 63 % | 63 % |
| No W/D/4H conflict | 66 % | 68 % |
| Dominant side exists (not STAND_DOWN) | 55 % | 55 % |
| Fully stacked W = D = 4H | **8.7 %** | 7.3 % |
| Daily + 4H agree (weekly ignored) | 23 % | 24 % |
| Daily zone matches side | **16.5 %** | 15 % |
| Swing card LOOK (R:R ≥ 1) | 5.1 % | 5.1 % |
| **ALL gates → TRADE / LOOK** | **1.7 %** | **1.1 %** |
| TRADE and swing card LOOK | 0.6 % | 0.4 % |
| Label WAIT | 54 % | 54 % |
| Label NO_TRADE | 45 % | 45 % |

Read: about one READY session per 60 under a neutral model, and it does **not** improve in a strongly trending market. Two gates do the damage.

- **Fully stacked (8.7 %).** Three independent HH/HL reads with k = 2 rarely agree. Each TF is directional about two thirds of the time, but the same direction on all three is under one in ten.
- **Zone matches side (16.5 %).** This gate fights the stack gate. A Daily `up` read is only confirmed two bars after a new higher high, so price is almost always still in premium when the stack says long. "Stacked long AND in discount" is close to self-contradictory on the daily timeframe. That is why the page says "WAITING FOR DISCOUNT" most days.

These are synthetic estimates. Once Yahoo is reachable the same replay should be re-run on real NQ / ES / YM / RTY / GC bars (the script already mirrors the live windows). Phase 1.6 (30-session grade distribution) needs that access.

## 4. Risk flags

| Spec risk | Present? | Detail |
|---|---|---|
| Every condition is AND-gated | **Yes** | Label is decided by gates 4, 5, 6. Score never changes the label. |
| Intraday 5m / 15m rules on delayed Yahoo data | **Yes** | The 15m card classifies structure and compares the delayed last 15m close to the 15m equilibrium. Also the **daily** zone (gate 6) uses the delayed 15m close, so a price near equilibrium flips zone 15–20 minutes late. |
| Thresholds in fixed points / ticks | No fixed points. | Equilibrium dead band is 0.15 % of price and the R:R gate is a ratio. Nothing is ATR-based, so the dead band is the same in a quiet tape as in a 3 % day. |
| Requires Weekly, Daily, 4H (and 1H) to all align | **Yes, W + D + 4H** | 1H is not read directly. Weekly is mandatory for TRADE. |
| No stale-data check | **Yes** | No bar-age check. If the 15m fetch fails the engine silently uses the daily close as "last price" and still labels. No `data_age` is reported. `asOf` is just the server time of the response. |
| Session window | Missing | `marketClock()` exists but readiness ignores weekends, the 5–6 PM halt and holidays. |
| News blackout | Missing | `upcomingHighImpact()` exists but is only displayed, never used as a gate. |

Smaller findings:

- Futures page banner shows "NO TRADE" for a WAIT label; the dashboard shows WAIT for the same data. Reasons shown are a headline only; failed conditions are not listed.
- `DISPLAY_INSTRUMENTS` is `MNQ, MES, MYM, M2K, GC`. The Phase 2 universe (CL, NG, SI, 6E, ZN) is not covered by the readiness engine today.
- Weekly bars come from Yahoo's native 1wk series while the backtest resamples weekly itself; the two can disagree on the current partial week.
- The last daily and weekly bar returned by Yahoo during a session is the live partial bar. `classify` treats it as closed.

## 5. Proposed Phase 1 shape (for approval)

- Implement in TypeScript in `lib/` and `app/api/` (there is no Python runtime in production). The `backend/` folder stays untouched.
- Hard gates: session window from `marketClock`, news blackout from the Forex Factory feed with a manual fallback list in config, data freshness per timeframe (15m ≤ 30 min, 1h ≤ 90 min, daily ≤ 36 h, weekly ≤ 8 d, scaled for weekends and the halt).
- Scored 0–100: Daily + 4H alignment (full points), Weekly agreement (bonus), Daily zone in ATR terms (distance from equilibrium / ATR14, scored not gated), invalidation defined, swing history depth, 4H zone, R:R to TP1. The daily zone and the 15m card keep their numbers but get a "Confirm on TradingView" label and an ATR-width band instead of a 0.15 % dead band.
- Grades A / B / C → READY / WATCH / WAIT, and the Futures page shows grade, score and the blocking gate or top two failed conditions.

## 6. Blockers to clear before Phase 1.6 and Phase 2

- Add `query1.finance.yahoo.com` and `query2.finance.yahoo.com` to the environment's Allowed domains (cloud environment menu → Edit → Network access). Without it the 30-session validation and the selector snapshot test cannot run on real data.
- Confirm the TypeScript decision above.
