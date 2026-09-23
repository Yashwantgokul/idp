"""
Entry point for HID Authenticator (SYMPACT MVP).
Launches the FastAPI server and device monitoring adapter.
"""

import sys
import uvicorn
from core.config import HOST, PORT, DB_PATH, DISCLAIMER_TEXT


def print_banner():
    banner = f"""
======================================================================
               HID Authenticator (SYMPACT MVP v1.0)
               Peripheral Trust Management Application
======================================================================
 Database:      {DB_PATH}
 Dashboard UI:  http://{HOST}:{PORT}
 Platform:      {sys.platform}
 
 Notice:
 {DISCLAIMER_TEXT}
======================================================================
    """
    print(banner)


def main():
    print_banner()
    uvicorn.run(
        "api.server:app",
        host=HOST,
        port=PORT,
        log_level="info",
        reload=False
    )


if __name__ == "__main__":
    main()
