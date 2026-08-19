# dsh-token-usage-observer

统计本机 DeepSeek Harness / Codex (ChatGPT) / OpenCode 的 token 用量与预计费用，并作为 DeepSeek Harness 插件（agent tool）使用。

Collect and summarize local token usage from DeepSeek Harness, Codex (ChatGPT) and OpenCode logs, exposed as a DeepSeek Harness plugin tool.

## 功能 / Features

- 聚合三个来源的 token 用量：输入（缓存未命中）、输入（缓存命中）、缓存写入、输出，并计算缓存命中率与预计费用
- 支持按来源、时间段（`YYYY-MM-DD`，本地时区）与分类（模型 id / agent preset）筛选
- 支持按来源 / 分类 / 日期 / 不分组四种分组维度
- 费用单价可配置（默认按 DeepSeek 公开价：输入 $0.14 / 缓存命中 $0.014 / 输出 $0.28，每百万 token；缓存写入默认 $0，全部默认 0）
- 只读本地日志，不修改任何数据；对损坏/无法读取的文件静默跳过

## 安装 / Install

上传到 GitHub 后，通过 dsh 插件命令安装：

```sh
dsh plugin --profile web add "github:<owner>/<repo>"
```

更新 / 移除：

```sh
dsh plugin --profile web update dsh-token-usage-observer
dsh plugin --profile web remove dsh-token-usage-observer
```

## 使用 / Usage

安装后，在 DeepSeek Harness 对话中直接询问即可，例如：

- "统计我本机的 token 用量"
- "看看 codex 这周花了多少 token"
- "8 月 deepseek 模型的用量按天分组，并按公开价估算费用"

也可通过工具名 `usage_stats` 显式调用，参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `source` | string | `all` \| `deepseek-harness` \| `codex` \| `opencode`，默认 `all` |
| `from` | string | 起始日期（含），`YYYY-MM-DD`，本地时区 |
| `to` | string | 结束日期（含），`YYYY-MM-DD`，本地时区 |
| `category` | string | 分类筛选（模型 id / agent preset，不区分大小写，子串匹配） |
| `groupBy` | string | `source` \| `category` \| `day` \| `none`，默认 `source` |
| `prices` | object | 单价覆盖（每百万 token，USD）：`input`、`cacheHit`、`cacheWrite`、`output` |

## 数据来源 / Data sources

| 来源 | 位置 | 说明 |
| --- | --- | --- |
| DeepSeek Harness | `~/.dsh/sessions/<encoded-cwd>/session-<uuid>/session.jsonl[.zstd]` | 读取 `assistant/message` 事件的 `data.usage`（`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`），模型来自 `request/context` 事件 |
| Codex (ChatGPT) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | 逐文件累加 `token_count` 事件的 `last_token_usage`（`input_tokens`、`cached_input_tokens`、`cache_write_input_tokens`、`output_tokens`、`reasoning_output_tokens`），避免续写会话重复计数 |
| OpenCode | `~/.local/share/opencode/opencode.db`（依次尝试多个常见路径） | 只读查询 `session` 表的 `tokens_input` / `tokens_output` / `tokens_reasoning` / `tokens_cache_read` / `tokens_cache_write`，模型取自 `model` 字段 |

可通过环境变量 `DSH_HOME` / `CODEX_HOME` 覆盖 Harness 与 Codex 的日志根目录。

## 插件配置 / Plugin config

插件支持可选的 `paths`（各来源自定义路径）与 `prices`（默认单价）配置，通过 cordis patch 的 `config` 字段注入。

## 开发 / Development

```sh
npm.cmd install
npm.cmd run check   # typecheck + build
```

构建产物输出到 `lib/`。插件遵循 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 插件规范（cordis patch + `dsh-tools` `defineTool`）。

## License

MIT