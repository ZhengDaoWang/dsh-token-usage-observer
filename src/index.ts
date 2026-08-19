import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { collectAll } from './collect.ts'
import { summarize } from './aggregate.ts'
import { renderResult } from './render.ts'
import type { PluginConfig, Prices } from './types.ts'

export const name = 'dsh-token-usage-observer'

export const inject = ['tools']

export const usage = '统计本机 DeepSeek Harness / Codex / OpenCode 的 token 用量与费用'

export function apply(ctx: Context, config: PluginConfig = {}): void {
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