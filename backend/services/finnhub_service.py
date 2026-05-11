"""
Finnhub service — real-time quotes and WebSocket price streaming.
"""
import asyncio
import json
import logging
import time
from typing import Dict, Any, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

FINNHUB_BASE = "https://finnhub.io/api/v1"


async def get_quote(symbol: str) -> Dict[str, Any]:
    """Fetch real-time quote from Finnhub."""
    if not settings.finnhub_api_key:
        raise ValueError("FINNHUB_API_KEY not configured")

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{FINNHUB_BASE}/quote",
            params={"symbol": symbol, "token": settings.finnhub_api_key},
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("c") is None or data["c"] == 0:
        raise ValueError(f"Finnhub returned no price for {symbol}")

    return {
        "symbol": symbol,
        "price": data["c"],
        "open": data["o"],
        "high": data["h"],
        "low": data["l"],
        "prevClose": data["pc"],
        "change": data["c"] - data["pc"],
        "changePercent": ((data["c"] - data["pc"]) / data["pc"] * 100) if data["pc"] else 0,
        "timestamp": data.get("t"),
        "dataSource": "finnhub_realtime",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


async def get_candles(symbol: str, period: str = "3mo", interval: str = "1d") -> List[Dict[str, Any]]:
    """Fetch historical candles from Finnhub."""
    if not settings.finnhub_api_key:
        raise ValueError("Market data unavailable — API key required")

    # Calculate from/to timestamps
    import time
    to_ts = int(time.time())
    
    # Map period to seconds
    period_seconds = {
        "1d": 86400,
        "5d": 5 * 86400,
        "1mo": 30 * 86400,
        "3mo": 90 * 86400,
        "6mo": 180 * 86400,
        "1y": 365 * 86400,
        "2y": 2 * 365 * 86400,
        "5y": 5 * 365 * 86400,
    }
    from_ts = to_ts - period_seconds.get(period, 90 * 86400)

    # Map interval to Finnhub resolution
    resolution_map = {
        "1m": "1",
        "5m": "5",
        "15m": "15",
        "30m": "30",
        "1h": "60",
        "1d": "D",
        "1wk": "W",
        "1mo": "M",
    }
    resolution = resolution_map.get(interval, "D")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{FINNHUB_BASE}/stock/candle",
            params={
                "symbol": symbol,
                "resolution": resolution,
                "from": from_ts,
                "to": to_ts,
                "token": settings.finnhub_api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("s") != "ok" or not data.get("c"):
        raise ValueError(f"Finnhub returned no candle data for {symbol}")

    # Convert to candle format
    candles = []
    for i in range(len(data["c"])):
        candles.append({
            "time": data["t"][i],
            "open": data["o"][i],
            "high": data["h"][i],
            "low": data["l"][i],
            "close": data["c"][i],
            "volume": data["v"][i] if i < len(data["v"]) else 0,
        })

    return candles


async def get_news(symbol: str, from_date: str, to_date: str) -> list:
    if not settings.finnhub_api_key:
        raise ValueError("FINNHUB_API_KEY not configured")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{FINNHUB_BASE}/company-news",
            params={
                "symbol": symbol,
                "from": from_date,
                "to": to_date,
                "token": settings.finnhub_api_key,
            },
        )
        resp.raise_for_status()
        items = resp.json()
    result = []
    for item in items[:10]:
        result.append({
            "title": item.get("headline", ""),
            "link": item.get("url", ""),
            "publisher": item.get("source", ""),
            "publishedAt": item.get("datetime", 0) * 1000,
            "summary": item.get("summary", ""),
        })
    return result


class FinnhubStreamManager:
    """
    Manages a persistent WebSocket connection to Finnhub for real-time trade streaming.
    Calls `on_trade(symbol, price, volume, timestamp)` for each trade update.
    """

    WS_URL = "wss://ws.finnhub.io"

    def __init__(self):
        self._subscribed: set = set()
        self._running = False
        self._ws = None
        self._callbacks: list = []
        self._task: Optional[asyncio.Task] = None

    def add_callback(self, fn):
        self._callbacks.append(fn)

    def subscribe(self, symbol: str):
        self._subscribed.add(symbol.upper())

    def unsubscribe(self, symbol: str):
        self._subscribed.discard(symbol.upper())

    async def start(self):
        if not settings.finnhub_api_key:
            logger.warning("Finnhub WS: no API key, streaming disabled")
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _run(self):
        import websockets
        url = f"{self.WS_URL}?token={settings.finnhub_api_key}"
        while self._running:
            try:
                async with websockets.connect(url, ping_interval=20) as ws:
                    self._ws = ws
                    # Subscribe to all tracked symbols
                    for sym in list(self._subscribed):
                        await ws.send(json.dumps({"type": "subscribe", "symbol": sym}))
                    logger.info(f"Finnhub WS connected, subscribed to {len(self._subscribed)} symbols")

                    async for raw in ws:
                        if not self._running:
                            break
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if msg.get("type") == "trade":
                            for trade in msg.get("data", []):
                                symbol = trade.get("s", "")
                                price = trade.get("p", 0)
                                volume = trade.get("v", 0)
                                ts = trade.get("t", 0)
                                for cb in self._callbacks:
                                    try:
                                        await cb(symbol, price, volume, ts)
                                    except Exception:
                                        pass
            except Exception as e:
                logger.warning(f"Finnhub WS error: {e}, reconnecting in 5s")
                await asyncio.sleep(5)


finnhub_stream = FinnhubStreamManager()
