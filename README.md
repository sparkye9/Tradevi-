# Tradevi 3.0

Tape desk for micros, stocks, and a per-account journal. Education and research only — it does not place trades, connect to a broker, or give financial advice.

Live: [tradevi.vercel.app](https://tradevi.vercel.app)

---

## What it is

Five desks plus a calendar, behind sign-in and a $7.99/month PayPal pass (owner emails skip checkout):

| Desk | What you get |
|------|----------------|
| **Dashboard** | One WAIT / LOOK / NO TRADE read, MNQ game plan, journal edge, next high-impact prints |
| **Futures** | Trend Bias Stack (HH/HL structure on micros — not moving averages) |
| **Stocks** | Volume + SMA tape with a hard NO TRADE. Sub-desks: Discovery, Swing, Intraday, Options, Small Account |
| **Power Hour** | Globex clock (Asia / London / New York) plus 3:00–4:00 PM ET cash Power Hour |
| **Calendar** | This week’s economic prints from Forex Factory’s public weekly export |
| **Journal** | Saved to the signed-in Supabase account |

Chat with us (`/chat`) emails TheOptionaltrader@gmail.com. Expect 24–48 business hours.

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

Next.js 14 (App Router), TypeScript, Tailwind, Zustand, Supabase, PayPal, yahoo-finance2 / Finviz / Tradier where configured. Deployed on Vercel from `main`.

---

## Quick start

```bash
npm install
cp .env.example .env.local
# fill Supabase, PayPal, Finviz, Tradier as needed — see SUBSCRIPTIONS.md
npm run dev
```

```bash
npm test          # clock + quality engine checks
npx tsc --noEmit  # typecheck
```

---

## License

MIT — personal education and research.
