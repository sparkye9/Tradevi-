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

export function safeInteger(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return Math.round(value).toString();
}
