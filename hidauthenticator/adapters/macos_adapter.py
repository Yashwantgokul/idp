"""
macOS Device Adapter Skeleton for HID Authenticator (SYMPACT MVP).
Prepares for Phase 4 cross-platform support via IOKit / system_profiler.
"""

from typing import List, Callable
from adapters.base import BaseDeviceAdapter
from core.models import CommonDeviceEvent


class MacOSDeviceAdapter(BaseDeviceAdapter):
    def __init__(self):
        super().__init__("macOS IOKit Adapter")
        self.detection_available = False
        self.error_message = "macOS adapter ready for IOKit / system_profiler integration on macOS hosts."

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
