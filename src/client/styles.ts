/**
 * Dashboard + sidebar-entry styles, injected as a single `<style>` tag.
 *
 * Plain CSS (no CSS-module build pipeline): the class names below are
 * globally unique (`dsh-tu-*`) and scoped by the plugin's own data
 * attributes, so nothing leaks into the rest of the GUI. Colors ride the dsh
 * `--dsw-*` theme tokens so the dashboard follows the active theme/skin.
 */

export const STYLES = `
/* --- sidebar entry row ------------------------------------------------------- */

.dsh-tu-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.dsh-tu-entry:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover);
  color: var(--dsw-alias-label-primary);
}

.dsh-tu-entry[data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.dsh-tu-entryIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.dsh-tu-entryLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-dsh-frame][data-sidebar-collapsed] .dsh-tu-entry {
  justify-content: center;
  padding: 0;
  width: 100%;
}

[data-dsh-frame][data-sidebar-collapsed] .dsh-tu-entryLabel {
  display: none;
}

/* --- center-column takeover (global rules, attribute-scoped) ------------------ */

[data-pane='conversation'],
[class*='centerCol'] {
  position: relative;
}

[data-dsh-token-usage-view] {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
}

html[data-dsh-token-usage-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-dsh-token-usage-view] {
  display: block;
}

html[data-dsh-token-usage-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-pane='conversation'] > :not([data-dsh-token-usage-view]),
html[data-dsh-token-usage-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [class*='centerCol'] > :not([data-dsh-token-usage-view]) {
  display: none !important;
}

/* --- dashboard frame ---------------------------------------------------------- */

.dsh-tu-dashboard {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 20px;
  gap: 12px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  font-size: 13px;
}

.dsh-tu-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  flex-wrap: wrap;
}

.dsh-tu-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}

.dsh-tu-subtitle {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dsh-tu-spacer {
  flex: 1;
}

.dsh-tu-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.dsh-tu-button:hover {
  border-color: var(--dsw-alias-border-l1);
}

.dsh-tu-button:disabled {
  opacity: 0.6;
  cursor: default;
}

/* --- filter bar --------------------------------------------------------------- */

.dsh-tu-filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  flex: none;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-input-major);
}

.dsh-tu-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.dsh-tu-fieldLabel {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dsh-tu-input,
.dsh-tu-select {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  outline: none;
  min-width: 0;
}

.dsh-tu-input:focus,
.dsh-tu-select:focus {
  border-color: var(--dsw-alias-border-l1);
}

/* --- totals cards -------------------------------------------------------------- */

.dsh-tu-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  flex: none;
}

.dsh-tu-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-input-major);
  min-width: 0;
}

.dsh-tu-cardValue {
  font-size: 17px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-tu-cardLabel {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dsh-tu-cardCost {
  color: var(--dsw-alias-accent);
}

/* --- groups table -------------------------------------------------------------- */

.dsh-tu-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  flex: 1;
}

.dsh-tu-sectionTitle {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  flex: none;
}

.dsh-tu-tableWrap {
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  flex: 1;
  min-height: 0;
}

.dsh-tu-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
}

.dsh-tu-table th {
  position: sticky;
  top: 0;
  text-align: right;
  padding: 6px 10px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-specific-input-major);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  white-space: nowrap;
  z-index: 1;
}

.dsh-tu-table th.dsh-tu-left {
  text-align: left;
}

.dsh-tu-table td {
  padding: 5px 10px;
  text-align: right;
  border-bottom: 1px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dsh-tu-table td.dsh-tu-left {
  text-align: left;
}

.dsh-tu-table tr:last-child td {
  border-bottom: none;
}

.dsh-tu-table tbody tr:hover td {
  background: var(--dsw-specific-sidebar-nav-item-hover);
}

.dsh-tu-empty {
  padding: 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-tu-error {
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-danger, #e5484d);
  border-radius: 8px;
  color: var(--dsw-alias-danger, #e5484d);
  background: var(--dsw-specific-input-major);
  font-size: 12px;
  white-space: pre-wrap;
}

.dsh-tu-loading {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dsh-tu-scanned {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  flex: none;
}
`

let injected = false

/** Inject the plugin stylesheet once (idempotent; the loader removes plugin-owned tags on unload). */
export function injectStyles(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-token-usage-observer'
  tag.dataset.pluginCss = 'dsh-token-usage-observer/all'
  tag.textContent = STYLES
  document.head.appendChild(tag)
}
