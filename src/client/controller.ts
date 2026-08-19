/**
 * Tiny framework-free controller bridging the sidebar entry row and the
 * dashboard view: open state, toggle, and a subscribe surface for the DOM
 * mount helpers (no React involved in the visibility wiring).
 */

export interface PanelSnapshot {
  panelOpen: boolean
}

export class PanelController {
  private open = false
  private listeners = new Set<() => void>()

  getSnapshot(): PanelSnapshot {
    return { panelOpen: this.open }
  }

  toggle(): void {
    this.open = !this.open
    this.notify()
  }

  close(): void {
    if (!this.open) return
    this.open = false
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
