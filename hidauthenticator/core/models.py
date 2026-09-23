"""
Data models and schemas for HID Authenticator (HIDShield-X MVP).
Complies with PRD FR-02, FR-08, FR-10, and Section 8.3.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class DeviceStatus(str, Enum):
    """
    Device status terminology strictly conforming to PRD FR-10.
    """
    NOT_AUTHENTICATED = "not_authenticated"
    PENDING_AUTHENTICATION = "pending_authentication"
    AUTHENTICATED = "authenticated"
    REJECTED = "rejected"
    TRUST_REVOKED = "trust_revoked"


class EventType(str, Enum):
    """
    Authentication and device event types per PRD FR-08.
    """
    DETECTED = "detected"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    AUTH_REQUESTED = "auth_requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    TRUST_REVOKED = "trust_revoked"


class CommonDeviceEvent(BaseModel):
    """
    Standard device structure produced by platform adapters per PRD 8.3.
    """
    device_name: Optional[str] = Field(None, description="Reported device or interface name")
    vendor_id: Optional[str] = Field(None, description="4-hex-digit USB Vendor ID (VID)")
    product_id: Optional[str] = Field(None, description="4-hex-digit USB Product ID (PID)")
    serial_number: Optional[str] = Field(None, description="Device serial number if exposed")
    manufacturer: Optional[str] = Field(None, description="Manufacturer string if available")
    product_string: Optional[str] = Field(None, description="Product description if available")
    interface_type: Optional[str] = Field("HID", description="Interface category e.g. HID, Keyboard, Mouse")
    connection_type: Optional[str] = Field("USB", description="USB or USB Receiver")
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Optional internal hardware identifier or instance path for OS correlation
    hardware_id: Optional[str] = Field(None, description="Operating system specific device path/ID")
    source: str = Field("real", description="Data source: 'real' (hardware) or 'mock' (simulated)")


class DeviceRecord(BaseModel):
    """
    Database representation of a registered peripheral per PRD 9.1.
    """
    id: int
    device_name: Optional[str] = None
    vendor_id: Optional[str] = None
    product_id: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    product_string: Optional[str] = None
    interface_type: Optional[str] = "HID"
    connection_type: Optional[str] = "USB"
    status: DeviceStatus = DeviceStatus.NOT_AUTHENTICATED
    first_detected_at: datetime
    last_connected_at: datetime
    approved_at: Optional[datetime] = None
    is_connected: bool = True
    hardware_id: Optional[str] = None
    source: str = "real"


class EventRecord(BaseModel):
    """
    Event record representation per PRD 9.2.
    """
    id: int
    device_id: Optional[int] = None
    event_type: EventType
    timestamp: datetime
    details: Optional[Dict[str, Any]] = None
    device_name: Optional[str] = None
    vendor_id: Optional[str] = None
    product_id: Optional[str] = None


class ActionResponse(BaseModel):
    success: bool
    message: str
    device: Optional[DeviceRecord] = None


class OverviewStats(BaseModel):
    connected_devices_count: int
    trusted_devices_count: int
    pending_devices_count: int
    total_events_count: int


class SystemModePayload(BaseModel):
    mode: str = Field(..., description="'mock' or 'real'")


class SystemModeResponse(BaseModel):
    mode: str
    success: bool
    message: str


class EnforcementStatus(BaseModel):
    is_locked: bool
    mode: str
    pending_count: int
    gated_interfaces: list[str]
    pending_devices: list[DeviceRecord]

