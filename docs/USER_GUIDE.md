# TRADEVI — User Guide

Tradevi is decision support. It does not place orders, does not connect to a broker, and does not predict markets. Market data is **delayed** (Yahoo Finance continuous front-month futures). Confirm every level on your own platform.

## Daily flow

1. **Command Center** (`/command-center`)
   - Tick the pre-market checklist.
   - Set your **max daily risk**.
   - Write your bias and if/then scenarios.
   - The middle column shows market status, the next high-impact USD print, the risk budget left (max risk minus today's journaled losses), each prop account's room to its floor, and quote freshness for every instrument.
2. **Market Structure** (`/market-structure`)
   - Pick an instrument.
   - The table shows each timeframe's trend, last BOS/CHOCH, recent swings and open FVGs.
   - Conflicts between higher and lower timeframes are listed rather than hidden.
   - Setup cards show entry zone, invalidation, stop, TP1/TP2, R:R, required confirmation, status, and a score breakdown.
   - "No active setup" is a normal answer.
3. **Power Hour** (`/power-hour`)
   - The futures panel at the top uses your window (default 2:38–2:45 entry, 3:15–3:20 exit, ET). Change it inline or in Settings.
   - The status is **NO TRADE** unless all eight rules pass, and the failing rules are listed.
   - **CANDIDATE** means conditions are met and you are waiting for the confirmation candle.
   - **CONFIRMED** means it printed inside the entry window.
   - The stock Power Hour scan is still below it.
4. **Risk Calculator** (`/risk`)
   - Choose the exact contract (micro vs standard matters 10×).
   - Enter entry, stop, targets, your broker's round-trip fees and the stop slippage.
   - Contracts are always rounded down.
   - Pick a prop account to get a warning if a full stop-out would hit its floor or daily limit.
5. **Trading Journal** (`/journal`)
   - Log each trade with your reasoning, rule compliance, mistakes, lessons and up to 3 screenshots.
   - Screenshots are shrunk and stored in your browser.
6. **Prop Firm Manager** (`/prop-firms`): add the day's realized P&L to each account's **Daily log**.

## Setting up a prop account

1. **+ Account**: choose the firm and enter the account type *exactly as the firm names it*, the phase and the starting balance.
2. **Rules** tab. For every rule, open your firm's current rules page for *that account type* and enter the value. Paste the link as the source, then tick **I checked this today**. Until you do, the dashboard marks the rule **UNVERIFIED**. Changing a value clears its verification.
   - **Drawdown**: static, end-of-day trailing or intraday trailing; balance or equity; and where trailing stops ("start + $X", or blank for never).
   - **Consistency**: pick the formula whose wording matches your firm's. "Best day ÷ net profit" counts losing days. "Best day ÷ winning days" does not. These give different numbers.
   - **Payout**: buffer above start, min / max payout, max % of profit, your split.
3. **Daily log**: one row per trading day (CME date: after 6 PM ET is the next day). For intraday-trailing or equity-based accounts, also enter the day's **peak open profit** and **lowest open P&L**. Without them the floor can be understated. CSV import uses the format `date,realized[,peak,lowest]`.
4. **Dashboard**: balance, drawdown floor and room, daily loss left, consistency with profit still needed, qualifying days, payout eligibility and the next milestone. Every block has a "How this was calculated" trail.

**Back up**: use Export on the Prop Firm page or in Settings. Data is stored only in this browser.

## Reading statuses

| Label | Meaning |
|---|---|
| NO TRADE | One or more required conditions failed. The reasons are listed. |
| WATCHING | The setup exists, but the confirmation has not printed. |
| CONFIRMED | The confirmation printed on fresh data. This is still not a guarantee. |
| INVALIDATED / EXPIRED | The structure broke, or the zone aged out. |
| STALE | The market is open but the data is older than the limit. Calculations will not use it. |
| FEED DISCONNECTED | The provider could not be reached. No prices are shown rather than old ones. |
| UNVERIFIED | A prop rule you entered but have not confirmed. |

## Backtesting

`/futures/backtest` replays the daily swing engine over 2 years.

- **Costs ON** applies $1.50 round-trip and 1 tick of slippage on stops, priced on the micro contract.
- Check the **sample-size warning** and whether **out-of-sample** agrees with in-sample before reading anything into the result.
- A positive number is not proof of an edge.
