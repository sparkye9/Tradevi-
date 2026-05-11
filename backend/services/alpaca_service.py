"""
Alpaca broker integration — read-only portfolio data and manual order staging.
This app NEVER places orders automatically. Every trade must be confirmed in the broker.
"""
import logging
from typing import Dict, Any, List, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


def _headers() -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": settings.alpaca_api_key,
        "APCA-API-SECRET-KEY": settings.alpaca_secret_key,
        "Content-Type": "application/json",
    }


def _base() -> str:
    return settings.alpaca_base_url.rstrip("/")


async def get_account() -> Dict[str, Any]:
    if not settings.alpaca_api_key:
        raise ValueError("ALPACA_API_KEY not configured")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{_base()}/v2/account", headers=_headers())
        resp.raise_for_status()
        data = resp.json()
    return {
        "buyingPower": float(data.get("buying_power", 0)),
        "cash": float(data.get("cash", 0)),
        "portfolioValue": float(data.get("portfolio_value", 0)),
        "equity": float(data.get("equity", 0)),
        "dayPL": float(data.get("unrealized_intraday_pl", 0)),
        "dayPLPercent": float(data.get("unrealized_intraday_plpc", 0)) * 100,
        "totalPL": float(data.get("unrealized_pl", 0)),
        "status": data.get("status", "unknown"),
        "currency": data.get("currency", "USD"),
    }


async def get_positions() -> List[Dict[str, Any]]:
    if not settings.alpaca_api_key:
        raise ValueError("ALPACA_API_KEY not configured")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{_base()}/v2/positions", headers=_headers())
        resp.raise_for_status()
        positions = resp.json()
    result = []
    for p in positions:
        result.append({
            "symbol": p.get("symbol", ""),
            "qty": float(p.get("qty", 0)),
            "side": p.get("side", ""),
            "marketValue": float(p.get("market_value", 0)),
            "costBasis": float(p.get("cost_basis", 0)),
            "unrealizedPL": float(p.get("unrealized_pl", 0)),
            "unrealizedPLPct": float(p.get("unrealized_plpc", 0)) * 100,
            "currentPrice": float(p.get("current_price", 0)),
            "avgEntryPrice": float(p.get("avg_entry_price", 0)),
        })
    return result


async def get_orders(status: str = "all", limit: int = 50) -> List[Dict[str, Any]]:
    if not settings.alpaca_api_key:
        raise ValueError("ALPACA_API_KEY not configured")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{_base()}/v2/orders",
            headers=_headers(),
            params={"status": status, "limit": limit, "direction": "desc"},
        )
        resp.raise_for_status()
        orders = resp.json()
    result = []
    for o in orders:
        result.append({
            "id": o.get("id", ""),
            "symbol": o.get("symbol", ""),
            "side": o.get("side", ""),
            "type": o.get("type", ""),
            "qty": float(o.get("qty", 0) or 0),
            "filledQty": float(o.get("filled_qty", 0) or 0),
            "status": o.get("status", ""),
            "limitPrice": float(o.get("limit_price", 0) or 0),
            "filledAvgPrice": float(o.get("filled_avg_price", 0) or 0),
            "submittedAt": o.get("submitted_at", ""),
            "filledAt": o.get("filled_at", ""),
        })
    return result


async def stage_order_review(
    symbol: str,
    side: str,
    qty: float,
    order_type: str = "market",
    limit_price: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Returns a staged order object for manual review — does NOT submit to broker.
    The user must copy the details into their broker app and execute manually.
    """
    return {
        "staged": True,
        "symbol": symbol.upper(),
        "side": side,
        "qty": qty,
        "orderType": order_type,
        "limitPrice": limit_price,
        "warning": (
            "⚠️ This is a STAGED order for review only. "
            "This app does NOT execute trades. "
            "You must manually enter this order in your broker (Alpaca, Robinhood, etc.)."
        ),
    }
