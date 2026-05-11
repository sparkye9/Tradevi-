"""
Options scanner and opportunity scoring logic.
"""
import math
from typing import List, Dict, Any, Optional


def score_opportunity(
    direction: str,
    trend: str,
    bias: str,
    rsi: float,
    dist_to_breakout: float,
    cost_per_contract: float,
    spread_pct: float,
    volume: int,
    open_interest: int,
    dte: int,
    delta: float,
    iv: float,
    gamma: float,
    adx: float,
) -> int:
    score = 0

    # Trend alignment (25pts)
    trend_aligned = (direction == "call" and bias != "bearish") or (direction == "put" and bias != "bullish")
    if trend_aligned:
        score += 20
    if trend == direction.replace("call", "bullish").replace("put", "bearish"):
        score += 5

    # RSI momentum (15pts)
    if direction == "call":
        if 45 <= rsi <= 65:
            score += 15
        elif 35 <= rsi < 45:
            score += 10
        elif rsi < 35:
            score += 5
    else:
        if 35 <= rsi <= 55:
            score += 15
        elif 55 < rsi <= 65:
            score += 10
        elif rsi > 65:
            score += 5

    # Proximity to breakout/down (15pts)
    if dist_to_breakout < 0.01:
        score += 15
    elif dist_to_breakout < 0.02:
        score += 10
    elif dist_to_breakout < 0.05:
        score += 5

    # Cost tier (10pts)
    if cost_per_contract <= 25:
        score += 3   # lottery risk
    elif cost_per_contract <= 50:
        score += 10
    elif cost_per_contract <= 100:
        score += 8
    else:
        score += 5

    # Liquidity (15pts)
    if volume >= 500:
        score += 8
    elif volume >= 100:
        score += 5
    elif volume >= 20:
        score += 2
    if open_interest >= 1000:
        score += 7
    elif open_interest >= 200:
        score += 4
    elif open_interest >= 50:
        score += 1

    # Spread tightness (10pts)
    if spread_pct <= 5:
        score += 10
    elif spread_pct <= 10:
        score += 6
    elif spread_pct <= 20:
        score += 3

    # DTE sweet spot (5pts)
    if 14 <= dte <= 45:
        score += 5
    elif 7 <= dte < 14:
        score += 3
    elif dte < 7:
        score += 1

    # ADX trend strength (5pts)
    if adx >= 30:
        score += 5
    elif adx >= 20:
        score += 3

    return min(score, 100)


def estimated_gain_pct(
    cost_per_contract: float,
    delta: float,
    atr: float,
    stock_price: float,
    dte: int,
) -> float:
    if cost_per_contract <= 0 or stock_price <= 0:
        return 0.0
    # Rough estimate: how much the option might gain if stock moves 1 ATR in the right direction
    atr_move = atr if atr > 0 else stock_price * 0.01
    option_gain = abs(delta) * atr_move * 100
    return round((option_gain / cost_per_contract) * 100, 1)


def beginner_explanation(
    symbol: str,
    direction: str,
    strike: float,
    expiration: str,
    cost_per_contract: float,
    dte: int,
    risk_label: str,
    estimated_gain: float,
    trend: str,
) -> str:
    direction_word = "rise" if direction == "call" else "fall"
    option_type = "call" if direction == "call" else "put"
    risk_note = (
        "⚠️ Lottery-tier risk — expires worthless most of the time."
        if risk_label == "Lottery"
        else f"Risk level: {risk_label}."
    )
    return (
        f"This ${cost_per_contract:.0f} {option_type} on {symbol} bets the stock will {direction_word} "
        f"past ${strike:.2f} by {expiration} ({dte} days). "
        f"Estimated gain if {symbol} moves in your favor: ~{estimated_gain:.0f}%. "
        f"The stock trend is currently {trend}. {risk_note} "
        f"Always confirm in your broker before entering."
    )


def scan_contracts(
    symbol: str,
    contracts: List[Dict],
    analysis: Dict,
    direction: str,
    filters: Dict,
) -> List[Dict]:
    """Score and filter a list of option contracts for the given symbol."""
    opportunities = []
    stock_price = analysis.get("price", 0)
    trend = analysis.get("trend", "neutral")
    bias = analysis.get("bias", "neutral")
    rsi = analysis.get("rsi", 50)
    atr = analysis.get("atr", 0)
    adx_list = analysis.get("indicators", {}).get("adx", [])
    adx = adx_list[-1] if adx_list and adx_list[-1] is not None else 20.0

    breakout = analysis.get("breakoutTrigger", stock_price)
    breakdown = analysis.get("breakdownTrigger", stock_price)

    for contract in contracts:
        cost = contract.get("costPerContract", 0)
        volume = contract.get("volume", 0)
        oi = contract.get("openInterest", 0)
        dte = contract.get("dte", 0)
        delta = abs(contract.get("delta", 0))
        spread_pct = contract.get("spreadPercent", 99)
        iv = contract.get("iv", 0)
        gamma = contract.get("gamma", 0)
        risk_label = contract.get("riskLabel", "High Risk")
        strike = contract.get("strike", 0)

        # Filter gates
        if cost > filters.get("maxPremium", 500):
            continue
        if cost <= 0:
            continue
        if volume < filters.get("minVolume", 5):
            continue
        if oi < filters.get("minOpenInterest", 10):
            continue
        if delta < filters.get("minDelta", 0.1):
            continue
        if delta > filters.get("maxDelta", 0.9):
            continue
        if dte < filters.get("minDTE", 0):
            continue
        if dte > filters.get("maxDTE", 60):
            continue
        if not filters.get("includeLottery", False) and risk_label == "Lottery":
            continue

        dist = abs(breakout - stock_price) / stock_price if direction == "call" \
            else abs(stock_price - breakdown) / stock_price

        opp_score = score_opportunity(
            direction=direction,
            trend=trend,
            bias=bias,
            rsi=rsi,
            dist_to_breakout=dist,
            cost_per_contract=cost,
            spread_pct=spread_pct,
            volume=volume,
            open_interest=oi,
            dte=dte,
            delta=delta,
            iv=iv,
            gamma=gamma,
            adx=float(adx) if adx is not None else 20.0,
        )

        if opp_score < filters.get("minOpportunityScore", 40):
            continue

        est_gain = estimated_gain_pct(cost, delta, atr, stock_price, dte)
        exp_date = contract.get("expiration", "")
        expl = beginner_explanation(symbol, direction, strike, exp_date, cost, dte, risk_label, est_gain, trend)

        opportunities.append({
            "id": f"{symbol}-{direction}-{strike}-{exp_date}",
            "symbol": symbol,
            "direction": "bullish" if direction == "call" else "bearish",
            "contract": contract,
            "stockAnalysis": {
                "price": stock_price,
                "rsi": rsi,
                "atr": atr,
                "trend": trend,
                "bias": bias,
                "support": analysis.get("support"),
                "resistance": analysis.get("resistance"),
                "breakoutTrigger": breakout,
                "breakdownTrigger": breakdown,
                "ma20": analysis.get("ma20"),
                "ma50": analysis.get("ma50"),
            },
            "opportunityScore": opp_score,
            "riskScore": 100 - opp_score,
            "estimatedGainPercent": est_gain,
            "costPerContract": cost,
            "beginnerExplanation": expl,
            "wouldTake": opp_score >= 65,
            "scannedAt": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
        })

    return sorted(opportunities, key=lambda x: x["opportunityScore"], reverse=True)[:5]
