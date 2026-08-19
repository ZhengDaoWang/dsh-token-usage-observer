/**
 * Host HTTP routes for the token-usage dashboard.
 *
 * The browser half of the plugin fetches stats from `GET /dsh-token-usage/stats`
 * (same origin). The route reuses the exact same collect + summarize pipeline
 * as the `usage_stats` agent tool, so the WebUI dashboard and the tool always
 * agree. Requests are fenced to loopback + browser same-origin markers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import { collectAll } from './collect.ts'
import { summarize, type UsageStatsArgs } from './aggregate.ts'
import { isLoopbackRequest } from './loopback.ts'
import type { PluginConfig, Source } from './types.ts'

/** URL prefix of the token-usage route family (browser half mirrors this). */
export const STATS_API_PREFIX = '/dsh-token-usage'

const SOURCE_VALUES = new Set(['all', 'deepseek-harness', 'codex', 'opencode'])
const GROUPBY_VALUES = new Set(['source', 'category', 'day', 'none'])

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function parsePrices(search: URLSearchParams): UsageStatsArgs['prices'] | null {
  const prices: Record<string, number> = {}
  for (const key of ['input', 'cacheHit', 'cacheWrite', 'output'] as const) {
    const raw = search.get(key)
    if (raw === null || raw === '') continue
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) return null
    prices[key] = value
  }
  return Object.keys(prices).length > 0 ? prices : {}
}

/**
 * Build the dashboard route family.
 * @param config - plugin configuration (paths / prices defaults).
 * @returns web routes to register on the host web server.
 */
export function makeStatsRoutes(config: PluginConfig): WebRoute[] {
  const stats: WebRoute = {
    kind: 'exact',
    path: `${STATS_API_PREFIX}/stats`,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (req.method !== 'GET') {
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      if (!isLoopbackRequest(req)) {
        json(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const rawSource = url.searchParams.get('source') ?? 'all'
      const source = SOURCE_VALUES.has(rawSource) ? rawSource : 'all'
      const rawGroupBy = url.searchParams.get('groupBy') ?? 'source'
      const groupBy = GROUPBY_VALUES.has(rawGroupBy) ? rawGroupBy : 'source'
      const prices = parsePrices(url.searchParams)
      if (prices === null) {
        json(res, 400, { ok: false, error: 'invalid-price' })
        return
      }
      const args: UsageStatsArgs = {
        source: source as UsageStatsArgs['source'],
        from: url.searchParams.get('from') ?? undefined,
        to: url.searchParams.get('to') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        groupBy: groupBy as UsageStatsArgs['groupBy'],
        prices,
      }
      const selected: readonly Source[] = source === 'all'
        ? ['deepseek-harness', 'codex', 'opencode']
        : [source as Source]
      try {
        const { records, scanned } = collectAll(config, selected)
        json(res, 200, summarize(records, scanned, args, config.prices))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        json(res, 500, { ok: false, error: message })
      }
    },
  }
  return [stats]
}
