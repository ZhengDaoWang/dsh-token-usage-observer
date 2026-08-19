/** Shared types for the usage observer collectors. */

export type Source = 'deepseek-harness' | 'codex' | 'opencode'

export const SOURCES: readonly Source[] = ['deepseek-harness', 'codex', 'opencode']

export const SOURCE_LABELS: Record<Source, string> = {
  'deepseek-harness': 'DeepSeek Harness',
  codex: 'Codex (ChatGPT)',
  opencode: 'OpenCode',
}

/** One token-usage record normalized from any source. */
export interface UsageRecord {
  source: Source
  /** Category key for filtering/grouping: model id or agent preset. */
  category: string
  /** Unix epoch milliseconds. */
  timestamp: number
  /** Uncached input tokens (cache miss). */
  input: number
  /** Output tokens (including reasoning, when reported separately). */
  output: number
  /** Cached input tokens (cache hit). */
  cacheHit: number
  /** Cache-write input tokens. */
  cacheWrite: number
  /** Origin file the record was parsed from. */
  file: string
  /** Session identifier: harness session dir name, codex rollout id, opencode db row id. */
  session: string
  /** Human-readable session name/title when the source provides one; empty otherwise. */
  sessionName?: string
}

/** Aggregated token totals for one bucket. */
export interface UsageTotals {
  requests: number
  input: number
  output: number
  cacheMiss: number
  cacheHit: number
  cacheWrite: number
  /** cacheHit / (cacheHit + cacheMiss), 0..1. */
  cacheHitRate: number
  /** Estimated cost in USD, 0 when no price is configured. */
  estimatedCost: number
}

/** Aggregated token totals for one group bucket. */
export interface UsageGroup extends UsageTotals {
  key: string
}

/** Per-session aggregated totals (the dashboard detail list). */
export interface UsageSession extends UsageTotals {
  /** Composite key: `<source>:<session>`. */
  key: string
  source: Source
  /** Session id (harness session-<uuid>, codex rollout id, opencode db row id). */
  session: string
  /** Human-readable session name/title; empty when the source provides none. */
  sessionName?: string
  /** Model / agent preset of the session (best known). */
  category: string
  /** Latest record timestamp in the session (epoch ms). */
  timestamp: number
}

/** Per-source scan diagnostics. */
export interface SourceScan {
  source: Source
  root: string
  files: number
  records: number
}

export interface UsageStatsResult {
  totals: UsageTotals
  groups: UsageGroup[]
  sessions: UsageSession[]
  scanned: SourceScan[]
  prices: Prices
}

export interface Prices {
  /** USD per 1M uncached input tokens. */
  input: number
  /** USD per 1M cached input tokens. */
  cacheHit: number
  /** USD per 1M cache-write input tokens. */
  cacheWrite: number
  /** USD per 1M output tokens. */
  output: number
}

/** Plugin configuration. */
export interface PluginConfig {
  /** Root directories to scan, per source. Overrides defaults. */
  paths?: Partial<Record<Source, string[]>>
  /** OpenCode SQLite database files. Overrides the default discovery. */
  opencodeDbs?: string[]
  /** Default prices per 1M tokens, in USD. */
  prices?: Partial<Prices>
  /** Announce the plugin (dashboard + tool) to agents in the system prompt. Default true. */
  announceToAgent?: boolean
}