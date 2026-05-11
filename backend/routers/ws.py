"""
WebSocket router — streams real-time price updates to connected frontend clients.
"""
import asyncio
import json
import uuid
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from websocket_manager import manager
from routers.alerts import check_alerts

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    client_id = str(uuid.uuid4())
    await manager.connect(client_id, ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            action = msg.get("action")
            symbol = msg.get("symbol", "").upper()

            if action == "subscribe" and symbol:
                manager.subscribe(client_id, symbol)
                await manager.send_to_client(client_id, {
                    "type": "subscribed",
                    "symbol": symbol,
                })

            elif action == "unsubscribe" and symbol:
                manager.unsubscribe(client_id, symbol)

            elif action == "ping":
                await manager.send_to_client(client_id, {"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WS error for {client_id}: {e}")
        manager.disconnect(client_id)


async def on_finnhub_trade(symbol: str, price: float, volume: float, timestamp: int):
    """Callback registered with FinnhubStreamManager to forward ticks to subscribed clients."""
    msg = {
        "type": "trade",
        "symbol": symbol,
        "price": price,
        "volume": volume,
        "timestamp": timestamp,
    }
    await manager.broadcast_symbol(symbol, msg)

    # Check price alerts
    triggered = await check_alerts(symbol, price)
    for alert in triggered:
        await manager.broadcast_all({
            "type": "alert_triggered",
            "alert": alert,
        })
