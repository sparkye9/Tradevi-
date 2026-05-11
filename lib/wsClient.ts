'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_WS_URL ?? `ws://${window.location.hostname}:8000/ws`)
    : '';

export type WsMessage =
  | { type: 'trade'; symbol: string; price: number; volume: number; timestamp: number }
  | { type: 'subscribed'; symbol: string }
  | { type: 'alert_triggered'; alert: unknown }
  | { type: 'pong' }
  | { type: string; [key: string]: unknown };

interface UseTickerOptions {
  symbol: string;
  enabled?: boolean;
}

/**
 * Hook that connects to the backend WebSocket and streams real-time price ticks
 * for a single symbol. Returns the latest price (or null if no tick received yet).
 */
export function useTickerPrice({ symbol, enabled = true }: UseTickerOptions) {
  const [price, setPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!WS_URL || !enabled) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ action: 'subscribe', symbol: symbol.toUpperCase() }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === 'trade' && msg.symbol === symbol.toUpperCase() && typeof msg.price === 'number') {
          setPrice(msg.price);
        }
      } catch {}
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [symbol, enabled]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { price, connected };
}

/**
 * Hook that connects once and allows subscribing to multiple symbols.
 * Calls `onMessage` for every incoming WebSocket message.
 */
export function useTradeStream(
  symbols: string[],
  onMessage: (msg: WsMessage) => void,
  enabled = true
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!WS_URL || !enabled) return;
    let active = true;

    const connect = () => {
      if (!active) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        symbols.forEach(sym => {
          ws.send(JSON.stringify({ action: 'subscribe', symbol: sym.toUpperCase() }));
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          onMessageRef.current(msg);
        } catch {}
      };

      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (active) reconnectTimer.current = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [symbols.join(','), enabled]);

  return { connected };
}
