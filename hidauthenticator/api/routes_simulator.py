"""
Simulator API Routes for HID Authenticator (HIDShield-X MVP).
Enables testing approval, rejection, and disconnect edge cases without physical hardware.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel

from adapters.simulator_adapter import SimulatorDeviceAdapter
from core.trust_manager import trust_mgr

router = APIRouter(prefix="/api/simulator", tags=["Simulator"])

# Global simulator adapter instance
simulator = SimulatorDeviceAdapter()


class SimulateConnectPayload(BaseModel):
    device_name: str
    vendor_id: Optional[str] = None
    product_id: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    product_string: Optional[str] = None
    interface_type: str = "HID"
    connection_type: str = "USB"
    custom_hardware_id: Optional[str] = None


class SimulateDisconnectPayload(BaseModel):
    hardware_id: str


from core.database import db

# Wire up simulator events to trust manager
def _on_sim_connected(evt):
    evt.source = "mock"
    mode = db.get_system_mode("mock")
    if mode == "mock":
        trust_mgr.handle_device_connected(evt)

def _on_sim_disconnected(hw_id):
    mode = db.get_system_mode("mock")
    if mode == "mock":
        trust_mgr.handle_device_disconnected(hw_id)

simulator.start_monitoring(_on_sim_connected, _on_sim_disconnected)


@router.get("/presets", response_model=List[Dict[str, Any]])
def get_presets():
    """Retrieve sample peripheral presets for fast testing."""
    return simulator.get_presets()


@router.get("/active")
def get_active_simulations():
    """Retrieve currently connected simulated devices."""
    return [d.model_dump(mode="json") for d in simulator.get_connected_devices()]


@router.post("/connect")
def simulate_connect(payload: SimulateConnectPayload):
    """Simulate peripheral connection."""
    event = simulator.simulate_connect(
        device_name=payload.device_name,
        vendor_id=payload.vendor_id,
        product_id=payload.product_id,
        serial_number=payload.serial_number,
        manufacturer=payload.manufacturer,
        product_string=payload.product_string,
        interface_type=payload.interface_type,
        connection_type=payload.connection_type,
        custom_hardware_id=payload.custom_hardware_id
    )
    return {
        "success": True,
        "message": f"Simulated connection of '{payload.device_name}'",
        "event": event.model_dump(mode="json")
    }


@router.post("/disconnect")
def simulate_disconnect(payload: SimulateDisconnectPayload):
    """Simulate peripheral disconnection."""
    ok = simulator.simulate_disconnect(payload.hardware_id)
    return {
        "success": ok,
        "message": f"Simulated disconnection for '{payload.hardware_id}'" if ok else "Device not found in active simulations"
    }


@router.post("/clear")
def clear_all_simulations():
    """Disconnect and clear all simulated endpoints."""
    simulator.clear_all()
    return {"success": True, "message": "All virtual endpoints disconnected."}

