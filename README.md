# TradeWise — Options Analysis Dashboard

> **⚠️ DISCLAIMER:** This app is for education, research, alerts, and journaling only. It does not provide financial advice and does not execute trades. Options can go to zero. Always confirm manually in your brokerage.

TradeWise is a real options-analysis dashboard that pulls live/delayed market data from Yahoo Finance, scans for high-potential options setups, and helps you decide whether to place a trade **manually** in Robinhood.

**It does NOT auto-trade. It does NOT connect to Robinhood. Every trade decision is 100% yours.**

---

## Features

- **Live Market Data** — Real quotes, charts, and options chains from Yahoo Finance
- **Opportunity Scanner** — Scans 16 symbols for options with 100%+ potential, scored 0–100
- **Options Chain Viewer** — Full chain with Greeks, spread analysis, and quality highlighting
- **Signal Dashboard** — Bias, RSI, ATR, support/resistance, trend strength for all symbols
- **2-Alert System** — Trade Window + Invalidation alerts with countdown timers
- **Robinhood Manual Trade Ticket** — Copy-paste ticket with full checklist (no auto-trading)
- **Risk Calculator** — Account-size-aware position sizing with warnings
- **Trade Journal** — Auto-populated from alerts, tracks entries/exits/emotions
- **Backtest Lab** — ORB breakout strategy backtester using real historical data
- **Bible & Mindset** — Verses and affirmations for trading discipline
- **Audit Log** — Full local audit trail of all your actions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State | Zustand + localStorage |
| Charts | Recharts |
| Market Data | yahoo-finance2 |
| Deploy | Vercel |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/tradewise.git
cd tradewise

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local

# 4. Run development server
npm run dev

# 5. Open in browser
open http://localhost:3000
```

---

## Project Structure

```
tradewise/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Dashboard
│   ├── scanner/            # Opportunity Scanner
│   ├── options-chain/      # Options Chain Viewer
│   ├── watchlist/          # Positions Watchlist
│   ├── signals/            # Market Signals
│   ├── risk/               # Risk & Safety
│   ├── alerts/             # Trade Alerts
│   ├── journal/            # Trade Journal
│   ├── backtest/           # Backtest Lab
│   ├── bible/              # Bible & Mindset
│   ├── audit/              # Audit Log
│   └── api/                # API routes
│       ├── quote/          # GET /api/quote?symbol=SPY
│       ├── chart/          # GET /api/chart?symbol=SPY&period=3mo
│       ├── options-chain/  # GET /api/options-chain?symbol=SPY
│       ├── scanner/        # POST /api/scanner (with filters)
│       ├── news/           # GET /api/news?symbol=SPY
│       ├── alerts/         # GET /api/alerts
│       └── watchlist/      # POST /api/watchlist
├── components/             # React components
│   ├── layout/             # AppShell, Sidebar, Header, NotificationBanner
│   ├── dashboard/          # BiasCard, MainChart, KeyLevels, BiblePanel, FocusTimer
│   ├── scanner/            # OpportunityCard, ScannerFilters
│   ├── options/            # OptionsChainTable
│   ├── alerts/             # AlertCard, TradeTicket
│   ├── risk/               # RiskCalculator
│   └── ui/                 # Badge, Card, Button, DisclaimerBanner
├── lib/                    # Business logic
│   ├── types.ts            # TypeScript interfaces
│   ├── yahoo.ts            # Yahoo Finance integration
│   ├── indicators.ts       # RSI, MA, ATR, VWAP, support/resistance
│   ├── optionsAnalysis.ts  # Delta, theta, Greeks estimation, scoring
│   ├── scanner.ts          # Multi-symbol opportunity scanner
│   ├── alerts.ts           # Alert generation and management
│   ├── risk.ts             # Risk calculator
│   └── mock.ts             # Fallback data when Yahoo Finance is unavailable
└── store/                  # Zustand stores (localStorage)
    ├── watchlistStore.ts
    ├── alertsStore.ts
    ├── journalStore.ts
    ├── settingsStore.ts
    └── auditStore.ts
```

---

## API Reference

### `GET /api/quote?symbol=SPY`
Returns current quote + technical analysis (trend, RSI, ATR, support/resistance, key levels).

### `GET /api/chart?symbol=SPY&period=3mo&interval=1d`
Returns OHLCV candles. Periods: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`. Intervals: `5m`, `1h`, `1d`.

### `GET /api/options-chain?symbol=SPY&expiration=2024-05-15`
Returns full options chain with analyzed contracts (delta, theta, IV, breakeven, est. gain, risk label).

### `POST /api/scanner`
Runs the opportunity scanner. Body:
```json
{
  "maxPremium": 100,
  "optionType": "both",
  "tradeType": "swing",
  "minVolume": 10,
  "minOpenInterest": 50,
  "minOpportunityScore": 40,
  "biasFilter": "both",
  "includeLottery": false,
  "symbols": ["SPY", "QQQ", "TSLA"]
}
```

### `GET /api/news?symbol=SPY`
Returns recent news headlines for the symbol.

---

## Opportunity Score (0–100)

Scores every options contract across 10 factors:

| Factor | Weight |
|--------|--------|
| Trend alignment with direction | 20 pts |
| Distance to breakout/breakdown | 15 pts |
| Contract affordability | 10 pts |
| Bid/ask spread tightness | 10 pts |
| Volume + open interest | 10 pts |
| Estimated reward potential | 15 pts |
| Risk level (Low/Med/High/Lottery) | 10 pts |
| DTE sweet spot (7–30 days) | 5 pts |
| Momentum (RSI confirmation) | 8 pts |
| ATR room to target | 7 pts |

---

## Scanner Symbols

`SPY`, `QQQ`, `IWM`, `TSLA`, `NVDA`, `AAPL`, `AMD`, `META`, `MSFT`, `F`, `SQQQ`, `TQQQ`, `SOFI`, `PLTR`, `USO`, `XLE`

---

## Deploying to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Or connect your GitHub repo at vercel.com:
# 1. Push to GitHub
# 2. Import repo at vercel.com/new
# 3. Framework: Next.js (auto-detected)
# 4. No environment variables required for basic use
# 5. Deploy
```

---

## GitHub Setup

```bash
# Initialize and push
git init
git add .
git commit -m "Initial TradeWise commit"
git remote add origin https://github.com/YOUR_USERNAME/tradewise.git
git push -u origin main
```

---

## Important Notes

- **Data is delayed** — Yahoo Finance data may be 15+ minutes delayed during market hours
- **Fallback data** — If Yahoo Finance is unavailable, mock data is used automatically
- **All storage is local** — Watchlist, alerts, journal, and settings are stored in your browser's localStorage only
- **No Robinhood integration** — This app never connects to Robinhood, never stores credentials, never places trades
- **Options are risky** — Most options expire worthless. Never risk more than you can afford to lose

---

## License

MIT — Free to use for personal education and research.

---

*Built with Next.js, TypeScript, Tailwind CSS, yahoo-finance2, Recharts, and Zustand.*
