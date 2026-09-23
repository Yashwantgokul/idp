"""
Input Enforcement Manager for HID Authenticator (HIDShield-X).
Tracks workstation gating state and provides input security enforcement
for newly detected and unapproved HID peripherals (Keyboard, Mouse, HID).
"""

from typing import List, Set, Optional, Dict, Any
import asyncio
import logging

from core.models import DeviceRecord, DeviceStatus, EnforcementStatus
from core.database import Database, db
from core.event_manager import EventManager, event_mgr

logger = logging.getLogger("hidauthenticator.enforcement")


class InputEnforcementManager:
    """
    Manages the input gating state for the workstation.
    When a peripheral is pending authorization, the enforcement state
    gates/locks recognition until explicit user approval is granted.
    """

    def __init__(self, database: Database = db, event_manager: EventManager = event_mgr):
        self.db = database
        self.event_mgr = event_manager
        self._is_locked: bool = False
        self._gated_interfaces: Set[str] = set()
        self._pending_devices: List[DeviceRecord] = []

    def evaluate_state(self, mode: Optional[str] = None) -> EnforcementStatus:
        """
        Evaluate current gating state based on active system mode and pending devices.
        """
        current_mode = mode or self.db.get_system_mode("mock")
        # List devices in pending_authentication status for this mode
        pending = self.db.list_devices(
            status=DeviceStatus.PENDING_AUTHENTICATION,
            source=current_mode
        )

        gated_interfaces: Set[str] = set()
        for dev in pending:
            if dev.is_connected:
                if dev.interface_type:
                    gated_interfaces.add(dev.interface_type)
                else:
                    gated_interfaces.add("HID")

        self._pending_devices = [d for d in pending if d.is_connected]
        self._is_locked = len(self._pending_devices) > 0
        self._gated_interfaces = gated_interfaces

        return EnforcementStatus(
            is_locked=self._is_locked,
            mode=current_mode,
            pending_count=len(self._pending_devices),
            gated_interfaces=sorted(list(self._gated_interfaces)),
            pending_devices=self._pending_devices
        )

    def get_status(self) -> EnforcementStatus:
        return self.evaluate_state()

    def sync_and_broadcast(self, mode: Optional[str] = None):
        """
        Re-evaluates state and dispatches live enforcement update over WebSocket.
        """
        status = self.evaluate_state(mode)
        message = {
            "type": "enforcement_state_changed",
            "enforcement": status.model_dump(mode="json")
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.event_mgr.broadcast(message))
        except RuntimeError:
            pass


# Global singleton
enforcement_mgr = InputEnforcementManager()
