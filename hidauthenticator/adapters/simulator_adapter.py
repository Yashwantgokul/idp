"""
Simulator Device Adapter for HID Authenticator (HIDShield-X MVP).
Enables interactive simulation of USB peripheral attachment/removal
for automated tests, demonstrations, and edge-case validation.
"""

from datetime import datetime, timezone
import uuid
from typing import Dict, List, Optional, Callable

from adapters.base import BaseDeviceAdapter
from core.models import CommonDeviceEvent


DEFAULT_PRESETS = [
    {
        "id": "preset_logitech_keyboard",
        "device_name": "Logitech G Pro Gaming Keyboard",
        "vendor_id": "046D",
        "product_id": "C33C",
        "serial_number": "LOGI-KB-882190",
        "manufacturer": "Logitech",
        "product_string": "G Pro Mechanical Gaming Keyboard",
        "interface_type": "Keyboard",
        "connection_type": "USB"
    },
    {
        "id": "preset_razer_mouse",
        "device_name": "Razer DeathAdder Essential Mouse",
        "vendor_id": "1532",
        "product_id": "0084",
        "serial_number": "RZ-M-552109",
        "manufacturer": "Razer Inc.",
        "product_string": "Razer DeathAdder Essential",
        "interface_type": "Mouse",
        "connection_type": "USB"
    },
    {
        "id": "preset_lenovo_dongle",
        "device_name": "Lenovo 2.4GHz Wireless USB Receiver",
        "vendor_id": "17EF",
        "product_id": "608D",
        "serial_number": None,
        "manufacturer": "Lenovo",
        "product_string": "Lenovo Wireless Peripherals Dongle",
        "interface_type": "HID",
        "connection_type": "USB Receiver"
    },
    {
        "id": "preset_barcode_scanner",
        "device_name": "Symbol Handheld Barcode Scanner",
        "vendor_id": "05E0",
        "product_id": "1200",
        "serial_number": "BC-SN-99014",
        "manufacturer": "Symbol Technologies",
        "product_string": "Symbol Barcode Decoder",
        "interface_type": "HID",
        "connection_type": "USB"
    }
]


class SimulatorDeviceAdapter(BaseDeviceAdapter):
    """
    In-memory device simulator that implements the BaseDeviceAdapter contract.
    """

    def __init__(self):
        super().__init__("Simulator Device Adapter")
        self._connected_simulations: Dict[str, CommonDeviceEvent] = {}

    def start_monitoring(
        self,
        on_connected: Callable[[CommonDeviceEvent], None],
        on_disconnected: Callable[[str], None]
    ):
        super().start_monitoring(on_connected, on_disconnected)

    def stop_monitoring(self):
        super().stop_monitoring()
        self._connected_simulations.clear()

    def get_connected_devices(self) -> List[CommonDeviceEvent]:
        return list(self._connected_simulations.values())

    def get_presets(self) -> List[Dict]:
        return DEFAULT_PRESETS

    def simulate_connect(
        self,
        device_name: str,
        vendor_id: Optional[str] = None,
        product_id: Optional[str] = None,
        serial_number: Optional[str] = None,
        manufacturer: Optional[str] = None,
        product_string: Optional[str] = None,
        interface_type: str = "HID",
        connection_type: str = "USB",
        custom_hardware_id: Optional[str] = None
    ) -> CommonDeviceEvent:
        """
        Simulate plugging in a device.
        """
        hw_id = custom_hardware_id or f"SIMULATOR\\VID_{vendor_id or '0000'}&PID_{product_id or '0000'}\\{serial_number or uuid.uuid4().hex[:8]}"
        event = CommonDeviceEvent(
            device_name=device_name,
            vendor_id=vendor_id,
            product_id=product_id,
            serial_number=serial_number,
            manufacturer=manufacturer,
            product_string=product_string,
            interface_type=interface_type,
            connection_type=connection_type,
            detected_at=datetime.now(timezone.utc),
            hardware_id=hw_id
        )

        self._connected_simulations[hw_id] = event

        if self._on_device_connected:
            self._on_device_connected(event)

        return event

    def simulate_disconnect(self, hardware_id: str) -> bool:
        """
        Simulate unplugging a device.
        """
        if hardware_id in self._connected_simulations:
            del self._connected_simulations[hardware_id]
            if self._on_device_disconnected:
                self._on_device_disconnected(hardware_id)
            return True
        return False
