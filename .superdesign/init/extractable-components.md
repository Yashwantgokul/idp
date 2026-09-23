# HIDShield-X — Extractable Component Registry

These components are self-contained and suitable for modular extraction into standalone web components, React/Svelte components, or design canvas drafts:

1. **`DeviceCard`**
   - **Inputs:** `device_id`, `product_name`, `manufacturer`, `vendor_id`, `product_id`, `serial_number`, `interface_type`, `connection_type`, `status`.
   - **Emits:** `onApprove(deviceId)`, `onReject(deviceId)`, `onCopy(text)`.
   - **Contains:** Avatar icon, primary title, vendor subtitle, 2x2 micro-spec container, primary and decline actions.

2. **`KpiMetricCard`**
   - **Inputs:** `title`, `count`, `caption`, `badgeText`, `badgeVariant` (`active` | `warn` | `success`).
   - **Contains:** Uppercase tracked title, pill badge, tabular-figures count, secondary subtitle.

3. **`SaasTable`**
   - **Inputs:** `columns[]`, `rows[]`, `emptyMessage`, `onRowAction(row)`.
   - **Contains:** Tracked uppercase headers, hover row transitions, status pills, action buttons.

4. **`SearchInput`**
   - **Inputs:** `placeholder`, `keyboardShortcut`.
   - **Emits:** `onSearch(query)`.
   - **Contains:** Magnifying icon, input element, monospace shortcut kbd badge.

5. **`ToastNotification`**
   - **Inputs:** `message`, `type` (`success` | `info` | `warning` | `danger`), `duration`.
   - **Contains:** Subtle tinted border, semantic status SVG icon, dismissal timer.
