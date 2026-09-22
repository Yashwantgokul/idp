"""
Unit tests for Trust Manager and Matching Rules in HID Authenticator.
Validates PRD Section 5 workflows, Section 10 matching rules, and FR-03..FR-07.
"""

import unittest
import tempfile
from pathlib import Path
from datetime import datetime, timezone

from core.database import Database
from core.event_manager import EventManager
from core.trust_manager import TrustManager
from core.models import CommonDeviceEvent, DeviceStatus, EventType


class TestTrustManager(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_trust.db"
        self.db = Database(self.db_path)
        self.event_mgr = EventManager(self.db)
        self.trust_mgr = TrustManager(self.db, self.event_mgr)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_first_time_device_connection(self):
        """FR-01, FR-02, FR-04: First-time connection triggers pending authentication and prompt."""
        event = CommonDeviceEvent(
            device_name="Logitech G Pro",
            vendor_id="046D",
            product_id="C33C",
            serial_number="LOGI-SN-001",
            manufacturer="Logitech",
            interface_type="Keyboard"
        )

        dev_rec = self.trust_mgr.handle_device_connected(event)
        self.assertIsNotNone(dev_rec)
        self.assertEqual(dev_rec.status, DeviceStatus.PENDING_AUTHENTICATION)
        self.assertTrue(dev_rec.is_connected)

        # Check events logged: detected and auth_requested
        events = self.event_mgr.get_history(device_id=dev_rec.id)
        event_types = [e.event_type for e in events]
        self.assertIn(EventType.DETECTED, event_types)
        self.assertIn(EventType.AUTH_REQUESTED, event_types)

    def test_approve_workflow(self):
        """FR-05: Approving a device marks it Authenticated and records timestamp."""
        event = CommonDeviceEvent(
            device_name="Logitech Mouse",
            vendor_id="046D",
            product_id="C077",
            manufacturer="Logitech"
        )
        dev = self.trust_mgr.handle_device_connected(event)
        self.assertEqual(dev.status, DeviceStatus.PENDING_AUTHENTICATION)

        # Approve
        approved = self.trust_mgr.approve_device(dev.id)
        self.assertEqual(approved.status, DeviceStatus.AUTHENTICATED)
        self.assertIsNotNone(approved.approved_at)

        # Verify event logged
        events = self.event_mgr.get_history(device_id=dev.id)
        self.assertEqual(events[0].event_type, EventType.APPROVED)

    def test_previously_approved_device_reconnect(self):
        """Section 5.2: Reconnecting an approved device retains Authenticated state without prompt."""
        event = CommonDeviceEvent(
            device_name="Approved Keyboard",
            vendor_id="046D",
            product_id="C31C",
            serial_number="SN-AUTH-100",
            manufacturer="Logitech"
        )
        dev = self.trust_mgr.handle_device_connected(event)
        self.trust_mgr.approve_device(dev.id)

        # Disconnect
        self.trust_mgr.handle_device_disconnected(event)
        dev_disc = self.db.get_device_by_id(dev.id)
        self.assertFalse(dev_disc.is_connected)

        # Reconnect same device
        dev_reconn = self.trust_mgr.handle_device_connected(event)
        self.assertEqual(dev_reconn.id, dev.id)
        self.assertEqual(dev_reconn.status, DeviceStatus.AUTHENTICATED)
        self.assertTrue(dev_reconn.is_connected)

        # Verify last event was 'connected' rather than 'auth_requested'
        events = self.event_mgr.get_history(device_id=dev.id)
        self.assertEqual(events[0].event_type, EventType.CONNECTED)

    def test_rejection_workflow(self):
        """FR-06: Rejecting a device updates status to Rejected and does not trust it."""
        event = CommonDeviceEvent(
            device_name="Untrusted Barcode Scanner",
            vendor_id="05E0",
            product_id="1200",
            manufacturer="Symbol"
        )
        dev = self.trust_mgr.handle_device_connected(event)
        rejected = self.trust_mgr.reject_device(dev.id)

        self.assertEqual(rejected.status, DeviceStatus.REJECTED)
        self.assertIsNone(rejected.approved_at)

        # Ensure it does not appear in trusted registry
        trusted = self.db.list_devices(status=DeviceStatus.AUTHENTICATED)
        self.assertEqual(len(trusted), 0)

    def test_trust_revocation_and_reconnection(self):
        """FR-07: Revoking trust removes approval; reconnecting later requires approval again."""
        event = CommonDeviceEvent(
            device_name="Temporary Mouse",
            vendor_id="1532",
            product_id="0084",
            serial_number="RZ-REVOKE-1",
            manufacturer="Razer"
        )
        dev = self.trust_mgr.handle_device_connected(event)
        self.trust_mgr.approve_device(dev.id)

        # Revoke trust
        revoked = self.trust_mgr.revoke_trust(dev.id)
        self.assertEqual(revoked.status, DeviceStatus.TRUST_REVOKED)

        # Reconnect
        reconnected = self.trust_mgr.handle_device_connected(event)
        self.assertEqual(reconnected.id, dev.id)
        # PRD FR-07 acceptance criteria: "A subsequent connection requires approval again."
        self.assertEqual(reconnected.status, DeviceStatus.PENDING_AUTHENTICATION)

    def test_device_matching_serial_number(self):
        """Section 10: Serial number provides the strongest match."""
        dev1 = self.trust_mgr.handle_device_connected(CommonDeviceEvent(
            device_name="Custom KB",
            vendor_id="048D",
            product_id="C100",
            serial_number="SER-UNIQUE-999"
        ))

        # Another event with same serial
        matched_rec, reason = self.trust_mgr.match_device(CommonDeviceEvent(
            device_name="Renamed KB",
            vendor_id="048D",
            product_id="C100",
            serial_number="SER-UNIQUE-999"
        ))
        self.assertIsNotNone(matched_rec)
        self.assertEqual(matched_rec.id, dev1.id)
        self.assertEqual(reason, "exact_serial_match")

    def test_duplicate_notification_suppression(self):
        """FR-01: Repeated connection events for already pending connection do not create duplicate records."""
        event = CommonDeviceEvent(
            device_name="Duplicate Test Mouse",
            vendor_id="1234",
            product_id="5678",
            serial_number="SN-DUP-1"
        )
        rec1 = self.trust_mgr.handle_device_connected(event)
        rec2 = self.trust_mgr.handle_device_connected(event)

        self.assertEqual(rec1.id, rec2.id)
        all_devs = self.db.list_devices()
        self.assertEqual(len(all_devs), 1)


if __name__ == "__main__":
    unittest.main()
