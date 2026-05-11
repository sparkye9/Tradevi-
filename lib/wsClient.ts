'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type WsMessage = unknown;

const getSocketUrl = () => {
  if (typeof window === 'undefined') return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

export function useTickerPrice({ symbol, enabled = true }: { symbol: string; enabled?: boolean }) {
  const [price, setPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !symbol || typeof window === 'undefined') return;

    const socketUrl = getSocketUrl();
    if (!socketUrl) return;

    const ws = new WebSocket(socketUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ action: 'subscribe', symbol: symbol.toUpperCase() }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (typeof msg.price === 'number') setPrice(msg.price);
      } catch {}
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
  }, [symbol, enabled]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return { price, connected };
}

export function useTradeStream(
  symbols: string[],
  onMessage: (msg: WsMessage) => void,
  enabled = true
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || symbols.length === 0 || typeof window === 'undefined') return;

    const socketUrl = getSocketUrl();
    if (!socketUrl) return;

    const ws = new WebSocket(socketUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ action: 'subscribe', symbols: symbols.map(s => s.toUpperCase()) }));
    };

    ws.onmessage = (event) => {
      try {
        onMessageRef.current(JSON.parse(event.data));
      } catch {}
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => ws.close();
  }, [symbols.join(','), enabled]);

  return { connected };
}