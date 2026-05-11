"""
Yahoo Finance via yfinance — historical candles only.
Real-time quotes come from Finnhub; this is for chart history.
"""
import time
from typing import List, Dict, Any

import yfinance as yf


PERIOD_MAP = {
    "1d": ("1d", "5m"),
    "5d": ("5d", "15m"),
    "1mo": ("1mo", "1h"),
    "3mo": ("3mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y": ("1y", "1d"),
    "2y": ("2y", "1wk"),
    "5y": ("5y", "1wk"),
}


def fetch_candles(symbol: str, period: str = "3mo", interval: str = "1d") -> List[Dict[str, Any]]:
    """Fetch OHLCV candle data from Yahoo Finance."""
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval, auto_adjust=True)

    if df.empty:
        raise ValueError(f"No candle data returned for {symbol} (period={period}, interval={interval})")

    candles = []
    for ts, row in df.iterrows():
        candles.append({
            "time": int(ts.timestamp()),
            "timestamp": ts.isoformat(),
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row.get("Volume", 0)),
        })

    return candles


def fetch_quote_yf(symbol: str) -> Dict[str, Any]:
    """Fallback quote from yfinance when Finnhub key is not configured."""
    ticker = yf.Ticker(symbol)
    info = ticker.fast_info
    price = getattr(info, "last_price", None) or getattr(info, "regularMarketPrice", None)
    prev = getattr(info, "previous_close", None) or getattr(info, "regularMarketPreviousClose", None)
    high = getattr(info, "day_high", None)
    low = getattr(info, "day_low", None)
    vol = getattr(info, "three_month_average_volume", None)

    if not price:
        raise ValueError(f"yfinance returned no price for {symbol}")

    change = (price - prev) if prev else 0
    change_pct = (change / prev * 100) if prev else 0

    return {
        "symbol": symbol,
        "price": round(float(price), 4),
        "open": round(float(prev or price), 4),
        "high": round(float(high or price), 4),
        "low": round(float(low or price), 4),
        "prevClose": round(float(prev or price), 4),
        "change": round(float(change), 4),
        "changePercent": round(float(change_pct), 4),
        "volume": int(vol or 0),
        "shortName": getattr(ticker.fast_info, "currency", symbol),
        "dataSource": "yahoo_delayed",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
