/**
 * Browser-half entry for the dsh-token-usage-observer plugin — runs inside
 * the dsh web GUI.
 *
 * Mounts the two DOM surfaces: the sidebar entry row (toggles the panel) and
 * the token-usage dashboard in the center column. Failure policy: DOM mounting
 * problems are logged, never thrown — the web shell fails the whole boot when
 * a plugin apply throws, and an external plugin must not take the GUI down.
 *
 * Export discipline (client face): the /client surface carries the cordis
 * loading contract (`apply` / `inject`) plus types only — all value exports
 * stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { StatsApi } from './api.ts'
import { PanelController } from './controller.ts'
import { mountPanel } from './mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { injectStyles } from './styles.ts'

/** Locale namespace this plugin owns (declared for future i18n; no dicts yet). */
const NS = 'dsh-token-usage-observer'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-token-usage-observer surface copy (dictionaries registered by the locale service). */
    'dsh-token-usage-observer': Record<string, string>
  }
}

/** Required services (none beyond the cordis core — the dashboard talks to the host over HTTP). */
export const inject: string[] = []

/**
 * Mount the token-usage dashboard.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Inject the plugin stylesheet once (self-healing across HMR re-applies).
  injectStyles()

  const controller = new PanelController()
  const api = new StatsApi()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry({
      rowAttribute: 'data-dsh-token-usage-entry',
      rowSelector: '[data-dsh-token-usage-entry]',
      plugin: 'token-usage-observer',
      icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12.5v-3M6.5 12.5v-6M10 12.5v-8M13.5 12.5v-4"/><rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/></svg>',
      css: { entry: 'dsh-tu-entry', entryIcon: 'dsh-tu-entryIcon', entryLabel: 'dsh-tu-entryLabel' },
      label: () => 'Token 统计',
      tooltip: () => '本机 token 用量统计看板',
      onToggle: () => { controller.toggle() },
      position: 'after',
      familySelectors: ['[data-dsh-taskboard-entry]', '[data-dsh-ssh-entry]', '[data-dsh-token-usage-entry]'],
      active: {
        subscribe: (listener) => controller.subscribe(listener),
        isOpen: () => controller.getSnapshot().panelOpen,
      },
    }))
    disposers.push(mountPanel(controller, api))
  } catch (error) {
    // DOM failures degrade the dashboard, never the GUI.
    console.warn('[dsh-token-usage-observer] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-token-usage-observer: ui mounts')
}
