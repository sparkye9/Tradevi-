from fastapi import APIRouter, HTTPException, Query
from services.market_data import get_quote
from services.finnhub_service import get_news
from config import settings
import datetime

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


@router.get("/{symbol}")
async def quote(symbol: str):
    sym = symbol.upper()
    try:
        # Use market_data service with provider fallback (Finnhub > YFinance)
        data = await get_quote(sym, use_provider="auto")
        return data
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Quote unavailable: {str(e)}")


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
