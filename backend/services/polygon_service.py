"""
Polygon.io service — options chain with Greeks.
Falls back to yfinance options data (no Greeks) when Polygon key is absent.
"""
import time
import logging
from typing import Dict, Any, List, Optional

import httpx
import yfinance as yf

from config import settings

logger = logging.getLogger(__name__)

POLYGON_BASE = "https://api.polygon.io"


def _dte(expiration_str: str) -> int:
    import datetime
    try:
        exp = datetime.date.fromisoformat(expiration_str)
        delta = (exp - datetime.date.today()).days
        return max(0, delta)
    except Exception:
        return 0


def _risk_label(cost: float, delta: float, dte: int) -> str:
    if cost < 25 or dte <= 3:
        return "Lottery"
    if cost < 50 or abs(delta) < 0.25:
        return "High Risk"
    if cost < 100:
        return "Moderate"
    return "Defined"


async def fetch_options_chain_polygon(symbol: str, expiration: Optional[str] = None) -> Dict[str, Any]:
    """Fetch options chain from Polygon.io with Greeks."""
    if not settings.polygon_api_key:
        raise ValueError("POLYGON_API_KEY not configured")

    params = {
        "underlying_ticker": symbol.upper(),
        "limit": 250,
        "apiKey": settings.polygon_api_key,
        "order": "asc",
        "sort": "strike_price",
    }
    if expiration:
        params["expiration_date"] = expiration

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{POLYGON_BASE}/v3/snapshot/options/{symbol}", params=params)
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results", [])
    calls: List[Dict] = []
    puts: List[Dict] = []
    expirations = set()

    stock_price = 0.0
    for r in results:
        details = r.get("details", {})
        greeks = r.get("greeks", {})
        day = r.get("day", {})

        exp_date = details.get("expiration_date", "")
        expirations.add(exp_date)

        strike = float(details.get("strike_price", 0))
        option_type = details.get("contract_type", "call").lower()
        last_price = float(r.get("last_quote", {}).get("midpoint", 0) or day.get("close", 0) or 0)
        bid = float(r.get("last_quote", {}).get("bid", 0))
        ask = float(r.get("last_quote", {}).get("ask", 0))
        volume = int(day.get("volume", 0))
        oi = int(r.get("open_interest", 0))
        iv = float(r.get("implied_volatility", 0))

        delta = float(greeks.get("delta", 0))
        gamma = float(greeks.get("gamma", 0))
        theta = float(greeks.get("theta", 0))
        vega = float(greeks.get("vega", 0))

        cost = round(last_price * 100, 2)
        dte = _dte(exp_date)
        spread_pct = round(((ask - bid) / ask * 100) if ask > 0 else 0, 2)

        contract: Dict[str, Any] = {
            "symbol": details.get("ticker", ""),
            "strike": strike,
            "expiration": exp_date,
            "dte": dte,
            "type": option_type,
            "bid": bid,
            "ask": ask,
            "lastPrice": last_price,
            "iv": round(iv * 100, 2),
            "delta": round(delta, 4),
            "gamma": round(gamma, 4),
            "theta": round(theta, 4),
            "vega": round(vega, 4),
            "volume": volume,
            "openInterest": oi,
            "costPerContract": cost,
            "spreadPercent": spread_pct,
            "riskLabel": _risk_label(cost, delta, dte),
            "dataSource": "polygon_realtime",
        }

        if option_type == "call":
            calls.append(contract)
        else:
            puts.append(contract)

    sorted_exps = sorted(expirations)

    return {
        "symbol": symbol,
        "calls": calls,
        "puts": puts,
        "expirationDates": sorted_exps,
        "meta": {
            "dataSource": "polygon_realtime",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }


def fetch_options_chain_yf(symbol: str, expiration: Optional[str] = None) -> Dict[str, Any]:
    """Fallback: yfinance options (no Greeks)."""
    ticker = yf.Ticker(symbol)
    exps = ticker.options
    if not exps:
        raise ValueError(f"No options data for {symbol}")

    selected_exp = expiration if expiration in exps else exps[0]
    chain = ticker.option_chain(selected_exp)

    def _parse_df(df, option_type: str) -> List[Dict]:
        contracts = []
        for _, row in df.iterrows():
            bid = float(row.get("bid", 0) or 0)
            ask = float(row.get("ask", 0) or 0)
            last = float(row.get("lastPrice", 0) or 0)
            strike = float(row.get("strike", 0))
            oi = int(row.get("openInterest", 0) or 0)
            volume = int(row.get("volume", 0) or 0)
            iv = float(row.get("impliedVolatility", 0) or 0)
            cost = round(last * 100, 2)
            dte = _dte(selected_exp)
            spread_pct = round(((ask - bid) / ask * 100) if ask > 0 else 0, 2)
            delta = 0.5 if option_type == "call" else -0.5

            contracts.append({
                "symbol": str(row.get("contractSymbol", "")),
                "strike": strike,
                "expiration": selected_exp,
                "dte": dte,
                "type": option_type,
                "bid": bid,
                "ask": ask,
                "lastPrice": last,
                "iv": round(iv * 100, 2),
                "delta": delta,
                "gamma": 0.0,
                "theta": 0.0,
                "vega": 0.0,
                "volume": volume,
                "openInterest": oi,
                "costPerContract": cost,
                "spreadPercent": spread_pct,
                "riskLabel": _risk_label(cost, delta, dte),
                "dataSource": "yahoo_delayed",
            })
        return contracts

    return {
        "symbol": symbol,
        "calls": _parse_df(chain.calls, "call"),
        "puts": _parse_df(chain.puts, "put"),
        "expirationDates": list(exps),
        "meta": {
            "dataSource": "yahoo_delayed",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "delayNote": "~15-20 min delayed via Yahoo Finance",
        },
    }


async def fetch_options_chain(symbol: str, expiration: Optional[str] = None) -> Dict[str, Any]:
    """Use Polygon if key is set, otherwise fall back to yfinance."""
    if settings.polygon_api_key:
        try:
            return await fetch_options_chain_polygon(symbol, expiration)
        except Exception as e:
            logger.warning(f"Polygon options failed for {symbol}: {e}, falling back to yfinance")
    return fetch_options_chain_yf(symbol, expiration)


async def get_aggregates(
    symbol: str,
    timespan: str = "day",
    multiplier: int = 1,
    period_days: int = 90
) -> List[Dict[str, Any]]:
    """
    Fetch aggregate/candle data from Polygon.io.
    
    Args:
        symbol: Stock symbol (e.g., 'SPY')
        timespan: 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'
        multiplier: Number of timespan units per candle (e.g., 5 for 5-minute bars)
        period_days: Number of days of historical data to fetch
    
    Returns:
        List of candle dictionaries with time, open, high, low, close, volume
    """
    if not settings.polygon_api_key:
        raise ValueError("POLYGON_API_KEY not configured")
    
    import datetime
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=period_days)
    
    params = {
        "timespan": timespan,
        "apiKey": settings.polygon_api_key,
        "limit": 50000,
    }
    
    url = f"{POLYGON_BASE}/v2/aggs/ticker/{symbol.upper()}/range/{multiplier}/{timespan}/{start_date}/{end_date}"
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    
    results = data.get("results", [])
    if not results:
        raise ValueError(f"No candle data from Polygon for {symbol}")
    
    candles = []
    for r in results:
        candles.append({
            "time": int(r.get("t", 0) / 1000),  # Convert milliseconds to seconds
            "timestamp": datetime.datetime.fromtimestamp(r.get("t", 0) / 1000).isoformat(),
            "open": round(float(r.get("o", 0)), 4),
            "high": round(float(r.get("h", 0)), 4),
            "low": round(float(r.get("l", 0)), 4),
            "close": round(float(r.get("c", 0)), 4),
            "volume": int(r.get("v", 0)),
        })
    
    return candles
