from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from services.alpaca_service import get_account, get_positions, get_orders, stage_order_review

router = APIRouter(prefix="/api/broker", tags=["broker"])


@router.get("/account")
async def account():
    try:
        return await get_account()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Broker connection failed: {e}")


@router.get("/positions")
async def positions():
    try:
        return {"positions": await get_positions()}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Broker connection failed: {e}")


@router.get("/orders")
async def orders(status: str = "all", limit: int = 50):
    try:
        return {"orders": await get_orders(status, limit)}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Broker connection failed: {e}")


class StageOrderRequest(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    qty: float
    orderType: Literal["market", "limit"] = "market"
    limitPrice: Optional[float] = None


@router.post("/stage-order")
async def stage_order(body: StageOrderRequest):
    """
    Returns a staged order for manual review — NEVER submits to broker.
    The user must manually execute this in their broker.
    """
    return await stage_order_review(
        symbol=body.symbol,
        side=body.side,
        qty=body.qty,
        order_type=body.orderType,
        limit_price=body.limitPrice,
    )
