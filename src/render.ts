/** Render a UsageStatsResult as markdown. */

import type { UsageGroup, UsageSession, UsageStatsResult, UsageTotals } from './types.ts'

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

function usd(cost: number): string {
  return `$${cost.toFixed(6)}`
}

function totalsLine(t: UsageTotals): string[] {
  return [
    `请求数 ${fmt(t.requests)}`,
    `输入(未缓存) ${fmt(t.cacheMiss)}`,
    `输入(缓存命中) ${fmt(t.cacheHit)}`,
    `缓存写入 ${fmt(t.cacheWrite)}`,
    `输出 ${fmt(t.output)}`,
    `缓存命中率 ${pct(t.cacheHitRate)}`,
    `预计费用 ${usd(t.estimatedCost)}`,
  ]
}

function renderGroups(groups: UsageGroup[]): string[] {
  if (groups.length === 0) return ['- 无匹配记录']
  const lines: string[] = []
  for (const group of groups) {
    lines.push(`- **${group.key}**: ${totalsLine(group).join(' | ')}`)
  }
  return lines
}

function renderSessions(sessions: UsageSession[]): string[] {
  if (sessions.length === 0) return ['- 无匹配记录']
  const lines: string[] = [
    '| 来源 | 会话 | 模型/预设 | 时间 | 请求数 | 输入(未缓存) | 输入(缓存命中) | 缓存写入 | 输出 | 命中率 | 费用 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const session of sessions) {
    const time = session.timestamp > 0 ? new Date(session.timestamp).toISOString().slice(0, 10) : '-'
    lines.push(`| ${session.source} | ${session.session} | ${session.category} | ${time} | ${fmt(session.requests)} | ${fmt(session.cacheMiss)} | ${fmt(session.cacheHit)} | ${fmt(session.cacheWrite)} | ${fmt(session.output)} | ${pct(session.cacheHitRate)} | ${usd(session.estimatedCost)} |`)
  }
  return lines
}

export function renderResult(result: UsageStatsResult): string {
  const lines: string[] = []
  lines.push('### Token 用量统计')
  lines.push('')
  lines.push(`- **总计**: ${totalsLine(result.totals).join(' | ')}`)
  lines.push('')
  lines.push('#### 分组明细（来源汇总）')
  lines.push(...renderGroups(result.groups))
  lines.push('')
  lines.push('#### 会话明细（按费用降序，最多 200 条）')
  lines.push(...renderSessions(result.sessions))
  lines.push('')
  lines.push('#### 扫描范围')
  for (const scan of result.scanned) {
    lines.push(`- ${scan.source}: ${scan.files} 个文件 / ${scan.records} 条记录 <- ${scan.root}`)
  }
  lines.push('')
  lines.push(`_价格: 输入 $${result.prices.input}/1M, 缓存命中 $${result.prices.cacheHit}/1M, 缓存写入 $${result.prices.cacheWrite}/1M, 输出 $${result.prices.output}/1M_`)
  return lines.join('\n')
}
