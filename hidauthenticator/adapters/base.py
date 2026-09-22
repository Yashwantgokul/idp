"""
Base Device Adapter Interface (PRD Section 8.1 & 8.3).
Provides a common abstraction for OS-specific device detection mechanisms.
"""

from abc import ABC, abstractmethod
from typing import Callable, List, Optional
from core.models import CommonDeviceEvent


class BaseDeviceAdapter(ABC):
    """
    Abstract adapter for monitoring physical or virtual peripheral connections.
    """

    def __init__(self, name: str):
        self.name = name
        self._is_running = False
        self._on_device_connected: Optional[Callable[[CommonDeviceEvent], None]] = None
        self._on_device_disconnected: Optional[Callable[[str], None]] = None

    @abstractmethod
    def start_monitoring(
        self,
        on_connected: Callable[[CommonDeviceEvent], None],
        on_disconnected: Callable[[str], None]
    ):
        """
        Begin monitoring system peripheral events.
        """
        self._on_device_connected = on_connected
        self._on_device_disconnected = on_disconnected
        self._is_running = True

    @abstractmethod
    def stop_monitoring(self):
        """
        Stop monitoring and release system hooks.
        """
        self._is_running = False

    @abstractmethod
    def get_connected_devices(self) -> List[CommonDeviceEvent]:
        """
        Return an immediate snapshot of all currently attached supported devices.
        """
        pass

    @property
    def is_running(self) -> bool:
        return self._is_running
