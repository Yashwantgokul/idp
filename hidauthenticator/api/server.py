"""
FastAPI Server for HID Authenticator (HIDShield-X MVP).
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

# Platform adapter reference
active_adapter = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global active_adapter

    # Initialize Database
    db.init_db()

    # Determine and initialize platform adapter
    if sys.platform == "win32":
        from adapters.windows_adapter import WindowsDeviceAdapter
        active_adapter = WindowsDeviceAdapter()
    elif sys.platform.startswith("linux"):
        from adapters.linux_adapter import LinuxDeviceAdapter
        active_adapter = LinuxDeviceAdapter()
    elif sys.platform == "darwin":
        from adapters.macos_adapter import MacOSDeviceAdapter
        active_adapter = MacOSDeviceAdapter()

    if active_adapter:
        def on_connected(event):
            trust_mgr.handle_device_connected(event)

        def on_disconnected(hw_id):
            trust_mgr.handle_device_disconnected(hw_id)

        try:
            active_adapter.start_monitoring(on_connected, on_disconnected)
        except Exception as e:
            print(f"Warning: Could not start hardware adapter: {e}")

    yield

    # Shutdown
    if active_adapter and active_adapter.is_running:
        active_adapter.stop_monitoring()


app = FastAPI(
    title="HID Authenticator",
    description="Peripheral Trust-Management Application (HIDShield-X MVP)",
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


@app.get("/api/system/status")
def get_system_status():
    """Retrieve runtime status of the system and device detection."""
    adapter_name = active_adapter.name if active_adapter else "Simulator Only"
    adapter_available = getattr(active_adapter, "detection_available", True) if active_adapter else True
    error_msg = getattr(active_adapter, "error_message", None) if active_adapter else None

    return {
        "platform": sys.platform,
        "adapter_name": adapter_name,
        "detection_available": adapter_available,
        "error_message": error_msg,
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
