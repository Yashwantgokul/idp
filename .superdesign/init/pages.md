# HIDShield-X — Page Component Dependency Trees

## / (Workstation Dashboard)
**Entry:** `hidauthenticator/static/index.html`
**Runtime Logic:** `hidauthenticator/static/js/app.js`
**Styling System:** `hidauthenticator/static/css/style.css`

### Component Hierarchy:
- `app-shell`
  - `app-header`
    - `brand-mark`
    - `search-trigger` (`#device-search-input`)
    - `sync-indicator` (`#ws-dot`)
    - `host-pill` (`#platform-name`)
    - `btn-secondary` (`openSimulatorTab()`)
  - `main-workspace`
    - `metrics-rail`
      - `metric-card#kpi-connected`
      - `metric-card#kpi-pending`
      - `metric-card#kpi-trusted`
      - `metric-card#kpi-events`
    - `section-pending` (Authorization Queue)
      - `block-header` (`title-with-counter`)
      - `queue-container`
        - `empty-state-card#pending-empty`
        - `devices-grid#pending-cards`
          - `device-card` (dynamic instance per pending peripheral)
    - `registry-block`
      - `tab-control-bar` (`segmented-control`)
        - `segment-btn#tab-btn-trusted`
        - `segment-btn#tab-btn-all`
        - `segment-btn#tab-btn-history`
        - `segment-btn#tab-btn-simulator`
      - `tab-panel#tab-trusted`
        - `saas-table#trusted-table`
      - `tab-panel#tab-all-devices`
        - `saas-table#all-devices-table`
      - `tab-panel#tab-history`
        - `saas-table#history-table`
      - `tab-panel#tab-simulator`
        - `simulator-layout`
          - `preset-container`
          - `form#custom-sim-form`
          - `active-sims-container`
  - `app-footer`
  - `modal-backdrop#auth-modal`
  - `modal-backdrop#revoke-modal`
  - `toast-stack#toast-container`
