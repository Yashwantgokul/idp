"""
API endpoint tests for HID Authenticator (SYMPACT MVP).
"""

import unittest
import tempfile
from pathlib import Path

from core.database import db
# Redirect database to temporary file before importing server
temp_dir_obj = tempfile.TemporaryDirectory()
db.db_file = Path(temp_dir_obj.name) / "test_api.db"
db.init_db()

from fastapi.testclient import TestClient
from api.server import app
from core.models import DeviceStatus


class TestAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        # Clean test state if needed
        db.init_db()
        db.set_system_mode("mock")

    def test_system_status(self):
        """Verify system status endpoint reports platform and disclaimer."""
        res = self.client.get("/api/system/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("platform", data)
        self.assertIn("adapter_name", data)
        self.assertIn("disclaimer", data)

    def test_stats_endpoint(self):
        """Verify KPI stats endpoint."""
        res = self.client.get("/api/devices/stats")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("connected_devices_count", data)
        self.assertIn("trusted_devices_count", data)
        self.assertIn("pending_devices_count", data)
        self.assertIn("total_events_count", data)

    def test_simulator_and_approval_flow(self):
        """Test simulated device connection -> pending -> approve -> revoke flow."""
        # 1. Simulate connect
        connect_payload = {
            "device_name": "API Test Keyboard",
            "vendor_id": "AAAA",
            "product_id": "1111",
            "serial_number": "SN-API-TEST-1",
            "manufacturer": "API Mfg",
            "interface_type": "Keyboard",
            "connection_type": "USB"
        }
        res = self.client.post("/api/simulator/connect", json=connect_payload)
        self.assertEqual(res.status_code, 200)
        hw_id = res.json()["event"]["hardware_id"]

        # 2. Verify device appears in pending
        res_pending = self.client.get("/api/devices?status=pending_authentication")
        self.assertEqual(res_pending.status_code, 200)
        pending_list = res_pending.json()
        target = next((d for d in pending_list if d["serial_number"] == "SN-API-TEST-1"), None)
        self.assertIsNotNone(target)
        device_id = target["id"]

        # 3. Approve device
        res_approve = self.client.post(f"/api/devices/{device_id}/approve")
        self.assertEqual(res_approve.status_code, 200)
        self.assertEqual(res_approve.json()["device"]["status"], DeviceStatus.AUTHENTICATED.value)

        # 4. Verify in trusted list
        res_trusted = self.client.get("/api/devices?status=authenticated")
        self.assertTrue(any(d["id"] == device_id for d in res_trusted.json()))

        # 5. Revoke trust
        res_revoke = self.client.post(f"/api/devices/{device_id}/revoke")
        self.assertEqual(res_revoke.status_code, 200)
        self.assertEqual(res_revoke.json()["device"]["status"], DeviceStatus.TRUST_REVOKED.value)

        # 6. Simulator disconnect
        res_disc = self.client.post("/api/simulator/disconnect", json={"hardware_id": hw_id})
        self.assertEqual(res_disc.status_code, 200)

    def test_events_history(self):
        """Verify events audit trail query."""
        res = self.client.get("/api/events?limit=10")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)


if __name__ == "__main__":
    unittest.main()
