"""
Database module for HID Authenticator (HIDShield-X MVP).
Implements SQLite persistent storage conforming to PRD Section 9.
"""

import sqlite3
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

from core.config import DB_PATH
from core.models import DeviceRecord, EventRecord, DeviceStatus, EventType


def adapt_datetime_iso(val: datetime) -> str:
    """Format datetime to ISO string."""
    if val.tzinfo is None:
        val = val.replace(tzinfo=timezone.utc)
    return val.isoformat()


def parse_datetime_iso(val: Optional[str]) -> Optional[datetime]:
    """Parse ISO string back to datetime."""
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(val)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class Database:
    def __init__(self, db_file: Path = DB_PATH):
        self.db_file = Path(db_file)
        self.db_file.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    @contextmanager
    def get_connection(self):
        """Context manager for thread-safe SQLite connection."""
        conn = sqlite3.connect(
            str(self.db_file),
            timeout=10.0,
            check_same_thread=False
        )
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for better concurrency and foreign keys
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_db(self):
        """Initialize database tables according to PRD Section 9."""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Devices Table (Section 9.1)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_name TEXT,
                vendor_id TEXT,
                product_id TEXT,
                serial_number TEXT,
                manufacturer TEXT,
                product_string TEXT,
                interface_type TEXT DEFAULT 'HID',
                connection_type TEXT DEFAULT 'USB',
                status TEXT NOT NULL DEFAULT 'not_authenticated',
                first_detected_at TEXT NOT NULL,
                last_connected_at TEXT NOT NULL,
                approved_at TEXT,
                is_connected INTEGER NOT NULL DEFAULT 1,
                hardware_id TEXT,
                source TEXT DEFAULT 'real'
            );
            """)

            # Migration for existing databases without source column
            try:
                cursor.execute("ALTER TABLE devices ADD COLUMN source TEXT DEFAULT 'real';")
            except Exception:
                pass

            # Authentication Events Table (Section 9.2)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS authentication_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER,
                event_type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                details TEXT,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
            );
            """)

            # Application Settings Table (Section 9.3)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS application_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT
            );
            """)

            # Indices for quick lookups
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_vid_pid ON devices(vendor_id, product_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_source ON devices(source);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON authentication_events(timestamp);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_device_id ON authentication_events(device_id);")

    # -------------------------------------------------------------
    # Devices Operations
    # -------------------------------------------------------------

    def _row_to_device(self, row: sqlite3.Row) -> DeviceRecord:
        col_names = row.keys()
        return DeviceRecord(
            id=row["id"],
            device_name=row["device_name"],
            vendor_id=row["vendor_id"],
            product_id=row["product_id"],
            serial_number=row["serial_number"],
            manufacturer=row["manufacturer"],
            product_string=row["product_string"],
            interface_type=row["interface_type"] or "HID",
            connection_type=row["connection_type"] or "USB",
            status=DeviceStatus(row["status"]),
            first_detected_at=parse_datetime_iso(row["first_detected_at"]) or datetime.now(timezone.utc),
            last_connected_at=parse_datetime_iso(row["last_connected_at"]) or datetime.now(timezone.utc),
            approved_at=parse_datetime_iso(row["approved_at"]),
            is_connected=bool(row["is_connected"]),
            hardware_id=row["hardware_id"],
            source=row["source"] if "source" in col_names and row["source"] else "real"
        )

    def insert_device(self, data: Dict[str, Any]) -> DeviceRecord:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            first_detected = adapt_datetime_iso(data.get("first_detected_at", datetime.now(timezone.utc)))
            last_connected = adapt_datetime_iso(data.get("last_connected_at", datetime.now(timezone.utc)))
            approved_at = adapt_datetime_iso(data["approved_at"]) if data.get("approved_at") else None

            cursor.execute("""
            INSERT INTO devices (
                device_name, vendor_id, product_id, serial_number, manufacturer,
                product_string, interface_type, connection_type, status,
                first_detected_at, last_connected_at, approved_at, is_connected, hardware_id, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data.get("device_name"),
                data.get("vendor_id"),
                data.get("product_id"),
                data.get("serial_number"),
                data.get("manufacturer"),
                data.get("product_string"),
                data.get("interface_type", "HID"),
                data.get("connection_type", "USB"),
                data.get("status", DeviceStatus.NOT_AUTHENTICATED.value),
                first_detected,
                last_connected,
                approved_at,
                1 if data.get("is_connected", True) else 0,
                data.get("hardware_id"),
                data.get("source", "real")
            ))
            device_id = cursor.lastrowid
        return self.get_device_by_id(device_id)

    def get_device_by_id(self, device_id: int) -> Optional[DeviceRecord]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM devices WHERE id = ?", (device_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_device(row)
            return None

    def list_devices(
        self,
        status: Optional[DeviceStatus] = None,
        is_connected: Optional[bool] = None,
        source: Optional[str] = None
    ) -> List[DeviceRecord]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            query = "SELECT * FROM devices WHERE 1=1"
            params: List[Any] = []

            if status is not None:
                query += " AND status = ?"
                params.append(status.value)
            if is_connected is not None:
                query += " AND is_connected = ?"
                params.append(1 if is_connected else 0)
            if source is not None and source != "all":
                query += " AND source = ?"
                params.append(source)

            query += " ORDER BY last_connected_at DESC"
            cursor.execute(query, params)
            return [self._row_to_device(r) for r in cursor.fetchall()]

    def update_device_status(
        self,
        device_id: int,
        status: DeviceStatus,
        approved_at: Optional[datetime] = None
    ) -> Optional[DeviceRecord]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            app_at_str = adapt_datetime_iso(approved_at) if approved_at else None
            if approved_at is not None:
                cursor.execute("""
                UPDATE devices SET status = ?, approved_at = ? WHERE id = ?
                """, (status.value, app_at_str, device_id))
            else:
                cursor.execute("""
                UPDATE devices SET status = ? WHERE id = ?
                """, (status.value, device_id))
        return self.get_device_by_id(device_id)

    def update_device_connection(
        self,
        device_id: int,
        is_connected: bool,
        last_connected_at: Optional[datetime] = None
    ) -> Optional[DeviceRecord]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if last_connected_at:
                cursor.execute("""
                UPDATE devices SET is_connected = ?, last_connected_at = ? WHERE id = ?
                """, (1 if is_connected else 0, adapt_datetime_iso(last_connected_at), device_id))
            else:
                cursor.execute("""
                UPDATE devices SET is_connected = ? WHERE id = ?
                """, (1 if is_connected else 0, device_id))
        return self.get_device_by_id(device_id)

    def set_all_devices_disconnected(self):
        """Mark all devices as disconnected, useful on system restart."""
        with self.get_connection() as conn:
            conn.execute("UPDATE devices SET is_connected = 0;")

    # -------------------------------------------------------------
    # Authentication Events Operations
    # -------------------------------------------------------------

    def insert_event(
        self,
        event_type: EventType,
        device_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None
    ) -> EventRecord:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            ts = adapt_datetime_iso(timestamp or datetime.now(timezone.utc))
            details_json = json.dumps(details or {}, ensure_ascii=False)
            cursor.execute("""
            INSERT INTO authentication_events (device_id, event_type, timestamp, details)
            VALUES (?, ?, ?, ?)
            """, (device_id, event_type.value, ts, details_json))
            event_id = cursor.lastrowid
        return self.get_event_by_id(event_id)

    def get_event_by_id(self, event_id: int) -> Optional[EventRecord]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT e.*, d.device_name, d.vendor_id, d.product_id
            FROM authentication_events e
            LEFT JOIN devices d ON e.device_id = d.id
            WHERE e.id = ?
            """, (event_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_event(row)

    def _row_to_event(self, row: sqlite3.Row) -> EventRecord:
        details_val = None
        if row["details"]:
            try:
                details_val = json.loads(row["details"])
            except Exception:
                details_val = {"raw": row["details"]}

        return EventRecord(
            id=row["id"],
            device_id=row["device_id"],
            event_type=EventType(row["event_type"]),
            timestamp=parse_datetime_iso(row["timestamp"]) or datetime.now(timezone.utc),
            details=details_val,
            device_name=row["device_name"] if "device_name" in row.keys() else None,
            vendor_id=row["vendor_id"] if "vendor_id" in row.keys() else None,
            product_id=row["product_id"] if "product_id" in row.keys() else None
        )

    def list_events(
        self,
        device_id: Optional[int] = None,
        event_type: Optional[EventType] = None,
        source: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[EventRecord]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            query = """
            SELECT e.*, d.device_name, d.vendor_id, d.product_id
            FROM authentication_events e
            LEFT JOIN devices d ON e.device_id = d.id
            WHERE 1=1
            """
            params: List[Any] = []
            if device_id is not None:
                query += " AND e.device_id = ?"
                params.append(device_id)
            if event_type is not None:
                query += " AND e.event_type = ?"
                params.append(event_type.value)
            if source is not None and source != "all":
                query += " AND (d.source = ? OR (d.source IS NULL AND ? = 'real'))"
                params.extend([source, source])

            query += " ORDER BY e.id DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])

            cursor.execute(query, params)
            return [self._row_to_event(r) for r in cursor.fetchall()]

    def count_events(self, source: Optional[str] = None) -> int:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if source is not None and source != "all":
                cursor.execute("""
                SELECT COUNT(*) FROM authentication_events e
                LEFT JOIN devices d ON e.device_id = d.id
                WHERE (d.source = ? OR (d.source IS NULL AND ? = 'real'))
                """, (source, source))
            else:
                cursor.execute("SELECT COUNT(*) FROM authentication_events")
            return cursor.fetchone()[0]

    # -------------------------------------------------------------
    # Application Settings & System Mode
    # -------------------------------------------------------------

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT setting_value FROM application_settings WHERE setting_key = ?", (key,))
            row = cursor.fetchone()
            if row:
                return row["setting_value"]
            return default

    def set_setting(self, key: str, value: str):
        with self.get_connection() as conn:
            conn.execute("""
            INSERT INTO application_settings (setting_key, setting_value)
            VALUES (?, ?)
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value;
            """, (key, value))

    def get_system_mode(self, default: str = "mock") -> str:
        """Retrieve current operating mode: 'mock' (simulation) or 'real' (hardware)."""
        mode = self.get_setting("system_mode", default)
        return mode if mode in ("mock", "real") else default

    def set_system_mode(self, mode: str):
        """Set current operating mode: 'mock' or 'real'."""
        if mode not in ("mock", "real"):
            raise ValueError("Mode must be 'mock' or 'real'")
        self.set_setting("system_mode", mode)


# Default global instance
db = Database()

