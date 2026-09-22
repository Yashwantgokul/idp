"""
Authentication & Device Events API Routes (PRD FR-08).
"""

from typing import List, Optional
from fastapi import APIRouter, Query

from core.models import EventRecord, EventType
from core.event_manager import event_mgr

router = APIRouter(prefix="/api/events", tags=["Events"])


@router.get("", response_model=List[EventRecord])
def get_events(
    device_id: Optional[int] = Query(None, description="Filter events for a specific device"),
    event_type: Optional[EventType] = Query(None, description="Filter by event type"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    Retrieve authentication and device lifecycle history ordered chronologically (newest first).
    """
    return event_mgr.get_history(
        device_id=device_id,
        event_type=event_type,
        limit=limit,
        offset=offset
    )
