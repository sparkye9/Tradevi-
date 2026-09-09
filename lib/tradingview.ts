// lib/tradingview.ts — TradingView Alert Webhook helpers
//
// TradingView has no public API for pulling live chart/price data out of a
// personal account — the only sanctioned way data moves from TradingView
// into a third-party app is the other direction: you create an Alert on a
// chart/indicator (Pro+ plan), point its "Webhook URL" at
// POST /api/tradingview/webhook, and TradingView POSTs the alert's message
// body when it fires.
//
// Setup on the TradingView side:
//   1. Create an alert → Notifications tab → check "Webhook URL"
//   2. URL: https://<your-domain>/api/tradingview/webhook
//   3. Message (JSON): {"secret": "<TRADINGVIEW_WEBHOOK_SECRET>", "symbol": "{{ticker}}", "message": "{{strategy.order.comment}}"}
//
// TradingView can't send custom headers, so the shared secret has to travel
// inside the JSON body instead.

export interface TvAlertPayload {
  secret?: string;
  symbol?: string;
  message?: string;
  [key: string]: unknown;
}

export function verifyTradingViewSecret(payload: TvAlertPayload): boolean {
  const expected = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expected) return false;
  return payload.secret === expected;
}
