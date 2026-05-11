from fastapi import APIRouter, HTTPException, Query
from services.yfinance_service import fetch_candles, PERIOD_MAP
from services.indicators import analyze_candles
import time

router = APIRouter(prefix="/api/charts", tags=["charts"])


@router.get("/{symbol}")
async def candles(
    symbol: str,
    period: str = Query("3mo", description="1d|5d|1mo|3mo|6mo|1y|2y|5y"),
    interval: str = Query("", description="Override auto interval"),
    indicators: bool = Query(True, description="Include full indicator suite"),
):
    sym = symbol.upper()
    try:
        # Auto-select interval from period if not provided
        auto_period, auto_interval = PERIOD_MAP.get(period, ("3mo", "1d"))
        use_interval = interval or auto_interval

        candle_list = fetch_candles(sym, auto_period, use_interval)
        result: dict = {
            "symbol": sym,
            "period": period,
            "interval": use_interval,
            "candles": candle_list,
            "meta": {
                "dataSource": "yahoo_delayed",
                "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "delayNote": "~15-20 min delayed via Yahoo Finance",
                "count": len(candle_list),
            },
        }

        if indicators and candle_list:
            result["analysis"] = analyze_candles(candle_list)

        return result
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
