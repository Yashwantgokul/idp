"""
Unit tests for Input Enforcement Gating and Lockout.
"""

import unittest
from fastapi.testclient import TestClient
from api.server import app
from core.database import db
from core.enforcement import enforcement_mgr
from core.trust_manager import trust_mgr
from core.models import CommonDeviceEvent, DeviceStatus


class TestEnforcement(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.client.post("/api/system/mode", json={"mode": "mock"})
        with db.get_connection() as conn:
            conn.execute("DELETE FROM authentication_events WHERE device_id IN (SELECT id FROM devices WHERE device_name LIKE 'Enforcement Test%')")
            conn.execute("DELETE FROM devices WHERE device_name LIKE 'Enforcement Test%'")

    def test_enforcement_locking_and_unlocking(self):
        # Initial status should be checked
        initial_status = self.client.get("/api/system/enforcement").json()

        import uuid
        test_uid = uuid.uuid4().hex[:6]
        # Connect a mock device that requires approval
        evt = CommonDeviceEvent(
            device_name="Enforcement Test Keyboard",
            vendor_id=f"9{test_uid[:3]}",
            product_id=f"8{test_uid[3:]}",
            interface_type="Keyboard",
            source="mock",
            hardware_id=f"SIMULATOR\\VID_9999&PID_8888\\TEST_{test_uid}"
        )
        rec = trust_mgr.handle_device_connected(evt)

        # Enforcement should now be locked with Keyboard gated
        status = enforcement_mgr.get_status()
        self.assertTrue(status.is_locked)
        self.assertIn("Keyboard", status.gated_interfaces)

        # Test input test endpoint
        res = self.client.post("/api/system/enforcement/test-input", json={"input_type": "keystroke"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["is_gated"])
        self.assertFalse(res.json()["allowed"])

        # Approve the device
        trust_mgr.approve_device(rec.id)

        # Verify enforcement is unlocked (if no other pending devices exist for mock mode)
        status_after = enforcement_mgr.get_status()
        mock_pending = db.list_devices(status=DeviceStatus.PENDING_AUTHENTICATION, source="mock")
        if not mock_pending:
            self.assertFalse(status_after.is_locked)

            # Test input endpoint should now allow keystrokes
            res_after = self.client.post("/api/system/enforcement/test-input", json={"input_type": "keystroke"})
            self.assertEqual(res_after.status_code, 200)
            self.assertFalse(res_after.json()["is_gated"])
            self.assertTrue(res_after.json()["allowed"])


if __name__ == "__main__":
    unittest.main()
