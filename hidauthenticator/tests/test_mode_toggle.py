"""
Unit tests for Mock vs Real Data Mode toggle and isolation.
"""

import unittest
from fastapi.testclient import TestClient
from api.server import app
from core.database import db
from core.models import DeviceStatus


class TestModeToggle(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_get_and_set_mode(self):
        # Set to mock
        res = self.client.post("/api/system/mode", json={"mode": "mock"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mode"], "mock")

        # Verify get
        res = self.client.get("/api/system/mode")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["mode"], "mock")

        # Switch to real
        res = self.client.post("/api/system/mode", json={"mode": "real"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["mode"], "real")

        # Verify get real
        res = self.client.get("/api/system/mode")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["mode"], "real")

        # Invalid mode
        res = self.client.post("/api/system/mode", json={"mode": "invalid_mode"})
        self.assertEqual(res.status_code, 400)

        # Reset to mock
        self.client.post("/api/system/mode", json={"mode": "mock"})

    def test_mode_device_isolation(self):
        # Switch to mock
        self.client.post("/api/system/mode", json={"mode": "mock"})

        # Insert a mock device and a real device directly
        mock_dev = db.insert_device({
            "device_name": "Test Mock Keyboard",
            "vendor_id": "AAAA",
            "product_id": "1111",
            "interface_type": "Keyboard",
            "source": "mock"
        })

        real_dev = db.insert_device({
            "device_name": "Test Real Mouse",
            "vendor_id": "BBBB",
            "product_id": "2222",
            "interface_type": "Mouse",
            "source": "real"
        })

        # When querying in mock mode, only mock devices should appear
        res_mock = self.client.get("/api/devices")
        self.assertEqual(res_mock.status_code, 200)
        mock_names = [d["device_name"] for d in res_mock.json()]
        self.assertIn("Test Mock Keyboard", mock_names)
        self.assertNotIn("Test Real Mouse", mock_names)

        # Switch to real mode
        self.client.post("/api/system/mode", json={"mode": "real"})
        res_real = self.client.get("/api/devices")
        self.assertEqual(res_real.status_code, 200)
        real_names = [d["device_name"] for d in res_real.json()]
        self.assertIn("Test Real Mouse", real_names)
        self.assertNotIn("Test Mock Keyboard", real_names)

        # Reset to mock
        self.client.post("/api/system/mode", json={"mode": "mock"})


if __name__ == "__main__":
    unittest.main()
