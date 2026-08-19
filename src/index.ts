import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'

import { collectAll } from './collect.ts'
import { summarize } from './aggregate.ts'
import { renderResult } from './render.ts'
import { makeStatsRoutes, STATS_API_PREFIX } from './routes.ts'
import type { PluginConfig, Prices } from './types.ts'

export { makeStatsRoutes, STATS_API_PREFIX } from './routes.ts'

export const name = 'dsh-token-usage-observer'

export const inject = ['tools', 'webServer', 'systemPrompt']

export const usage = '统计本机 DeepSeek Harness / Codex / OpenCode 的 token 用量与费用'

/** Model-facing announcement: plugin presence, capabilities, and the WebUI dashboard. */
export const TOKEN_USAGE_GUIDANCE = '本机已安装 dsh-token-usage-observer 插件：侧边栏「Token 统计」看板 + usage_stats 工具，统计本机 DeepSeek Harness / Codex (ChatGPT) / OpenCode 的 token 用量（输入缓存未命中/缓存命中/缓存写入、输出）、缓存命中率与预计费用，数据来自本地会话日志。支持按来源、时间段（YYYY-MM-DD）与分类（模型/agent preset）筛选。用户提到「token 统计 / 用量 / 费用 / 看板」时即指本插件，请据此协作。'

export function apply(ctx: Context, config: PluginConfig = {}): void {
  // WebUI dashboard data endpoint (same origin, loopback-fenced).
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    try {
      for (const route of makeStatsRoutes(config)) disposers.push(ctx.webServer.register(route))
    } catch (error) {
      for (const dispose of disposers) dispose()
      throw error
    }
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-token-usage-observer: stats routes')

  // Model-facing announcement of the plugin (dashboard + tool).
  if (config.announceToAgent !== false) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: 'plugin:dsh-token-usage-observer',
      order: 200,
      text: TOKEN_USAGE_GUIDANCE,
    }), 'dsh-token-usage-observer: announcement')
  }

  ctx.tools.register(defineTool({
    name: 'usage_stats',
    description:
      '统计本机 DeepSeek Harness / Codex (ChatGPT) / OpenCode 的 token 用量：输入（缓存未命中）、输入（缓存命中）、缓存写入、输出、缓存命中率与预计费用。' +
      '数据来源为本地会话日志，支持按来源、时间段（YYYY-MM-DD）与分类（模型/agent preset）筛选。',
    parameters: {
      source: {
        type: 'string',
        enum: ['all', 'deepseek-harness', 'codex', 'opencode'],
        description: '统计来源，默认 all',
      },
      from: {
        type: 'string',
        description: '起始日期（含），格式 YYYY-MM-DD，按本地时区',
      },
      to: {
        type: 'string',
        description: '结束日期（含），格式 YYYY-MM-DD，按本地时区',
      },
      category: {
        type: 'string',
        description: '按分类筛选（模型 id 或 agent preset，不区分大小写，子串匹配）',
      },
      groupBy: {
        type: 'string',
        enum: ['source', 'category', 'day', 'none'],
        description: '分组维度，默认 source',
      },
      prices: {
        type: 'object',
        additionalProperties: false,
        properties: {
          input: { type: 'number', description: '每 1M 未缓存输入 token 的价格（USD）' },
          cacheHit: { type: 'number', description: '每 1M 缓存命中输入 token 的价格（USD）' },
          cacheWrite: { type: 'number', description: '每 1M 缓存写入 token 的价格（USD）' },
          output: { type: 'number', description: '每 1M 输出 token 的价格（USD）' },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          totals: {
            type: 'object',
            additionalProperties: false,
            properties: {
              requests: { type: 'integer' },
              input: { type: 'integer' },
              output: { type: 'integer' },
              cacheMiss: { type: 'integer' },
              cacheHit: { type: 'integer' },
              cacheWrite: { type: 'integer' },
              cacheHitRate: { type: 'number' },
              estimatedCost: { type: 'number' },
            },
          },
          groups: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string' },
                requests: { type: 'integer' },
                input: { type: 'integer' },
                output: { type: 'integer' },
                cacheMiss: { type: 'integer' },
                cacheHit: { type: 'integer' },
                cacheWrite: { type: 'integer' },
                cacheHitRate: { type: 'number' },
                estimatedCost: { type: 'number' },
              },
            },
          },
          sessions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string' },
                source: { type: 'string' },
                session: { type: 'string' },
                category: { type: 'string' },
                timestamp: { type: 'integer' },
                requests: { type: 'integer' },
                input: { type: 'integer' },
                output: { type: 'integer' },
                cacheMiss: { type: 'integer' },
                cacheHit: { type: 'integer' },
                cacheWrite: { type: 'integer' },
                cacheHitRate: { type: 'number' },
                estimatedCost: { type: 'number' },
              },
            },
          },
          scanned: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                source: { type: 'string' },
                root: { type: 'string' },
                files: { type: 'integer' },
                records: { type: 'integer' },
              },
            },
          },
          prices: {
            type: 'object',
            additionalProperties: false,
            properties: {
              input: { type: 'number' },
              cacheHit: { type: 'number' },
              cacheWrite: { type: 'number' },
              output: { type: 'number' },
            },
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: renderResult(value as never) },
      ],
    },
    async execute(args, _exec) {
      const typed = args as {
        source?: 'all' | 'deepseek-harness' | 'codex' | 'opencode'
        from?: string
        to?: string
        category?: string
        groupBy?: 'source' | 'category' | 'day' | 'none'
        prices?: Partial<Prices>
      }
      const selected = typed.source === 'all' || !typed.source
        ? ['deepseek-harness', 'codex', 'opencode'] as const
        : [typed.source]
      const { records, scanned } = collectAll(config, selected)
      return summarize(records, scanned, typed, config.prices)
    },
  }))
}
