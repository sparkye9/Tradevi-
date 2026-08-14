"""
Tradevi swing engine - Slice 1: Trend Bias Stack (Weekly / Daily / 4H)

What this is:
    Slice 1 of the subscription futures engine: Weekly / Daily / 4H structure
    bias. Slice 2 (dealing-range levels, premium/discount, invalidation, and
    the gated swing suggestion) lives in lib/trendBias.ts and is what the
    /trend-bias page actually renders.

    This standalone script is the local validation tool for Slice 1 — the
    HH/HL vs LH/LL classify() that the TypeScript port must match. Use this
    script to sanity-check the engine against TradingView; the production app
    does not run Python at all — it's a single Next.js deployment on Vercel.

Why it is built this way:
    - Free data only. Uses yfinance. No paid feed required.
    - MNQ has no separate free symbol, but it tracks NQ exactly (same index,
      1/10 size), so this reads NQ=F. The bias applies directly to MNQ.
    - Structure-based, not moving-average based, so it matches your ICT/SMC
      Pine logic. Trend = higher highs and higher lows (up), lower highs and
      lower lows (down), anything else is range.
    - yfinance has no native 4H interval, so 4H is resampled from 1H bars.

How to validate (free, uses your TradingView Premium):
    Run this on NQ. Open NQ on TradingView with your EDGE PRO / GR structure
    showing. On the same date, the engine's per-timeframe read should match the
    higher-high/higher-low structure your Pine draws. If it disagrees, raise or
    lower SWING_STRICTNESS below until they agree, then lock it. Port any
    change to lib/trendBias.ts so the app matches this script.

Setup:
    pip install yfinance pandas
Run:
    python scripts/swing_trend_bias.py
"""

import pandas as pd
import yfinance as yf

# Instrument -> free data symbol. MNQ reads NQ=F (same underlying index).
INSTRUMENT_MAP = {
    "MNQ": "NQ=F",
    "NQ": "NQ=F",
    "MES": "ES=F",
    "ES": "ES=F",
    "MYM": "YM=F",
    "YM": "YM=F",
    "M2K": "RTY=F",
    "RTY": "RTY=F",
    "GC": "GC=F",
}

# How many bars on each side a candle must dominate to count as a swing pivot.
# Higher = fewer, more significant swings. This is the knob you tune during
# validation against your Pine.
SWING_STRICTNESS = 2


def fetch(symbol, interval, period):
    """Pull OHLC from yfinance and normalize columns."""
    df = yf.download(
        symbol,
        interval=interval,
        period=period,
        auto_adjust=False,
        progress=False,
    )
    if df is None or len(df) == 0:
        raise RuntimeError(f"No data returned for {symbol} {interval} {period}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df.dropna()


def resample_4h(df_1h):
    """yfinance has no 4H interval, so build 4H bars from 1H bars."""
    agg = {
        "Open": df_1h["Open"].resample("4h").first(),
        "High": df_1h["High"].resample("4h").max(),
        "Low": df_1h["Low"].resample("4h").min(),
        "Close": df_1h["Close"].resample("4h").last(),
    }
    return pd.concat(agg.values(), axis=1, keys=agg.keys()).dropna()


def swing_points(df, k):
    """
    Return confirmed swing highs and lows as lists of (index, price).
    A swing high is a bar whose High is the strict max of the k bars on each
    side. Swing low is the mirror. Only pivots with k confirming bars after
    them are returned, so there is no lookahead: the last k bars can never
    produce a new pivot until more bars close.
    """
    highs = df["High"].values
    lows = df["Low"].values
    n = len(df)
    sh, sl = [], []
    for i in range(k, n - k):
        left_h = highs[i - k:i]
        right_h = highs[i + 1:i + k + 1]
        if highs[i] > left_h.max() and highs[i] > right_h.max():
            sh.append((i, float(highs[i])))
        left_l = lows[i - k:i]
        right_l = lows[i + 1:i + k + 1]
        if lows[i] < left_l.min() and lows[i] < right_l.min():
            sl.append((i, float(lows[i])))
    return sh, sl


def classify(df, k=SWING_STRICTNESS):
    """Classify the last confirmed structure as up, down, or range."""
    sh, sl = swing_points(df, k)
    if len(sh) < 2 or len(sl) < 2:
        return "range", "not enough confirmed swings"

    last_h, prev_h = sh[-1][1], sh[-2][1]
    last_l, prev_l = sl[-1][1], sl[-2][1]

    higher_high = last_h > prev_h
    higher_low = last_l > prev_l
    lower_high = last_h < prev_h
    lower_low = last_l < prev_l

    if higher_high and higher_low:
        return "up", "higher high and higher low"
    if lower_high and lower_low:
        return "down", "lower high and lower low"
    return "range", "mixed structure (no clean HH/HL or LH/LL)"


def alignment(reads):
    """Turn the three timeframe biases into a single conviction read."""
    biases = [b for b, _ in reads.values()]
    if all(b == "up" for b in biases):
        return "STACKED LONG. High conviction. Swings favor longs."
    if all(b == "down" for b in biases):
        return "STACKED SHORT. High conviction. Swings favor shorts."
    if "up" in biases and "down" in biases:
        return "CONFLICTING. Lower conviction. Stand down for swings."
    return "PARTIAL ALIGNMENT. Moderate conviction. Trade the dominant side only."


def trend_bias_stack(instrument):
    """Compute the Weekly / Daily / 4H trend bias stack for one instrument."""
    symbol = INSTRUMENT_MAP.get(instrument.upper())
    if symbol is None:
        raise ValueError(f"Unknown instrument {instrument}. Add it to INSTRUMENT_MAP.")

    weekly = fetch(symbol, interval="1wk", period="2y")
    daily = fetch(symbol, interval="1d", period="1y")
    hourly = fetch(symbol, interval="1h", period="60d")
    four_h = resample_4h(hourly)

    reads = {
        "Weekly": classify(weekly),
        "Daily": classify(daily),
        "4H": classify(four_h),
    }
    return {
        "instrument": instrument.upper(),
        "data_symbol": symbol,
        "reads": reads,
        "alignment": alignment(reads),
    }


def render(result):
    """Plain text render, same shape the futures page will show."""
    lines = []
    lines.append(f"TREND BIAS STACK  |  {result['instrument']} (data: {result['data_symbol']})")
    lines.append("-" * 56)
    for tf, (bias, reason) in result["reads"].items():
        lines.append(f"  {tf:<8} {bias.upper():<6}  {reason}")
    lines.append("-" * 56)
    lines.append(f"  ALIGNMENT: {result['alignment']}")
    return "\n".join(lines)


if __name__ == "__main__":
    result = trend_bias_stack("MNQ")
    print(render(result))
