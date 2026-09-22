/**
 * HID Authenticator Frontend Application (HIDShield-X MVP)
 * Handles live WebSockets, device approval workflows, trust revocation, and peripheral simulation.
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
// WebSocket Live Connection
// -------------------------------------------------------------
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsDot.classList.add('online');
    wsStatusText.textContent = 'Live System Sync';
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
    wsStatusText.textContent = 'Reconnecting...';
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(initWebSocket, 3000);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

function handleLiveEvent(data) {
  // Real-time event dispatch
  switch (data.type) {
    case 'auth_requested':
      showToast(`New peripheral detected: ${data.device.device_name || 'USB HID'}`, 'warning');
      refreshAllData();
      promptDeviceApproval(data.device, data.prompt);
      break;

    case 'device_approved':
      showToast(`Device '${data.device.device_name}' approved and trusted.`, 'success');
      refreshAllData();
      break;

    case 'device_rejected':
      showToast(`Device '${data.device.device_name}' rejected.`, 'danger');
      refreshAllData();
      break;

    case 'trust_revoked':
      showToast(`Trust revoked for '${data.device.device_name}'.`, 'info');
      refreshAllData();
      break;

    case 'device_connected':
      refreshAllData();
      break;

    case 'device_disconnected':
      showToast(`Device '${data.device.device_name}' disconnected.`, 'info');
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
      pendingCountBadge.textContent = `${devices.length} awaiting review`;

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
      <div class="pending-card-header">
        <div>
          <div class="pending-card-title">${escapeHtml(device.device_name || 'USB HID Peripheral')}</div>
          <div class="pending-card-subtitle">${escapeHtml(device.manufacturer || 'Standard USB Device')}</div>
        </div>
        <span class="badge badge-pending">Pending Approval</span>
      </div>

      <div class="pending-card-meta">
        <div class="meta-field">
          <span class="meta-key">VID / PID</span>
          <span class="meta-val font-mono">${device.vendor_id || '—'}:${device.product_id || '—'}</span>
        </div>
        <div class="meta-field">
          <span class="meta-key">Interface</span>
          <span class="meta-val">${device.interface_type || 'HID'}</span>
        </div>
        <div class="meta-field">
          <span class="meta-key">Serial</span>
          <span class="meta-val font-mono">${device.serial_number || 'Unavailable'}</span>
        </div>
        <div class="meta-field">
          <span class="meta-key">Connection</span>
          <span class="meta-val">${device.connection_type || 'USB'}</span>
        </div>
      </div>

      <div class="pending-card-actions">
        <button class="btn btn-danger btn-sm" style="flex:1" onclick="handleRejectDevice(${device.id})">
          ✕ Reject
        </button>
        <button class="btn btn-success btn-sm" style="flex:1.2" onclick="handleApproveDevice(${device.id})">
          ✓ Approve
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
        trustedTbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No trusted devices registered yet. Approve connected devices to add them here.</td></tr>`;
      } else {
        trustedTbody.innerHTML = devices.map(d => `
          <tr>
            <td>
              <div class="font-bold">${escapeHtml(d.device_name || 'Unknown')}</div>
              <div class="text-muted text-sm">${escapeHtml(d.product_string || '')}</div>
            </td>
            <td class="font-mono">${d.vendor_id || '—'}:${d.product_id || '—'}</td>
            <td class="font-mono text-sm">${d.serial_number || '<span class="text-muted">Unavailable</span>'}</td>
            <td>${escapeHtml(d.manufacturer || 'Standard')}</td>
            <td>
              <span class="badge ${d.is_connected ? 'badge-connected' : 'badge-disconnected'}">
                ${d.is_connected ? '● Connected' : '○ Disconnected'}
              </span>
            </td>
            <td class="text-sm">${formatDate(d.approved_at)}</td>
            <td class="text-sm">${formatDate(d.last_connected_at)}</td>
            <td>
              <button class="btn btn-danger btn-sm" onclick="promptRevokeTrust(${d.id}, '${escapeHtml(d.device_name || '')}', '${d.vendor_id || ''}:${d.product_id || ''}')">
                Revoke Trust
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
        allDevicesTbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No devices recorded.</td></tr>`;
      } else {
        allDevicesTbody.innerHTML = devices.map(d => `
          <tr>
            <td>${renderStatusBadge(d.status)}</td>
            <td>
              <div class="font-bold">${escapeHtml(d.device_name || 'Unknown')}</div>
              <div class="text-muted text-sm">${escapeHtml(d.manufacturer || '')}</div>
            </td>
            <td class="font-mono">${d.vendor_id || '—'}:${d.product_id || '—'}</td>
            <td class="font-mono text-sm">${d.serial_number || '<span class="text-muted">Unavailable</span>'}</td>
            <td>${d.interface_type || 'HID'}</td>
            <td>
              <span class="badge ${d.is_connected ? 'badge-connected' : 'badge-disconnected'}">
                ${d.is_connected ? '● Active' : '○ Offline'}
              </span>
            </td>
            <td class="text-sm">${formatDate(d.last_connected_at)}</td>
            <td>
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
    return `<button class="btn btn-danger btn-sm" onclick="promptRevokeTrust(${d.id}, '${escapeHtml(d.device_name || '')}', '${d.vendor_id || ''}:${d.product_id || ''}')">Revoke</button>`;
  } else if (d.status === 'pending_authentication' || d.status === 'trust_revoked' || d.status === 'rejected') {
    return `<button class="btn btn-success btn-sm" onclick="handleApproveDevice(${d.id})">Approve</button>`;
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
        historyTbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No events recorded.</td></tr>`;
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
    // Load presets
    const pRes = await fetch('/api/simulator/presets');
    if (pRes.ok) {
      const presets = await pRes.json();
      presetContainer.innerHTML = presets.map(p => `
        <div class="preset-card">
          <div>
            <h5>${escapeHtml(p.device_name)}</h5>
            <p>${escapeHtml(p.manufacturer)} &bull; VID: ${p.vendor_id} PID: ${p.product_id}</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="simulatePresetPlugIn(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            🔌 Plug In
          </button>
        </div>
      `).join('');
    }

    // Load active simulations
    const aRes = await fetch('/api/simulator/active');
    if (aRes.ok) {
      const active = await aRes.json();
      if (active.length === 0) {
        activeSimsList.innerHTML = `<div class="empty-state"><p>No simulated peripherals currently attached.</p></div>`;
      } else {
        activeSimsList.innerHTML = active.map(a => `
          <div class="active-sim-item">
            <div>
              <div class="font-bold">${escapeHtml(a.device_name)}</div>
              <div class="text-sm text-muted font-mono">${a.hardware_id}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="simulateUnplug('${escapeHtml(a.hardware_id)}')">
              Unplug
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
// Interactive Approval & Rejection Workflows
// -------------------------------------------------------------
function promptDeviceApproval(device, promptText) {
  currentPendingDeviceId = device.id;

  document.getElementById('modal-prompt-text').textContent = promptText || "This device has not been registered. Do you want to approve it?";
  document.getElementById('modal-dev-name').textContent = device.device_name || "USB Human Interface Device";
  document.getElementById('modal-dev-mfg').textContent = device.manufacturer || "Standard USB Device";
  document.getElementById('modal-dev-vid').textContent = device.vendor_id || "Unavailable";
  document.getElementById('modal-dev-pid').textContent = device.product_id || "Unavailable";
  document.getElementById('modal-dev-serial').textContent = device.serial_number || "Unavailable";
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
      showToast(err.detail || 'Failed to approve device', 'danger');
    }
  } catch (e) {
    showToast('Network error while approving device', 'danger');
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
      showToast(err.detail || 'Failed to reject device', 'danger');
    }
  } catch (e) {
    showToast('Network error while rejecting device', 'danger');
  }
}

// -------------------------------------------------------------
// Revocation Workflow (FR-07)
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
      showToast(`Simulated connection: ${preset.device_name}`, 'info');
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
      showToast(`Simulated unplug: ${hardwareId}`, 'info');
      refreshAllData();
    }
  } catch (e) {
    showToast('Unplug simulation failed', 'danger');
  }
}

// -------------------------------------------------------------
// Helpers, UI Tabs, Events
// -------------------------------------------------------------
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
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
        showToast(`Connected custom device: ${payload.device_name}`, 'info');
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
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function renderStatusBadge(status) {
  switch (status) {
    case 'authenticated':
      return `<span class="badge badge-authenticated">● Authenticated</span>`;
    case 'pending_authentication':
      return `<span class="badge badge-pending">⏳ Pending</span>`;
    case 'rejected':
      return `<span class="badge badge-rejected">✕ Rejected</span>`;
    case 'trust_revoked':
      return `<span class="badge badge-revoked">⊘ Revoked</span>`;
    default:
      return `<span class="badge badge-not-auth">${status}</span>`;
  }
}

function renderEventBadge(type) {
  switch (type) {
    case 'approved':
      return `<span class="badge badge-authenticated">Approved</span>`;
    case 'rejected':
      return `<span class="badge badge-rejected">Rejected</span>`;
    case 'trust_revoked':
      return `<span class="badge badge-revoked">Trust Revoked</span>`;
    case 'auth_requested':
      return `<span class="badge badge-pending">Auth Requested</span>`;
    case 'detected':
      return `<span class="badge badge-not-auth">Detected</span>`;
    case 'connected':
      return `<span class="badge badge-connected">Connected</span>`;
    case 'disconnected':
      return `<span class="badge badge-disconnected">Disconnected</span>`;
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
      hour: '2-digit', minute: '2-digit', second: '2-digit'
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
      return keys.map(k => `${k}: ${details[k]}`).join(' | ');
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
