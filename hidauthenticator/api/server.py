"""
FastAPI Server for HID Authenticator (SYMPACT MVP).
Integrates device detection adapters, database persistence, REST endpoints, and WebSockets.
"""

import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from core.config import BASE_DIR, DISCLAIMER_TEXT
from core.database import db
from core.trust_manager import trust_mgr
from api.routes_devices import router as devices_router
from api.routes_events import router as events_router
from api.routes_simulator import router as simulator_router
from api.websocket import manager as ws_manager

from core.models import SystemModePayload, SystemModeResponse, EnforcementStatus
from core.enforcement import enforcement_mgr
from pydantic import BaseModel
from fastapi import HTTPException

# Platform adapter reference
active_adapter = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global active_adapter

    # Initialize Database
    db.init_db()

    # Determine and initialize platform adapter
    if sys.platform == "win32":
        import ctypes
        is_admin = False
        try:
            is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0
        except Exception:
            pass

        if not is_admin:
            print("\n" + "!" * 80)
            print("WARNING: HID Authenticator is NOT running as Administrator.")
            print("OS-level physical hardware blocking (disabling USB devices) will fail.")
            print("To enable full hardware blocking, please restart this terminal as Administrator.")
            print("!" * 80 + "\n")

        from adapters.windows_adapter import WindowsDeviceAdapter
        active_adapter = WindowsDeviceAdapter()
        
        # Wire up OS-level enforcement callbacks if adapter supports it
        if hasattr(active_adapter, "disable_device") and hasattr(active_adapter, "enable_device"):
            trust_mgr.set_hardware_control_callbacks(
                active_adapter.disable_device,
                active_adapter.enable_device
            )
            
    elif sys.platform.startswith("linux"):
        from adapters.linux_adapter import LinuxDeviceAdapter
        active_adapter = LinuxDeviceAdapter()
    elif sys.platform == "darwin":
        from adapters.macos_adapter import MacOSDeviceAdapter
        active_adapter = MacOSDeviceAdapter()

    if active_adapter:
        def on_connected(event):
            event.source = "real"
            # Always process real hardware connections regardless of mode.
            # When a physical USB device is plugged in, the user should
            # always see the auth prompt (the whole point of the app).
            trust_mgr.handle_device_connected(event)

        def on_disconnected(hw_id):
            trust_mgr.handle_device_disconnected(hw_id)

        try:
            active_adapter.start_monitoring(on_connected, on_disconnected)
            if db.get_system_mode("mock") == "real" and hasattr(active_adapter, "scan_now"):
                active_adapter.scan_now()
        except Exception as e:
            print(f"Warning: Could not start hardware adapter: {e}")

    yield

    # Shutdown
    if active_adapter and active_adapter.is_running:
        active_adapter.stop_monitoring()


app = FastAPI(
    title="HID Authenticator",
    description="Peripheral Trust-Management Application (SYMPACT MVP)",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local desktop usage
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(devices_router)
app.include_router(events_router)
app.include_router(simulator_router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Real-time event stream for the dashboard."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; clients can send ping
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


@app.get("/api/system/mode", response_model=SystemModeResponse)
def get_system_mode():
    """Retrieve active operating mode ('mock' or 'real')."""
    mode = db.get_system_mode("mock")
    return SystemModeResponse(
        mode=mode,
        success=True,
        message=f"Current system mode is '{mode}'"
    )


@app.post("/api/system/mode", response_model=SystemModeResponse)
async def set_system_mode(payload: SystemModePayload):
    """Switch system mode between 'mock' (simulation) and 'real' (live hardware)."""
    new_mode = payload.mode.lower().strip()
    if new_mode not in ("mock", "real"):
        raise HTTPException(status_code=400, detail="Mode must be 'mock' or 'real'")

    db.set_system_mode(new_mode)

    if new_mode == "real":
        # Immediately query Windows WMI for physical keyboard, mouse, etc.
        if active_adapter and hasattr(active_adapter, "scan_now"):
            try:
                active_adapter.scan_now()
            except Exception as e:
                print(f"Hardware scan error: {e}")

    enforcement_mgr.sync_and_broadcast(new_mode)

    await ws_manager.broadcast({
        "type": "system_mode_changed",
        "mode": new_mode
    })

    return SystemModeResponse(
        mode=new_mode,
        success=True,
        message=f"System mode switched to '{new_mode}'."
    )


@app.get("/api/system/enforcement", response_model=EnforcementStatus)
def get_enforcement_status():
    """Get current workstation input gating and lockout status."""
    return enforcement_mgr.get_status()


class TestInputPayload(BaseModel):
    input_type: str = "keystroke"
    detail: Optional[str] = None


@app.post("/api/system/enforcement/test-input")
def test_input_action(payload: TestInputPayload):
    """Simulate or verify keystroke/pointer interaction against active gating."""
    status = enforcement_mgr.get_status()
    req_type = "Keyboard" if payload.input_type == "keystroke" else "Mouse"
    is_gated = status.is_locked and (req_type in status.gated_interfaces or not status.gated_interfaces)
    return {
        "allowed": not is_gated,
        "is_gated": is_gated,
        "input_type": payload.input_type,
        "pending_count": status.pending_count,
        "gated_interfaces": status.gated_interfaces,
        "mode": status.mode
    }


@app.get("/api/system/status")
def get_system_status():
    """Retrieve runtime status of the system, active mode, and input gating."""
    adapter_name = active_adapter.name if active_adapter else "Simulator Only"
    adapter_available = getattr(active_adapter, "detection_available", True) if active_adapter else True
    error_msg = getattr(active_adapter, "error_message", None) if active_adapter else None
    mode = db.get_system_mode("mock")
    enforce = enforcement_mgr.get_status()

    return {
        "platform": sys.platform,
        "adapter_name": adapter_name,
        "detection_available": adapter_available,
        "error_message": error_msg,
        "mode": mode,
        "is_locked": enforce.is_locked,
        "pending_count": enforce.pending_count,
        "gated_interfaces": enforce.gated_interfaces,
        "disclaimer": DISCLAIMER_TEXT,
        "version": "1.0.0"
    }



# Mount static assets
static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
def serve_index():
    """Serve desktop dashboard."""
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "HID Authenticator API is running. Dashboard HTML not yet loaded."}
