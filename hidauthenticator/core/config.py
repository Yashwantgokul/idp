"""
Configuration settings for HID Authenticator.
"""

from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "hidauthenticator.db"

# Server configuration
HOST = "127.0.0.1"
PORT = 8000

# Adapter settings
POLL_INTERVAL_SECONDS = 1.5

# Security disclaimer text (neutral language per PRD)
DISCLAIMER_TEXT = (
    "HID Authenticator provides application-level trust management. "
    "Approval records user recognition of a device; it does not constitute OS-level hardware input blocking or proof of physical authenticity."
)
