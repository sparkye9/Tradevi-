# TRADEVI — Full Application Audit

Date: 2026-10-13 · Branch: `claude/laughing-carson-5ibv9n` · Baseline commit: `d3255c8`

Every finding below was traced to the source file that produces it. Nothing was assumed to work because it appears on screen. Live market data could **not** be fetched from the audit environment: Yahoo, Stooq and Forex Factory all refuse connections from this sandbox. All verification of calculations is therefore done with deterministic fixtures (`scripts/check-engines.ts`, `scripts/check-trading.ts`), not live quotes.

---

## 1. Architecture as found

| Layer | What is actually there |
|---|---|
| Framework | Next.js **14.2.5** (App Router), React 18.3, TypeScript 5.5 (strict), Tailwind 3.4, Zustand 4.5 (localStorage persistence), lucide-react, recharts, lightweight-charts |
| Backend | Next.js API routes only (`app/api/**`), Node runtime on Vercel. The `backend/` FastAPI folder is **dead legacy**. It imports `routers.scanner`, which does not exist, so it cannot start. It is not deployed. |
| Database | Supabase. Used **only** by the TradingView webhook to insert into `tv_alerts`, through the service-role key. `supabase/schema.sql` still defines `subscriptions` and `journal_entries` tables for features that were removed. |
| Auth | None. Accounts were removed on purpose (`middleware.ts` redirects old `/login` etc.). Every page and API is public. |
| Deployment | Vercel, `vercel.json` → `npm run build`. Production deploys from `main`. |
| Tests | `npm test` → `scripts/check-engines.ts`. 129 assertion checks plus a snapshot. No test framework. At baseline all checks pass and `tsc --noEmit` is clean. |

### Market data providers, per instrument

| Instrument | Provider / symbol | Type of price | Real-time? |
|---|---|---|---|
| ES, NQ, YM, RTY, GC, SI, CL, NG, 6E, ZN | Yahoo v8 chart `XX=F` (keyless, unofficial) | **Continuous front-month future**. Yahoo picks the roll date. | Delayed. CME futures on Yahoo are typically ~10 min delayed. Not guaranteed. |
| MES, MNQ, MYM, M2K, MGC | **Not fetched.** They read the full-size `ES=F`, `NQ=F`… series. | Same price index as the full contract. Correct for levels, but **not** the micro's own volume or book. | Delayed |
| Daily fallback | Stooq CSV `xx.f` | End-of-day continuous future | EOD only |
| Top tape (`FuturesBar`) | Yahoo v7 quote (crumb auth): ES, NQ, YM, RTY, `^VIX`, GC, CL, `^TNX`, `DX=F` | Futures plus two **cash indexes** (VIX, TNX) with no label telling them apart | Delayed |
| Stocks / options | Finviz public screener → Yahoo fallback. Tradier overlays price when `TRADIER_TOKEN` is set. | Equities | Tradier is real-time with a production token. The others are delayed. |
| Economic calendar | Forex Factory weekly JSON export | This week only | n/a |
| XAUUSD, US30, NAS100, BTC, FX pairs | **Not supported anywhere** | — | — |

### Environment variables (all server-side only, none `NEXT_PUBLIC_` except the Supabase URL)

`FINVIZ_EMAIL`, `FINVIZ_PASSWORD`, `FINVIZ_SESSION_COOKIE`, `TRADIER_TOKEN`, `TRADIER_ENV`, `TRADINGVIEW_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. No provider key reaches the browser. `/api/health` exposes booleans only.

### Feature inventory (traced)

| Feature | Source | Status |
|---|---|---|
| Futures readiness board (A/B/C) | `lib/readiness.ts`, `lib/readinessConfig.ts`, `lib/readinessBoard.ts` | Works. Has hard gates for session, news and freshness. See issues below. |
| Trend Bias Stack W/D/4H | `lib/trendBias.ts` | Works. Fractal k=2 HH/HL classifier. |
| Swing / 15m entry-stop-TP | `lib/futuresSetups.ts` | Works. Dealing-range map, R:R ≥ 1 gate. |
| Market Selector | `lib/selector.ts`, `lib/selectorData.ts` | Works. Snapshot-tested. |
| Backtest | `lib/backtest.ts`, `/api/futures/backtest` | Works, but has the accuracy defects listed in §2. |
| Power Hour | `app/power-hour/page.tsx` | **Stocks** volume scan in the 3–4 PM window plus the Globex clock. There is **no futures Power Hour engine**, no VWAP, no 2:38–2:45 window. |
| Globex clock / holidays | `lib/powerHour.ts`, `lib/marketHolidays.ts` | Works, with DST handled by `Intl` (`America/New_York`). One wrong holiday (see C-3). |
| Economic calendar | `lib/economicCalendar.ts` | Works (this week only). |
| Options chain / Learn / Payoff calculator | `lib/optionChain.ts`, `components/learn/*` | Works. Not in scope for changes. |
| Stocks desks | `lib/stockQuality.ts` and others | Works. Not in scope for changes. |
| Consistency guardrail | `components/guardrail/ConsistencyGuardrail.tsx` | **Dead code.** It is not rendered anywhere, and its formula is wrong (see H-5). |
| Options risk calculator | `lib/risk.ts` `calcRisk` | **Dead code.** It is never imported, and it is options-only (×100 multiplier). |
| Market structure (BOS / CHOCH / FVG / liquidity) | — | **Not implemented.** The README says so honestly. |
| Prop firm manager / drawdown / payout | — | **Not implemented.** |
| Futures position sizing (tick/point value) | — | **Not implemented.** There are no contract specs anywhere in the repo. |
| Journal | — | Removed in commit `86096bd` along with accounts. |

---

## 2. Findings

Severity key: **Critical** = can produce a wrong number that someone would trade or risk money on. **High** = materially misleading output or a security exposure. **Medium** = correctness or robustness gap with limited blast radius. **Low** = hygiene.

| # | Component | Current implementation | Problem | Severity | Recommended fix (status) |
|---|---|---|---|---|---|
| C-1 | Futures risk / position size | None. The only calculator is the options-only `calcRisk` (dead). | There are no tick/point values for any future, so position size cannot be computed. Micro and standard contracts are indistinguishable. | **Critical** | Add `lib/contracts.ts` (CME specs, with source and review date) and `lib/futuresRisk.ts`, using integer-cent math and floor rounding. **Fixed.** |
| C-2 | Backtest: overlapping trades | `i = fillIdx + 1` after each trade | The next signal is evaluated the bar after the **fill**, while the first trade is still open. Positions overlap, the trade count is inflated, and the R drawdown curve is fiction. | **Critical** | Resume after the exit bar. **Fixed.** |
| C-3 | Backtest: fill-bar targets | Exit loop starts on the fill bar and credits TP1/TP2 on it | On a daily bar that both fills the limit and touches the target, the order is unknowable. The bar can reach the target *before* coming back to fill. This is an optimistic bias. | **Critical** | On the fill bar only the stop can trigger (conservative). Targets count from the next bar. **Fixed.** |
| C-4 | Backtest: timeouts | Timed-out trades scored `0 R` | A trade still open at the max-hold cut is marked flat, whatever its real P&L. This hides losses and gains. | **Critical** | Mark to the close of the timeout bar. **Fixed.** |
| C-5 | Holiday calendar | `2027-12-31` listed as "New Year's Day (observed)", CME closed | NYSE does not observe a Saturday New Year's Day on the prior Friday, because of year-end accounting. NYSE and CME were open on Fri 2021-12-31. The app would show HOLIDAY / closed on a real trading day. | High | Removed. The test was changed to assert the date is open. **Fixed.** |
| H-1 | Top tape quotes | `lastUpdated` = server time. When the fetch fails, `lastGoodResult` is served with a `sourceError` the UI ignores. | A failed or stale feed looks live. There is no quote timestamp, no source, and no stale flag. VIX and TNX (cash indexes) are mixed in with futures without a label. | High | Return `quoteTime` (Yahoo `regularMarketTime`), asset class, and stale / disconnected state per row. The bar shows the source and greys out stale rows. **Fixed.** |
| H-2 | News gate | Calendar unavailable and no manual events → gate **passes** | The engine can grade a setup READY during CPI or FOMC when the calendar fetch failed. | High | Fail closed: WAIT with "news could not be checked". Configurable. **Fixed.** |
| H-3 | TradingView webhook | Inserts the full `payload` into `tv_alerts` | The payload contains the shared **secret**, so it is stored in plaintext in the DB, readable by any authenticated Supabase user per the RLS policy. The comparison is not constant-time, and there is no size limit. | High | Strip `secret` before storing. Use `timingSafeEqual`. Cap body at 16 KB and the message at 2,000 chars. **Fixed.** |
| H-4 | Futures Power Hour | Stocks-only scan | The requested 2:38–2:45 / 3:15–3:20 futures workflow does not exist. Nothing says NO TRADE for futures in that window. | High | Add `lib/powerHourEngine.ts` (VWAP, prior-session levels, volume, ATR, structure, explicit NO TRADE rules) and `/api/power-hour`. **Added.** |
| H-5 | Consistency guardrail (dead) | `best day / net P&L`, "today" in **UTC** | It is not rendered. If it were revived: net P&L in the denominator is one firm's definition, not universal; a UTC date mislabels evening sessions; and there is no "profit needed" math. | High | Replaced by `lib/propFirm/consistency.ts`, which supports multiple formulas, CME session dates, and required-profit math. **Fixed.** The old component is left in place but still unused (see L-1). |
| H-6 | Prop firm rules | None | — | High | Profiles are user-entered. Every rule carries a source, a verified date and a `verified` flag, and is marked UNVERIFIED until the user confirms it. **No firm's rules are hardcoded.** **Added.** |
| M-1 | 4H bars | `floor(time / 4h)` on UTC epoch | Buckets fall at 00/04/08… UTC (8 PM/12 AM… ET in EDT, shifting an hour in EST). They are not aligned to the CME 6 PM session open and they shift at DST. | Medium | New session-aligned resampler (`resampleSessionHours`) is used by the new structure and setup engines. The legacy stack is unchanged so the readiness snapshot stays comparable. **Partially fixed** (documented). |
| M-2 | Backtest weekly filter | `floor(time / 7d)`. The Unix epoch is a Thursday. | Weekly bars run Thursday→Wednesday. | Medium | Use `resampleWeekly` (ISO Monday weeks, NY dates). **Fixed.** |
| M-3 | Backtest costs and validation | None | No commission or slippage. No in-sample / out-of-sample split. No consecutive-loss, monthly or average R:R metrics. Scratches counted as losses. | Medium | Added cost model (ticks + $/side via contract spec), a 70/30 IS/OOS split, a sample-size warning, monthly table and loss streaks. **Fixed.** |
| M-4 | Partial bars | The live daily / weekly bar is treated as closed | A forming bar can create or remove a pivot until it closes (repainting near the right edge). | Medium | The new structure engine drops the forming bar by default (`dropForming`). The legacy stack is unchanged, and the limitation is documented. **Partially fixed.** |
| M-5 | Yahoo candle parser | `high ?? 0`, `low ?? 0` | A bar with a null high or low passes the `open > 0 && close > 0` filter with high = 0. That corrupts swings and ATR. | Medium | Reject bars with any non-positive OHLC or high < low. **Fixed.** |
| M-6 | Input validation | `/api/tradier/quotes` accepts unbounded symbol lists. `/api/futures/backtest` accepts any `period` and silently falls back to 90 days. | Abuse or cost amplification, and silent wrong windows. | Medium | Regex plus a 50-symbol cap. `period` whitelist with a 400 response. `maxHold` clamped. **Fixed.** |
| M-7 | Micro contracts | MNQ reads NQ=F | Prices are the same index, so levels are fine. Volume is the full contract's. Not disclosed. | Medium | Disclosed in the source labels and in `lib/contracts.ts` (`priceProxy`). **Documented.** |
| M-8 | Holiday early closes | Not modelled | Day-after-Thanksgiving, Christmas Eve and July 3 early closes (CME equity 12:15 PM CT / NYSE 1 PM) are ignored. Power Hour could be shown on a half day. | Medium | `EARLY_CLOSES` list added. The Power Hour engine says NO TRADE on early-close days. **Fixed.** |
| M-9 | Rate limits | None on any route | Each readiness board call fans out ~40 Yahoo requests. | Medium | In-memory per-IP token bucket on the expensive routes (`lib/rateLimit.ts`). It is best-effort on serverless (per instance). **Added.** |
| L-1 | Dead code | `backend/`, `lib/risk.ts`, `lib/tfc.ts`, `lib/yahoo.ts`, `lib/yahoo-finance.ts`, 4 unused stores, `ConsistencyGuardrail`, `SetupCard`, `Badge`/`Button`/`Card`/`DataSourceBanner`/`EmptyState` | Never imported. | Low | Listed here. **Not deleted**, pending your approval. |
| L-2 | `supabase/schema.sql` | Defines subscriptions and journal tables | Features were removed. Confusing. | Low | Leave as is. Note in deployment docs. |
| L-3 | Package name | `"tradewise"` | Cosmetic. | Low | Leave. |
| L-4 | `tsconfig.tsbuildinfo` committed | — | Build artifact in git. | Low | Leave (not touching unrelated files). |
| L-5 | Readiness score | 0–100 "score" | Not a probability, and it is not presented as one. Fine. | Low | The new setup score uses the same convention and the UI says explicitly "not a probability". |

---

## 3. Prioritised repair plan (as executed)

1. **Accuracy first.** Contract specs and the position sizer (C-1), backtest correctness (C-2…C-4, M-2, M-3), holiday fix (C-5), parser hardening (M-5).
2. **Reliability.** Quote freshness, source labels and stale / disconnected states (H-1), fail-closed news gate (H-2), early closes (M-8).
3. **Security.** Webhook secret storage and constant-time compare (H-3), input validation (M-6), rate limiting (M-9).
4. **Prop firm manager** (H-5, H-6). Consistency, drawdown and payout engines, plus the page.
5. **Analysis engines.** Market structure (BOS/CHOCH/FVG/liquidity, multi-timeframe), setup generator, futures Power Hour (H-4, M-1, M-4).
6. **Workflow and UI.** Risk calculator page, daily command center (checklist, session, journal), navigation regrouped. Existing stock and options tools kept.
7. **Tests and docs.** `scripts/check-trading.ts`, `docs/CALCULATIONS.md`, `docs/USER_GUIDE.md`, `docs/DEPLOYMENT.md`.

Nothing is deployed. Production stays on `main` until you approve a merge.

---

## 4. Status after this branch

All items marked **Fixed** / **Added** above are implemented and covered by `npm test` (deterministic fixtures; 129 pre-existing engine checks + the new trading checks). `tsc --noEmit` and `next build` pass. Pages were rendered headless at 1366 px and 390 px with no runtime errors and no horizontal overflow.

### Remaining limitations

1. **No real-time futures data.** Everything is Yahoo's delayed continuous front-month series. A licensed feed (CME via a broker or vendor API) is the only fix; until then intraday rules run on delayed bars and the UI says so.
2. **Live data was not verifiable from the build sandbox** (Yahoo, Stooq and Forex Factory were unreachable). Engines are verified on fixtures only; check `/market-structure` and `/power-hour` on the Vercel preview during market hours.
3. **Contract roll** is Yahoo's: there is no explicit front-month/rollover mapping, and roll gaps remain in historical series (flagged by the Market Selector's roll windows, not removed).
4. **Holiday calendar** is a static list through 2028, plus early closes for known dates; CME special-session hours (e.g. reduced Good Friday sessions) are not modelled.
5. **Legacy readiness stack** still uses epoch-aligned 4H bars and treats the forming daily bar as closed (kept so its snapshot and A/B/C history stay comparable). The new Structure / Setup / Power Hour engines use session-aligned bars and drop forming bars.
6. **Backtest** covers the daily swing engine only. Intraday setups (structure, Power Hour) are not backtested — Yahoo serves ≤ 60 days of 5m/15m history, too little for out-of-sample validation. No walk-forward re-optimisation exists because no parameter is optimised.
7. **Setup and readiness scores are unvalidated** checklist totals, not probabilities.
8. **Prop-firm, journal and checklist data live in browser localStorage** — no sync, no server backup (export manually). Screenshots are capped to ~3 MB total.
9. **Rate limiting is per serverless instance** (burst protection, not a global quota).
10. **ESLint is not configured** in the repo (`next lint` prompts for setup); not changed here.
11. **Dead code** listed in L-1 is untouched pending your decision.
12. **XAUUSD, NAS100 and US30** have no free feed and are shown as unavailable rather than substituted.
