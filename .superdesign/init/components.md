# HIDShield-X — Shared UI Components

## Overview
HIDShield-X is an enterprise-grade peripheral trust manager and HID authenticator application. The frontend uses semantic HTML5, Vanilla CSS with a three-tier token architecture, and vanilla JavaScript for real-time WebSocket peripheral event processing.

---

### Component: `BrandMark` & `Header`
**Path:** `hidauthenticator/static/index.html` (lines 18–68)
**Description:** Sticky top bar with brand badge, global peripheral search bar with keyboard shortcut hint, live WebSocket synchronization indicator, host platform adapter pill, and Port Simulator action trigger.

```html
<header class="app-header">
  <div class="header-left">
    <div class="brand-mark" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    </div>
    <div class="brand-text">
      <h1 class="brand-name">HIDShield-X</h1>
      <div class="brand-tag">Peripheral Trust Infrastructure</div>
    </div>
  </div>

  <div class="header-center">
    <div class="search-trigger" id="global-search-trigger">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" id="device-search-input" placeholder="Search peripherals by name, VID, PID, or vendor..." autocomplete="off">
      <kbd class="key-hint">⌘K</kbd>
    </div>
  </div>

  <div class="header-right">
    <div class="sync-indicator">
      <span class="live-dot online" id="ws-dot"></span>
      <span class="sync-text" id="ws-status-text">Active Sync</span>
    </div>
    <div class="host-pill" title="Host Adapter Engine">
      <span id="platform-name">Windows WMI</span>
    </div>
    <button class="btn btn-secondary btn-sm header-action-btn" onclick="openSimulatorTab()">
      <span>Port Simulator</span>
    </button>
  </div>
</header>
```

---

### Component: `KpiMetricCard`
**Path:** `hidauthenticator/static/index.html` (lines 74–125)
**Description:** 4-column metric strip presenting active endpoints, pending review count, trusted registry entries, and audit trail events.

```html
<div class="metric-card" id="kpi-connected">
  <div class="metric-body">
    <div class="metric-header">
      <span class="metric-title">Connected Devices</span>
      <span class="metric-badge badge-active">Physical & Virtual</span>
    </div>
    <div class="metric-value-wrap">
      <span class="metric-number" id="count-connected">0</span>
      <span class="metric-caption">Active endpoints</span>
    </div>
  </div>
</div>
```

---

### Component: `DeviceCard`
**Path:** `hidauthenticator/static/js/app.js` (`renderPendingDevices()`)
**Description:** High-density review card displaying peripheral type icon, vendor name, 2x2 micro-spec grid (VID:PID, interface, serial, connection bus), and dual action triggers (Decline vs Authorize Device).

```html
<div class="device-card status-pending" id="card-${dev.device_id}">
  <div class="device-card-head">
    <div class="device-avatar">${iconSvg}</div>
    <div class="device-main-info">
      <div class="device-primary-title" title="${dev.product_name}">${dev.product_name}</div>
      <div class="device-vendor-sub">${dev.manufacturer || 'Standard USB Device'}</div>
    </div>
  </div>
  <div class="device-spec-box">
    <div class="spec-cell">
      <span class="spec-k">Hardware ID</span>
      <span class="spec-v font-mono copyable-chip" onclick="copyText('${dev.vendor_id}:${dev.product_id}')">
        ${dev.vendor_id} : ${dev.product_id}
      </span>
    </div>
    <div class="spec-cell">
      <span class="spec-k">Interface</span>
      <span class="spec-v">${dev.interface_type || 'HID'}</span>
    </div>
    <div class="spec-cell">
      <span class="spec-k">Serial</span>
      <span class="spec-v font-mono">${dev.serial_number || 'None'}</span>
    </div>
    <div class="spec-cell">
      <span class="spec-k">Connection</span>
      <span class="spec-v">${dev.connection_type || 'USB'}</span>
    </div>
  </div>
  <div class="device-card-footer">
    <button class="btn btn-danger-ghost btn-sm" onclick="promptAction('reject', '${dev.device_id}')">Decline</button>
    <button class="btn btn-primary btn-sm btn-flex" onclick="promptAction('approve', '${dev.device_id}')">Authorize Device</button>
  </div>
</div>
```

---

### Component: `SaasTable`
**Path:** `hidauthenticator/static/index.html` (lines 201–250, 275–293)
**Description:** Dense enterprise table with uppercase tracked headers, hover row states, status pills, and action buttons.

```html
<div class="table-container">
  <table class="saas-table" id="trusted-table">
    <thead>
      <tr>
        <th style="width: 28%;">Peripheral Descriptor</th>
        <th style="width: 16%;">Hardware ID (VID:PID)</th>
        <th style="width: 15%;">Serial Number</th>
        <th style="width: 11%;">Class</th>
        <th style="width: 10%;">State</th>
        <th style="width: 10%;">Approved</th>
        <th style="width: 10%;" class="text-right">Action</th>
      </tr>
    </thead>
    <tbody id="trusted-tbody">
      <!-- Dynamic Rows -->
    </tbody>
  </table>
</div>
```

---

### Component: `AuthorizationModal`
**Path:** `hidauthenticator/static/index.html` (lines 397–447)
**Description:** Modal prompt for first-time device connection decisions with hardware specification review box and confirmation buttons.

```html
<div class="modal-backdrop" id="auth-modal" role="dialog" aria-modal="true">
  <div class="modal-window">
    <div class="modal-header">
      <div class="modal-header-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
      </div>
      <div class="modal-header-text">
        <h3>Peripheral Authorization Request</h3>
        <p id="modal-prompt-text">This device has not been registered. Do you want to approve it?</p>
      </div>
      <button class="modal-close-btn" onclick="closeAuthModal()" aria-label="Close dialog">&times;</button>
    </div>
    <div class="modal-content">
      <div class="spec-table-box">
        <div class="spec-table-row"><span class="spec-label">Reported Name</span><span class="spec-val" id="modal-dev-name">—</span></div>
        <div class="spec-table-row"><span class="spec-label">Hardware Identifier</span><span class="spec-val font-mono" id="modal-dev-vidpid">—</span></div>
      </div>
      <div class="spec-advisory">Authorizing this peripheral records it in your trusted device registry.</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-btn-reject">Decline Device</button>
      <button class="btn btn-primary" id="modal-btn-approve">Authorize Device</button>
    </div>
  </div>
</div>
```
