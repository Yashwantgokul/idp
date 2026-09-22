"""
Linux Device Adapter Skeleton for HID Authenticator (HIDShield-X MVP).
Prepares for Phase 4 cross-platform support via udev / sysfs interfaces.
"""

from typing import List, Callable
from adapters.base import BaseDeviceAdapter
from core.models import CommonDeviceEvent


class LinuxDeviceAdapter(BaseDeviceAdapter):
    def __init__(self):
        super().__init__("Linux udev Adapter")
        self.detection_available = False
        self.error_message = "Linux adapter ready for pyudev integration on Linux hosts."

    def start_monitoring(
        self,
        on_connected: Callable[[CommonDeviceEvent], None],
        on_disconnected: Callable[[str], None]
    ):
        super().start_monitoring(on_connected, on_disconnected)

    def stop_monitoring(self):
        super().stop_monitoring()

    def get_connected_devices(self) -> List[CommonDeviceEvent]:
        return []
