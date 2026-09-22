"""
WebSocket Manager for real-time dashboard notifications in HID Authenticator.
"""

import json
from typing import List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect

from core.event_manager import event_mgr


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()


async def event_broadcast_listener(payload: Dict[str, Any]):
    """Callback linked to EventManager to push events down WebSocket."""
    await manager.broadcast(payload)


# Connect event_mgr to websocket manager
event_mgr.register_listener(event_broadcast_listener)
