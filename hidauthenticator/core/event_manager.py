"""
Event Manager for HID Authenticator (HIDShield-X MVP).
Handles logging, querying, and live broadcasting of device lifecycle & authentication events (PRD FR-08).
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Callable, Awaitable
from core.models import EventRecord, EventType
from core.database import Database, db


class EventManager:
    def __init__(self, database: Database = db):
        self.db = database
        self._listeners: List[Callable[[Dict[str, Any]], Awaitable[None]]] = []

    def register_listener(self, listener: Callable[[Dict[str, Any]], Awaitable[None]]):
        """Register an async callback for real-time WebSocket distribution."""
        if listener not in self._listeners:
            self._listeners.append(listener)

    def unregister_listener(self, listener: Callable[[Dict[str, Any]], Awaitable[None]]):
        """Unregister an async callback."""
        if listener in self._listeners:
            self._listeners.remove(listener)

    async def broadcast(self, payload: Dict[str, Any]):
        """Broadcast payload to all registered listeners asynchronously."""
        for listener in list(self._listeners):
            try:
                await listener(payload)
            except Exception:
                # If a listener fails (e.g. disconnected client), silently continue
                pass

    def log_event(
        self,
        event_type: EventType,
        device_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None
    ) -> EventRecord:
        """
        Record an event to the persistent database.
        """
        record = self.db.insert_event(
            event_type=event_type,
            device_id=device_id,
            details=details,
            timestamp=timestamp
        )
        return record

    def get_history(
        self,
        device_id: Optional[int] = None,
        event_type: Optional[EventType] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[EventRecord]:
        """
        Retrieve paginated event history.
        """
        return self.db.list_events(
            device_id=device_id,
            event_type=event_type,
            limit=limit,
            offset=offset
        )

    def get_total_events_count(self) -> int:
        return self.db.count_events()


# Global instance
event_mgr = EventManager()
