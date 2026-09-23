/**
 * HIDShield-X: Peripheral Trust Manager
 * Enterprise Frontend Controller & Real-Time Security Monitor
 */

// Application State
let currentPendingDeviceId = null;
let currentRevokeDeviceId = null;
let ws = null;
let reconnectTimer = null;
let searchQuery = '';
let currentQueueFilter = 'all';
let currentSystemMode = 'mock';
let enforcementState = { is_locked: false, gated_interfaces: [], pending_count: 0 };
let lockHudTimer = null;

function setQueueFilter(filter) {
  currentQueueFilter = filter;
  document.querySelectorAll('.queue-filter-pill').forEach(pill => {
    pill.classList.remove('active');
  });
  const activePill = document.getElementById(`filter-pill-${filter}`) || document.querySelector(`[data-filter="${filter}"]`);
  if (activePill) activePill.classList.add('active');
  loadPendingDevices();
}
window.setQueueFilter = setQueueFilter;

// DOM Elements
let wsDot, wsStatusText, platformBadge;
let countConnected, countPending, countTrusted, countEvents;
let pendingEmpty, pendingCards, pendingCountBadge;
let tabCountTrusted, tabCountAll, tabCountHistory;
let trustedTbody, allDevicesTbody, historyTbody, historyFilter, searchInput;
let presetContainer, activeSimsList, customSimForm;
let authModal, revokeModal, popupBannerContainer;

// Mode & Enforcement DOM Elements
let btnModeMock, btnModeReal, enforcementBadge, enforcementBadgeText;
let modeAwarenessBanner, modeBannerTagText, modeBannerDesc, btnScanHardware, btnClearSim;
let gatedInterfacesDisplay, gatedInterfacesText;
let keyboardStateBadge, keystrokeLockOverlay, sandboxKeystrokeInput, keystrokeStreamBox;
let mouseStateBadge, mouseLockOverlay, sandboxMousePad, mouseCrosshair, mouseCoords;
let workstationLockHud, lockHudText, modalDevSource;

function initDomReferences() {
  wsDot = document.getElementById('ws-dot');
  wsStatusText = document.getElementById('ws-status-text');
  platformBadge = document.getElementById('platform-name');

  countConnected = document.getElementById('count-connected');
  countPending = document.getElementById('count-pending');
  countTrusted = document.getElementById('count-trusted');
  countEvents = document.getElementById('count-events');

  pendingEmpty = document.getElementById('pending-empty');
  pendingCards = document.getElementById('pending-cards');
  pendingCountBadge = document.getElementById('pending-count-badge');

  tabCountTrusted = document.getElementById('tab-count-trusted');
  tabCountAll = document.getElementById('tab-count-all');
  tabCountHistory = document.getElementById('tab-count-history');

  trustedTbody = document.getElementById('trusted-tbody');
  allDevicesTbody = document.getElementById('all-devices-tbody');
  historyTbody = document.getElementById('history-tbody');
  historyFilter = document.getElementById('history-filter-type');
  searchInput = document.getElementById('device-search-input');

  presetContainer = document.getElementById('preset-container');
  activeSimsList = document.getElementById('active-sims-list');
  customSimForm = document.getElementById('custom-sim-form');

  authModal = document.getElementById('auth-modal');
  revokeModal = document.getElementById('revoke-modal');
  popupBannerContainer = document.getElementById('device-popup-container');

  btnModeMock = document.getElementById('btn-mode-mock');
  btnModeReal = document.getElementById('btn-mode-real');
  enforcementBadge = document.getElementById('enforcement-badge');
  enforcementBadgeText = document.getElementById('enforcement-badge-text');

  modeAwarenessBanner = document.getElementById('mode-awareness-banner');
  modeBannerTagText = document.getElementById('mode-banner-tag-text');
  modeBannerDesc = document.getElementById('mode-banner-desc');
  btnScanHardware = document.getElementById('btn-scan-hardware');
  btnClearSim = document.getElementById('btn-clear-sim');

  gatedInterfacesDisplay = document.getElementById('gated-interfaces-display');
  gatedInterfacesText = document.getElementById('gated-interfaces-text');

  keyboardStateBadge = document.getElementById('keyboard-state-badge');
  keystrokeLockOverlay = document.getElementById('keystroke-lock-overlay');
  sandboxKeystrokeInput = document.getElementById('sandbox-keystroke-input');
  keystrokeStreamBox = document.getElementById('keystroke-stream-box');

  mouseStateBadge = document.getElementById('mouse-state-badge');
  mouseLockOverlay = document.getElementById('mouse-lock-overlay');
  sandboxMousePad = document.getElementById('sandbox-mouse-pad');
  mouseCrosshair = document.getElementById('mouse-crosshair');
  mouseCoords = document.getElementById('mouse-coords');

  workstationLockHud = document.getElementById('workstation-lock-hud');
  lockHudText = document.getElementById('lock-hud-text');
  modalDevSource = document.getElementById('modal-dev-source');
}

// Init
async function init() {
  initDomReferences();
  setupTabs();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupNotificationPermissions();
  setupSandboxTesters();
  setupGlobalInputLockTrap();
  await loadSystemStatus();
  await loadSystemMode();
  await refreshAllData();
  await loadEnforcementStatus();
  initWebSocket();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// -------------------------------------------------------------
// Browser Desktop Notification & Sound Feedback
// -------------------------------------------------------------
function setupNotificationPermissions() {
  if ('Notification' in window && Notification.permission === 'default') {
    const requestPerm = () => {
      Notification.requestPermission();
      document.removeEventListener('click', requestPerm);
    };
    document.addEventListener('click', requestPerm, { once: true });
  }
}

function sendDesktopNotification(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, {
        body: body,
        tag: 'hidshield-device-alert',
        silent: false
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  } catch (e) {
    console.debug('Browser desktop notification skipped:', e);
  }
}

function playArrivalChime(type = 'review') {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';

    if (type === 'review') {
      // Urgent but pleasant double-ping
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } else {
      // Soft harmonious chord (C5 -> E5)
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.33);
    }
  } catch (e) {
    // Audio is non-blocking enhancement
  }
}

// -------------------------------------------------------------
// On-Screen Device Arrival Popup Banner
// -------------------------------------------------------------
function showDeviceArrivalBanner(device, mode = 'review') {
  const container = document.getElementById('device-popup-container');
  if (!container || !device) return;

  const bannerId = `arrival-banner-${device.id || Date.now()}`;
  const existing = document.getElementById(bannerId);
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = bannerId;
  banner.className = `device-arrival-banner banner-${mode === 'review' ? 'review' : 'trusted'}`;

  const iconSvg = getDeviceSvgIcon(device.interface_type, device.device_name);
  const vidPid = formatVidPid(device.vendor_id, device.product_id);
  const topology = device.connection_type || 'USB';
  const iface = device.interface_type || 'Peripheral';
  const badgeTitle = mode === 'review' ? 'Peripheral Plugged In &bull; Review Required' : 'Trusted Peripheral Connected';

  banner.innerHTML = `
    <div class="banner-top-row">
      <span class="banner-status-badge">
        <span class="banner-status-dot"></span>
        <span>${badgeTitle}</span>
      </span>
      <button class="banner-close-btn" aria-label="Dismiss banner" onclick="dismissArrivalBanner('${bannerId}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="banner-body-row">
      <div class="banner-device-icon">${iconSvg}</div>
      <div class="banner-device-details">
        <div class="banner-device-title">${escapeHtml(device.device_name || 'USB HID Peripheral')}</div>
        <div class="banner-device-meta">
          <span class="banner-meta-tag">${escapeHtml(iface)}</span>
          <span class="banner-meta-tag">${vidPid}</span>
          <span class="banner-meta-tag">${escapeHtml(topology)}</span>
        </div>
      </div>
    </div>
    <div class="banner-actions">
      ${mode === 'review' ? `
        <button class="banner-btn banner-btn-ghost" onclick="openSpecModalFromBanner('${device.id}')">
          Inspect Specs
        </button>
        <button class="banner-btn banner-btn-primary" onclick="approveFromBanner('${device.id}', '${bannerId}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Authorize Now
        </button>
      ` : `
        <button class="banner-btn banner-btn-ghost" onclick="focusDeviceInRegistry('${device.id}', '${bannerId}')">
          View in Registry
        </button>
        <button class="banner-btn banner-btn-primary" onclick="dismissArrivalBanner('${bannerId}')">
          Dismiss
        </button>
      `}
    </div>
    <div class="banner-progress-track">
      <div class="banner-progress-bar"></div>
    </div>
  `;

  container.appendChild(banner);

  const timer = setTimeout(() => {
    dismissArrivalBanner(bannerId);
  }, 6500);
  banner._timer = timer;
}

function dismissArrivalBanner(bannerId) {
  const banner = document.getElementById(bannerId);
  if (!banner) return;
  if (banner._timer) clearTimeout(banner._timer);
  banner.classList.add('banner-exit');
  setTimeout(() => {
    if (banner.parentNode) banner.remove();
  }, 200);
}

function openSpecModalFromBanner(deviceId) {
  fetch(`/api/devices/${deviceId}`)
    .then(r => r.json())
    .then(dev => {
      promptDeviceApproval(dev, "This peripheral is plugged in. Authorize for this workstation?");
    })
    .catch(err => console.error('Failed to open device spec modal:', err));
}

async function approveFromBanner(deviceId, bannerId) {
  dismissArrivalBanner(bannerId);
  await handleApproveDevice(deviceId);
}

function focusDeviceInRegistry(deviceId, bannerId) {
  dismissArrivalBanner(bannerId);
  const tabTrusted = document.querySelector('[data-tab="tab-trusted"]');
  if (tabTrusted) tabTrusted.click();
}

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
      console.error('Failed to parse WebSocket packet', e);
    }
  };

  ws.onclose = () => {
    wsDot.classList.remove('online');
    wsStatusText.textContent = 'Reconnecting';
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
    case 'system_mode_changed':
      applySystemModeUi(data.mode);
      showToast(`Mode switched to ${data.mode === 'real' ? 'Real Hardware' : 'Mock Simulation'}`, 'info');
      refreshAllData();
      loadEnforcementStatus();
      break;

    case 'enforcement_state_changed':
      if (data.enforcement) {
        applyEnforcementStateUi(data.enforcement);
      }
      break;

    case 'auth_requested':
      showToast(`Authorization required: ${data.device.device_name || 'USB HID'}`, 'warning');
      showDeviceArrivalBanner(data.device, 'review');
      playArrivalChime('review');
      sendDesktopNotification(
        'HIDShield-X: Authorization Required',
        `New peripheral '${data.device.device_name}' plugged in. Approval required.`
      );
      refreshAllData();
      loadEnforcementStatus();
      promptDeviceApproval(data.device, data.prompt);
      break;

    case 'device_connected':
      const isAuth = data.device && data.device.status === 'authenticated';
      showDeviceArrivalBanner(data.device, isAuth ? 'trusted' : 'review');
      playArrivalChime(isAuth ? 'trusted' : 'review');
      sendDesktopNotification(
        isAuth ? 'HIDShield-X: Device Connected' : 'HIDShield-X: Peripheral Plugged In',
        `${data.device.device_name} attached (${isAuth ? 'Authorized' : 'Review Required'})`
      );
      showToast(`Connected: ${data.device.device_name}`, isAuth ? 'success' : 'info');
      refreshAllData();
      loadEnforcementStatus();
      break;

    case 'device_approved':
      showToast(`Authorized: ${data.device.device_name}`, 'success');
      refreshAllData();
      loadEnforcementStatus();
      break;

    case 'device_rejected':
      showToast(`Declined: ${data.device.device_name}`, 'danger');
      refreshAllData();
      loadEnforcementStatus();
      break;

    case 'trust_revoked':
      showToast(`Trust revoked: ${data.device.device_name}`, 'info');
      refreshAllData();
      loadEnforcementStatus();
      break;

    case 'device_disconnected':
      showToast(`Detached: ${data.device.device_name}`, 'info');
      refreshAllData();
      loadEnforcementStatus();
      break;

    default:
      refreshAllData();
      loadEnforcementStatus();
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
      if (data.mode) {
        applySystemModeUi(data.mode);
      }
    }
  } catch (e) {
    console.error('Failed to load system status', e);
  }
}

async function loadSystemMode() {
  try {
    const res = await fetch('/api/system/mode');
    if (res.ok) {
      const data = await res.json();
      applySystemModeUi(data.mode);
    }
  } catch (e) {
    console.error('Failed to load system mode', e);
  }
}

async function refreshAllData() {
  await Promise.all([
    loadStats(),
    loadPendingDevices(),
    loadTrustedDevices(),
    loadAllDevices(),
    loadHistory(),
    loadSimulatorData(),
    loadEnforcementStatus()
  ]);
}

async function loadStats() {
  try {
    const res = await fetch(`/api/devices/stats?source=${encodeURIComponent(currentSystemMode)}`);
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
    const res = await fetch(`/api/devices?status=pending_authentication&source=${encodeURIComponent(currentSystemMode)}`);
    if (res.ok) {
      let devices = await res.json();
      pendingCountBadge.textContent = devices.length;


      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        devices = devices.filter(d => 
          (d.device_name && d.device_name.toLowerCase().includes(q)) ||
          (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) ||
          (d.vendor_id && d.vendor_id.toLowerCase().includes(q)) ||
          (d.product_id && d.product_id.toLowerCase().includes(q))
        );
      }

      // Compute category counts for filter pills
      const countAll = devices.length;
      const countKeyboards = devices.filter(d => 
        (d.interface_type && d.interface_type.toLowerCase() === 'keyboard') ||
        (d.device_name && d.device_name.toLowerCase().includes('keyboard'))
      ).length;
      const countMice = devices.filter(d => 
        (d.interface_type && d.interface_type.toLowerCase() === 'mouse') ||
        (d.device_name && (d.device_name.toLowerCase().includes('mouse') || d.device_name.toLowerCase().includes('touch pad') || d.device_name.toLowerCase().includes('trackpad')))
      ).length;
      const countOther = countAll - countKeyboards - countMice;

      const elAll = document.getElementById('filter-count-all');
      const elKb = document.getElementById('filter-count-keyboard');
      const elMouse = document.getElementById('filter-count-mouse');
      const elOther = document.getElementById('filter-count-other');
      if (elAll) elAll.textContent = countAll;
      if (elKb) elKb.textContent = countKeyboards;
      if (elMouse) elMouse.textContent = countMice;
      if (elOther) elOther.textContent = Math.max(0, countOther);

      // Apply category filter
      let filteredDevices = devices;
      if (currentQueueFilter === 'Keyboard') {
        filteredDevices = devices.filter(d => 
          (d.interface_type && d.interface_type.toLowerCase() === 'keyboard') ||
          (d.device_name && d.device_name.toLowerCase().includes('keyboard'))
        );
      } else if (currentQueueFilter === 'Mouse') {
        filteredDevices = devices.filter(d => 
          (d.interface_type && d.interface_type.toLowerCase() === 'mouse') ||
          (d.device_name && (d.device_name.toLowerCase().includes('mouse') || d.device_name.toLowerCase().includes('touch pad') || d.device_name.toLowerCase().includes('trackpad')))
        );
      } else if (currentQueueFilter === 'HID') {
        filteredDevices = devices.filter(d => 
          !(d.interface_type && d.interface_type.toLowerCase() === 'keyboard') &&
          !(d.device_name && d.device_name.toLowerCase().includes('keyboard')) &&
          !(d.interface_type && d.interface_type.toLowerCase() === 'mouse') &&
          !(d.device_name && (d.device_name.toLowerCase().includes('mouse') || d.device_name.toLowerCase().includes('touch pad') || d.device_name.toLowerCase().includes('trackpad')))
        );
      }

      if (filteredDevices.length === 0) {
        pendingEmpty.style.display = 'block';
        pendingCards.innerHTML = '';
      } else {
        pendingEmpty.style.display = 'none';
        pendingCards.innerHTML = filteredDevices.map(d => renderDeviceCard(d)).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load pending queue', e);
  }
}

function renderDeviceCard(device) {
  const icon = getDeviceSvgIcon(device.interface_type, device.device_name);
  const formattedVidPid = formatVidPid(device.vendor_id, device.product_id);

  return `
    <div class="device-card status-pending" id="device-card-${device.id}">
      <div class="device-card-head">
        <div class="device-avatar">${icon}</div>
        <div class="device-main-info">
          <div class="device-primary-title" title="${escapeHtml(device.device_name || 'USB HID Peripheral')}">
            ${escapeHtml(device.device_name || 'USB HID Peripheral')}
          </div>
          <div class="device-vendor-sub">${escapeHtml(device.manufacturer || 'Standard USB Peripheral')}</div>
        </div>
      </div>

      <div class="device-spec-box">
        <div class="spec-cell">
          <span class="spec-k">Hardware ID</span>
          <span class="spec-v font-mono copyable-chip" onclick="copyToClipboard('${formattedVidPid}', 'Hardware ID')">
            ${formattedVidPid}
          </span>
        </div>
        <div class="spec-cell">
          <span class="spec-k">Interface</span>
          <span class="spec-v">${device.interface_type || 'HID'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-k">Serial</span>
          <span class="spec-v font-mono">${device.serial_number || 'None'}</span>
        </div>
        <div class="spec-cell">
          <span class="spec-k">Connection</span>
          <span class="spec-v">${device.connection_type || 'Direct USB'}</span>
        </div>
      </div>

      <div class="device-card-footer">
        <button class="btn btn-danger-ghost btn-sm" style="flex:1" onclick="handleRejectDevice(${device.id})">
          Decline
        </button>
        <button class="btn btn-primary btn-sm" style="flex:1.4" onclick="handleApproveDevice(${device.id})">
          Authorize Device
        </button>
      </div>
    </div>
  `;
}

async function loadTrustedDevices() {
  try {
    const res = await fetch(`/api/devices?status=authenticated&source=${encodeURIComponent(currentSystemMode)}`);
    if (res.ok) {
      let devices = await res.json();
      tabCountTrusted.textContent = devices.length;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        devices = devices.filter(d => 
          (d.device_name && d.device_name.toLowerCase().includes(q)) ||
          (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) ||
          (d.vendor_id && d.vendor_id.toLowerCase().includes(q)) ||
          (d.product_id && d.product_id.toLowerCase().includes(q))
        );
      }

      if (devices.length === 0) {
        trustedTbody.innerHTML = `<tr><td colspan="7" class="empty-table-row">No trusted devices registered yet. Authorize devices from the queue above.</td></tr>`;
      } else {
        trustedTbody.innerHTML = devices.map(d => {
          const formattedVidPid = formatVidPid(d.vendor_id, d.product_id);
          return `
            <tr>
              <td>
                <div class="font-bold">${escapeHtml(d.device_name || 'Generic Device')}</div>
                <div class="text-xs text-muted">${escapeHtml(d.manufacturer || 'Standard Peripheral')}</div>
              </td>
              <td class="font-mono text-sm copyable-chip" onclick="copyToClipboard('${formattedVidPid}', 'Hardware ID')">
                ${formattedVidPid}
              </td>
              <td class="font-mono text-xs">${d.serial_number || '<span class="text-muted">None</span>'}</td>
              <td>${escapeHtml(d.interface_type || 'HID')}</td>
              <td>
                <span class="status-pill ${d.is_connected ? 'pill-authorized' : 'pill-offline'}">
                  ${d.is_connected ? 'Active' : 'Offline'}
                </span>
              </td>
              <td class="text-xs font-mono">${formatDate(d.approved_at)}</td>
              <td class="text-right">
                <button class="btn btn-danger-ghost btn-sm" onclick="promptRevokeTrust(${d.id}, '${escapeHtml(d.device_name || '')}', '${formattedVidPid}')">
                  Revoke
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load trusted devices', e);
  }
}

async function loadAllDevices() {
  try {
    const res = await fetch(`/api/devices?source=${encodeURIComponent(currentSystemMode)}`);
    if (res.ok) {
      let devices = await res.json();
      tabCountAll.textContent = devices.length;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        devices = devices.filter(d => 
          (d.device_name && d.device_name.toLowerCase().includes(q)) ||
          (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) ||
          (d.vendor_id && d.vendor_id.toLowerCase().includes(q)) ||
          (d.product_id && d.product_id.toLowerCase().includes(q))
        );
      }

      if (devices.length === 0) {
        allDevicesTbody.innerHTML = `<tr><td colspan="7" class="empty-table-row">No hardware devices recorded.</td></tr>`;
      } else {
        allDevicesTbody.innerHTML = devices.map(d => {
          const formattedVidPid = formatVidPid(d.vendor_id, d.product_id);
          return `
            <tr>
              <td>${renderStatusBadge(d.status)}</td>
              <td>
                <div class="font-bold">${escapeHtml(d.device_name || 'Generic Device')}</div>
                <div class="text-xs text-muted">${escapeHtml(d.manufacturer || 'Standard Peripheral')}</div>
              </td>
              <td class="font-mono text-sm copyable-chip" onclick="copyToClipboard('${formattedVidPid}', 'Hardware ID')">
                ${formattedVidPid}
              </td>
              <td class="font-mono text-xs">${d.serial_number || '<span class="text-muted">None</span>'}</td>
              <td>${d.interface_type || 'HID'}</td>
              <td>
                <span class="${d.is_connected ? 'text-emerald' : 'text-muted'} font-bold text-xs">
                  ${d.is_connected ? 'Connected' : 'Offline'}
                </span>
              </td>
              <td class="text-right">
                ${renderDeviceActionButtons(d, formattedVidPid)}
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load all devices', e);
  }
}

function renderDeviceActionButtons(d, formattedVidPid) {
  if (d.status === 'authenticated') {
    return `<button class="btn btn-danger-ghost btn-sm" onclick="promptRevokeTrust(${d.id}, '${escapeHtml(d.device_name || '')}', '${formattedVidPid}')">Revoke</button>`;
  } else if (d.status === 'pending_authentication' || d.status === 'trust_revoked' || d.status === 'rejected') {
    return `<button class="btn btn-primary btn-sm" onclick="handleApproveDevice(${d.id})">Authorize</button>`;
  }
  return '-';
}

async function loadHistory() {
  try {
    const filter = historyFilter.value;
    let url = `/api/events?limit=50&source=${encodeURIComponent(currentSystemMode)}`;
    if (filter) {
      url += `&event_type=${filter}`;
    }

    const res = await fetch(url);
    if (res.ok) {
      const events = await res.json();
      tabCountHistory.textContent = events.length;


      if (events.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="5" class="empty-table-row">No audit records found.</td></tr>`;
      } else {
        historyTbody.innerHTML = events.map(e => `
          <tr>
            <td class="text-xs font-mono text-muted">${formatDate(e.timestamp)}</td>
            <td>${renderEventBadge(e.event_type)}</td>
            <td class="font-bold">${escapeHtml(e.device_name || 'System Endpoint')}</td>
            <td class="font-mono text-xs">${formatVidPid(e.vendor_id, e.product_id)}</td>
            <td class="text-xs text-muted">${formatDetails(e.details)}</td>
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
        <div class="preset-chip-card">
          <div>
            <div class="preset-name">${escapeHtml(p.device_name)}</div>
            <div class="preset-desc">${p.vendor_id}:${p.product_id} &bull; ${escapeHtml(p.manufacturer)}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="simulatePresetPlugIn(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            Attach Endpoint
          </button>
        </div>
      `).join('');
    }

    const aRes = await fetch('/api/simulator/active');
    if (aRes.ok) {
      const active = await aRes.json();
      if (active.length === 0) {
        activeSimsList.innerHTML = `<div class="empty-sim-state"><div class="empty-sim-text">No simulated endpoints attached. Select a preset on the left to inject a test connection.</div></div>`;
      } else {
        activeSimsList.innerHTML = active.map(a => `
          <div class="active-sim-chip">
            <div>
              <div class="font-bold text-sm">${escapeHtml(a.device_name)}</div>
              <div class="text-xs text-muted font-mono">${a.hardware_id}</div>
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
// Interactive Approval & Revocation
// -------------------------------------------------------------
function promptDeviceApproval(device, promptText) {
  if (!device) return;
  currentPendingDeviceId = device.id;

  const titleEl = document.getElementById('modal-title-text');
  if (titleEl) {
    titleEl.textContent = `HID Authenticator • ${escapeHtml(device.interface_type || 'Peripheral')} Authorization`;
  }
  document.getElementById('modal-prompt-text').textContent = promptText || "Untrusted peripheral detected. Input access is locked until authorized.";
  document.getElementById('modal-dev-name').textContent = device.device_name || "USB Peripheral";
  document.getElementById('modal-dev-mfg').textContent = device.manufacturer || "Standard USB Device";
  document.getElementById('modal-dev-vidpid').textContent = formatVidPid(device.vendor_id, device.product_id);
  document.getElementById('modal-dev-serial').textContent = device.serial_number || "None";
  document.getElementById('modal-dev-interface').textContent = device.interface_type || "HID";
  
  const elSource = document.getElementById('modal-dev-source');
  if (elSource) {
    elSource.textContent = (device.source === 'real' || !device.source)
      ? 'Physical Host Hardware (Windows WMI)'
      : 'Virtual Emulation Endpoint';
  }

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
      showToast('Peripheral authorized & input unlocked', 'success');
      await refreshAllData();
      await loadEnforcementStatus();
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
      showToast('Peripheral declined; input remains blocked', 'danger');
      await refreshAllData();
      await loadEnforcementStatus();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Decline failed', 'danger');
    }
  } catch (e) {
    showToast('Network error while declining device', 'danger');
  }
}


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
      showToast(`Attached virtual peripheral: ${preset.device_name}`, 'info');
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
      showToast(`Detached virtual endpoint`, 'info');
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
  const tabs = document.querySelectorAll('.segment-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

function openSimulatorTab() {
  const simTabBtn = document.getElementById('tab-btn-simulator');
  if (simTabBtn) {
    simTabBtn.click();
    simTabBtn.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setupEventListeners() {
  const btnApprove = document.getElementById('modal-btn-approve');
  if (btnApprove) {
    btnApprove.addEventListener('click', () => {
      if (currentPendingDeviceId) handleApproveDevice(currentPendingDeviceId);
    });
  }

  const btnReject = document.getElementById('modal-btn-reject');
  if (btnReject) {
    btnReject.addEventListener('click', () => {
      if (currentPendingDeviceId) handleRejectDevice(currentPendingDeviceId);
    });
  }

  const btnRevoke = document.getElementById('revoke-btn-confirm');
  if (btnRevoke) btnRevoke.addEventListener('click', confirmRevokeTrust);

  const btnRefresh = document.getElementById('btn-global-refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', refreshAllData);

  if (historyFilter) historyFilter.addEventListener('change', loadHistory);

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      loadPendingDevices();
      loadTrustedDevices();
      loadAllDevices();
    });
  }

  if (customSimForm) {
    customSimForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        device_name: document.getElementById('custom-name') ? document.getElementById('custom-name').value : '',
        manufacturer: document.getElementById('custom-mfg') ? document.getElementById('custom-mfg').value || null : null,
        vendor_id: document.getElementById('custom-vid') ? document.getElementById('custom-vid').value || null : null,
        product_id: document.getElementById('custom-pid') ? document.getElementById('custom-pid').value || null : null,
        serial_number: document.getElementById('custom-serial') ? document.getElementById('custom-serial').value || null : null,
        interface_type: document.getElementById('custom-interface') ? document.getElementById('custom-interface').value : 'Keyboard',
        connection_type: document.getElementById('custom-conn') ? document.getElementById('custom-conn').value : 'USB'
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
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K to focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (searchInput) searchInput.focus();
    }
    // Esc to close modal
    if (e.key === 'Escape') {
      if (authModal.classList.contains('show')) closeAuthModal();
      if (revokeModal.classList.contains('show')) closeRevokeModal();
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

function copyToClipboard(text, label) {
  if (!text || text === '—' || text === '-') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${label}: ${text}`, 'info');
  });
}

function formatVidPid(vid, pid) {
  if (!vid && !pid) return '-';
  const v = vid ? (vid.startsWith('0x') ? vid : `0x${vid.toUpperCase()}`) : '0x????';
  const p = pid ? (pid.startsWith('0x') ? pid : `0x${pid.toUpperCase()}`) : '0x????';
  return `${v}:${p}`;
}

function getDeviceSvgIcon(interfaceType, name) {
  const t = (interfaceType || '').toLowerCase();
  const n = (name || '').toLowerCase();

  if (t.includes('keyboard') || n.includes('keyboard')) {
    return `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"></path>
      </svg>
    `;
  }
  if (t.includes('mouse') || n.includes('mouse') || n.includes('pointing')) {
    return `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="2" width="14" height="20" rx="7"></rect>
        <path d="M12 6v4"></path>
      </svg>
    `;
  }
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="6" width="20" height="12" rx="3"></rect>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  `;
}

function renderStatusBadge(status) {
  switch (status) {
    case 'authenticated':
      return `<span class="status-pill pill-authorized">Authorized</span>`;
    case 'pending_authentication':
      return `<span class="status-pill pill-review">Review</span>`;
    case 'rejected':
      return `<span class="status-pill pill-declined">Declined</span>`;
    case 'trust_revoked':
      return `<span class="status-pill pill-revoked">Revoked</span>`;
    default:
      return `<span class="status-pill">${status}</span>`;
  }
}

function renderEventBadge(type) {
  switch (type) {
    case 'approved':
      return `<span class="status-pill pill-authorized">Approved</span>`;
    case 'rejected':
      return `<span class="status-pill pill-declined">Declined</span>`;
    case 'trust_revoked':
      return `<span class="status-pill pill-revoked">Revoked</span>`;
    case 'auth_requested':
      return `<span class="status-pill pill-review">Review Required</span>`;
    case 'detected':
      return `<span class="status-pill">Detected</span>`;
    case 'connected':
      return `<span class="status-pill pill-authorized">Connected</span>`;
    case 'disconnected':
      return `<span class="status-pill pill-offline">Disconnected</span>`;
    default:
      return `<span class="status-pill">${type}</span>`;
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
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

// -------------------------------------------------------------
// System Mode & Workstation Input Gating Helpers
// -------------------------------------------------------------
async function switchSystemMode(newMode) {
  try {
    const res = await fetch('/api/system/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode })
    });
    if (res.ok) {
      const data = await res.json();
      applySystemModeUi(data.mode);
      showToast(`Switched to ${data.mode === 'real' ? 'Real Hardware' : 'Mock Simulation'} Mode`, 'info');
      await refreshAllData();
      await loadEnforcementStatus();

      if (data.mode === 'real') {
        showToast('Real-time physical HID scan active', 'success');
      }
    }
  } catch (e) {
    showToast('Failed to switch system mode', 'danger');
  }
}

async function triggerHardwareScan() {
  showToast('Scanning host physical peripherals (WMI)...', 'info');
  await switchSystemMode('real');
}

async function clearAllSimulations() {
  try {
    const res = await fetch('/api/simulator/clear', { method: 'POST' });
    if (res.ok) {
      showToast('All virtual endpoints cleared', 'info');
      await refreshAllData();
      await loadEnforcementStatus();
    }
  } catch (e) {
    showToast('Failed to clear virtual endpoints', 'danger');
  }
}

function applySystemModeUi(mode) {
  currentSystemMode = mode;

  if (btnModeMock && btnModeReal) {
    if (mode === 'real') {
      btnModeReal.classList.add('active');
      btnModeReal.setAttribute('aria-checked', 'true');
      btnModeMock.classList.remove('active');
      btnModeMock.setAttribute('aria-checked', 'false');
    } else {
      btnModeMock.classList.add('active');
      btnModeMock.setAttribute('aria-checked', 'true');
      btnModeReal.classList.remove('active');
      btnModeReal.setAttribute('aria-checked', 'false');
    }
  }

  if (modeAwarenessBanner) {
    if (mode === 'real') {
      modeAwarenessBanner.className = 'mode-awareness-banner banner-real';
      if (modeBannerTagText) modeBannerTagText.textContent = 'LIVE HARDWARE ENVIRONMENT';
      if (modeBannerDesc) modeBannerDesc.textContent = 'Host Peripheral Monitoring Active: Real physical USB keyboards, mice, and HID controllers on this workstation are monitored in real time.';
      if (btnScanHardware) btnScanHardware.style.display = 'inline-flex';
      if (btnClearSim) btnClearSim.style.display = 'none';
    } else {
      modeAwarenessBanner.className = 'mode-awareness-banner banner-mock';
      if (modeBannerTagText) modeBannerTagText.textContent = 'MOCK SIMULATION ENVIRONMENT';
      if (modeBannerDesc) modeBannerDesc.textContent = 'Isolating physical peripherals: Operating in simulation mode to test USB arrival, matching rules, and authorization policies without affecting local hardware.';
      if (btnScanHardware) btnScanHardware.style.display = 'none';
      if (btnClearSim) btnClearSim.style.display = 'inline-flex';
    }
  }
}

async function loadEnforcementStatus() {
  try {
    const res = await fetch('/api/system/enforcement');
    if (res.ok) {
      const status = await res.json();
      applyEnforcementStateUi(status);
    }
  } catch (e) {
    console.error('Failed to load enforcement status', e);
  }
}

function applyEnforcementStateUi(status) {
  enforcementState = status;

  if (enforcementBadge && enforcementBadgeText) {
    if (status.is_locked) {
      enforcementBadge.className = 'enforcement-indicator-pill pill-locked';
      enforcementBadgeText.textContent = `INPUT GATED (${status.pending_count})`;
    } else {
      enforcementBadge.className = 'enforcement-indicator-pill pill-unlocked';
      enforcementBadgeText.textContent = 'Workstation Unlocked';
    }
  }

  if (gatedInterfacesDisplay && gatedInterfacesText) {
    if (status.is_locked) {
      gatedInterfacesDisplay.classList.add('gated-active');
      const ifaces = status.gated_interfaces.length > 0 ? status.gated_interfaces.join(', ') : 'All HID';
      gatedInterfacesText.textContent = `Gated Endpoints: ${ifaces}`;
    } else {
      gatedInterfacesDisplay.classList.remove('gated-active');
      gatedInterfacesText.textContent = 'All Endpoints Permitted';
    }
  }

  const isKbGated = status.is_locked && (status.gated_interfaces.includes('Keyboard') || status.gated_interfaces.length === 0);
  const isMouseGated = status.is_locked && (status.gated_interfaces.includes('Mouse') || status.gated_interfaces.length === 0);

  if (keyboardStateBadge) {
    keyboardStateBadge.className = `sandbox-state-badge ${isKbGated ? 'badge-locked' : 'badge-unlocked'}`;
    keyboardStateBadge.textContent = isKbGated ? 'LOCKED' : 'UNLOCKED';
  }
  if (keystrokeLockOverlay) {
    if (isKbGated) keystrokeLockOverlay.classList.add('active');
    else keystrokeLockOverlay.classList.remove('active');
  }

  if (mouseStateBadge) {
    mouseStateBadge.className = `sandbox-state-badge ${isMouseGated ? 'badge-locked' : 'badge-unlocked'}`;
    mouseStateBadge.textContent = isMouseGated ? 'LOCKED' : 'UNLOCKED';
  }
  if (mouseLockOverlay) {
    if (isMouseGated) mouseLockOverlay.classList.add('active');
    else mouseLockOverlay.classList.remove('active');
  }

  // If there are pending devices and modal is not open, pop it up
  if (status.is_locked && status.pending_devices && status.pending_devices.length > 0) {
    if (authModal && !authModal.classList.contains('show')) {
      promptDeviceApproval(status.pending_devices[0]);
    }
  }
}

function setupGlobalInputLockTrap() {
  window.addEventListener('keydown', (e) => {
    // If auth modal is open, or focused inside an input/button or search bar, allow it
    if (authModal && authModal.classList.contains('show')) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT')) return;

    if (enforcementState.is_locked) {
      if (enforcementState.gated_interfaces.includes('Keyboard') || enforcementState.gated_interfaces.length === 0) {
        showWorkstationLockHud('⚠️ WORKSTATION LOCKED: Untrusted peripheral detected. Approve in the popup to unlock typing.');
        playArrivalChime('review');
      }
    }
  }, true);
}

function showWorkstationLockHud(text) {
  if (!workstationLockHud) return;
  if (lockHudText) lockHudText.textContent = text;
  workstationLockHud.classList.add('show');
  if (lockHudTimer) clearTimeout(lockHudTimer);
  lockHudTimer = setTimeout(() => {
    workstationLockHud.classList.remove('show');
  }, 2400);
}

function setupSandboxTesters() {
  if (sandboxKeystrokeInput) {
    sandboxKeystrokeInput.addEventListener('keydown', (e) => {
      // Ignore Tab, Shift, Ctrl, Alt alone
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;

      const isKbGated = enforcementState.is_locked && (enforcementState.gated_interfaces.includes('Keyboard') || enforcementState.gated_interfaces.length === 0);

      if (isKbGated) {
        e.preventDefault();
        showWorkstationLockHud('⚠️ KEYSTROKE INTERCEPTED: Peripheral Authorization Required');
        playArrivalChime('review');

        const line = document.createElement('div');
        line.className = 'stream-line stream-blocked';
        line.innerHTML = `⛔ [${new Date().toLocaleTimeString()}] BLOCKED KEY <kbd>${escapeHtml(e.key)}</kbd> &bull; UNAUTHORIZED PERIPHERAL GATED`;
        if (keystrokeStreamBox) {
          keystrokeStreamBox.insertBefore(line, keystrokeStreamBox.firstChild);
          if (keystrokeStreamBox.children.length > 20) keystrokeStreamBox.removeChild(keystrokeStreamBox.lastChild);
        }
      } else {
        const line = document.createElement('div');
        line.className = 'stream-line stream-success';
        line.innerHTML = `✅ [${new Date().toLocaleTimeString()}] ACCEPTED <kbd>${escapeHtml(e.key)}</kbd> &bull; Trusted Peripheral Verified (1.2ms latency)`;
        if (keystrokeStreamBox) {
          keystrokeStreamBox.insertBefore(line, keystrokeStreamBox.firstChild);
          if (keystrokeStreamBox.children.length > 20) keystrokeStreamBox.removeChild(keystrokeStreamBox.lastChild);
        }
      }
    });
  }

  if (sandboxMousePad) {
    sandboxMousePad.addEventListener('mousemove', (e) => {
      const rect = sandboxMousePad.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);

      const isMouseGated = enforcementState.is_locked && (enforcementState.gated_interfaces.includes('Mouse') || enforcementState.gated_interfaces.length === 0);

      if (isMouseGated) {
        if (mouseCrosshair) mouseCrosshair.style.display = 'none';
        if (mouseCoords) mouseCoords.textContent = 'Position: MOTION GATED';
      } else {
        if (mouseCrosshair) {
          mouseCrosshair.style.display = 'block';
          mouseCrosshair.style.left = `${x}px`;
          mouseCrosshair.style.top = `${y}px`;
        }
        if (mouseCoords) mouseCoords.textContent = `Position: X: ${x}px  Y: ${y}px  (Verified Live Input)`;
      }
    });

    sandboxMousePad.addEventListener('mouseleave', () => {
      if (mouseCrosshair) mouseCrosshair.style.display = 'none';
      if (mouseCoords) mouseCoords.textContent = 'Position: X: - Y: -';
    });
  }
}

// Global Window Bindings for HTML Event Triggers
window.openSimulatorTab = openSimulatorTab;
window.closeAuthModal = closeAuthModal;
window.closeRevokeModal = closeRevokeModal;
window.copyToClipboard = copyToClipboard;
window.handleApproveDevice = handleApproveDevice;
window.handleRejectDevice = handleRejectDevice;
window.promptRevokeTrust = promptRevokeTrust;
window.confirmRevokeTrust = confirmRevokeTrust;
window.simulatePresetPlugIn = simulatePresetPlugIn;
window.simulateQuickPreset = simulatePresetPlugIn;
window.simulateUnplug = simulateUnplug;
window.dismissArrivalBanner = dismissArrivalBanner;
window.openSpecModalFromBanner = openSpecModalFromBanner;
window.approveFromBanner = approveFromBanner;
window.focusDeviceInRegistry = focusDeviceInRegistry;
window.setQueueFilter = setQueueFilter;
window.refreshAllData = refreshAllData;
window.switchSystemMode = switchSystemMode;
window.triggerHardwareScan = triggerHardwareScan;
window.clearAllSimulations = clearAllSimulations;
window.showWorkstationLockHud = showWorkstationLockHud;



