import asyncio
import json
import logging
from typing import Dict, Set, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # client_id -> WebSocket
        self._connections: Dict[str, WebSocket] = {}
        # symbol -> set of client_ids subscribed
        self._subscriptions: Dict[str, Set[str]] = {}

    async def connect(self, client_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[client_id] = ws
        logger.info(f"WS connected: {client_id} (total={len(self._connections)})")

    def disconnect(self, client_id: str):
        self._connections.pop(client_id, None)
        for subs in self._subscriptions.values():
            subs.discard(client_id)
        logger.info(f"WS disconnected: {client_id} (total={len(self._connections)})")

    def subscribe(self, client_id: str, symbol: str):
        self._subscriptions.setdefault(symbol.upper(), set()).add(client_id)

    def unsubscribe(self, client_id: str, symbol: str):
        subs = self._subscriptions.get(symbol.upper(), set())
        subs.discard(client_id)

    async def send_to_client(self, client_id: str, message: dict):
        ws = self._connections.get(client_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to {client_id}: {e}")
                self.disconnect(client_id)

    async def broadcast_symbol(self, symbol: str, message: dict):
        client_ids = list(self._subscriptions.get(symbol.upper(), set()))
        if not client_ids:
            return
        tasks = [self.send_to_client(cid, message) for cid in client_ids]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_all(self, message: dict):
        client_ids = list(self._connections.keys())
        tasks = [self.send_to_client(cid, message) for cid in client_ids]
        await asyncio.gather(*tasks, return_exceptions=True)

    @property
    def connected_count(self) -> int:
        return len(self._connections)

    def subscribed_symbols(self) -> list:
        return [s for s, ids in self._subscriptions.items() if ids]


manager = ConnectionManager()
