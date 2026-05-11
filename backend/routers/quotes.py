from fastapi import APIRouter, HTTPException, Query
from services.finnhub_service import get_quote as finnhub_quote, get_news
from services.yfinance_service import fetch_quote_yf
from config import settings
import datetime

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


@router.get("/{symbol}")
async def quote(symbol: str):
    sym = symbol.upper()
    try:
        if settings.finnhub_api_key:
            data = await finnhub_quote(sym)
        else:
            data = fetch_quote_yf(sym)
        return data
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{symbol}/news")
async def news(symbol: str):
    sym = symbol.upper()
    try:
        if not settings.finnhub_api_key:
            raise ValueError("Finnhub key not set")
        today = datetime.date.today()
        from_date = (today - datetime.timedelta(days=7)).isoformat()
        to_date = today.isoformat()
        items = await get_news(sym, from_date, to_date)
        return {"news": items}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
