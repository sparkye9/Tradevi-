"""
Kalshi same-day edge scanner — service layer.

Importable functions used by the FastAPI router:
  fetch_candidate_markets(pk)  -> list[dict]
  score_market(m, fair_cents)  -> dict | None
  size_positions(candidates)   -> list[dict]
  place_limit_order(pk, pick)  -> dict

Auth helpers (load_private_key, signed_headers) are also exported
so the router can call them once per request and pass the key down.
"""

import base64
import datetime as dt
import json
import os
import time
from zoneinfo import ZoneInfo

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

# ── constants ────────────────────────────────────────────────────────────────

API_BASE = "https://api.elections.kalshi.com"
ET = ZoneInfo("America/New_York")

BANKROLL_DOLLARS: float = 5.00
MAX_POSITIONS: int = 3
EDGE_MIN_CENTS: int = 3
PRICE_FLOOR_CENTS: int = 15
PRICE_CEIL_CENTS: int = 60
CUTOFF_HOUR_ET: int = 21

SERIES_TICKERS: list[str] = [
    "KXHIGHNY",    # NYC daily high
    "KXHIGHCHI",   # Chicago daily high
    "KXHIGHMIA",   # Miami daily high
    "KXHIGHAUS",   # Austin daily high
    "KXMLBGAME",   # MLB game winners
]

# ── auth ─────────────────────────────────────────────────────────────────────

def load_private_key():
    """
    Load RSA private key. Checks env vars in order:
      1. KALSHI_KEY / kalshi_key — PEM content inline (common in cloud deploys)
                                   or a file path if it doesn't start with '-----'
      2. KALSHI_KEY_PATH          — explicit file path (legacy)
    Raises ValueError with a clear message if nothing is found.
    """
    for var in ("KALSHI_KEY", "kalshi_key"):
        val = os.environ.get(var, "").strip()
        if not val:
            continue
        if val.startswith("-----"):
            return serialization.load_pem_private_key(val.encode(), password=None)
        # treat as file path
        path = os.path.expanduser(val)
        if os.path.exists(path):
            with open(path, "rb") as f:
                return serialization.load_pem_private_key(f.read(), password=None)

    path = os.path.expanduser(os.environ.get("KALSHI_KEY_PATH", ""))
    if path and os.path.exists(path):
        with open(path, "rb") as f:
            return serialization.load_pem_private_key(f.read(), password=None)

    raise ValueError(
        "Kalshi private key not found. Set one of:\n"
        "  KALSHI_KEY   — PEM content directly (for cloud/Vercel)\n"
        "  KALSHI_KEY_PATH — path to your .pem file\n"
        "Example: KALSHI_KEY='-----BEGIN RSA PRIVATE KEY-----\\n...'"
    )


def signed_headers(private_key, method: str, path: str) -> dict:
    """Kalshi API v2 RSA-PSS SHA256 request signing."""
    ts = str(int(time.time() * 1000))
    msg = f"{ts}{method}{path}".encode()
    sig = private_key.sign(
        msg,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.DIGEST_LENGTH,
        ),
        hashes.SHA256(),
    )
    # Accept KALSHI_KEY_ID or KALSHI_KEY_ID (same names, just in case)
    key_id = (
        os.environ.get("KALSHI_KEY_ID")
        or os.environ.get("kalshi_key_id")
        or ""
    ).strip()
    if not key_id:
        raise ValueError(
            "KALSHI_KEY_ID not set. This is the key identifier string shown "
            "in Kalshi's API settings (not the private key itself)."
        )
    return {
        "KALSHI-ACCESS-KEY": key_id,
        "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(),
        "KALSHI-ACCESS-TIMESTAMP": ts,
        "Content-Type": "application/json",
    }


def _api_get(private_key, path: str, params: dict | None = None) -> dict:
    headers = signed_headers(private_key, "GET", path)
    r = requests.get(
        API_BASE + path, headers=headers, params=params or {}, timeout=15
    )
    r.raise_for_status()
    return r.json()


def _api_post(private_key, path: str, body: dict) -> dict:
    headers = signed_headers(private_key, "POST", path)
    r = requests.post(
        API_BASE + path, headers=headers, data=json.dumps(body), timeout=15
    )
    r.raise_for_status()
    return r.json()

# ── auto-scan (no fair values needed) ────────────────────────────────────────

def fetch_all_open_markets(private_key, limit_pages: int = 10) -> list[dict]:
    """
    Fetch open markets across ALL series (paginated, up to limit_pages pages).
    Used for the auto-scan which needs no fair values.
    """
    out: list[dict] = []
    cursor = None
    for _ in range(limit_pages):
        params: dict = {"status": "open", "limit": 200}
        if cursor:
            params["cursor"] = cursor
        try:
            data = _api_get(private_key, "/trade-api/v2/markets", params)
        except requests.HTTPError as e:
            print(f"[kalshi] fetch_all_open_markets: {e}")
            break
        out.extend(data.get("markets", []))
        cursor = data.get("cursor")
        if not cursor:
            break
    return out


def auto_scan_markets(private_key, min_gap: int = 3, max_gap: int = 30) -> list[dict]:
    """
    Scan all open markets for mathematical edges requiring NO fair values.

    Two signals:
      1. Arb gap: yes_ask + no_ask < 100  →  buy both sides, guaranteed profit
         gap = 100 - (yes_ask + no_ask).  Net profit per contract pair = gap cents.
      2. Near-arb: gap in [min_gap, max_gap] — worth flagging even if you only
         buy the cheaper side and believe it's right.

    Returns list sorted by gap descending (best edge first).
    """
    markets = fetch_all_open_markets(private_key)
    results = []
    for m in markets:
        yes_ask = m.get("yes_ask")
        no_ask = m.get("no_ask")
        if yes_ask is None or no_ask is None:
            continue
        total = yes_ask + no_ask
        gap = 100 - total
        if gap < min_gap:
            continue
        # which side is cheaper
        cheap_side = "yes" if yes_ask <= no_ask else "no"
        cheap_ask = yes_ask if cheap_side == "yes" else no_ask
        results.append({
            "ticker": m.get("ticker", ""),
            "title": m.get("title", ""),
            "yes_ask": yes_ask,
            "no_ask": no_ask,
            "gap": round(gap, 1),
            "is_arb": gap > 0,            # true arb: both sides together < 100
            "cheap_side": cheap_side,
            "cheap_ask": cheap_ask,
            "close_time": m.get("close_time", ""),
            "series_ticker": m.get("series_ticker", ""),
        })
    results.sort(key=lambda x: x["gap"], reverse=True)
    return results[:50]  # top 50


# ── scan ─────────────────────────────────────────────────────────────────────

def _cutoff_ts_today(cutoff_hour: int = CUTOFF_HOUR_ET) -> int:
    now = dt.datetime.now(ET)
    cutoff = now.replace(hour=cutoff_hour, minute=0, second=0, microsecond=0)
    return int(cutoff.timestamp())


def fetch_candidate_markets(
    private_key,
    series_tickers: list[str] | None = None,
    cutoff_hour: int = CUTOFF_HOUR_ET,
) -> list[dict]:
    """
    All open markets in the target series that close before cutoff_hour ET today.
    Returns raw Kalshi market dicts.
    """
    out: list[dict] = []
    cutoff = _cutoff_ts_today(cutoff_hour)
    for series in (series_tickers or SERIES_TICKERS):
        cursor = None
        while True:
            params: dict = {
                "series_ticker": series,
                "status": "open",
                "max_close_ts": cutoff,
                "limit": 200,
            }
            if cursor:
                params["cursor"] = cursor
            try:
                data = _api_get(private_key, "/trade-api/v2/markets", params)
            except requests.HTTPError as e:
                # Non-fatal: log and skip this series
                print(f"[kalshi] {series}: {e}")
                break
            out.extend(data.get("markets", []))
            cursor = data.get("cursor")
            if not cursor:
                break
    return out


def score_market(
    m: dict,
    fair_cents: dict[str, int | float],
    edge_min: int = EDGE_MIN_CENTS,
    price_floor: int = PRICE_FLOOR_CENTS,
    price_ceil: int = PRICE_CEIL_CENTS,
) -> dict | None:
    """
    Compare market ask against caller-supplied fair value.
    Returns a scored dict if the edge and price band pass, else None.

    fair_cents keys are market tickers; values are fair YES probability in cents.
    The NO edge is computed as (100 - fair) vs the NO ask.
    """
    ticker = m.get("ticker")
    yes_ask = m.get("yes_ask")
    no_ask = m.get("no_ask")
    fair = fair_cents.get(ticker)

    if fair is None or yes_ask is None:
        return None

    yes_edge = fair - yes_ask
    no_edge = (100 - fair) - (no_ask if no_ask is not None else 101)

    if yes_edge >= no_edge:
        side, edge, ask = "yes", yes_edge, yes_ask
    else:
        side, edge, ask = "no", no_edge, no_ask

    if edge < edge_min:
        return None
    if ask is None or not (price_floor <= ask <= price_ceil):
        return None

    return {
        "ticker": ticker,
        "title": m.get("title", ""),
        "side": side,
        "ask_cents": ask,
        "fair_cents": fair if side == "yes" else 100 - fair,
        "edge_cents": round(edge, 1),
        "close_time": m.get("close_time", ""),
    }


def size_positions(
    candidates: list[dict],
    bankroll: float = BANKROLL_DOLLARS,
    max_positions: int = MAX_POSITIONS,
) -> list[dict]:
    """
    Rank by edge, take up to max_positions, split bankroll evenly.
    Adds contracts, cost_dollars, payout_if_right to each pick.
    """
    picks = sorted(candidates, key=lambda c: c["edge_cents"], reverse=True)[:max_positions]
    if not picks:
        return []
    per_position = bankroll / len(picks)
    for p in picks:
        cost = p["ask_cents"] / 100
        p["contracts"] = max(1, int(per_position // cost))
        p["cost_dollars"] = round(p["contracts"] * cost, 2)
        p["payout_if_right"] = round(p["contracts"] * 1.00, 2)
    return picks

# ── orders ───────────────────────────────────────────────────────────────────

def place_limit_order(private_key, pick: dict) -> dict:
    """Place a single limit buy. pick must be a sized position dict from size_positions."""
    body = {
        "ticker": pick["ticker"],
        "action": "buy",
        "side": pick["side"],
        "type": "limit",
        "count": pick["contracts"],
        f"{pick['side']}_price": pick["ask_cents"],
        "client_order_id": f"scan-{int(time.time())}-{pick['ticker'][-8:]}",
    }
    return _api_post(private_key, "/trade-api/v2/portfolio/orders", body)
