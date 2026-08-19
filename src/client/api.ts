/**
 * Browser-side HTTP client for the token-usage dashboard. Talks to the host
 * route family at `/dsh-token-usage` (same origin, loopback-fenced). The only
 * data access path the dashboard components use.
 */

import type { Prices, Source, UsageStatsResult } from '../types.ts'

/** URL prefix of the token-usage route family (host half owns the routes). */
export const STATS_API_PREFIX = '/dsh-token-usage'

export interface StatsQuery {
  source?: 'all' | Source
  from?: string
  to?: string
  category?: string
  groupBy?: 'source' | 'category' | 'day' | 'none'
  prices?: Partial<Prices>
}

const REQUEST_TIMEOUT_MS = 30_000

/** Error carrying the route's JSON error message. */
export class StatsApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatsApiError'
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new StatsApiError(body.error ?? `token-usage request failed: ${response.status}`)
  return body
}

export class StatsApi {
  /**
   * Fetch aggregated token usage.
   * @param query - filters; omitted fields use host defaults.
   * @returns the aggregated result (totals, groups, scanned diagnostics, prices).
   */
  async stats(query: StatsQuery = {}): Promise<UsageStatsResult> {
    const params = new URLSearchParams()
    if (query.source !== undefined && query.source !== 'all') params.set('source', query.source)
    if (query.from !== undefined && query.from !== '') params.set('from', query.from)
    if (query.to !== undefined && query.to !== '') params.set('to', query.to)
    if (query.category !== undefined && query.category !== '') params.set('category', query.category)
    if (query.groupBy !== undefined && query.groupBy !== 'source') params.set('groupBy', query.groupBy)
    if (query.prices !== undefined) {
      for (const [key, value] of Object.entries(query.prices)) {
        if (typeof value === 'number' && Number.isFinite(value)) params.set(key, String(value))
      }
    }
    const queryString = params.toString()
    const url = `${STATS_API_PREFIX}/stats${queryString === '' ? '' : `?${queryString}`}`
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => { controller.abort() }, REQUEST_TIMEOUT_MS)
    try {
      return await readJson<UsageStatsResult>(await fetch(url, { cache: 'no-store', signal: controller.signal }))
    } catch (error) {
      if (controller.signal.aborted) throw new StatsApiError(`token-usage Host request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
      throw error
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }
}
