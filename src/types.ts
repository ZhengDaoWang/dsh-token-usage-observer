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
}