# Tradevi 3.0

Free, open trading-education desk for futures, stocks and options — no sign-up. Education and research only — it does not place trades, connect to a broker, or give financial advice.

Live: [tradevi.vercel.app](https://tradevi.vercel.app)

---

## What it is

Open to everyone — no accounts or subscriptions. A Learn section plus five desks:

| Desk | What you get |
|------|----------------|
| **Dashboard** | Welcome tour, WAIT / LOOK / NO TRADE, MNQ game plan, next high-impact prints |
| **Learn** | Options 101: calls/puts, contracts, moneyness, the Greeks, payoff calculator, practice quiz, glossary |
| **Futures** | Readiness board (hard gates + 0–100 score → A READY / B WATCH / C WAIT) for ten futures, Trend Bias Stack (HH/HL), swing and 15-minute entry / stop / TP1 / TP2 |
| **Market Selector** | Ranks the futures universe by trend cleanliness (ER10, ADX14) and the nearest untaken liquidity draw. Trade / Watch / Avoid, daily and weekly views |
| **Stocks** | Volume + SMA tape with a hard NO TRADE. Sub-desks: Discovery, Swing, Intraday, Options, Small Account |
| **Power Hour** | Globex clock (Asia / London / New York) plus 3:00–4:00 PM ET cash Power Hour |
| **Calendar** | This week’s economic prints from Forex Factory’s public weekly export |

Each desk has a collapsible “What am I looking at?” explainer for students. A contact form still exists at `/chat` (emails TheOptionaltrader@gmail.com) but is not linked from the navigation.

---

## Honesty

This app does **not** compute CHOCH, BOS, FVG, or VWAP. Confirm structure on TradingView.

Yahoo / Finviz tape is delayed. There is no live last-sale feed and no letter grades. The economic calendar is Forex Factory’s weekly export (this week only), not a live BLS/Fed feed and not a fake “LIVE” badge.

The Globex clock uses observed NYSE/CME holiday dates (not a live exchange calendar). CME equity-index futures are treated as fully closed on New Year’s Day, Good Friday, and Christmas. Other US cash holidays: Globex can stay open; Power Hour is off.

---

## Stocks quality

`lib/stockQuality.ts` is the only stocks verdict. A LOOK needs volume evidence and a side. Weak RVOL, mixed SMAs, or no lean is **NO TRADE**.

Swing, Intraday, Options, and Small Account filter that LOOK list. They do not keep a separate 0–5 score.

Small Account sizes LOOK names to the capital you pick. Entry / stop / targets on that page are percent estimates from last price — not structure.

---

## Tech

Next.js 14 (App Router), TypeScript, Tailwind, Zustand, yahoo-finance2 / Finviz / Tradier where configured. Deployed on Vercel from `main`.

---

## Quick start

```bash
npm install
cp .env.example .env.local
# fill Finviz, Tradier (and optionally Supabase for TradingView alerts) as needed
npm run dev
```

```bash
npm test          # clock, quality, indicator, readiness and selector checks (+ snapshot)
npx tsc --noEmit  # typecheck
npx tsx scripts/validate-readiness.ts 30      # A/B/C grade distribution over the last 30 sessions
npx tsx scripts/make-selector-fixture.ts      # refresh the selector fixture, then UPDATE_SNAPSHOT=1 npm test
npx tsx scripts/verify-data-sources.ts        # check every instrument against Yahoo and Stooq
```

## Futures data sources

Daily bars for the Market Selector come from Yahoo first and fall back to Stooq's free end-of-day CSV per instrument when Yahoo errors or returns too little history (`lib/dailyBars.ts`). The selector response reports which feed answered for each symbol, and the page says "via Stooq" on any row that fell back. Both feeds are free and unofficial, so either can refuse at any time.

The Stooq symbols in `lib/marketUniverse.ts` are unverified for Russell, Euro FX and the 10-year note — run `scripts/verify-data-sources.ts` with network access and correct or null them. Euro FX is `null` on purpose: spot EURUSD is not a substitute for the future, because the basis moves the highs and lows the draws are built from.

The Weekly / Daily / 4H trend stack still reads Yahoo only, since Stooq has no intraday history.

Futures readiness config (session window, news blackout, data-age limits, weights) lives in `lib/readinessConfig.ts`. The instrument universe for both the readiness board and the Market Selector lives in `lib/marketUniverse.ts`.

---

## License

MIT — personal education and research.
