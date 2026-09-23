"""
Windows Device Adapter for HID Authenticator (HIDShield-X MVP).
Monitors USB Human Interface Devices (keyboards, mice, HID peripherals)
using Windows WMI / PnP Entity subsystem.
Complies with PRD FR-01, FR-02, and Section 8.
"""

import re
import threading
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Callable

from adapters.base import BaseDeviceAdapter
from core.models import CommonDeviceEvent
from core.config import POLL_INTERVAL_SECONDS

# Regex patterns for USB, HID, and Bluetooth DeviceIDs (supporting VID_ and VID& formats)
VID_REGEX = re.compile(r"VID[_&](?:0002)?([0-9A-Fa-f]{4})", re.IGNORECASE)
PID_REGEX = re.compile(r"PID[_&]([0-9A-Fa-f]{4})", re.IGNORECASE)


def parse_device_id(device_id: str):
    """Extract VID, PID, and serial or instance information from DeviceID."""
    vid = None
    pid = None
    serial = None

    if not device_id:
        return vid, pid, serial

    vid_match = VID_REGEX.search(device_id)
    if vid_match:
        vid = vid_match.group(1).upper()

    pid_match = PID_REGEX.search(device_id)
    if pid_match:
        pid = pid_match.group(1).upper()

    # The 3rd segment of DeviceID often contains serial or instance ID
    # e.g., USB\VID_048D&PID_C100\5&1F456139&0&9
    parts = device_id.split("\\")
    if len(parts) >= 3:
        potential_serial = parts[2]
        # On Windows, if it contains '&', it is usually a generated instance ID
        # If it doesn't contain '&', it is often a hardware exposed serial number
        if "&" not in potential_serial and len(potential_serial) >= 4:
            serial = potential_serial

    return vid, pid, serial


class WindowsDeviceAdapter(BaseDeviceAdapter):
    """
    Adapter implementing USB HID peripheral monitoring on Microsoft Windows.
    """

    def __init__(self, poll_interval: float = POLL_INTERVAL_SECONDS):
        super().__init__("Windows WMI HID Adapter")
        self.poll_interval = poll_interval
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._known_devices: Dict[str, CommonDeviceEvent] = {}
        self.detection_available = True
        self.error_message: Optional[str] = None

    def _query_wmi_devices(self) -> Dict[str, CommonDeviceEvent]:
        """Query WMI for currently connected HID, Keyboard, and Mouse devices."""
        import pythoncom
        import win32com.client

        pythoncom.CoInitialize()
        current_map: Dict[str, CommonDeviceEvent] = {}

        try:
            wmi = win32com.client.GetObject("winmgmts:")
            # Query for HIDClass, Keyboard, and Mouse
            pnp_devices = wmi.ExecQuery(
                "SELECT DeviceID, Name, Manufacturer, Description, PNPClass, Status "
                "FROM Win32_PnPEntity "
                "WHERE (PNPClass = 'HIDClass' OR PNPClass = 'Keyboard' OR PNPClass = 'Mouse') "
                "AND Status = 'OK'"
            )

            for dev in pnp_devices:
                device_id = str(dev.DeviceID or "")
                if not device_id:
                    continue

                # Filter out root buses or virtual system aggregates
                # Focus on USB, HID, or Bluetooth bus devices
                dev_id_upper = device_id.upper()
                is_supported_bus = any(bus in dev_id_upper for bus in ["USB", "HID", "BTH", "BLUETOOTH"])
                if not is_supported_bus:
                    continue

                vid, pid, serial = parse_device_id(device_id)

                # Determine interface category
                pnp_class = str(dev.PNPClass or "HID")
                if "KEYBOARD" in pnp_class.upper():
                    interface_type = "Keyboard"
                elif "MOUSE" in pnp_class.upper() or "POINTING" in pnp_class.upper():
                    interface_type = "Mouse"
                else:
                    interface_type = "HID"

                name = str(dev.Name or dev.Description or "USB HID Peripheral")
                mfg = str(dev.Manufacturer or "")
                if mfg in ("(Standard system devices)", "(Standard keyboards)", "(Standard mice)"):
                    mfg = "Standard Device"

                # Detect connection topology (Direct USB, 2.4GHz Wireless USB Receiver, or Bluetooth)
                name_upper = name.upper()
                if "BTH" in dev_id_upper or "BLUETOOTH" in dev_id_upper:
                    connection_type = "Bluetooth"
                elif any(w in name_upper for w in ["RECEIVER", "DONGLE", "WIRELESS", "UNIFYING", "BOLT", "NANO"]):
                    connection_type = "USB Receiver"
                else:
                    connection_type = "USB"

                event = CommonDeviceEvent(
                    device_name=name,
                    vendor_id=vid,
                    product_id=pid,
                    serial_number=serial,
                    manufacturer=mfg if mfg else None,
                    product_string=str(dev.Description or name),
                    interface_type=interface_type,
                    connection_type=connection_type,
                    detected_at=datetime.now(timezone.utc),
                    hardware_id=device_id
                )
                current_map[device_id] = event

        except Exception as e:
            self.detection_available = False
            self.error_message = str(e)
        finally:
            pythoncom.CoUninitialize()

        return current_map

    def get_connected_devices(self) -> List[CommonDeviceEvent]:
        try:
            current_map = self._query_wmi_devices()
            return list(current_map.values())
        except Exception:
            return list(self._known_devices.values())

    def _worker(self):
        """Background poller to detect device arrivals and removals."""
        # Initial snapshot
        self._known_devices = self._query_wmi_devices()

        # Emit initial connected events
        if self._on_device_connected:
            for dev_event in self._known_devices.values():
                try:
                    self._on_device_connected(dev_event)
                except Exception:
                    pass

        while not self._stop_event.is_set():
            time.sleep(self.poll_interval)
            if self._stop_event.is_set():
                break

            current_snapshot = self._query_wmi_devices()

            # Detect additions (new devices connected)
            for hw_id, dev_event in current_snapshot.items():
                if hw_id not in self._known_devices:
                    self._known_devices[hw_id] = dev_event
                    if self._on_device_connected:
                        try:
                            self._on_device_connected(dev_event)
                        except Exception:
                            pass

            # Detect removals (devices disconnected)
            removed_ids = [hw_id for hw_id in self._known_devices if hw_id not in current_snapshot]
            for hw_id in removed_ids:
                del self._known_devices[hw_id]
                if self._on_device_disconnected:
                    try:
                        self._on_device_disconnected(hw_id)
                    except Exception:
                        pass

    def start_monitoring(
        self,
        on_connected: Callable[[CommonDeviceEvent], None],
        on_disconnected: Callable[[str], None]
    ):
        super().start_monitoring(on_connected, on_disconnected)
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._worker, daemon=True, name="WindowsDeviceWatcher")
        self._thread.start()

    def stop_monitoring(self):
        super().stop_monitoring()
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
