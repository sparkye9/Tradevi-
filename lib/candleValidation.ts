/**
 * Validates candle data before rendering
 * Prevents crashes and invalid indicator calculations
 */

import type { CandleData } from './apiClient';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  validCandles: CandleData[];
}

export function validateCandles(candles: CandleData[]): ValidationResult {
  const errors: string[] = [];
  const validCandles: CandleData[] = [];

  if (!Array.isArray(candles)) {
    errors.push('Candles is not an array');
    return { isValid: false, errors, validCandles };
  }

  if (candles.length === 0) {
    errors.push('No candle data provided');
    return { isValid: false, errors, validCandles };
  }

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Check required fields
    if (typeof candle.time !== 'number') {
      errors.push(`Candle ${i}: time is missing or not a number`);
      continue;
    }

    if (typeof candle.open !== 'number' || !isFinite(candle.open) || candle.open <= 0) {
      errors.push(`Candle ${i}: open is not a valid positive number`);
      continue;
    }

    if (typeof candle.high !== 'number' || !isFinite(candle.high) || candle.high <= 0) {
      errors.push(`Candle ${i}: high is not a valid positive number`);
      continue;
    }

    if (typeof candle.low !== 'number' || !isFinite(candle.low) || candle.low <= 0) {
      errors.push(`Candle ${i}: low is not a valid positive number`);
      continue;
    }

    if (typeof candle.close !== 'number' || !isFinite(candle.close) || candle.close <= 0) {
      errors.push(`Candle ${i}: close is not a valid positive number`);
      continue;
    }

    // Verify OHLC relationships
    if (candle.high < candle.low) {
      errors.push(`Candle ${i}: high (${candle.high}) is less than low (${candle.low})`);
      continue;
    }

    if (candle.high < candle.open || candle.high < candle.close) {
      errors.push(`Candle ${i}: high is less than open or close`);
      continue;
    }

    if (candle.low > candle.open || candle.low > candle.close) {
      errors.push(`Candle ${i}: low is greater than open or close`);
      continue;
    }

    // Volume can be 0 or missing, but if present should be >= 0
    const volume = candle.volume ?? 0;
    if (typeof volume !== 'number' || !isFinite(volume) || volume < 0) {
      errors.push(`Candle ${i}: volume is not a valid non-negative number`);
      continue;
    }

    // Valid candle
    validCandles.push({
      ...candle,
      volume: volume, // Ensure volume defaults to 0 if missing
    });
  }

  const isValid = validCandles.length > 0 && errors.length === 0;

  return {
    isValid,
    errors,
    validCandles,
  };
}

/**
 * Validates that we have enough candles for indicator calculations
 */
export function validateCandlesForIndicators(candles: CandleData[]): {
  canCalculateRSI: boolean;
  canCalculateEMA: boolean;
  canCalculateMACD: boolean;
  canCalculateATR: boolean;
} {
  const length = candles.length;

  return {
    canCalculateRSI: length >= 14, // RSI needs at least 14 candles
    canCalculateEMA: length >= 20, // EMA typically needs 20+ for meaningful values
    canCalculateMACD: length >= 26, // MACD slow EMA is 26
    canCalculateATR: length >= 14, // ATR needs at least 14 candles
  };
}
