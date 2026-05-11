import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import uuid

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# In-memory alert store (replace with DB in production)
_alerts: List[dict] = []


class AlertCreate(BaseModel):
    symbol: str
    condition: Literal["above", "below", "percent_change"]
    value: float
    message: Optional[str] = None
    notifyTelegram: bool = False


@router.get("")
async def list_alerts():
    return {"alerts": _alerts}


@router.post("")
async def create_alert(body: AlertCreate):
    alert = {
        "id": str(uuid.uuid4()),
        "symbol": body.symbol.upper(),
        "condition": body.condition,
        "value": body.value,
        "message": body.message or f"{body.symbol} {body.condition} {body.value}",
        "notifyTelegram": body.notifyTelegram,
        "triggered": False,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _alerts.append(alert)
    return alert


@router.delete("/{alert_id}")
async def delete_alert(alert_id: str):
    global _alerts
    before = len(_alerts)
    _alerts = [a for a in _alerts if a["id"] != alert_id]
    if len(_alerts) == before:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"deleted": alert_id}


async def check_alerts(symbol: str, price: float):
    """Called by the WebSocket price feed to check if any alerts should fire."""
    triggered = []
    for alert in _alerts:
        if alert["symbol"] != symbol or alert["triggered"]:
            continue
        fired = False
        if alert["condition"] == "above" and price > alert["value"]:
            fired = True
        elif alert["condition"] == "below" and price < alert["value"]:
            fired = True
        if fired:
            alert["triggered"] = True
            alert["triggeredAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            alert["triggeredPrice"] = price
            triggered.append(alert)
            # Send Telegram if configured
            if alert.get("notifyTelegram"):
                from services.telegram_service import send_telegram
                try:
                    await send_telegram(alert["message"])
                except Exception:
                    pass
    return triggered
