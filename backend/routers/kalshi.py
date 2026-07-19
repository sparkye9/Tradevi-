"""
Kalshi same-day edge scanner — FastAPI router.

Endpoints
─────────
GET  /api/kalshi/scan          dry scan: returns picks, never places orders
POST /api/kalshi/scan          same but accepts fair values in the request body
POST /api/kalshi/orders        place limit orders for all sized picks (requires live=true)
GET  /api/kalshi/series        list available series tickers from Kalshi
GET  /api/kalshi/status        confirm auth is configured (no API call made)
"""

import os
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel, Field

from services.kalshi_service import (
    BANKROLL_DOLLARS,
    CUTOFF_HOUR_ET,
    EDGE_MIN_CENTS,
    MAX_POSITIONS,
    PRICE_CEIL_CENTS,
    PRICE_FLOOR_CENTS,
    SERIES_TICKERS,
    fetch_candidate_markets,
    load_private_key,
    place_limit_order,
    score_market,
    size_positions,
)

router = APIRouter(prefix="/api/kalshi", tags=["kalshi"])


# ── request / response models ─────────────────────────────────────────────────

class ScanRequest(BaseModel):
    fair_values: dict[str, float] = Field(
        default_factory=dict,
        description="Market ticker -> fair YES probability in cents (0-100). "
                    "Required. The scanner never invents probabilities.",
        examples=[{"KXMLBGAME-26JUL19NYYLAD-NYY": 55, "KXHIGHNY-26JUL19-B87.5": 40}],
    )
    bankroll: float = Field(default=BANKROLL_DOLLARS, ge=1.0, le=500.0)
    max_positions: int = Field(default=MAX_POSITIONS, ge=1, le=10)
    edge_min_cents: int = Field(default=EDGE_MIN_CENTS, ge=1, le=20)
    price_floor_cents: int = Field(default=PRICE_FLOOR_CENTS, ge=5, le=49)
    price_ceil_cents: int = Field(default=PRICE_CEIL_CENTS, ge=50, le=95)
    cutoff_hour_et: int = Field(default=CUTOFF_HOUR_ET, ge=12, le=23)
    series_tickers: list[str] | None = Field(
        default=None,
        description="Override the default series list. None uses the built-in list.",
    )


class OrderRequest(BaseModel):
    fair_values: dict[str, float] = Field(
        ...,
        description="Same fair values dict used for the scan that produced these picks.",
    )
    live: bool = Field(
        default=False,
        description="Must be true to place real orders. False returns what WOULD be placed.",
    )
    bankroll: float = Field(default=BANKROLL_DOLLARS, ge=1.0, le=500.0)
    max_positions: int = Field(default=MAX_POSITIONS, ge=1, le=10)


class Pick(BaseModel):
    ticker: str
    title: str
    side: str
    ask_cents: float
    fair_cents: float
    edge_cents: float
    close_time: str
    contracts: int
    cost_dollars: float
    payout_if_right: float


class ScanResponse(BaseModel):
    scan_time_et: str
    markets_found: int
    picks: list[Pick]
    message: str


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_key():
    """Load private key or raise 503 with a clear message."""
    try:
        return load_private_key()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


def _run_scan(req: ScanRequest) -> ScanResponse:
    import datetime as dt
    from zoneinfo import ZoneInfo

    if not req.fair_values:
        raise HTTPException(
            status_code=422,
            detail=(
                "fair_values is required. The scanner never invents probabilities. "
                "Supply {ticker: fair_yes_cents} for each market you want evaluated."
            ),
        )

    pk = _get_key()
    markets = fetch_candidate_markets(
        pk,
        series_tickers=req.series_tickers,
        cutoff_hour=req.cutoff_hour_et,
    )

    scored = [
        s
        for m in markets
        if (
            s := score_market(
                m,
                req.fair_values,
                edge_min=req.edge_min_cents,
                price_floor=req.price_floor_cents,
                price_ceil=req.price_ceil_cents,
            )
        )
    ]

    picks = size_positions(scored, bankroll=req.bankroll, max_positions=req.max_positions)

    now_et = dt.datetime.now(ZoneInfo("America/New_York")).strftime("%a %b %d %I:%M %p ET")
    message = (
        f"{len(picks)} qualifying position(s) found."
        if picks
        else "No qualifying edges right now. Correct answer: do not trade."
    )

    return ScanResponse(
        scan_time_et=now_et,
        markets_found=len(markets),
        picks=[Pick(**p) for p in picks],
        message=message,
    )


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def kalshi_status():
    """Check whether Kalshi auth env vars are present (no API call)."""
    # Key content — check all supported var names
    key_inline = bool(
        os.environ.get("KALSHI_KEY", "").strip()
        or os.environ.get("kalshi_key", "").strip()
    )
    key_path_val = os.path.expanduser(os.environ.get("KALSHI_KEY_PATH", ""))
    key_file_exists = bool(key_path_val and os.path.exists(key_path_val))
    key_ok = key_inline or key_file_exists

    # Key ID — check both casings
    key_id = (
        os.environ.get("KALSHI_KEY_ID", "").strip()
        or os.environ.get("kalshi_key_id", "").strip()
    )
    key_id_set = bool(key_id)

    return {
        "ready": key_ok and key_id_set,
        "key_id_set": key_id_set,
        "key_found": key_ok,
        "key_source": (
            "inline (KALSHI_KEY)" if key_inline
            else "file (KALSHI_KEY_PATH)" if key_file_exists
            else "missing"
        ),
        "hint": (
            None if (key_ok and key_id_set)
            else (
                "Set KALSHI_KEY_ID (the identifier from Kalshi's API settings page) "
                + ("" if key_id_set else "and ")
                + ("" if key_ok else "KALSHI_KEY (PEM content) or KALSHI_KEY_PATH (file path)")
            ).strip(" and ")
        ),
    }


@router.get("/series")
async def list_series():
    """
    Fetch available series tickers from Kalshi.
    Useful for verifying SERIES_TICKERS after Kalshi renames things.
    """
    import requests as _req

    pk = _get_key()
    from services.kalshi_service import _api_get, signed_headers

    try:
        data = _api_get(pk, "/trade-api/v2/series")
    except _req.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Kalshi error: {e}")

    series = data.get("series", [])
    return {
        "count": len(series),
        "default_tickers": SERIES_TICKERS,
        "series": [
            {"ticker": s.get("ticker"), "title": s.get("title"), "category": s.get("category")}
            for s in series
        ],
    }


@router.get("/scan", response_model=ScanResponse)
async def scan_get(
    fair: Annotated[
        str | None,
        Query(
            description='JSON string of {ticker: cents}, e.g. \'{"KXMLBGAME-...-NYY": 55}\'',
            alias="fair",
        ),
    ] = None,
    bankroll: float = Query(default=BANKROLL_DOLLARS),
    max_positions: int = Query(default=MAX_POSITIONS),
    edge_min_cents: int = Query(default=EDGE_MIN_CENTS),
):
    """
    Dry scan via GET. Pass fair values as a JSON string in the `fair` query param.
    Easier for quick browser testing; use POST for production calls.
    """
    import json as _json

    try:
        fair_values = _json.loads(fair) if fair else {}
    except Exception:
        raise HTTPException(status_code=422, detail="fair must be a valid JSON object string.")

    req = ScanRequest(
        fair_values=fair_values,
        bankroll=bankroll,
        max_positions=max_positions,
        edge_min_cents=edge_min_cents,
    )
    return _run_scan(req)


@router.post("/scan", response_model=ScanResponse)
async def scan_post(req: Annotated[ScanRequest, Body()]):
    """
    Dry scan via POST. Supply fair_values, optional overrides for bankroll etc.
    Returns picks with sizing but does NOT place any orders.
    """
    return _run_scan(req)


@router.post("/orders")
async def place_orders(req: Annotated[OrderRequest, Body()]):
    """
    Run the scan and, if live=true, place limit orders for all sized picks.

    live=false (default) is a final confirmation preview — same output as /scan
    but through the orders endpoint so the caller can flip live=true in one edit.

    live=true places real orders. Each order response from Kalshi is included
    in the return payload. Partial failures are reported per-pick, not as a 500.
    """
    scan_req = ScanRequest(
        fair_values=req.fair_values,
        bankroll=req.bankroll,
        max_positions=req.max_positions,
    )
    scan_result = _run_scan(scan_req)

    if not scan_result.picks:
        return {"placed": 0, "message": scan_result.message, "orders": []}

    if not req.live:
        return {
            "placed": 0,
            "live": False,
            "message": "Dry run. Set live=true to place these orders.",
            "would_place": [p.model_dump() for p in scan_result.picks],
        }

    pk = _get_key()
    import requests as _req

    results = []
    placed = 0
    for pick in scan_result.picks:
        try:
            resp = place_limit_order(pk, pick.model_dump())
            results.append({"ticker": pick.ticker, "status": "placed", "response": resp})
            placed += 1
        except _req.HTTPError as e:
            results.append({"ticker": pick.ticker, "status": "error", "detail": str(e)})

    return {
        "placed": placed,
        "live": True,
        "orders": results,
    }
