"""
Device Management API Routes (PRD FR-03, FR-05, FR-06, FR-07, FR-09).
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from core.models import DeviceRecord, DeviceStatus, ActionResponse, OverviewStats
from core.database import db
from core.trust_manager import trust_mgr

router = APIRouter(prefix="/api/devices", tags=["Devices"])


@router.get("", response_model=List[DeviceRecord])
def get_devices(
    status: Optional[DeviceStatus] = Query(None, description="Filter by device status"),
    is_connected: Optional[bool] = Query(None, description="Filter by connection state"),
    source: Optional[str] = Query(None, description="Filter by source: 'mock', 'real', or 'all'. Defaults to current system mode.")
):
    """List all registered devices in the database, scoped to active mode."""
    target_source = source if source is not None else db.get_system_mode("mock")
    return db.list_devices(status=status, is_connected=is_connected, source=target_source)


@router.get("/stats", response_model=OverviewStats)
def get_dashboard_stats(
    source: Optional[str] = Query(None, description="Filter stats by source. Defaults to current system mode.")
):
    """Retrieve aggregate statistics for the dashboard overview, scoped to active mode."""
    target_source = source if source is not None else db.get_system_mode("mock")
    return trust_mgr.get_overview_stats(source=target_source)



@router.get("/{device_id}", response_model=DeviceRecord)
def get_device(device_id: int):
    """Get metadata for a specific device."""
    device = db.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.post("/{device_id}/approve", response_model=ActionResponse)
def approve_device(device_id: int):
    """
    Approve an unregistered or pending device per PRD FR-05.
    Transitions status to Authenticated, records approval time, logs event.
    """
    updated = trust_mgr.approve_device(device_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Device not found")
    return ActionResponse(
        success=True,
        message=f"Device '{updated.device_name}' successfully approved and added to Trusted Registry.",
        device=updated
    )


@router.post("/{device_id}/reject", response_model=ActionResponse)
def reject_device(device_id: int):
    """
    Reject an unregistered device per PRD FR-06.
    Transitions status to Rejected, logs event. Device does not become trusted.
    """
    updated = trust_mgr.reject_device(device_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Device not found")
    return ActionResponse(
        success=True,
        message=f"Device '{updated.device_name}' rejected.",
        device=updated
    )


@router.post("/{device_id}/revoke", response_model=ActionResponse)
def revoke_trust(device_id: int):
    """
    Revoke trust from a previously approved device per PRD FR-07.
    Transitions status to Trust Revoked, logs event.
    Subsequent connection will require renewed user approval.
    """
    updated = trust_mgr.revoke_trust(device_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Device not found")
    return ActionResponse(
        success=True,
        message=f"Trust revoked for '{updated.device_name}'. Approval will be required on next connection.",
        device=updated
    )
