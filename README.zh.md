# dsh-token-usage-observer

Collect and summarize local token usage from DeepSeek Harness, Codex (ChatGPT) and OpenCode logs, exposed as a DeepSeek Harness plugin tool.

统计本机 DeepSeek Harness / Codex (ChatGPT) / OpenCode 的 token 用量与预计费用，并作为 DeepSeek Harness 插件（agent tool）使用。

## Features / 功能

- Aggregates token usage from three sources: input (cache miss), input (cache hit), cache write and output, plus cache hit rate and estimated cost
- Filter by source, date range (`YYYY-MM-DD`, local timezone) and category (model id / agent preset)
- Group by source / category / day / none
- Configurable prices (defaults follow DeepSeek public pricing: input $0.14 / cache hit $0.014 / output $0.28 per 1M tokens; cache write defaults to $0; all default to 0)
- Read-only over local logs; silently skips corrupt or unreadable files

## Install

After publishing to GitHub, install via the dsh plugin command:

```sh
dsh plugin --profile web add "github:<owner>/<repo>"
```

Update / remove:

```sh
dsh plugin --profile web update dsh-token-usage-observer
dsh plugin --profile web remove dsh-token-usage-observer
```

## Usage

Once installed, just ask DeepSeek Harness in plain language, e.g.:

- "Summarize my local token usage"
- "How many tokens did codex spend this week?"
- "Group August deepseek usage by day and estimate the cost at public prices"

Or call the tool `usage_stats` explicitly. Parameters:

| Param | Type | Description |
| --- | --- | --- |
| `source` | string | `all` \| `deepseek-harness` \| `codex` \| `opencode`, default `all` |
| `from` | string | Start date (inclusive), `YYYY-MM-DD`, local timezone |
| `to` | string | End date (inclusive), `YYYY-MM-DD`, local timezone |
| `category` | string | Category filter (model id / agent preset, case-insensitive substring match) |
| `groupBy` | string | `source` \| `category` \| `day` \| `none`, default `source` |
| `prices` | object | Price overrides (USD per 1M tokens): `input`, `cacheHit`, `cacheWrite`, `output` |

## Data sources

| Source | Location | Notes |
| --- | --- | --- |
| DeepSeek Harness | `~/.dsh/sessions/<encoded-cwd>/session-<uuid>/session.jsonl[.zstd]` | Reads `data.usage` on `assistant/message` events (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`); model from `request/context` events |
| Codex (ChatGPT) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Sums `last_token_usage` from `token_count` events per file (`input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`) so continued sessions are not double counted |
| OpenCode | `~/.local/share/opencode/opencode.db` (tries several common paths) | Read-only query of the `session` table columns `tokens_input` / `tokens_output` / `tokens_reasoning` / `tokens_cache_read` / `tokens_cache_write`; model from the `model` column |

The Harness and Codex log roots can be overridden with the `DSH_HOME` / `CODEX_HOME` environment variables.

## Plugin config

The plugin accepts optional `paths` (custom roots per source) and `prices` (default unit prices) config, injected through the `config` field of the cordis patch.

## Development

```sh
npm.cmd install
npm.cmd run check   # typecheck + build
```

Build output goes to `lib/`. The plugin follows the [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) plugin spec (cordis patch + `dsh-tools` `defineTool`).

## License

MIT