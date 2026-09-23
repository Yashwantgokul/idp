"""
Native Windows Desktop Notification Dispatcher for HIDShield-X.
Uses Windows Runtime Toast Notifications via PowerShell in a non-blocking background thread.
"""

import sys
import subprocess
import threading
import logging
from typing import Optional

logger = logging.getLogger("hidauthenticator.notifier")

POWERSHELL_TOAST_TEMPLATE = """
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$title = [System.Security.SecurityElement]::Escape(@'
{title}
'@)
$body = [System.Security.SecurityElement]::Escape(@'
{body}
'@)

$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>$title</text>
            <text>$body</text>
        </binding>
    </visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe").Show($toast)
"""


def _send_toast_worker(title: str, body: str) -> None:
    if sys.platform != "win32":
        return

    try:
        script = POWERSHELL_TOAST_TEMPLATE.format(
            title=title.replace("'", "''"),
            body=body.replace("'", "''")
        )
        cmd = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-NonInteractive",
            "-Command", script
        ]
        # Execute silently with CREATE_NO_WINDOW
        creationflags = 0
        if hasattr(subprocess, "CREATE_NO_WINDOW"):
            creationflags = subprocess.CREATE_NO_WINDOW

        subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            timeout=5
        )
    except Exception as e:
        logger.debug(f"Failed to send Windows native notification: {e}")


def notify_device_event(title: str, body: str) -> None:
    """
    Fire-and-forget native Windows toast notification in a daemon thread.
    """
    t = threading.Thread(
        target=_send_toast_worker,
        args=(title, body),
        daemon=True,
        name="ToastNotifierThread"
    )
    t.start()
