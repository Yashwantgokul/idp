# HIDShield-X — Shared Layout Components

## Application Shell Architecture
The single-page application follows a desktop/workstation layout optimized for 1320px container width with responsive flex column rails.

### Layout: `AppHeader`
- **File:** `hidauthenticator/static/index.html` (lines 18–68)
- **CSS:** `hidauthenticator/static/css/style.css` (`.app-header`, `.header-left`, `.header-center`, `.header-right`)
- **Height:** 60px sticky top bar, `backdrop-filter: blur(12px)`.

### Layout: `MetricsRail`
- **File:** `hidauthenticator/static/index.html` (lines 73–125)
- **CSS:** `hidauthenticator/static/css/style.css` (`.metrics-rail`, `.metric-card`)
- **Structure:** 4-column CSS grid (`repeat(4, minmax(0, 1fr))`), collaping to 2 columns under 900px breakpoint.

### Layout: `MainWorkspace`
- **File:** `hidauthenticator/static/index.html` (lines 71–382)
- **CSS:** `hidauthenticator/static/css/style.css` (`.main-workspace`, `.content-block`)
- **Structure:** Centered flex column (`max-width: 1320px; margin: 0 auto; padding: 1.75rem 2rem 3rem;`).

### Layout: `SegmentedTabBar`
- **File:** `hidauthenticator/static/index.html` (lines 159–190)
- **CSS:** `hidauthenticator/static/css/style.css` (`.tab-control-bar`, `.segmented-control`, `.segment-btn`)
- **Structure:** Tab bar wrapping 4 panels:
  1. `tab-trusted`: Authorized Peripherals
  2. `tab-all-devices`: Host Peripheral Inventory
  3. `tab-history`: Security & Decision Audit Log
  4. `tab-simulator`: Hardware Emulation Studio

### Layout: `AppFooter`
- **File:** `hidauthenticator/static/index.html` (lines 385–394)
- **CSS:** `hidauthenticator/static/css/style.css` (`.app-footer`, `.footer-inner`, `.footer-note`, `.footer-meta`)
- **Structure:** Hairline bordered footer with regulatory scope disclaimer and engine version information.
