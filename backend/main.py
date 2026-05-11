"""
Tradevi FastAPI backend
────────────────────────
Real-time trading dashboard backend. Streams live prices via Finnhub WebSocket,
serves historical candles from yfinance, options chain from Polygon.io,
and portfolio data from Alpaca. NO mock data, NO auto-trading.
"""
import asyncio
import logging
import sys
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure services/routers can be imported relative to backend/
sys.path.insert(0, os.path.dirname(__file__))

from config import settings
from routers import quotes, charts, options, scanner, alerts, broker, ws as ws_router
from services.finnhub_service import finnhub_stream
from routers.ws import on_finnhub_trade

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Tradevi API",
    description="Real trading dashboard — live data only, no mock data.",
    version="2.0.0",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(quotes.router)
app.include_router(charts.router)
app.include_router(options.router)
app.include_router(scanner.router)
app.include_router(alerts.router)
app.include_router(broker.router)
app.include_router(ws_router.router)


@app.on_event("startup")
async def startup():
    logger.info("Starting Tradevi backend…")
    # Register Finnhub trade callback → WebSocket broadcast
    finnhub_stream.add_callback(on_finnhub_trade)
    # Start streaming SPY/QQQ by default; frontend can add more via WS subscribe
    for sym in ["SPY", "QQQ", "TSLA", "NVDA", "AAPL"]:
        finnhub_stream.subscribe(sym)
    await finnhub_stream.start()
    logger.info("Finnhub stream started")


@app.on_event("shutdown")
async def shutdown():
    await finnhub_stream.stop()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "finnhub": bool(settings.finnhub_api_key),
        "polygon": bool(settings.polygon_api_key),
        "alpaca": bool(settings.alpaca_api_key),
        "wsClients": __import__("websocket_manager").manager.connected_count,
    }
