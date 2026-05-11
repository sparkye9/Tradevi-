import asyncio
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Literal, Optional

from services.yfinance_service import fetch_candles
from services.indicators import analyze_candles
from services.polygon_service import fetch_options_chain
from services.options_analyzer import scan_contracts

router = APIRouter(prefix="/api/scanner", tags=["scanner"])

DEFAULT_SYMBOLS = [
    "SPY", "QQQ", "IWM", "TSLA", "NVDA", "AAPL", "AMD",
    "META", "MSFT", "F", "SQQQ", "TQQQ", "SOFI", "PLTR", "USO", "XLE",
]


class ScannerRequest(BaseModel):
    symbols: List[str] = Field(default_factory=lambda: DEFAULT_SYMBOLS[:12])
    maxPremium: float = 200
    optionType: Literal["calls", "puts", "both"] = "both"
    tradeType: Literal["day", "swing", "both"] = "swing"
    minVolume: int = 10
    minOpenInterest: int = 50
    minOpportunityScore: int = 40
    minDelta: float = 0.15
    maxDelta: float = 0.70
    minDTE: int = 7
    maxDTE: int = 45
    includeLottery: bool = False
    biasFilter: Literal["bullish", "bearish", "both"] = "both"


async def _scan_symbol(symbol: str, req: ScannerRequest) -> List[dict]:
    try:
        candle_list = fetch_candles(symbol, "3mo", "1d")
        if not candle_list:
            return []
        analysis = analyze_candles(candle_list)
        if not analysis:
            return []

        bias = analysis.get("bias", "neutral")
        if req.biasFilter != "both":
            if req.biasFilter == "bullish" and bias == "bearish":
                return []
            if req.biasFilter == "bearish" and bias == "bullish":
                return []

        directions = []
        if req.optionType == "calls":
            directions = ["call"]
        elif req.optionType == "puts":
            directions = ["put"]
        else:
            if bias != "bearish":
                directions.append("call")
            if bias != "bullish":
                directions.append("put")

        filters = req.model_dump()

        chain = await fetch_options_chain(symbol)
        opportunities = []
        for direction in directions:
            contracts = chain.get("calls" if direction == "call" else "puts", [])
            opps = scan_contracts(symbol, contracts, analysis, direction, filters)
            opportunities.extend(opps)

        return sorted(opportunities, key=lambda x: x["opportunityScore"], reverse=True)[:5]

    except Exception as e:
        return []


@router.post("/run")
async def run_scanner(req: ScannerRequest):
    symbols = [s.upper() for s in req.symbols[:16]]
    try:
        tasks = [_scan_symbol(sym, req) for sym in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_opps = []
        for r in results:
            if isinstance(r, list):
                all_opps.extend(r)

        all_opps.sort(key=lambda x: x["opportunityScore"], reverse=True)

        return {
            "opportunities": all_opps[:50],
            "symbolsScanned": len(symbols),
            "scannedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "meta": {
                "dataSource": "polygon_realtime" if all_opps else "yahoo_delayed",
                "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
