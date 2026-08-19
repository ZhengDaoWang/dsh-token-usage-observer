/** Collectors that parse local token-usage logs into normalized records. */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'

import type { PluginConfig, Source, SourceScan, UsageRecord } from './types.ts'

export interface CollectResult {
  records: UsageRecord[]
  scanned: SourceScan[]
}

/** Enumerate files recursively, skipping directories we cannot read. */
function walkFiles(dir: string, callback: (file: string) => void): number {
  if (!existsSync(dir)) return 0
  let files = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files += walkFiles(full, callback)
      } else if (entry.isFile()) {
        files++
        callback(full)
      }
    }
  } catch {
    // permission errors etc. are skipped
  }
  return files
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/** Parse epoch-ms timestamp from a number or ISO string. Returns 0 when unknown. */
function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/** Split a (possibly compressed) session log into JSON lines. */
function readJsonLines(file: string): string[] {
  const buffer = readFileSync(file)
  let text: string
  if (file.endsWith('.zstd')) {
    try {
      text = zstdDecompressSync(buffer).toString('utf8')
    } catch {
      text = buffer.toString('utf8')
    }
  } else {
    text = buffer.toString('utf8')
  }
  return text.split(/\r?\n/)
}

function parseLine(line: string): unknown {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function defaultRoots(config: PluginConfig): Record<Source, string[]> {
  const home = homedir()
  const dshHome = process.env.DSH_HOME || join(home, '.dsh')
  const codexHome = process.env.CODEX_HOME || join(home, '.codex')
  return {
    'deepseek-harness': config.paths?.['deepseek-harness'] ?? [join(dshHome, 'sessions')],
    codex: config.paths?.codex ?? [join(codexHome, 'sessions')],
    opencode: config.paths?.opencode ?? [],
  }
}

/**
 * DeepSeek Harness: `$DSH_HOME/sessions/<encoded-cwd>/session-<uuid>/session.jsonl[.zstd]`.
 * Usage rides on `assistant/message` events as `data.usage`
 * ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }).
 */
function collectDeepseekHarness(roots: string[]): UsageRecord[] {
  const records: UsageRecord[] = []
  for (const root of roots) {
    walkFiles(root, (file) => {
      const name = file.split(/[\\/]/).pop() ?? ''
      if (!name.startsWith('session.jsonl')) return
      const lines = readJsonLines(file)
      let agentPreset = 'unknown'
      let model = 'unknown'
      let createdAt = 0
      for (const line of lines) {
        const obj = parseLine(line)
        if (!obj || typeof obj !== 'object') continue
        const event = obj as Record<string, any>
        if (event.type === 'session') {
          agentPreset = typeof event.agentPreset === 'string' ? event.agentPreset : agentPreset
          createdAt = safeNumber(event.createdAt)
          continue
        }
        if (event.type === 'request/context') {
          if (typeof event.data?.model === 'string') model = event.data.model
          continue
        }
        if (event.type === 'assistant/message') {
          const usage = event.data?.usage
          if (!usage || typeof usage !== 'object') continue
          const input = safeNumber(usage.inputTokens)
          const output = safeNumber(usage.outputTokens)
          const cacheHit = safeNumber(usage.cacheReadTokens)
          const cacheWrite = safeNumber(usage.cacheWriteTokens)
          if (input + output + cacheHit + cacheWrite === 0) continue
          const timestamp = safeNumber(event.time) || createdAt
          records.push({
            source: 'deepseek-harness',
            category: model !== 'unknown' ? model : agentPreset,
            timestamp,
            input,
            output,
            cacheHit,
            cacheWrite,
            file,
          })
        }
      }
    })
  }
  return records
}

/**
 * Codex (ChatGPT): `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`.
 * Each `event_msg` of type `token_count` carries `last_token_usage` (a delta)
 * and `total_token_usage` (cumulative). Summing `last_token_usage` per file
 * gives that file's actual contribution and survives continuation restarts.
 * The model rides on `turn_context` payloads.
 */
function collectCodex(roots: string[]): UsageRecord[] {
  const records: UsageRecord[] = []
  for (const root of roots) {
    walkFiles(root, (file) => {
      if (!/rollout-.*\.jsonl$/.test(file)) return
      let model = 'unknown'
      const totals = { input: 0, output: 0, cacheHit: 0, cacheWrite: 0 }
      let lastTimestamp = 0
      const lines = readJsonLines(file)
      for (const line of lines) {
        const obj = parseLine(line)
        if (!obj || typeof obj !== 'object') continue
        const event = obj as Record<string, any>
        if (event.type === 'turn_context') {
          if (typeof event.payload?.model === 'string') model = event.payload.model
          continue
        }
        if (event.type !== 'event_msg') continue
        const payload = event.payload
        if (payload?.type === 'token_count') {
          const last = payload.info?.last_token_usage
          if (!last || typeof last !== 'object') continue
          totals.input += safeNumber(last.input_tokens)
          totals.cacheHit += safeNumber(last.cached_input_tokens)
          totals.cacheWrite += safeNumber(last.cache_write_input_tokens)
          totals.output += safeNumber(last.output_tokens) + safeNumber(last.reasoning_output_tokens)
          const ts = toEpochMs(event.timestamp)
          if (ts) lastTimestamp = ts
        }
      }
      if (totals.input + totals.output + totals.cacheHit + totals.cacheWrite === 0) return
      records.push({
        source: 'codex',
        category: model,
        timestamp: lastTimestamp,
        input: totals.input,
        output: totals.output,
        cacheHit: totals.cacheHit,
        cacheWrite: totals.cacheWrite,
        file,
      })
    })
  }
  return records
}

/** OpenCode: SQLite database (`session` table, one row per session). */
function collectOpencode(dbs: string[]): UsageRecord[] {
  const records: UsageRecord[] = []
  const candidates = dbs.length > 0 ? dbs : defaultOpendbCandidates()
  const seen = new Set<string>()
  for (const dbPath of candidates) {
    const resolved = resolve(dbPath)
    if (!existsSync(resolved) || seen.has(resolved)) continue
    seen.add(resolved)
    let db: DatabaseSync
    try {
      db = new DatabaseSync(resolved, { readOnly: true })
    } catch {
      continue
    }
    try {
      const rows = db
        .prepare('SELECT time_created, model, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write FROM session')
        .all() as Array<Record<string, any>>
      for (const row of rows) {
        const input = safeNumber(row.tokens_input)
        const output = safeNumber(row.tokens_output) + safeNumber(row.tokens_reasoning)
        const cacheHit = safeNumber(row.tokens_cache_read)
        const cacheWrite = safeNumber(row.tokens_cache_write)
        if (input + output + cacheHit + cacheWrite === 0) continue
        let category = 'unknown'
        if (typeof row.model === 'string') {
          try {
            const parsed = JSON.parse(row.model)
            if (typeof parsed?.id === 'string') category = parsed.id
          } catch {
            category = row.model
          }
        }
        records.push({
          source: 'opencode',
          category,
          timestamp: safeNumber(row.time_created),
          input,
          output,
          cacheHit,
          cacheWrite,
          file: resolved,
        })
      }
    } catch {
      // table layout differences / locked dbs are skipped
    } finally {
      db.close()
    }
  }
  return records
}

function defaultOpendbCandidates(): string[] {
  const home = homedir()
  return [
    join(home, '.local', 'share', 'opencode', 'opencode.db'),
    join(home, '.local', 'share', 'ai.opencode.desktop', 'opencode.db'),
    join(home, '.config', 'opencode', 'opencode.db'),
    join(home, '.opencode', 'opencode.db'),
  ]
}

export function collectAll(config: PluginConfig, selected: readonly Source[]): CollectResult {
  const roots = defaultRoots(config)
  const records: UsageRecord[] = []
  const scanned: SourceScan[] = []
  const opencodeDbs = config.opencodeDbs?.length
    ? config.opencodeDbs
    : defaultOpendbCandidates()

  for (const source of selected) {
    const start = records.length
    if (source === 'deepseek-harness') {
      records.push(...collectDeepseekHarness(roots['deepseek-harness']))
    } else if (source === 'codex') {
      records.push(...collectCodex(roots.codex))
    } else if (source === 'opencode') {
      records.push(...collectOpencode(opencodeDbs))
    }
    scanned.push({
      source,
      root: roots[source].join('; ') || opencodeDbs.join('; '),
      files: 0,
      records: records.length - start,
    })
    // files count is per-root; recompute cheaply for diagnostics
    const rootList = source === 'opencode' ? opencodeDbs : roots[source]
    const last = scanned[scanned.length - 1]
    last.files = countFiles(rootList, source)
  }
  return { records, scanned }
}

function countFiles(roots: string[], source: Source): number {
  if (source === 'opencode') {
    return roots.filter((root) => existsSync(root)).length
  }
  let files = 0
  for (const root of roots) {
    if (!existsSync(root)) continue
    walkFiles(root, (file) => {
      if (source === 'deepseek-harness' && !file.split(/[\\/]/).pop()!.startsWith('session.jsonl')) return
      if (source === 'codex' && !/rollout-.*\.jsonl$/.test(file)) return
      files++
    })
  }
  return files
}