"""
Technical indicator calculations — all pure numpy/pandas, no TA-Lib dependency.
"""
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional


def _rma(series: np.ndarray, period: int) -> np.ndarray:
    """Wilder's RMA (used by RSI, ATR)."""
    result = np.full_like(series, np.nan, dtype=float)
    if len(series) < period:
        return result
    seed = np.nanmean(series[:period])
    result[period - 1] = seed
    alpha = 1.0 / period
    for i in range(period, len(series)):
        result[i] = alpha * series[i] + (1 - alpha) * result[i - 1]
    return result


def calc_ema(series: np.ndarray, period: int) -> np.ndarray:
    result = pd.Series(series).ewm(span=period, adjust=False).mean().to_numpy()
    return result


def calc_rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    delta = np.diff(close, prepend=np.nan)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_gain = _rma(gain, period)
    avg_loss = _rma(loss, period)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = np.where(avg_loss == 0, np.inf, avg_gain / avg_loss)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calc_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
    prev_close = np.roll(close, 1)
    prev_close[0] = close[0]
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev_close), np.abs(low - prev_close)))
    return _rma(tr, period)


def calc_macd(close: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, np.ndarray]:
    fast_ema = calc_ema(close, fast)
    slow_ema = calc_ema(close, slow)
    macd_line = fast_ema - slow_ema
    signal_line = calc_ema(macd_line, signal)
    histogram = macd_line - signal_line
    return {"macd": macd_line, "signal": signal_line, "histogram": histogram}


def calc_bollinger(close: np.ndarray, period: int = 20, std_dev: float = 2.0) -> Dict[str, np.ndarray]:
    series = pd.Series(close)
    mid = series.rolling(period).mean().to_numpy()
    std = series.rolling(period).std(ddof=0).to_numpy()
    upper = mid + std_dev * std
    lower = mid - std_dev * std
    return {"upper": upper, "mid": mid, "lower": lower}


def calc_vwap(high: np.ndarray, low: np.ndarray, close: np.ndarray, volume: np.ndarray) -> np.ndarray:
    typical = (high + low + close) / 3.0
    cum_vol = np.cumsum(volume)
    cum_tp_vol = np.cumsum(typical * volume)
    with np.errstate(divide="ignore", invalid="ignore"):
        vwap = np.where(cum_vol > 0, cum_tp_vol / cum_vol, np.nan)
    return vwap


def calc_supertrend(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    period: int = 10,
    multiplier: float = 3.0,
) -> Dict[str, np.ndarray]:
    atr = calc_atr(high, low, close, period)
    hl2 = (high + low) / 2.0
    upper_band = hl2 + multiplier * atr
    lower_band = hl2 - multiplier * atr

    supertrend = np.full_like(close, np.nan)
    direction = np.zeros(len(close), dtype=int)  # 1=up, -1=down

    for i in range(1, len(close)):
        if np.isnan(atr[i]):
            continue
        # Update bands
        if lower_band[i] < lower_band[i - 1] or close[i - 1] < lower_band[i - 1]:
            lower_band[i] = lower_band[i]
        else:
            lower_band[i] = lower_band[i - 1]

        if upper_band[i] > upper_band[i - 1] or close[i - 1] > upper_band[i - 1]:
            upper_band[i] = upper_band[i]
        else:
            upper_band[i] = upper_band[i - 1]

        if close[i] > upper_band[i - 1]:
            direction[i] = 1
        elif close[i] < lower_band[i - 1]:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]

        supertrend[i] = lower_band[i] if direction[i] == 1 else upper_band[i]

    return {"supertrend": supertrend, "direction": direction}


def calc_aroon(high: np.ndarray, low: np.ndarray, period: int = 14) -> Dict[str, np.ndarray]:
    n = len(high)
    aroon_up = np.full(n, np.nan)
    aroon_down = np.full(n, np.nan)
    for i in range(period, n):
        window_high = high[i - period: i + 1]
        window_low = low[i - period: i + 1]
        high_idx = np.argmax(window_high)
        low_idx = np.argmin(window_low)
        aroon_up[i] = (high_idx / period) * 100
        aroon_down[i] = (low_idx / period) * 100
    return {"up": aroon_up, "down": aroon_down, "osc": aroon_up - aroon_down}


def calc_dmi(
    high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14
) -> Dict[str, np.ndarray]:
    n = len(close)
    plus_dm = np.zeros(n)
    minus_dm = np.zeros(n)
    for i in range(1, n):
        up_move = high[i] - high[i - 1]
        down_move = low[i - 1] - low[i]
        plus_dm[i] = up_move if up_move > down_move and up_move > 0 else 0
        minus_dm[i] = down_move if down_move > up_move and down_move > 0 else 0

    atr = calc_atr(high, low, close, period)
    smoothed_plus = _rma(plus_dm, period)
    smoothed_minus = _rma(minus_dm, period)

    with np.errstate(divide="ignore", invalid="ignore"):
        di_plus = np.where(atr > 0, 100 * smoothed_plus / atr, 0.0)
        di_minus = np.where(atr > 0, 100 * smoothed_minus / atr, 0.0)
        di_sum = di_plus + di_minus
        dx = np.where(di_sum > 0, 100 * np.abs(di_plus - di_minus) / di_sum, 0.0)

    adx = _rma(dx, period)
    return {"di_plus": di_plus, "di_minus": di_minus, "adx": adx}


def calc_lrsi(close: np.ndarray, gamma: float = 0.5, period: int = 2) -> np.ndarray:
    """Laguerre RSI."""
    n = len(close)
    l0 = np.zeros(n)
    l1 = np.zeros(n)
    l2 = np.zeros(n)
    l3 = np.zeros(n)
    lrsi = np.full(n, np.nan)

    for i in range(1, n):
        l0[i] = (1 - gamma) * close[i] + gamma * l0[i - 1]
        l1[i] = -gamma * l0[i] + l0[i - 1] + gamma * l1[i - 1]
        l2[i] = -gamma * l1[i] + l1[i - 1] + gamma * l2[i - 1]
        l3[i] = -gamma * l2[i] + l2[i - 1] + gamma * l3[i - 1]

        cu = 0.0
        cd = 0.0
        if l0[i] >= l1[i]:
            cu += l0[i] - l1[i]
        else:
            cd += l1[i] - l0[i]
        if l1[i] >= l2[i]:
            cu += l1[i] - l2[i]
        else:
            cd += l2[i] - l1[i]
        if l2[i] >= l3[i]:
            cu += l2[i] - l3[i]
        else:
            cd += l3[i] - l2[i]

        total = cu + cd
        lrsi[i] = cu / total if total > 0 else 0.0

    return lrsi


def calc_orb(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    timestamps: List[Any],
    minutes: int = 30,
) -> Dict[str, Optional[float]]:
    """Opening Range Breakout — finds high/low of first `minutes` bars of the session."""
    if not timestamps:
        return {"orb_high": None, "orb_low": None}

    import datetime
    try:
        ts = [pd.Timestamp(t) for t in timestamps]
        session_open = ts[0].replace(hour=9, minute=30, second=0, microsecond=0)
        cutoff = session_open + datetime.timedelta(minutes=minutes)
        orb_highs = [high[i] for i, t in enumerate(ts) if session_open <= t <= cutoff]
        orb_lows = [low[i] for i, t in enumerate(ts) if session_open <= t <= cutoff]
        if not orb_highs:
            return {"orb_high": None, "orb_low": None}
        return {"orb_high": float(max(orb_highs)), "orb_low": float(min(orb_lows))}
    except Exception:
        return {"orb_high": None, "orb_low": None}


def analyze_candles(candles: List[Dict]) -> Dict[str, Any]:
    """Run full indicator suite on a candle list. Returns dict ready for JSON serialization."""
    if len(candles) < 20:
        return {}

    closes = np.array([c["close"] for c in candles], dtype=float)
    highs = np.array([c["high"] for c in candles], dtype=float)
    lows = np.array([c["low"] for c in candles], dtype=float)
    volumes = np.array([c.get("volume", 0) for c in candles], dtype=float)
    timestamps = [c.get("time") or c.get("timestamp") for c in candles]

    rsi_14 = calc_rsi(closes, 14)
    ema_9 = calc_ema(closes, 9)
    ema_20 = calc_ema(closes, 20)
    ema_50 = calc_ema(closes, 50)
    ema_200 = calc_ema(closes, 200)
    macd = calc_macd(closes)
    bb = calc_bollinger(closes)
    vwap = calc_vwap(highs, lows, closes, volumes)
    st_fast = calc_supertrend(highs, lows, closes, 10, 3.0)
    st_slow = calc_supertrend(highs, lows, closes, 14, 2.0)
    aroon = calc_aroon(highs, lows, 14)
    dmi = calc_dmi(highs, lows, closes, 14)
    lrsi = calc_lrsi(closes)
    atr = calc_atr(highs, lows, closes, 14)
    orb = calc_orb(highs, lows, closes, timestamps)

    def _s(arr: np.ndarray) -> List[Optional[float]]:
        return [None if np.isnan(v) else round(float(v), 4) for v in arr]

    last = -1
    price = float(closes[last])
    current_rsi = float(rsi_14[last]) if not np.isnan(rsi_14[last]) else 50.0
    current_atr = float(atr[last]) if not np.isnan(atr[last]) else 0.0

    # Trend bias
    st_up = int(st_fast["direction"][last]) == 1 and int(st_slow["direction"][last]) == 1
    st_down = int(st_fast["direction"][last]) == -1 and int(st_slow["direction"][last]) == -1
    ema_bullish = float(ema_20[last]) > float(ema_50[last])
    dmi_bullish = float(dmi["di_plus"][last]) > float(dmi["di_minus"][last]) if not np.isnan(dmi["di_plus"][last]) else False
    aroon_bullish = float(aroon["osc"][last]) > 0 if not np.isnan(aroon["osc"][last]) else False

    bullish_signals = sum([st_up, ema_bullish, dmi_bullish, aroon_bullish])
    bearish_signals = sum([st_down, not ema_bullish, not dmi_bullish, not aroon_bullish])
    bias = "bullish" if bullish_signals >= 3 else "bearish" if bearish_signals >= 3 else "neutral"

    # Key levels
    recent_highs = highs[-20:]
    recent_lows = lows[-20:]
    resistance = float(np.max(recent_highs))
    support = float(np.min(recent_lows))
    breakout_trigger = round(resistance * 1.002, 2)
    breakdown_trigger = round(support * 0.998, 2)

    return {
        "price": price,
        "rsi": round(current_rsi, 2),
        "atr": round(current_atr, 4),
        "bias": bias,
        "trend": "bullish" if st_up else "bearish" if st_down else "neutral",
        "trendStrength": bullish_signals if bias == "bullish" else bearish_signals,
        "support": round(support, 2),
        "resistance": round(resistance, 2),
        "breakoutTrigger": breakout_trigger,
        "breakdownTrigger": breakdown_trigger,
        "ma20": round(float(ema_20[last]), 2),
        "ma50": round(float(ema_50[last]), 2),
        "indicators": {
            "rsi": _s(rsi_14),
            "ema9": _s(ema_9),
            "ema20": _s(ema_20),
            "ema50": _s(ema_50),
            "ema200": _s(ema_200),
            "macdLine": _s(macd["macd"]),
            "macdSignal": _s(macd["signal"]),
            "macdHist": _s(macd["histogram"]),
            "bbUpper": _s(bb["upper"]),
            "bbMid": _s(bb["mid"]),
            "bbLower": _s(bb["lower"]),
            "vwap": _s(vwap),
            "stFastDir": [int(d) for d in st_fast["direction"]],
            "stFastLine": _s(st_fast["supertrend"]),
            "stSlowDir": [int(d) for d in st_slow["direction"]],
            "stSlowLine": _s(st_slow["supertrend"]),
            "aroonUp": _s(aroon["up"]),
            "aroonDown": _s(aroon["down"]),
            "aroonOsc": _s(aroon["osc"]),
            "diPlus": _s(dmi["di_plus"]),
            "diMinus": _s(dmi["di_minus"]),
            "adx": _s(dmi["adx"]),
            "lrsi": _s(lrsi),
            "atr": _s(atr),
        },
        "orb": orb,
    }
