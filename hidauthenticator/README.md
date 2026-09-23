# HID Authenticator (SYMPACT MVP v1.0)

**Peripheral Trust-Management Application** for USB Human Interface Devices (HIDs), such as keyboards, mice, and other peripherals.

---

## 1. Product Overview

When a USB keyboard, mouse, or other HID device is plugged into a workstation, the operating system routinely begins accepting input immediately without verifying whether the user recognizes or trusts that physical peripheral.

**HID Authenticator** provides a visible peripheral trust-management workflow:
1. Detects connected USB Human Interface Devices (keyboards, mice, and composite HID devices).
2. Identifies devices using available USB and HID metadata (VID, PID, Serial, Manufacturer, Product String, Interface).
3. Compares the device against a local persistent trusted-device registry.
4. Requests explicit user approval for unregistered devices (**Approve** or **Reject**).
5. Maintains a persistent SQLite registry of approved devices and an immutable audit history of all authentication events and decisions.
6. Allows users to view and revoke previously granted trust.

---

## 2. Architecture & Design

```text
                     HID Authenticator
                            |
             +--------------+--------------+
             |                             |
       User Interface                Core Application
             |                             |
      Web Dashboard /              +-------+-------+
       Live Prompts                |               |
             |               Trust Manager   Event Manager
       (HTML/CSS/JS)               |               |
                                   +-------+-------+
                                           |
                                    SQLite Database
                                           |
                                  Platform Adapter API
                                           |
                        +------------------+------------------+
                        |                  |                  |
                    Windows             Linux              macOS
                 Device Adapter      Device Adapter      Device Adapter
```

### Components:
- **Core Engine (`core/`)**:
  - `database.py`: Thread-safe SQLite persistence for devices, authentication events, and system settings.
  - `trust_manager.py`: Implements matching rules, approval, rejection, and revocation workflows.
  - `event_manager.py`: Audit logger and real-time WebSocket event broadcaster.
  - `models.py`: Strongly-typed Pydantic schemas adhering to PRD requirements.
- **Platform Adapters (`adapters/`)**:
  - `base.py`: Common `BaseDeviceAdapter` contract.
  - `windows_adapter.py`: Windows PnP/WMI device adapter detecting physical USB keyboards, mice, and HID devices without requiring elevated admin permissions.
  - `simulator_adapter.py`: In-memory device simulator with presets and custom peripheral builder for testing all approval/rejection/disconnect edge cases.
  - `linux_adapter.py` & `macos_adapter.py`: Cross-platform skeleton adapters for Linux udev and macOS IOKit.
- **API & Live WebSockets (`api/`)**:
  - FastAPI REST backend serving endpoints for devices, stats, events, and simulator triggers.
  - `/ws` WebSocket endpoint delivering live event broadcasts to the dashboard in real-time.
- **Frontend Dashboard (`static/`)**:
  - Clean, modern cybersecurity dark-mode UI.
  - Overview KPI cards, pending approval queue, trusted registry, all devices list, event audit trail, and embedded simulator studio.

---

## 3. Device Status Terminology (PRD FR-10)

| Status | Meaning |
|---|---|
| **Not authenticated** | No approval has been recorded for the device. |
| **Pending authentication** | The device requires a user decision. |
| **Authenticated** | The user has approved the device and it is in the trusted registry. |
| **Rejected** | The user rejected the device; it does not become trusted. |
| **Trust revoked** | A previous approval has been withdrawn. Connecting again requires renewal. |

---

## 4. Device Matching Rules (PRD Section 10)

1. **Serial Number Match (Strongest)**: When a valid hardware serial number is exposed and matches an existing record.
2. **Hardware ID / Instance Path Match**: Operating-system specific physical instance path.
3. **Descriptor Match**: VID + PID + Manufacturer + Product String + Interface Category.
4. **Ambiguity Prevention**: The system will **never** silently trust a device solely based on a bare VID/PID match if other descriptors are missing or conflicting. If matching is ambiguous, user approval is requested.

---

## 5. Non-Goals & MVP Limitations

Per Section 2.2 and Section 16 of the PRD:
- **Application-Level Trust Decision**: Approving or rejecting a device in this MVP records user intent in the application registry. It does **not** perform OS-level kernel/driver input blocking or physical USB port cutoff.
- **No Suspicious Classification or Risk Scoring**: The product does not classify peripherals as "malware" or analyze keystroke timing/injection.
- **Identity Limitation**: USB descriptors can theoretically be spoofed in hardware. User approval indicates user recognition of the peripheral, not cryptographic hardware authenticity.

---

## 6. Installation & Running

### Requirements
- Python 3.10+ (tested on Python 3.13)
- Windows, Linux, or macOS

### Running the Application
From the `hidauthenticator` directory:

```bash
python run.py
```

Open your browser to:
```
http://127.0.0.1:8000
```

### Running Automated Tests
Run the built-in test suite:
```bash
python -m unittest discover tests -v
```
All unit tests validate:
- SQLite schema, CRUD operations, persistence across reboots.
- First-time connection prompting.
- Approval workflow and trusted registry updates.
- Rejection workflow and untrusted state.
- Revocation workflow and mandatory re-prompt on reconnection.
- Duplicate notification suppression.
- REST API and simulation flows.

---

## 7. Interactive Simulator Studio

The application includes an embedded **Simulator Studio** tab on the dashboard:
1. **Presets**: One-click connect for Logitech G Pro Keyboard, Razer DeathAdder Mouse, Lenovo Wireless Dongle, or Symbol Barcode Scanner.
2. **Custom Peripherals**: Test arbitrary names, VIDs, PIDs, and serial numbers.
3. **Live Unplugging**: Test disconnection while an approval prompt is pending.
