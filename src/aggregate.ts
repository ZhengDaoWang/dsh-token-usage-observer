/** Aggregation, filtering and rendering helpers. */

import type { Prices, Source, SourceScan, UsageGroup, UsageRecord, UsageSession, UsageStatsResult, UsageTotals } from './types.ts'

export interface UsageStatsArgs {
  source?: 'all' | Source
  from?: string
  to?: string
  category?: string
  groupBy?: 'source' | 'category' | 'day' | 'none'
  prices?: Partial<Prices>
}

const SOURCE_ORDER: Source[] = ['deepseek-harness', 'codex', 'opencode']

/** Cap on the per-session detail list (dashboard shows the most expensive first). */
export const SESSION_LIMIT = 200

function emptyTotals(): UsageTotals {
  return { requests: 0, input: 0, output: 0, cacheMiss: 0, cacheHit: 0, cacheWrite: 0, cacheHitRate: 0, estimatedCost: 0 }
}

function addTotals(target: UsageTotals, record: UsageRecord): void {
  target.requests++
  target.input += record.input
  target.output += record.output
  target.cacheMiss += record.input
  target.cacheHit += record.cacheHit
  target.cacheWrite += record.cacheWrite
}

function finalize(totals: UsageTotals, prices: Prices): void {
  const billedInput = totals.cacheHit + totals.cacheMiss
  totals.cacheHitRate = billedInput > 0 ? totals.cacheHit / billedInput : 0
  totals.estimatedCost =
    (totals.cacheMiss * prices.input +
      totals.cacheHit * prices.cacheHit +
      totals.cacheWrite * prices.cacheWrite +
      totals.output * prices.output) /
    1_000_000
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Parse YYYY-MM-DD into an epoch-ms boundary in local time. */
function dayBoundary(value: string | undefined, endOfDay: boolean): number | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const [, y, m, d] = match
  if (endOfDay) {
    return new Date(+y, +m - 1, +d, 23, 59, 59, 999).getTime()
  }
  return new Date(+y, +m - 1, +d).getTime()
}

function resolvePrices(base: Partial<Prices> | undefined, args: Partial<Prices>): Prices {
  const merged = { ...(base ?? {}), ...args }
  return {
    input: merged.input ?? 0,
    cacheHit: merged.cacheHit ?? 0,
    cacheWrite: merged.cacheWrite ?? 0,
    output: merged.output ?? 0,
  }
}

export function summarize(
  records: UsageRecord[],
  scanned: SourceScan[],
  args: UsageStatsArgs,
  configPrices: Partial<Prices> | undefined,
): UsageStatsResult {
  const from = dayBoundary(args.from, false)
  const to = dayBoundary(args.to, true)
  const category = args.category?.trim().toLowerCase()
  const groupBy = args.groupBy ?? 'source'
  const prices = resolvePrices(configPrices, args.prices ?? {})

  const filtered = records.filter((record) => {
    if (from !== undefined && record.timestamp < from) return false
    if (to !== undefined && record.timestamp > to) return false
    if (category && !record.category.toLowerCase().includes(category)) return false
    return true
  })

  const totals = emptyTotals()
  const groups = new Map<string, UsageTotals>()
  const keyOf = (record: UsageRecord): string => {
    switch (groupBy) {
      case 'category':
        return record.category || 'unknown'
      case 'day':
        return localDay(record.timestamp)
      case 'none':
        return 'total'
      case 'source':
        return record.source
    }
  }

  for (const record of filtered) {
    addTotals(totals, record)
    const key = keyOf(record)
    const group = groups.get(key) ?? emptyTotals()
    addTotals(group, record)
    groups.set(key, group)
  }

  finalize(totals, prices)
  const groupEntries = [...groups.entries()]
  const sortKey =
    groupBy === 'day'
      ? (a: [string, UsageTotals], b: [string, UsageTotals]) => a[0].localeCompare(b[0])
      : (a: [string, UsageTotals], b: [string, UsageTotals]) => b[1].requests - a[1].requests
  const sorted = groupBy === 'none' ? groupEntries : groupEntries.sort(sortKey)
  for (const [, group] of sorted) finalize(group, prices)
  const orderedGroups = groupBy === 'source'
    ? [...sorted].sort((a, b) => SOURCE_ORDER.indexOf(a[0] as Source) - SOURCE_ORDER.indexOf(b[0] as Source) || a[0].localeCompare(b[0]))
    : sorted

  return {
    totals,
    groups: orderedGroups.map(([key, value]) => ({ key, ...value }) as UsageGroup),
    sessions: summarizeSessions(filtered, prices),
    scanned,
    prices,
  }
}

/**
 * Aggregate per-session detail rows: one bucket per `source:session`, carrying
 * the session's totals, its best-known model/preset, and its latest timestamp.
 * Sorted by estimated cost (desc), then requests (desc); capped at SESSION_LIMIT.
 */
function summarizeSessions(records: UsageRecord[], prices: Prices): UsageSession[] {
  const sessions = new Map<string, UsageSession>()
  for (const record of records) {
    const key = `${record.source}:${record.session}`
    const existing = sessions.get(key)
    if (existing !== undefined) {
      addTotals(existing, record)
      if (record.category !== 'unknown' && record.category !== existing.category) existing.category = record.category
      if (record.timestamp > existing.timestamp) existing.timestamp = record.timestamp
      if (record.sessionName && record.sessionName !== existing.sessionName) existing.sessionName = record.sessionName
    } else {
      const totals = emptyTotals()
      addTotals(totals, record)
      sessions.set(key, {
        key,
        source: record.source,
        session: record.session,
        sessionName: record.sessionName,
        category: record.category,
        timestamp: record.timestamp,
        ...totals,
      })
    }
  }
  const list = [...sessions.values()]
  for (const session of list) finalize(session, prices)
  list.sort((a, b) => b.estimatedCost - a.estimatedCost || b.requests - a.requests)
  return list.slice(0, SESSION_LIMIT)
}