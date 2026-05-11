from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from services.polygon_service import fetch_options_chain

router = APIRouter(prefix="/api/options", tags=["options"])


@router.get("/{symbol}/chain")
async def options_chain(
    symbol: str,
    expiration: Optional[str] = Query(None, description="YYYY-MM-DD expiration date"),
):
    sym = symbol.upper()
    try:
        data = await fetch_options_chain(sym, expiration)
        return data
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
