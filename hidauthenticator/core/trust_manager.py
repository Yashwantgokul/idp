"""
Trust Manager for HID Authenticator (HIDShield-X MVP).
Implements PRD Section 10 Device Matching and Trust Rules,
and Functional Requirements FR-03, FR-04, FR-05, FR-06, FR-07, FR-10.
"""

from datetime import datetime, timezone
from typing import Optional, Tuple, List, Dict, Any
import asyncio

from core.models import (
    CommonDeviceEvent,
    DeviceRecord,
    DeviceStatus,
    EventType,
    OverviewStats
)
from core.database import Database, db
from core.event_manager import EventManager, event_mgr

try:
    from core.notifier import notify_device_event
except ImportError:
    try:
        from hidauthenticator.core.notifier import notify_device_event
    except ImportError:
        def notify_device_event(title: str, body: str) -> None:
            pass



class TrustManager:
    def __init__(self, database: Database = db, event_manager: EventManager = event_mgr):
        self.db = database
        self.event_mgr = event_manager

    def match_device(self, new_device: CommonDeviceEvent) -> Tuple[Optional[DeviceRecord], str]:
        """
        Device Matching Engine per PRD Section 10:
        1. Serial number match (strongest available).
        2. Hardware ID / instance path match (OS-level physical path).
        3. VID + PID + Manufacturer + Product String + Interface match.
        4. If ambiguous or only weak VID/PID without supporting metadata, do NOT blindly trust.
        
        Returns:
            Tuple of (matched_device_record_or_None, match_strength_description)
        """
        all_devices = self.db.list_devices()

        # Rule 1: Match by valid Serial Number if available on both
        if new_device.serial_number and new_device.serial_number.strip():
            for rec in all_devices:
                if rec.serial_number and rec.serial_number.strip().lower() == new_device.serial_number.strip().lower():
                    # Check for VID/PID consistency
                    if (not new_device.vendor_id or not rec.vendor_id or 
                        new_device.vendor_id.lower() == rec.vendor_id.lower()):
                        return rec, "exact_serial_match"

        # Rule 2: Match by exact hardware_id / instance path if provided by OS
        if new_device.hardware_id and new_device.hardware_id.strip():
            for rec in all_devices:
                if rec.hardware_id and rec.hardware_id.strip().lower() == new_device.hardware_id.strip().lower():
                    return rec, "hardware_id_match"

        # Rule 3: Match by VID + PID + Manufacturer + Product String + Interface
        if new_device.vendor_id and new_device.product_id:
            vid = new_device.vendor_id.strip().lower()
            pid = new_device.product_id.strip().lower()

            candidate_matches: List[DeviceRecord] = []
            for rec in all_devices:
                if rec.vendor_id and rec.product_id:
                    if rec.vendor_id.strip().lower() == vid and rec.product_id.strip().lower() == pid:
                        candidate_matches.append(rec)

            if len(candidate_matches) == 1:
                rec = candidate_matches[0]
                # Compare auxiliary metadata to prevent treating distinct devices with same VID/PID as identical
                mfg_match = (
                    not new_device.manufacturer or not rec.manufacturer or
                    new_device.manufacturer.strip().lower() == rec.manufacturer.strip().lower()
                )
                prod_match = (
                    not new_device.product_string or not rec.product_string or
                    new_device.product_string.strip().lower() == rec.product_string.strip().lower()
                )
                if mfg_match and prod_match:
                    return rec, "vid_pid_descriptor_match"

            elif len(candidate_matches) > 1:
                # Multiple records share VID/PID. Require stricter descriptor match.
                for rec in candidate_matches:
                    same_mfg = (
                        rec.manufacturer and new_device.manufacturer and
                        rec.manufacturer.strip().lower() == new_device.manufacturer.strip().lower()
                    )
                    same_prod = (
                        rec.product_string and new_device.product_string and
                        rec.product_string.strip().lower() == new_device.product_string.strip().lower()
                    )
                    if same_mfg and same_prod:
                        return rec, "multi_candidate_descriptor_match"

        # No confident match found
        return None, "no_match"

    def handle_device_connected(self, event: CommonDeviceEvent) -> DeviceRecord:
        """
        Process a device connection event per PRD Section 5.1 & 5.2.
        Handles new devices, previously approved devices, rejected, and revoked devices.
        Prevents duplicate prompt flood.
        """
        now = datetime.now(timezone.utc)
        matched_rec, match_reason = self.match_device(event)

        if matched_rec:
            # Device already exists in registry
            device_id = matched_rec.id

            # Update connection state and timestamp
            updated_rec = self.db.update_device_connection(
                device_id=device_id,
                is_connected=True,
                last_connected_at=now
            )

            # Check existing trust status
            if updated_rec.status == DeviceStatus.AUTHENTICATED:
                # Section 5.2: Previously Approved Device -> Authenticated
                self.event_mgr.log_event(
                    event_type=EventType.CONNECTED,
                    device_id=device_id,
                    details={
                        "action": "reconnected",
                        "status": DeviceStatus.AUTHENTICATED.value,
                        "match_reason": match_reason
                    },
                    timestamp=now
                )
                self._dispatch_async({
                    "type": "device_connected",
                    "device": updated_rec.model_dump(mode="json")
                })
                notify_device_event(
                    "HIDShield-X: Device Connected",
                    f"{updated_rec.device_name} attached (Status: Authorized)"
                )
                return updated_rec

            elif updated_rec.status == DeviceStatus.TRUST_REVOKED:
                # Section 5.4: If connected again, requires approval again
                self.db.update_device_status(device_id, DeviceStatus.PENDING_AUTHENTICATION)
                updated_rec = self.db.get_device_by_id(device_id)

                self.event_mgr.log_event(
                    event_type=EventType.AUTH_REQUESTED,
                    device_id=device_id,
                    details={
                        "reason": "previously_revoked_requires_approval",
                        "match_reason": match_reason
                    },
                    timestamp=now
                )
                self._dispatch_async({
                    "type": "auth_requested",
                    "device": updated_rec.model_dump(mode="json"),
                    "prompt": "This device had its trust revoked previously. Do you want to approve it?"
                })
                notify_device_event(
                    "HIDShield-X: Authorization Required",
                    f"Revoked peripheral '{updated_rec.device_name}' attached. Approval required."
                )
                return updated_rec

            elif updated_rec.status == DeviceStatus.PENDING_AUTHENTICATION:
                # FR-01: Avoid creating duplicate prompts for repeated notifications of active connection
                self._dispatch_async({
                    "type": "device_connected",
                    "device": updated_rec.model_dump(mode="json")
                })
                return updated_rec

            elif updated_rec.status == DeviceStatus.REJECTED:
                # Previously rejected device connected
                self.event_mgr.log_event(
                    event_type=EventType.CONNECTED,
                    device_id=device_id,
                    details={
                        "note": "previously_rejected_device_connected",
                        "match_reason": match_reason
                    },
                    timestamp=now
                )
                self._dispatch_async({
                    "type": "device_connected",
                    "device": updated_rec.model_dump(mode="json")
                })
                notify_device_event(
                    "HIDShield-X: Peripheral Plugged In",
                    f"Declined device '{updated_rec.device_name}' plugged in (Unauthorized)."
                )
                return updated_rec

            else:
                # Not authenticated -> Request auth
                self.db.update_device_status(device_id, DeviceStatus.PENDING_AUTHENTICATION)
                updated_rec = self.db.get_device_by_id(device_id)
                self.event_mgr.log_event(
                    event_type=EventType.AUTH_REQUESTED,
                    device_id=device_id,
                    details={"match_reason": match_reason},
                    timestamp=now
                )
                self._dispatch_async({
                    "type": "auth_requested",
                    "device": updated_rec.model_dump(mode="json"),
                    "prompt": "This device has not been registered. Do you want to approve it?"
                })
                notify_device_event(
                    "HIDShield-X: Authorization Required",
                    f"Peripheral '{updated_rec.device_name}' attached. Approval required."
                )
                return updated_rec

        else:
            # Section 5.1: First-Time Device Connection
            insert_data = {
                "device_name": event.device_name or "USB Human Interface Device",
                "vendor_id": event.vendor_id,
                "product_id": event.product_id,
                "serial_number": event.serial_number,
                "manufacturer": event.manufacturer,
                "product_string": event.product_string,
                "interface_type": event.interface_type or "HID",
                "connection_type": event.connection_type or "USB",
                "status": DeviceStatus.PENDING_AUTHENTICATION.value,
                "first_detected_at": now,
                "last_connected_at": now,
                "approved_at": None,
                "is_connected": True,
                "hardware_id": event.hardware_id
            }
            new_rec = self.db.insert_device(insert_data)

            # Record detected event
            self.event_mgr.log_event(
                event_type=EventType.DETECTED,
                device_id=new_rec.id,
                details={
                    "vendor_id": event.vendor_id,
                    "product_id": event.product_id,
                    "serial_number": event.serial_number,
                    "manufacturer": event.manufacturer,
                    "interface_type": event.interface_type
                },
                timestamp=now
            )

            # Record auth_requested event (FR-04)
            self.event_mgr.log_event(
                event_type=EventType.AUTH_REQUESTED,
                device_id=new_rec.id,
                details={"prompt_text": "This device has not been registered. Do you want to approve it?"},
                timestamp=now
            )

            # Broadcast prompt to UI
            self._dispatch_async({
                "type": "auth_requested",
                "device": new_rec.model_dump(mode="json"),
                "prompt": "This device has not been registered. Do you want to approve it?"
            })
            notify_device_event(
                "HIDShield-X: Authorization Required",
                f"New peripheral '{new_rec.device_name}' attached. Approval required."
            )
            return new_rec

    def handle_device_disconnected(self, hardware_id_or_event: Any) -> Optional[DeviceRecord]:
        """
        Process a device disconnection event per PRD FR-01.
        Handles devices that disconnect even before user responds to prompt.
        """
        now = datetime.now(timezone.utc)
        target_device = None

        if isinstance(hardware_id_or_event, str):
            # Look up by hardware_id or device ID
            all_devices = self.db.list_devices()
            for d in all_devices:
                if d.hardware_id and d.hardware_id == hardware_id_or_event:
                    target_device = d
                    break
        elif isinstance(hardware_id_or_event, CommonDeviceEvent):
            target_device, _ = self.match_device(hardware_id_or_event)

        if target_device:
            updated_rec = self.db.update_device_connection(target_device.id, is_connected=False)
            self.event_mgr.log_event(
                event_type=EventType.DISCONNECTED,
                device_id=target_device.id,
                details={"status_at_disconnect": target_device.status.value},
                timestamp=now
            )
            self._dispatch_async({
                "type": "device_disconnected",
                "device": updated_rec.model_dump(mode="json")
            })
            return updated_rec
        return None

    def approve_device(self, device_id: int) -> Optional[DeviceRecord]:
        """
        Approve an unregistered or pending device per PRD FR-05.
        - Sets status to Authenticated
        - Records approval timestamp
        - Logs 'approved' event
        """
        device = self.db.get_device_by_id(device_id)
        if not device:
            return None

        now = datetime.now(timezone.utc)
        updated = self.db.update_device_status(
            device_id=device_id,
            status=DeviceStatus.AUTHENTICATED,
            approved_at=now
        )

        self.event_mgr.log_event(
            event_type=EventType.APPROVED,
            device_id=device_id,
            details={"approved_by": "user", "device_name": device.device_name},
            timestamp=now
        )

        self._dispatch_async({
            "type": "device_approved",
            "device": updated.model_dump(mode="json")
        })
        return updated

    def reject_device(self, device_id: int) -> Optional[DeviceRecord]:
        """
        Reject an unregistered or pending device per PRD FR-06.
        - Sets status to Rejected
        - Does NOT add to trusted registry
        - Logs 'rejected' event
        """
        device = self.db.get_device_by_id(device_id)
        if not device:
            return None

        now = datetime.now(timezone.utc)
        updated = self.db.update_device_status(
            device_id=device_id,
            status=DeviceStatus.REJECTED
        )

        self.event_mgr.log_event(
            event_type=EventType.REJECTED,
            device_id=device_id,
            details={"rejected_by": "user", "device_name": device.device_name},
            timestamp=now
        )

        self._dispatch_async({
            "type": "device_rejected",
            "device": updated.model_dump(mode="json")
        })
        return updated

    def revoke_trust(self, device_id: int) -> Optional[DeviceRecord]:
        """
        Revoke trust from a previously approved device per PRD FR-07.
        - Sets status to Trust Revoked
        - Logs 'trust_revoked' event
        - Reconnecting in the future will require renewed approval.
        """
        device = self.db.get_device_by_id(device_id)
        if not device:
            return None

        now = datetime.now(timezone.utc)
        updated = self.db.update_device_status(
            device_id=device_id,
            status=DeviceStatus.TRUST_REVOKED
        )

        self.event_mgr.log_event(
            event_type=EventType.TRUST_REVOKED,
            device_id=device_id,
            details={"revoked_by": "user", "device_name": device.device_name},
            timestamp=now
        )

        self._dispatch_async({
            "type": "trust_revoked",
            "device": updated.model_dump(mode="json")
        })
        return updated

    def get_overview_stats(self) -> OverviewStats:
        """
        Compute dashboard metrics per PRD FR-09 Section 1.
        """
        all_devices = self.db.list_devices()
        connected_count = sum(1 for d in all_devices if d.is_connected)
        trusted_count = sum(1 for d in all_devices if d.status == DeviceStatus.AUTHENTICATED)
        pending_count = sum(1 for d in all_devices if d.status == DeviceStatus.PENDING_AUTHENTICATION)
        total_events = self.event_mgr.get_total_events_count()

        return OverviewStats(
            connected_devices_count=connected_count,
            trusted_devices_count=trusted_count,
            pending_devices_count=pending_count,
            total_events_count=total_events
        )

    def _dispatch_async(self, message: Dict[str, Any]):
        """Schedule WebSocket broadcast without blocking synchronous caller."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.event_mgr.broadcast(message))
        except RuntimeError:
            # In purely sync tests or startup threads without event loop, run or skip
            pass


# Global instance
trust_mgr = TrustManager()
