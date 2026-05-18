"""
Market data service — aggregates multiple data providers with fallback logic.
Prioritizes real-time, low-latency APIs over delayed sources.
"""
import time
from typing import Dict, Any, List, Optional
import httpx

from config import settings
from services.yfinance_service import fetch_candles as fetch_candles_yf
from services.finnhub_service import get_quote as get_quote_finnhub, get_candles as get_candles_finnhub
from services.polygon_service import fetch_options_chain, get_aggregates


async def get_candles(
    symbol: str, 
    period: str = "3mo", 
    interval: str = "1d",
    use_provider: str = "auto"  # "auto", "polygon", "finnhub", "yfinance"
) -> Dict[str, Any]:
    """
    Fetch OHLCV candle data from the best available provider.
    Priority: Polygon > Finnhub > YFinance
    
    Args:
        symbol: Stock symbol (e.g., 'SPY')
        period: Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y)
        interval: Candle interval (1m, 5m, 15m, 1h, 1d, 1wk)
        use_provider: Force a specific provider or auto-select
    
    Returns:
        Dict with candles list and metadata
    """
    
    # Try provider priority order
    providers_to_try = []
    
    if use_provider == "auto":
        if settings.massive_api_key or settings.polygon_api_key:
            providers_to_try.append("polygon")
        if settings.finnhub_api_key:
            providers_to_try.append("finnhub")
        # YFinance is always available (no key required)
        providers_to_try.append("yfinance")
    else:
        providers_to_try.append(use_provider)
    
    last_error = None
    
    for provider in providers_to_try:
        try:
            if provider == "polygon":
                return await _get_candles_polygon(symbol, period, interval)
            elif provider == "finnhub":
                return await _get_candles_finnhub(symbol, period, interval)
            elif provider == "yfinance":
                return _get_candles_yfinance(symbol, period, interval)
        except Exception as e:
            last_error = e
            continue
    
    # All providers failed
    if last_error:
        raise Exception(f"Market data unavailable - all providers failed. Last error: {str(last_error)}")
    raise Exception(f"Market data unavailable - no providers configured")


async def _get_candles_polygon(symbol: str, period: str, interval: str) -> Dict[str, Any]:
    """Fetch candles from Polygon API - high quality, real-time or 15min delayed."""
    if not settings.polygon_api_key:
        raise ValueError("Polygon API key not configured")
    
    # Map period/interval to Polygon timespan
    timespan_map = {
        "1m": "minute",
        "5m": "minute",  # Polygon minute endpoint
        "15m": "minute",
        "1h": "hour",
        "1d": "day",
        "1wk": "week",
    }
    
    timespan = timespan_map.get(interval, "day")
    multiplier = 1
    if interval == "5m":
        multiplier = 5
    elif interval == "15m":
        multiplier = 15
    
    # Use Polygon's get_aggregates function (already exists in polygon_service.py)
    candles = await get_aggregates(
        symbol=symbol,
        timespan=timespan,
        multiplier=multiplier,
        period_days=_period_to_days(period)
    )
    
    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "candles": candles,
        "meta": {
            "dataSource": "polygon_realtime",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "delayNote": "Real-time or ~15-30 min delayed via Polygon",
            "count": len(candles),
        },
    }


async def _get_candles_finnhub(symbol: str, period: str, interval: str) -> Dict[str, Any]:
    """Fetch candles from Finnhub API - real-time data."""
    candles = await get_candles_finnhub(symbol, period, interval)
    
    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "candles": candles,
        "meta": {
            "dataSource": "finnhub_realtime",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "delayNote": "Real-time via Finnhub",
            "count": len(candles),
        },
    }


def _get_candles_yfinance(symbol: str, period: str, interval: str) -> Dict[str, Any]:
    """Fallback to YFinance for historical candles - 15-20 min delayed."""
    candles = fetch_candles_yf(symbol, period, interval)
    
    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "candles": candles,
        "meta": {
            "dataSource": "yahoo_delayed",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "delayNote": "~15-20 min delayed via Yahoo Finance (fallback provider)",
            "count": len(candles),
            "fallback": True,
        },
    }


def _period_to_days(period: str) -> int:
    """Convert period string to approximate days."""
    period_days = {
        "1d": 1,
        "5d": 5,
        "1mo": 30,
        "3mo": 90,
        "6mo": 180,
        "1y": 365,
        "2y": 730,
        "5y": 1825,
    }
    return period_days.get(period, 90)


async def get_quote(symbol: str, use_provider: str = "auto") -> Dict[str, Any]:
    """
    Fetch real-time quote from the best available provider.
    Priority: Finnhub > YFinance
    
    Args:
        symbol: Stock symbol
        use_provider: Force a specific provider or auto-select
    
    Returns:
        Dict with quote data
    """
    
    providers_to_try = []

    if use_provider == "auto":
        if settings.massive_api_key or settings.polygon_api_key:
            providers_to_try.append("massive")
        if settings.finnhub_api_key:
            providers_to_try.append("finnhub")
        providers_to_try.append("yfinance")
    else:
        providers_to_try.append(use_provider)

    last_error = None

    for provider in providers_to_try:
        try:
            if provider == "massive":
                return await _get_quote_massive(symbol)
            elif provider == "finnhub":
                return await get_quote_finnhub(symbol)
            elif provider == "yfinance":
                from services.yfinance_service import fetch_quote_yf
                return fetch_quote_yf(symbol)
        except Exception as e:
            last_error = e
            continue
    
    # All providers failed
    if last_error:
        raise Exception(f"Quote unavailable - all providers failed. Last error: {str(last_error)}")
    raise Exception(f"Quote unavailable - no providers configured")


async def _get_quote_massive(symbol: str) -> Dict[str, Any]:
    """Real-time quote from Massive (Polygon rebranded) snapshot endpoint."""
    from services.polygon_service import _api_key, _base_url
    key = _api_key()
    if not key:
        raise ValueError("Massive API key not configured")

    url = f"{_base_url()}/v2/snapshot/locale/us/markets/stocks/tickers/{symbol.upper()}?apiKey={key}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    t = data.get("ticker", {})
    day = t.get("day", {})
    prev = t.get("prevDay", {})
    last_trade = t.get("lastTrade", {})

    price = float(last_trade.get("p", 0) or day.get("c", 0) or 0)
    prev_close = float(prev.get("c", 0) or price)
    change = price - prev_close
    change_pct = (change / prev_close * 100) if prev_close else float(t.get("todaysChangePerc", 0))

    return {
        "symbol": symbol.upper(),
        "price": round(price, 4),
        "open": round(float(day.get("o", 0)), 4),
        "high": round(float(day.get("h", 0)), 4),
        "low": round(float(day.get("l", 0)), 4),
        "prevClose": round(prev_close, 4),
        "change": round(change, 4),
        "changePercent": round(change_pct, 4),
        "volume": int(day.get("v", 0)),
        "shortName": symbol.upper(),
        "dataSource": "massive_realtime",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_health_status() -> Dict[str, Any]:
    """Get status of all market data providers."""
    return {
        "massive": bool(settings.massive_api_key),
        "polygon": bool(settings.polygon_api_key),
        "finnhub": bool(settings.finnhub_api_key),
        "yfinance": True,
    }
