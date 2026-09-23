# HIDShield-X — Route & API Architecture

## Overview
HIDShield-X serves a single-page reactive dashboard via FastAPI with real-time bidirectional WebSocket events for USB attach/detach events.

### Frontend Route
- **URL Path:** `/`
- **Handler:** `hidauthenticator/api/server.py` (`index()` -> `static/index.html`)
- **Type:** Single-Page Application (SPA) with tabbed navigation:
  - `#tab-trusted` (Authorized Peripherals)
  - `#tab-all-devices` (Discovered Inventory)
  - `#tab-history` (Audit Log)
  - `#tab-simulator` (Port Simulator Studio)

### REST API Endpoints
- `GET /api/devices`: List all discovered devices (filters: `status`, `connected`)
- `GET /api/devices/{device_id}`: Retrieve single device record
- `POST /api/devices/{device_id}/approve`: Grant trust and register peripheral (FR-05)
- `POST /api/devices/{device_id}/reject`: Decline authorization (FR-06)
- `POST /api/devices/{device_id}/revoke`: Withdraw trust from registered device (FR-07)
- `GET /api/events`: Retrieve chronological audit log (filters: `device_id`, `event_type`, `limit`, `offset`)
- `GET /api/stats`: Retrieve live counts for KPI metrics rail
- `GET /api/system/status`: Host platform info, detector backend, engine version
- `POST /api/simulator/connect`: Inject virtual USB connection
- `POST /api/simulator/disconnect`: Inject virtual USB disconnection
- `GET /api/simulator/active`: List simulated endpoints

### WebSocket Endpoint
- `WS /ws/devices`: Broadcasts `device_connected`, `device_disconnected`, `device_status_changed`, `device_revoked`, and `stats_updated` events in real time.
