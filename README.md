# dsh-token-usage-observer

统计本机 DeepSeek Harness / Codex (ChatGPT) / OpenCode 的 token 用量与预计费用，提供 agent 工具（`usage_stats`）与 WebUI 侧边栏「Token 统计」看板。

Collect and summarize local token usage from DeepSeek Harness, Codex (ChatGPT) and OpenCode logs, exposed as a DeepSeek Harness plugin: an agent tool (`usage_stats`) plus a WebUI sidebar dashboard tab.

## 功能 / Features

- 聚合三个来源的 token 用量：输入（缓存未命中）、输入（缓存命中）、缓存写入、输出，并计算缓存命中率与预计费用
- WebUI 侧边栏新增「Token 统计」入口：打开中心列看板，支持按来源、时间段（`YYYY-MM-DD`）、分类（模型 id / agent preset）与分组维度筛选，单价可在看板内实时调整
- 看板提供总量分布图表（按来源 / 分类 / 日期的堆叠条形图）与逐会话明细列表（各来源每个会话的会话名称、token 消耗、命中率与费用，按费用降序）
- agent 工具 `usage_stats`：同样的统计管线，支持按来源 / 分类 / 日期 / 不分组四种分组维度，并附会话明细表（含会话名称）
- 会话名称自动解析：Harness 取 `session/title` 事件、Codex 取 `session_index.jsonl` 的 `thread_name`、OpenCode 取 `session.title`；缺失时回落为会话 ID
- 费用单价可配置（默认按 DeepSeek 公开价：输入 $0.14 / 缓存命中 $0.014 / 输出 $0.28，每百万 token；缓存写入默认 $0，全部默认 0）
- 只读本地日志，不修改任何数据；对损坏/无法读取的文件静默跳过

## 安装 / Install

通过 dsh 插件命令安装（bundle 形态，构建产物随仓库分发，无需本地构建）：

```sh
dsh plugin --profile web add "github:ZhengDaoWang/dsh-token-usage-observer"
```

更新 / 移除：

```sh
dsh plugin --profile web update dsh-token-usage-observer
dsh plugin --profile web remove dsh-token-usage-observer
```

> 安装 / 更新后需重启 `dsh web`，侧边栏「Token 统计」入口与看板才会加载。

## WebUI 看板 / Dashboard

安装并重启后，侧边栏出现「Token 统计」入口（New Session 按钮下方、与任务看板 / SSH 入口同一区块）。点击打开中心列看板：

- **筛选栏**：来源（全部 / DeepSeek Harness / Codex / OpenCode）、起始 / 结束日期、分类（模型或 preset 子串）、图表分组维度（按来源 / 分类 / 日期 / 不分组）、四档单价（$ / 1M token）
- **统计卡片**：请求数、输入（缓存未命中）、输入（缓存命中）、缓存写入、输出、缓存命中率、预计费用
- **总量分布图表**：按所选分组维度绘制的堆叠条形图（输入未缓存 / 缓存命中 / 缓存写入 / 输出四段 + 各分组费用）
- **会话明细列表**：各来源逐会话展示（会话名称、会话 id、模型/预设、最近时间、请求数、各 token 指标、命中率、费用，按费用降序）
- **扫描范围**：各来源扫描的文件数与记录数

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

插件支持可选的 `paths`（各来源自定义路径）、`prices`（默认单价）与 `announceToAgent`（是否向 agent 公告本插件，默认 `true`）配置，通过 cordis patch 的 `config` 字段注入。

## 架构 / Architecture

- **Node 半区**（`src/index.ts`、`src/routes.ts`）：注册 `usage_stats` 工具与 `GET /dsh-token-usage/stats` HTTP 路由（loopback + 浏览器同源防护），复用同一 collect/summarize 管线
- **浏览器半区**（`src/client/`）：`lib/client.js` 经 `__ModuleLoader__` 契约注入 WebUI，挂载侧边栏入口行与中心列看板 React 根
- **构建**：tsdown 双入口（`src/index.ts` → `lib/index.js`，`src/client/index.ts` → `lib/client.js`）

## 开发 / Development

```sh
npm.cmd install
npm.cmd run check   # typecheck + build
```

构建产物输出到 `lib/`（含 `lib/client.js` 浏览器半区）。插件遵循 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 插件规范（cordis patch + `dsh-tools` `defineTool` + `dsh.client` 声明）。

## License

MIT
