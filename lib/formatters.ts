export function safeNumber(value: unknown, digits = 2): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return value.toFixed(digits);
}

export function safePercent(value: unknown, digits = 0): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${(value * 100).toFixed(digits)}%`;
}

export function safeMoney(value: unknown, digits = 2): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `$${value.toFixed(digits)}`;
}

/**
 * Futures price with decimals that fit the instrument: NQ 21,450 · CL 64.4 ·
 * ZN 112.25 · 6E 1.0825. Null or non-finite renders as an em dash.
 */
export function fmtPrice(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const places = value >= 1000 ? 0 : value >= 100 ? 1 : value >= 10 ? 2 : 4;
  return value.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
}

export function safeInteger(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return Math.round(value).toString();
}
