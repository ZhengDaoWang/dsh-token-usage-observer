# dsh-token-usage-observer

Collect and summarize local token usage from DeepSeek Harness, Codex (ChatGPT) and OpenCode logs, exposed as a DeepSeek Harness plugin: an agent tool (`usage_stats`) plus a WebUI sidebar dashboard tab.

统计本机 DeepSeek Harness / Codex (ChatGPT) / OpenCode 的 token 用量与预计费用，提供 agent 工具（`usage_stats`）与 WebUI 侧边栏「Token 统计」看板。

## Features / 功能

- Aggregates token usage from three sources: input (cache miss), input (cache hit), cache write and output, plus cache hit rate and estimated cost
- WebUI sidebar "Token 统计" entry opens a center-column dashboard: filter by source, date range (`YYYY-MM-DD`), category (model id / agent preset) and group dimension; unit prices adjustable live in the dashboard
- Agent tool `usage_stats` uses the same pipeline, group by source / category / day / none
- Configurable prices (defaults follow DeepSeek public pricing: input $0.14 / cache hit $0.014 / output $0.28 per 1M tokens; cache write defaults to $0; all default to 0)
- Read-only over local logs; silently skips corrupt or unreadable files

## Install / 安装

Install via the dsh plugin command (bundle form; build artifacts ship with the repo, no local build needed):

```sh
dsh plugin --profile web add "github:ZhengDaoWang/dsh-token-usage-observer"
```

Update / remove:

```sh
dsh plugin --profile web update dsh-token-usage-observer
dsh plugin --profile web remove dsh-token-usage-observer
```

> Restart `dsh web` after installing/updating so the sidebar "Token 统计" entry and dashboard load.

## WebUI Dashboard / WebUI 看板

After install and restart, the sidebar shows the "Token 统计" entry (below the New Session button, in the same block as the task board / SSH entries). Click to open the center-column dashboard:

- **Filter bar**: source (all / DeepSeek Harness / Codex / OpenCode), start / end date, category (model or preset substring), group dimension (source / category / day / none), four unit prices ($ per 1M tokens)
- **Summary cards**: requests, input (cache miss), input (cache hit), cache write, output, cache hit rate, estimated cost
- **Group table**: per-group metrics under the selected group dimension
- **Scan diagnostics**: files and records scanned per source

## Usage / 使用

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

## Data sources / 数据来源

| Source | Location | Notes |
| --- | --- | --- |
| DeepSeek Harness | `~/.dsh/sessions/<encoded-cwd>/session-<uuid>/session.jsonl[.zstd]` | Reads `data.usage` on `assistant/message` events (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`); model from `request/context` events |
| Codex (ChatGPT) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Sums `last_token_usage` from `token_count` events per file (`input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`) so continued sessions are not double counted |
| OpenCode | `~/.local/share/opencode/opencode.db` (tries several common paths) | Read-only query of the `session` table columns `tokens_input` / `tokens_output` / `tokens_reasoning` / `tokens_cache_read` / `tokens_cache_write`; model from the `model` column |

The Harness and Codex log roots can be overridden with the `DSH_HOME` / `CODEX_HOME` environment variables.

## Plugin config / 插件配置

The plugin accepts optional `paths` (custom roots per source), `prices` (default unit prices) and `announceToAgent` (announce the plugin to agents, default `true`) config, injected through the `config` field of the cordis patch.

## Architecture / 架构

- **Node half** (`src/index.ts`, `src/routes.ts`): registers the `usage_stats` tool and the `GET /dsh-token-usage/stats` HTTP route (loopback + browser same-origin fence), both sharing one collect/summarize pipeline
- **Browser half** (`src/client/`): `lib/client.js` loads into the WebUI via the `__ModuleLoader__` contract, mounting the sidebar entry row and the center-column dashboard React root
- **Build**: tsdown dual entry (`src/index.ts` → `lib/index.js`, `src/client/index.ts` → `lib/client.js`)

## Development / 开发

```sh
npm.cmd install
npm.cmd run check   # typecheck + build
```

Build output goes to `lib/` (including the `lib/client.js` browser half). The plugin follows the [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) plugin spec (cordis patch + `dsh-tools` `defineTool` + `dsh.client` declaration).

## License

MIT
