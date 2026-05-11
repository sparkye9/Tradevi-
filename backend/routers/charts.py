from fastapi import APIRouter, HTTPException, Query
from services.market_data import get_candles, get_health_status
from services.yfinance_service import PERIOD_MAP
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

        # Use market_data service with provider fallback
        result = await get_candles(sym, auto_period, use_interval, use_provider="auto")
        candle_list = result["candles"]

        if indicators and candle_list:
            result["analysis"] = analyze_candles(candle_list)

        return result
    except Exception as e:
        # Return 503 Service Unavailable instead of 500 to indicate temporary provider issue
        raise HTTPException(status_code=503, detail=f"Market data unavailable: {str(e)}")
