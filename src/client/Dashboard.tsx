/**
 * Token-usage dashboard — the WebUI surface of the plugin.
 *
 * Filter bar (source / time range / category / groupBy / prices) drives a
 * fetch to the host stats route; the result renders as summary cards, a group
 * table, and scan diagnostics. Plain React, no UI kit; styles come from the
 * injected plugin stylesheet (`dsh-tu-*` classes).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { StatsApi, StatsApiError, type StatsQuery } from './api.ts'
import { SOURCE_LABELS, SOURCES } from '../types.ts'
import type { UsageGroup, UsageStatsResult } from '../types.ts'

export interface DashboardProps {
  api: StatsApi
}

const DEFAULT_PRICES = { input: 0.14, cacheHit: 0.014, cacheWrite: 0, output: 0.28 }

const GROUPBY_OPTIONS: Array<{ value: StatsQuery['groupBy']; label: string }> = [
  { value: 'source', label: '按来源' },
  { value: 'category', label: '按分类' },
  { value: 'day', label: '按日期' },
  { value: 'none', label: '不分组' },
]

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

function usd(cost: number): string {
  if (cost >= 100) return `$${cost.toFixed(2)}`
  if (cost >= 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(6)}`
}

export function Dashboard({ api }: DashboardProps): JSX.Element {
  const [source, setSource] = useState<'all' | 'deepseek-harness' | 'codex' | 'opencode'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState('')
  const [groupBy, setGroupBy] = useState<StatsQuery['groupBy']>('source')
  const [priceInput, setPriceInput] = useState(String(DEFAULT_PRICES.input))
  const [priceCacheHit, setPriceCacheHit] = useState(String(DEFAULT_PRICES.cacheHit))
  const [priceCacheWrite, setPriceCacheWrite] = useState(String(DEFAULT_PRICES.cacheWrite))
  const [priceOutput, setPriceOutput] = useState(String(DEFAULT_PRICES.output))

  const [result, setResult] = useState<UsageStatsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState<StatsQuery | null>(null)

  const requestSeq = useRef(0)

  const buildQuery = useCallback((): StatsQuery => {
    const num = (raw: string): number | undefined => {
      const value = Number(raw)
      return raw !== '' && Number.isFinite(value) && value >= 0 ? value : undefined
    }
    const prices = {
      input: num(priceInput),
      cacheHit: num(priceCacheHit),
      cacheWrite: num(priceCacheWrite),
      output: num(priceOutput),
    }
    const hasAnyPrice = Object.values(prices).some(v => v !== undefined)
    return {
      source,
      from: from || undefined,
      to: to || undefined,
      category: category.trim() || undefined,
      groupBy,
      ...(hasAnyPrice ? { prices } : {}),
    }
  }, [source, from, to, category, groupBy, priceInput, priceCacheHit, priceCacheWrite, priceOutput])

  const run = useCallback(async (query: StatsQuery, signal?: AbortSignal): Promise<void> => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const value = await api.stats(query)
      if (seq !== requestSeq.current) return
      setResult(value)
      setLastQuery(query)
    } catch (caught) {
      if (seq !== requestSeq.current) return
      const message = caught instanceof StatsApiError ? caught.message
        : caught instanceof Error ? caught.message
        : String(caught)
      if (signal?.aborted) return
      setError(message)
      setResult(null)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [api])

  // Initial load + auto-refresh whenever the query inputs change (debounced
  // for the free-text category field).
  useEffect(() => {
    const query = buildQuery()
    const same = lastQuery !== null && JSON.stringify(query) === JSON.stringify(lastQuery)
    if (same) return
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => { void run(query, controller.signal) }, 250)
    return () => {
      globalThis.clearTimeout(timer)
      controller.abort()
    }
  }, [buildQuery, run, lastQuery])

  const refresh = useCallback((): void => {
    setLastQuery(null)
    void run(buildQuery())
  }, [buildQuery, run])

  const totals = result?.totals
  const groups = result?.groups ?? []

  const sourceLabel = (key: string): string => {
    if (key in SOURCE_LABELS) return SOURCE_LABELS[key as keyof typeof SOURCE_LABELS]
    if (groupBy === 'day') return key
    return key
  }

  return (
    <div className="dsh-tu-dashboard" data-dsh-plugin="token-usage-observer">
      <div className="dsh-tu-header">
        <h2 className="dsh-tu-title">Token 用量统计</h2>
        <span className="dsh-tu-subtitle">DeepSeek Harness / Codex (ChatGPT) / OpenCode</span>
        <span className="dsh-tu-spacer" />
        {loading && <span className="dsh-tu-loading">统计中…</span>}
        <button type="button" className="dsh-tu-button" onClick={refresh} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="dsh-tu-filters">
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">来源</span>
          <select className="dsh-tu-select" value={source} onChange={e => setSource(e.target.value as typeof source)}>
            <option value="all">全部</option>
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">起始日期</span>
          <input className="dsh-tu-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">结束日期</span>
          <input className="dsh-tu-input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">分类筛选（模型 / preset）</span>
          <input className="dsh-tu-input" type="text" placeholder="如 deepseek-chat" value={category} onChange={e => setCategory(e.target.value)} />
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">分组维度</span>
          <select className="dsh-tu-select" value={groupBy} onChange={e => setGroupBy(e.target.value as StatsQuery['groupBy'])}>
            {GROUPBY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">输入价 $/1M（未缓存）</span>
          <input className="dsh-tu-input" type="number" min="0" step="0.001" value={priceInput} onChange={e => setPriceInput(e.target.value)} />
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">缓存命中价 $/1M</span>
          <input className="dsh-tu-input" type="number" min="0" step="0.001" value={priceCacheHit} onChange={e => setPriceCacheHit(e.target.value)} />
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">缓存写入价 $/1M</span>
          <input className="dsh-tu-input" type="number" min="0" step="0.001" value={priceCacheWrite} onChange={e => setPriceCacheWrite(e.target.value)} />
        </label>
        <label className="dsh-tu-field">
          <span className="dsh-tu-fieldLabel">输出价 $/1M</span>
          <input className="dsh-tu-input" type="number" min="0" step="0.001" value={priceOutput} onChange={e => setPriceOutput(e.target.value)} />
        </label>
      </div>

      {error !== null && (
        <div className="dsh-tu-error">统计失败：{error}</div>
      )}

      {totals !== undefined && (
        <div className="dsh-tu-cards">
          <div className="dsh-tu-card">
            <span className="dsh-tu-cardValue">{fmt(totals.requests)}</span>
            <span className="dsh-tu-cardLabel">请求数</span>
          </div>
          <div className="dsh-tu-card">
            <span className="dsh-tu-cardValue">{fmt(totals.cacheMiss)}</span>
            <span className="dsh-tu-cardLabel">输入（缓存未命中）</span>
          </div>
          <div className="dsh-tu-card">
            <span className="dsh-tu-cardValue">{fmt(totals.cacheHit)}</span>
            <span className="dsh-tu-cardLabel">输入（缓存命中）</span>
          </div>
          <div className="dsh-tu-card">
            <span className="dsh-tu-cardValue">{fmt(totals.cacheWrite)}</span>
            <span className="dsh-tu-cardLabel">缓存写入</span>
          </div>
          <div className="dsh-tu-card">
            <span className="dsh-tu-cardValue">{fmt(totals.output)}</span>
            <span className="dsh-tu-cardLabel">输出</span>
          </div>
          <div className="dsh-tu-card">
            <span className="dsh-tu-cardValue">{pct(totals.cacheHitRate)}</span>
            <span className="dsh-tu-cardLabel">缓存命中率</span>
          </div>
          <div className="dsh-tu-card">
            <span className="dsh-tu-cardValue dsh-tu-cardCost">{usd(totals.estimatedCost)}</span>
            <span className="dsh-tu-cardLabel">预计费用</span>
          </div>
        </div>
      )}

      {result !== null && (
        <div className="dsh-tu-section">
          <h3 className="dsh-tu-sectionTitle">分组明细（{groups.length}）</h3>
          {groups.length === 0 ? (
            <div className="dsh-tu-empty">无匹配记录</div>
          ) : (
            <div className="dsh-tu-tableWrap">
              <table className="dsh-tu-table">
                <thead>
                  <tr>
                    <th className="dsh-tu-left">分组</th>
                    <th>请求数</th>
                    <th>输入(未缓存)</th>
                    <th>输入(缓存命中)</th>
                    <th>缓存写入</th>
                    <th>输出</th>
                    <th>缓存命中率</th>
                    <th>预计费用</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group: UsageGroup) => (
                    <tr key={group.key}>
                      <td className="dsh-tu-left">{sourceLabel(group.key)}</td>
                      <td>{fmt(group.requests)}</td>
                      <td>{fmt(group.cacheMiss)}</td>
                      <td>{fmt(group.cacheHit)}</td>
                      <td>{fmt(group.cacheWrite)}</td>
                      <td>{fmt(group.output)}</td>
                      <td>{pct(group.cacheHitRate)}</td>
                      <td>{usd(group.estimatedCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {result !== null && (
        <div className="dsh-tu-scanned">
          {result.scanned.map(scan => (
            <div key={scan.source}>
              {SOURCE_LABELS[scan.source] ?? scan.source}：{scan.files} 个文件 / {scan.records} 条记录 ← {scan.root}
            </div>
          ))}
          <div>
            价格：输入 ${result.prices.input}/1M · 缓存命中 ${result.prices.cacheHit}/1M · 缓存写入 ${result.prices.cacheWrite}/1M · 输出 ${result.prices.output}/1M
          </div>
        </div>
      )}
    </div>
  )
}
