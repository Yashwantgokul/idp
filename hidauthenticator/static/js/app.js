/**
 * HID Authenticator Frontend Application
 * Handles live WebSockets, device approval workflows, trust revocation, and peripheral simulation.
 * Craft-first, anti-slop implementation.
 */

// Application State
let currentPendingDeviceId = null;
let currentRevokeDeviceId = null;
let ws = null;
let reconnectTimer = null;

// DOM Elements
const wsDot = document.getElementById('ws-dot');
const wsStatusText = document.getElementById('ws-status-text');
const platformBadge = document.getElementById('platform-name');

const countConnected = document.getElementById('count-connected');
const countPending = document.getElementById('count-pending');
const countTrusted = document.getElementById('count-trusted');
const countEvents = document.getElementById('count-events');

const pendingEmpty = document.getElementById('pending-empty');
const pendingCards = document.getElementById('pending-cards');
const pendingCountBadge = document.getElementById('pending-count-badge');

const tabCountTrusted = document.getElementById('tab-count-trusted');
const tabCountAll = document.getElementById('tab-count-all');
const tabCountHistory = document.getElementById('tab-count-history');

const trustedTbody = document.getElementById('trusted-tbody');
const allDevicesTbody = document.getElementById('all-devices-tbody');
const historyTbody = document.getElementById('history-tbody');
const historyFilter = document.getElementById('history-filter-type');

const presetContainer = document.getElementById('preset-container');
const activeSimsList = document.getElementById('active-sims-list');
const customSimForm = document.getElementById('custom-sim-form');

// Modals
const authModal = document.getElementById('auth-modal');
const revokeModal = document.getElementById('revoke-modal');

// Init on Load
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEventListeners();
  loadSystemStatus();
  refreshAllData();
  initWebSocket();
});

// -------------------------------------------------------------
// WebSocket Connection
// -------------------------------------------------------------
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsDot.classList.add('online');
    wsStatusText.textContent = 'Active Sync';
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleLiveEvent(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message', e);
    }
  };

  ws.onclose = () => {
    wsDot.classList.remove('online');
    wsStatusText.textContent = 'Disconnected';
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(initWebSocket, 2500);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

function handleLiveEvent(data) {
  switch (data.type) {
    case 'auth_requested':
      showToast(`Review required: ${data.device.device_name || 'USB HID'}`, 'warning');
      refreshAllData();
      promptDeviceApproval(data.device, data.prompt);
      break;

    case 'device_approved':
      showToast(`Authorized: ${data.device.device_name}`, 'success');
      refreshAllData();
      break;

    case 'device_rejected':
      showToast(`Declined: ${data.device.device_name}`, 'danger');
      refreshAllData();
      break;

    case 'trust_revoked':
      showToast(`Revoked: ${data.device.device_name}`, 'info');
      refreshAllData();
      break;

    case 'device_connected':
      refreshAllData();
      break;

    case 'device_disconnected':
      showToast(`Detached: ${data.device.device_name}`, 'info');
      refreshAllData();
      break;

    default:
      refreshAllData();
  }
}

// -------------------------------------------------------------
// Data Fetching & Rendering
// -------------------------------------------------------------
async function loadSystemStatus() {
  try {
    const res = await fetch('/api/system/status');
    if (res.ok) {
      const data = await res.json();
      platformBadge.textContent = data.platform === 'win32' ? 'Windows WMI' : data.platform;
    }
  } catch (e) {
    console.error('Failed to load system status', e);
  }
}

async function refreshAllData() {
  await Promise.all([
    loadStats(),
    loadPendingDevices(),
    loadTrustedDevices(),
    loadAllDevices(),
    loadHistory(),
    loadSimulatorData()
  ]);
}

async function loadStats() {
  try {
    const res = await fetch('/api/devices/stats');
    if (res.ok) {
      const stats = await res.json();
      countConnected.textContent = stats.connected_devices_count;
      countPending.textContent = stats.pending_devices_count;
      countTrusted.textContent = stats.trusted_devices_count;
      countEvents.textContent = stats.total_events_count;
    }
  } catch (e) {
    console.error('Failed to load stats', e);
  }
}

async function loadPendingDevices() {
  try {
    const res = await fetch('/api/devices?status=pending_authentication');
    if (res.ok) {
      const devices = await res.json();
      pendingCountBadge.textContent = devices.length;

      if (devices.length === 0) {
        pendingEmpty.style.display = 'block';
        pendingCards.innerHTML = '';
      } else {
        pendingEmpty.style.display = 'none';
        pendingCards.innerHTML = devices.map(d => renderPendingCard(d)).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load pending devices', e);
  }
}

function renderPendingCard(device) {
  return `
    <div class="pending-card">
      <div class="pending-card-top">
        <div>
          <div class="pending-card-title">${escapeHtml(device.device_name || 'USB HID Peripheral')}</div>
          <div class="pending-card-mfg">${escapeHtml(device.manufacturer || 'Standard USB Device')}</div>
        </div>
        <span class="badge badge-pending">Review</span>
      </div>

      <div class="spec-strip">
        <div class="spec-cell">
          <span class="spec-cell-label">Hardware ID</span>
          <span class="spec-cell-val font-mono">${device.vendor_id || '—'}:${device.product_id || '—'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-cell-label">Interface</span>
          <span class="spec-cell-val">${device.interface_type || 'HID'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-cell-label">Serial</span>
          <span class="spec-cell-val font-mono">${device.serial_number || 'None'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-cell-label">Bus</span>
          <span class="spec-cell-val">${device.connection_type || 'USB'}</span>
        </div>
      </div>

      <div class="pending-actions">
        <button class="btn btn-danger-ghost btn-sm" style="flex:1" onclick="handleRejectDevice(${device.id})">
          Decline
        </button>
        <button class="btn btn-primary btn-sm" style="flex:1.2" onclick="handleApproveDevice(${device.id})">
          Approve
        </button>
      </div>
    </div>
  `;
}

async function loadTrustedDevices() {
  try {
    const res = await fetch('/api/devices?status=authenticated');
    if (res.ok) {
      const devices = await res.json();
      tabCountTrusted.textContent = devices.length;

      if (devices.length === 0) {
        trustedTbody.innerHTML = `<tr><td colspan="8" class="empty-table-cell">No trusted devices registered yet. Peripherals you approve will be listed here.</td></tr>`;
      } else {
        trustedTbody.innerHTML = devices.map(d => `
          <tr>
            <td>
              <div class="font-bold">${escapeHtml(d.device_name || 'Unknown')}</div>
              <div class="text-muted text-sm">${escapeHtml(d.manufacturer || '')}</div>
            </td>
            <td class="font-mono text-sm">${d.vendor_id || '—'}:${d.product_id || '—'}</td>
            <td class="font-mono text-sm">${d.serial_number || '<span class="text-muted">None</span>'}</td>
            <td>${escapeHtml(d.interface_type || 'HID')}</td>
            <td>
              <span class="${d.is_connected ? 'badge-conn-active' : 'badge-conn-offline'}">
                ${d.is_connected ? 'Active' : 'Offline'}
              </span>
            </td>
            <td class="text-sm">${formatDate(d.approved_at)}</td>
            <td class="text-sm">${formatDate(d.last_connected_at)}</td>
            <td class="text-right">
              <button class="btn btn-danger-ghost btn-sm" onclick="promptRevokeTrust(${d.id}, '${escapeHtml(d.device_name || '')}', '${d.vendor_id || ''}:${d.product_id || ''}')">
                Revoke
              </button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load trusted devices', e);
  }
}

async function loadAllDevices() {
  try {
    const res = await fetch('/api/devices');
    if (res.ok) {
      const devices = await res.json();
      tabCountAll.textContent = devices.length;

      if (devices.length === 0) {
        allDevicesTbody.innerHTML = `<tr><td colspan="8" class="empty-table-cell">No peripherals found.</td></tr>`;
      } else {
        allDevicesTbody.innerHTML = devices.map(d => `
          <tr>
            <td>${renderStatusBadge(d.status)}</td>
            <td>
              <div class="font-bold">${escapeHtml(d.device_name || 'Unknown')}</div>
              <div class="text-muted text-sm">${escapeHtml(d.manufacturer || '')}</div>
            </td>
            <td class="font-mono text-sm">${d.vendor_id || '—'}:${d.product_id || '—'}</td>
            <td class="font-mono text-sm">${d.serial_number || '<span class="text-muted">None</span>'}</td>
            <td>${d.interface_type || 'HID'}</td>
            <td>
              <span class="${d.is_connected ? 'badge-conn-active' : 'badge-conn-offline'}">
                ${d.is_connected ? 'Active' : 'Offline'}
              </span>
            </td>
            <td class="text-sm">${formatDate(d.last_connected_at)}</td>
            <td class="text-right">
              ${renderDeviceActionButtons(d)}
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load all devices', e);
  }
}

function renderDeviceActionButtons(d) {
  if (d.status === 'authenticated') {
    return `<button class="btn btn-danger-ghost btn-sm" onclick="promptRevokeTrust(${d.id}, '${escapeHtml(d.device_name || '')}', '${d.vendor_id || ''}:${d.product_id || ''}')">Revoke</button>`;
  } else if (d.status === 'pending_authentication' || d.status === 'trust_revoked' || d.status === 'rejected') {
    return `<button class="btn btn-primary btn-sm" onclick="handleApproveDevice(${d.id})">Approve</button>`;
  }
  return '—';
}

async function loadHistory() {
  try {
    const filter = historyFilter.value;
    let url = '/api/events?limit=50';
    if (filter) {
      url += `&event_type=${filter}`;
    }

    const res = await fetch(url);
    if (res.ok) {
      const events = await res.json();
      tabCountHistory.textContent = events.length;

      if (events.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="5" class="empty-table-cell">No audit records found.</td></tr>`;
      } else {
        historyTbody.innerHTML = events.map(e => `
          <tr>
            <td class="text-sm font-mono">${formatDate(e.timestamp)}</td>
            <td>${renderEventBadge(e.event_type)}</td>
            <td class="font-bold">${escapeHtml(e.device_name || 'System / Unregistered')}</td>
            <td class="font-mono text-sm">${e.vendor_id || '—'}:${e.product_id || '—'}</td>
            <td class="text-sm text-muted">${formatDetails(e.details)}</td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load history', e);
  }
}

async function loadSimulatorData() {
  try {
    const pRes = await fetch('/api/simulator/presets');
    if (pRes.ok) {
      const presets = await pRes.json();
      presetContainer.innerHTML = presets.map(p => `
        <div class="preset-chip">
          <div>
            <div class="preset-chip-title">${escapeHtml(p.device_name)}</div>
            <div class="preset-chip-meta">${p.vendor_id}:${p.product_id} &bull; ${escapeHtml(p.manufacturer)}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="simulatePresetPlugIn(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            Attach
          </button>
        </div>
      `).join('');
    }

    const aRes = await fetch('/api/simulator/active');
    if (aRes.ok) {
      const active = await aRes.json();
      if (active.length === 0) {
        activeSimsList.innerHTML = `<div class="empty-tray"><div class="empty-tray-desc">No simulated peripherals currently attached.</div></div>`;
      } else {
        activeSimsList.innerHTML = active.map(a => `
          <div class="active-device-row">
            <div>
              <div class="font-bold text-sm">${escapeHtml(a.device_name)}</div>
              <div class="text-sm text-muted font-mono">${a.hardware_id}</div>
            </div>
            <button class="btn btn-danger-ghost btn-sm" onclick="simulateUnplug('${escapeHtml(a.hardware_id)}')">
              Detach
            </button>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load simulator data', e);
  }
}

// -------------------------------------------------------------
// Interactive Approval & Rejection
// -------------------------------------------------------------
function promptDeviceApproval(device, promptText) {
  currentPendingDeviceId = device.id;

  document.getElementById('modal-prompt-text').textContent = promptText || "This peripheral is not registered. Authorize for this workstation?";
  document.getElementById('modal-dev-name').textContent = device.device_name || "USB Peripheral";
  document.getElementById('modal-dev-mfg').textContent = device.manufacturer || "Standard USB Device";
  document.getElementById('modal-dev-vidpid').textContent = `${device.vendor_id || '—'}:${device.product_id || '—'}`;
  document.getElementById('modal-dev-serial').textContent = device.serial_number || "None";
  document.getElementById('modal-dev-interface').textContent = device.interface_type || "HID";

  authModal.classList.add('show');
}

function closeAuthModal() {
  authModal.classList.remove('show');
  currentPendingDeviceId = null;
}

async function handleApproveDevice(deviceId) {
  try {
    const res = await fetch(`/api/devices/${deviceId}/approve`, { method: 'POST' });
    if (res.ok) {
      closeAuthModal();
      refreshAllData();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Authorization failed', 'danger');
    }
  } catch (e) {
    showToast('Network error while authorizing device', 'danger');
  }
}

async function handleRejectDevice(deviceId) {
  try {
    const res = await fetch(`/api/devices/${deviceId}/reject`, { method: 'POST' });
    if (res.ok) {
      closeAuthModal();
      refreshAllData();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Decline failed', 'danger');
    }
  } catch (e) {
    showToast('Network error while declining device', 'danger');
  }
}

// -------------------------------------------------------------
// Revocation
// -------------------------------------------------------------
function promptRevokeTrust(deviceId, name, vidpid) {
  currentRevokeDeviceId = deviceId;
  document.getElementById('revoke-dev-name').textContent = name;
  document.getElementById('revoke-dev-vidpid').textContent = vidpid;
  revokeModal.classList.add('show');
}

function closeRevokeModal() {
  revokeModal.classList.remove('show');
  currentRevokeDeviceId = null;
}

async function confirmRevokeTrust() {
  if (!currentRevokeDeviceId) return;

  try {
    const res = await fetch(`/api/devices/${currentRevokeDeviceId}/revoke`, { method: 'POST' });
    if (res.ok) {
      closeRevokeModal();
      refreshAllData();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Failed to revoke trust', 'danger');
    }
  } catch (e) {
    showToast('Network error while revoking trust', 'danger');
  }
}

// -------------------------------------------------------------
// Simulator Actions
// -------------------------------------------------------------
async function simulatePresetPlugIn(preset) {
  try {
    const res = await fetch('/api/simulator/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset)
    });
    if (res.ok) {
      showToast(`Attached: ${preset.device_name}`, 'info');
      refreshAllData();
    }
  } catch (e) {
    showToast('Simulation failed', 'danger');
  }
}

async function simulateUnplug(hardwareId) {
  try {
    const res = await fetch('/api/simulator/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hardware_id: hardwareId })
    });
    if (res.ok) {
      showToast(`Detached: ${hardwareId}`, 'info');
      refreshAllData();
    }
  } catch (e) {
    showToast('Detach simulation failed', 'danger');
  }
}

// -------------------------------------------------------------
// Navigation Tabs & Event Listeners
// -------------------------------------------------------------
function setupTabs() {
  const tabs = document.querySelectorAll('.view-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

function setupEventListeners() {
  document.getElementById('modal-btn-approve').addEventListener('click', () => {
    if (currentPendingDeviceId) handleApproveDevice(currentPendingDeviceId);
  });

  document.getElementById('modal-btn-reject').addEventListener('click', () => {
    if (currentPendingDeviceId) handleRejectDevice(currentPendingDeviceId);
  });

  document.getElementById('revoke-btn-confirm').addEventListener('click', confirmRevokeTrust);

  document.getElementById('btn-refresh-trusted').addEventListener('click', loadTrustedDevices);
  document.getElementById('btn-refresh-all').addEventListener('click', loadAllDevices);
  document.getElementById('btn-refresh-history').addEventListener('click', loadHistory);
  historyFilter.addEventListener('change', loadHistory);

  customSimForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      device_name: document.getElementById('custom-name').value,
      manufacturer: document.getElementById('custom-mfg').value || null,
      vendor_id: document.getElementById('custom-vid').value || null,
      product_id: document.getElementById('custom-pid').value || null,
      serial_number: document.getElementById('custom-serial').value || null,
      interface_type: document.getElementById('custom-interface').value,
      connection_type: document.getElementById('custom-conn').value
    };

    try {
      const res = await fetch('/api/simulator/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast(`Attached: ${payload.device_name}`, 'info');
        customSimForm.reset();
        refreshAllData();
      }
    } catch (err) {
      showToast('Simulation failed', 'danger');
    }
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 150ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

function renderStatusBadge(status) {
  switch (status) {
    case 'authenticated':
      return `<span class="badge badge-authenticated">Approved</span>`;
    case 'pending_authentication':
      return `<span class="badge badge-pending">Review</span>`;
    case 'rejected':
      return `<span class="badge badge-rejected">Declined</span>`;
    case 'trust_revoked':
      return `<span class="badge badge-revoked">Revoked</span>`;
    default:
      return `<span class="badge badge-not-auth">${status}</span>`;
  }
}

function renderEventBadge(type) {
  switch (type) {
    case 'approved':
      return `<span class="badge badge-authenticated">Approved</span>`;
    case 'rejected':
      return `<span class="badge badge-rejected">Declined</span>`;
    case 'trust_revoked':
      return `<span class="badge badge-revoked">Revoked</span>`;
    case 'auth_requested':
      return `<span class="badge badge-pending">Review Required</span>`;
    case 'detected':
      return `<span class="badge badge-not-auth">Detected</span>`;
    case 'connected':
      return `<span class="badge badge-authenticated">Connected</span>`;
    case 'disconnected':
      return `<span class="badge badge-not-auth">Disconnected</span>`;
    default:
      return `<span class="badge badge-not-auth">${type}</span>`;
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return isoStr;
  }
}

function formatDetails(details) {
  if (!details) return '';
  try {
    if (typeof details === 'object') {
      const keys = Object.keys(details);
      if (keys.length === 0) return '';
      return keys.map(k => `${k}: ${details[k]}`).join(' · ');
    }
    return String(details);
  } catch (e) {
    return '';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
