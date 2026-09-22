"""
Unit tests for Database layer in HID Authenticator.
"""

import unittest
import tempfile
from pathlib import Path
from datetime import datetime, timezone

from core.database import Database
from core.models import DeviceStatus, EventType


class TestDatabase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_hid.db"
        self.db = Database(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_init_and_tables(self):
        """Verify tables are created properly."""
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row["name"] for row in cursor.fetchall()]
            self.assertIn("devices", tables)
            self.assertIn("authentication_events", tables)
            self.assertIn("application_settings", tables)

    def test_insert_and_get_device(self):
        """Verify inserting and retrieving a device record."""
        now = datetime.now(timezone.utc)
        dev = self.db.insert_device({
            "device_name": "Test Mechanical Keyboard",
            "vendor_id": "046D",
            "product_id": "C31C",
            "serial_number": "SN12345",
            "manufacturer": "Logitech",
            "status": DeviceStatus.PENDING_AUTHENTICATION.value,
            "first_detected_at": now,
            "last_connected_at": now,
            "is_connected": True
        })
        self.assertIsNotNone(dev)
        self.assertEqual(dev.device_name, "Test Mechanical Keyboard")
        self.assertEqual(dev.vendor_id, "046D")
        self.assertEqual(dev.status, DeviceStatus.PENDING_AUTHENTICATION)
        self.assertTrue(dev.is_connected)

        fetched = self.db.get_device_by_id(dev.id)
        self.assertEqual(fetched.id, dev.id)
        self.assertEqual(fetched.serial_number, "SN12345")

    def test_update_status_and_connection(self):
        """Verify updating device status and connection state."""
        dev = self.db.insert_device({
            "device_name": "Test Mouse",
            "vendor_id": "1532",
            "product_id": "0084",
            "status": DeviceStatus.PENDING_AUTHENTICATION.value
        })

        now = datetime.now(timezone.utc)
        updated = self.db.update_device_status(dev.id, DeviceStatus.AUTHENTICATED, approved_at=now)
        self.assertEqual(updated.status, DeviceStatus.AUTHENTICATED)
        self.assertIsNotNone(updated.approved_at)

        # Update connection
        disconnected = self.db.update_device_connection(dev.id, is_connected=False)
        self.assertFalse(disconnected.is_connected)

    def test_list_devices_filtering(self):
        """Verify listing devices with status and connection filters."""
        self.db.insert_device({"device_name": "Dev 1", "status": DeviceStatus.AUTHENTICATED.value, "is_connected": True})
        self.db.insert_device({"device_name": "Dev 2", "status": DeviceStatus.PENDING_AUTHENTICATION.value, "is_connected": True})
        self.db.insert_device({"device_name": "Dev 3", "status": DeviceStatus.REJECTED.value, "is_connected": False})

        trusted = self.db.list_devices(status=DeviceStatus.AUTHENTICATED)
        self.assertEqual(len(trusted), 1)
        self.assertEqual(trusted[0].device_name, "Dev 1")

        connected = self.db.list_devices(is_connected=True)
        self.assertEqual(len(connected), 2)

    def test_event_logging(self):
        """Verify event insertion, correlation, and history queries."""
        dev = self.db.insert_device({"device_name": "Target Keyboard"})
        event = self.db.insert_event(
            event_type=EventType.DETECTED,
            device_id=dev.id,
            details={"source": "usb_bus"}
        )

        self.assertIsNotNone(event.id)
        self.assertEqual(event.event_type, EventType.DETECTED)
        self.assertEqual(event.details.get("source"), "usb_bus")

        history = self.db.list_events(device_id=dev.id)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0].device_name, "Target Keyboard")

    def test_settings(self):
        """Verify setting storage and retrieval."""
        self.assertIsNone(self.db.get_setting("test_key"))
        self.db.set_setting("test_key", "test_val")
        self.assertEqual(self.db.get_setting("test_key"), "test_val")


if __name__ == "__main__":
    unittest.main()
