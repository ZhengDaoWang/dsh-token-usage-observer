import { defineTool } from "@deepseek-ai/dsh-tools";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
//#region src/collect.ts
/** Collectors that parse local token-usage logs into normalized records. */
/** Enumerate files recursively, skipping directories we cannot read. */
function walkFiles(dir, callback) {
	if (!existsSync(dir)) return 0;
	let files = 0;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) files += walkFiles(full, callback);
			else if (entry.isFile()) {
				files++;
				callback(full);
			}
		}
	} catch {}
	return files;
}
function safeNumber(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
/** Parse epoch-ms timestamp from a number or ISO string. Returns 0 when unknown. */
function toEpochMs(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value > 0xe8d4a51000 ? value : value * 1e3;
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}
/** Split a (possibly compressed) session log into JSON lines. */
function readJsonLines(file) {
	const buffer = readFileSync(file);
	let text;
	if (file.endsWith(".zstd")) try {
		text = zstdDecompressSync(buffer).toString("utf8");
	} catch {
		text = buffer.toString("utf8");
	}
	else text = buffer.toString("utf8");
	return text.split(/\r?\n/);
}
function parseLine(line) {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}
function defaultRoots(config) {
	const home = homedir();
	const dshHome = process.env.DSH_HOME || join(home, ".dsh");
	const codexHome = process.env.CODEX_HOME || join(home, ".codex");
	return {
		"deepseek-harness": config.paths?.["deepseek-harness"] ?? [join(dshHome, "sessions")],
		codex: config.paths?.codex ?? [join(codexHome, "sessions")],
		opencode: config.paths?.opencode ?? []
	};
}
/**
* DeepSeek Harness: `$DSH_HOME/sessions/<encoded-cwd>/session-<uuid>/session.jsonl[.zstd]`.
* Usage rides on `assistant/message` events as `data.usage`
* ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }).
*/
function collectDeepseekHarness(roots) {
	const records = [];
	for (const root of roots) walkFiles(root, (file) => {
		if (!(file.split(/[\\/]/).pop() ?? "").startsWith("session.jsonl")) return;
		const lines = readJsonLines(file);
		let agentPreset = "unknown";
		let model = "unknown";
		let createdAt = 0;
		for (const line of lines) {
			const obj = parseLine(line);
			if (!obj || typeof obj !== "object") continue;
			const event = obj;
			if (event.type === "session") {
				agentPreset = typeof event.agentPreset === "string" ? event.agentPreset : agentPreset;
				createdAt = safeNumber(event.createdAt);
				continue;
			}
			if (event.type === "request/context") {
				if (typeof event.data?.model === "string") model = event.data.model;
				continue;
			}
			if (event.type === "assistant/message") {
				const usage = event.data?.usage;
				if (!usage || typeof usage !== "object") continue;
				const input = safeNumber(usage.inputTokens);
				const output = safeNumber(usage.outputTokens);
				const cacheHit = safeNumber(usage.cacheReadTokens);
				const cacheWrite = safeNumber(usage.cacheWriteTokens);
				if (input + output + cacheHit + cacheWrite === 0) continue;
				const timestamp = safeNumber(event.time) || createdAt;
				records.push({
					source: "deepseek-harness",
					category: model !== "unknown" ? model : agentPreset,
					timestamp,
					input,
					output,
					cacheHit,
					cacheWrite,
					file
				});
			}
		}
	});
	return records;
}
/**
* Codex (ChatGPT): `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`.
* Each `event_msg` of type `token_count` carries `last_token_usage` (a delta)
* and `total_token_usage` (cumulative). Summing `last_token_usage` per file
* gives that file's actual contribution and survives continuation restarts.
* The model rides on `turn_context` payloads.
*/
function collectCodex(roots) {
	const records = [];
	for (const root of roots) walkFiles(root, (file) => {
		if (!/rollout-.*\.jsonl$/.test(file)) return;
		let model = "unknown";
		const totals = {
			input: 0,
			output: 0,
			cacheHit: 0,
			cacheWrite: 0
		};
		let lastTimestamp = 0;
		const lines = readJsonLines(file);
		for (const line of lines) {
			const obj = parseLine(line);
			if (!obj || typeof obj !== "object") continue;
			const event = obj;
			if (event.type === "turn_context") {
				if (typeof event.payload?.model === "string") model = event.payload.model;
				continue;
			}
			if (event.type !== "event_msg") continue;
			const payload = event.payload;
			if (payload?.type === "token_count") {
				const last = payload.info?.last_token_usage;
				if (!last || typeof last !== "object") continue;
				totals.input += safeNumber(last.input_tokens);
				totals.cacheHit += safeNumber(last.cached_input_tokens);
				totals.cacheWrite += safeNumber(last.cache_write_input_tokens);
				totals.output += safeNumber(last.output_tokens) + safeNumber(last.reasoning_output_tokens);
				const ts = toEpochMs(event.timestamp);
				if (ts) lastTimestamp = ts;
			}
		}
		if (totals.input + totals.output + totals.cacheHit + totals.cacheWrite === 0) return;
		records.push({
			source: "codex",
			category: model,
			timestamp: lastTimestamp,
			input: totals.input,
			output: totals.output,
			cacheHit: totals.cacheHit,
			cacheWrite: totals.cacheWrite,
			file
		});
	});
	return records;
}
/** OpenCode: SQLite database (`session` table, one row per session). */
function collectOpencode(dbs) {
	const records = [];
	const candidates = dbs.length > 0 ? dbs : defaultOpendbCandidates();
	const seen = /* @__PURE__ */ new Set();
	for (const dbPath of candidates) {
		const resolved = resolve(dbPath);
		if (!existsSync(resolved) || seen.has(resolved)) continue;
		seen.add(resolved);
		let db;
		try {
			db = new DatabaseSync(resolved, { readOnly: true });
		} catch {
			continue;
		}
		try {
			const rows = db.prepare("SELECT time_created, model, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write FROM session").all();
			for (const row of rows) {
				const input = safeNumber(row.tokens_input);
				const output = safeNumber(row.tokens_output) + safeNumber(row.tokens_reasoning);
				const cacheHit = safeNumber(row.tokens_cache_read);
				const cacheWrite = safeNumber(row.tokens_cache_write);
				if (input + output + cacheHit + cacheWrite === 0) continue;
				let category = "unknown";
				if (typeof row.model === "string") try {
					const parsed = JSON.parse(row.model);
					if (typeof parsed?.id === "string") category = parsed.id;
				} catch {
					category = row.model;
				}
				records.push({
					source: "opencode",
					category,
					timestamp: safeNumber(row.time_created),
					input,
					output,
					cacheHit,
					cacheWrite,
					file: resolved
				});
			}
		} catch {} finally {
			db.close();
		}
	}
	return records;
}
function defaultOpendbCandidates() {
	const home = homedir();
	return [
		join(home, ".local", "share", "opencode", "opencode.db"),
		join(home, ".local", "share", "ai.opencode.desktop", "opencode.db"),
		join(home, ".config", "opencode", "opencode.db"),
		join(home, ".opencode", "opencode.db")
	];
}
function collectAll(config, selected) {
	const roots = defaultRoots(config);
	const records = [];
	const scanned = [];
	const opencodeDbs = config.opencodeDbs?.length ? config.opencodeDbs : defaultOpendbCandidates();
	for (const source of selected) {
		const start = records.length;
		if (source === "deepseek-harness") records.push(...collectDeepseekHarness(roots["deepseek-harness"]));
		else if (source === "codex") records.push(...collectCodex(roots.codex));
		else if (source === "opencode") records.push(...collectOpencode(opencodeDbs));
		scanned.push({
			source,
			root: roots[source].join("; ") || opencodeDbs.join("; "),
			files: 0,
			records: records.length - start
		});
		const rootList = source === "opencode" ? opencodeDbs : roots[source];
		const last = scanned[scanned.length - 1];
		last.files = countFiles(rootList, source);
	}
	return {
		records,
		scanned
	};
}
function countFiles(roots, source) {
	if (source === "opencode") return roots.filter((root) => existsSync(root)).length;
	let files = 0;
	for (const root of roots) {
		if (!existsSync(root)) continue;
		walkFiles(root, (file) => {
			if (source === "deepseek-harness" && !file.split(/[\\/]/).pop().startsWith("session.jsonl")) return;
			if (source === "codex" && !/rollout-.*\.jsonl$/.test(file)) return;
			files++;
		});
	}
	return files;
}
//#endregion
//#region src/aggregate.ts
const SOURCE_ORDER = [
	"deepseek-harness",
	"codex",
	"opencode"
];
function emptyTotals() {
	return {
		requests: 0,
		input: 0,
		output: 0,
		cacheMiss: 0,
		cacheHit: 0,
		cacheWrite: 0,
		cacheHitRate: 0,
		estimatedCost: 0
	};
}
function addTotals(target, record) {
	target.requests++;
	target.input += record.input;
	target.output += record.output;
	target.cacheMiss += record.input;
	target.cacheHit += record.cacheHit;
	target.cacheWrite += record.cacheWrite;
}
function finalize(totals, prices) {
	const billedInput = totals.cacheHit + totals.cacheMiss;
	totals.cacheHitRate = billedInput > 0 ? totals.cacheHit / billedInput : 0;
	totals.estimatedCost = (totals.cacheMiss * prices.input + totals.cacheHit * prices.cacheHit + totals.cacheWrite * prices.cacheWrite + totals.output * prices.output) / 1e6;
}
function localDay(timestamp) {
	const date = new Date(timestamp);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}
/** Parse YYYY-MM-DD into an epoch-ms boundary in local time. */
function dayBoundary(value, endOfDay) {
	if (!value) return void 0;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) return void 0;
	const [, y, m, d] = match;
	if (endOfDay) return new Date(+y, +m - 1, +d, 23, 59, 59, 999).getTime();
	return new Date(+y, +m - 1, +d).getTime();
}
function resolvePrices(base, args) {
	const merged = {
		...base ?? {},
		...args
	};
	return {
		input: merged.input ?? 0,
		cacheHit: merged.cacheHit ?? 0,
		cacheWrite: merged.cacheWrite ?? 0,
		output: merged.output ?? 0
	};
}
function summarize(records, scanned, args, configPrices) {
	const from = dayBoundary(args.from, false);
	const to = dayBoundary(args.to, true);
	const category = args.category?.trim().toLowerCase();
	const groupBy = args.groupBy ?? "source";
	const prices = resolvePrices(configPrices, args.prices ?? {});
	const filtered = records.filter((record) => {
		if (from !== void 0 && record.timestamp < from) return false;
		if (to !== void 0 && record.timestamp > to) return false;
		if (category && !record.category.toLowerCase().includes(category)) return false;
		return true;
	});
	const totals = emptyTotals();
	const groups = /* @__PURE__ */ new Map();
	const keyOf = (record) => {
		switch (groupBy) {
			case "category": return record.category || "unknown";
			case "day": return localDay(record.timestamp);
			case "none": return "total";
			case "source": return record.source;
		}
	};
	for (const record of filtered) {
		addTotals(totals, record);
		const key = keyOf(record);
		const group = groups.get(key) ?? emptyTotals();
		addTotals(group, record);
		groups.set(key, group);
	}
	finalize(totals, prices);
	const groupEntries = [...groups.entries()];
	const sortKey = groupBy === "day" ? (a, b) => a[0].localeCompare(b[0]) : (a, b) => b[1].requests - a[1].requests;
	const sorted = groupBy === "none" ? groupEntries : groupEntries.sort(sortKey);
	for (const [, group] of sorted) finalize(group, prices);
	return {
		totals,
		groups: (groupBy === "source" ? [...sorted].sort((a, b) => SOURCE_ORDER.indexOf(a[0]) - SOURCE_ORDER.indexOf(b[0]) || a[0].localeCompare(b[0])) : sorted).map(([key, value]) => ({
			key,
			...value
		})),
		scanned,
		prices
	};
}
//#endregion
//#region src/render.ts
function fmt(n) {
	return n.toLocaleString("en-US");
}
function pct(rate) {
	return `${(rate * 100).toFixed(2)}%`;
}
function usd(cost) {
	return `$${cost.toFixed(6)}`;
}
function totalsLine(t) {
	return [
		`请求数 ${fmt(t.requests)}`,
		`输入(未缓存) ${fmt(t.cacheMiss)}`,
		`输入(缓存命中) ${fmt(t.cacheHit)}`,
		`缓存写入 ${fmt(t.cacheWrite)}`,
		`输出 ${fmt(t.output)}`,
		`缓存命中率 ${pct(t.cacheHitRate)}`,
		`预计费用 ${usd(t.estimatedCost)}`
	];
}
function renderGroups(groups) {
	if (groups.length === 0) return ["- 无匹配记录"];
	const lines = [];
	for (const group of groups) lines.push(`- **${group.key}**: ${totalsLine(group).join(" | ")}`);
	return lines;
}
function renderResult(result) {
	const lines = [];
	lines.push("### Token 用量统计");
	lines.push("");
	lines.push(`- **总计**: ${totalsLine(result.totals).join(" | ")}`);
	lines.push("");
	lines.push("#### 分组明细");
	lines.push(...renderGroups(result.groups));
	lines.push("");
	lines.push("#### 扫描范围");
	for (const scan of result.scanned) lines.push(`- ${scan.source}: ${scan.files} 个文件 / ${scan.records} 条记录 <- ${scan.root}`);
	lines.push("");
	lines.push(`_价格: 输入 $${result.prices.input}/1M, 缓存命中 $${result.prices.cacheHit}/1M, 缓存写入 $${result.prices.cacheWrite}/1M, 输出 $${result.prices.output}/1M_`);
	return lines.join("\n");
}
//#endregion
//#region src/index.ts
const name = "dsh-token-usage-observer";
const inject = ["tools"];
const usage = "统计本机 DeepSeek Harness / Codex / OpenCode 的 token 用量与费用";
function apply(ctx, config = {}) {
	ctx.tools.register(defineTool({
		name: "usage_stats",
		description: "统计本机 DeepSeek Harness / Codex (ChatGPT) / OpenCode 的 token 用量：输入（缓存未命中）、输入（缓存命中）、缓存写入、输出、缓存命中率与预计费用。数据来源为本地会话日志，支持按来源、时间段（YYYY-MM-DD）与分类（模型/agent preset）筛选。",
		parameters: {
			source: {
				type: "string",
				enum: [
					"all",
					"deepseek-harness",
					"codex",
					"opencode"
				],
				description: "统计来源，默认 all"
			},
			from: {
				type: "string",
				description: "起始日期（含），格式 YYYY-MM-DD，按本地时区"
			},
			to: {
				type: "string",
				description: "结束日期（含），格式 YYYY-MM-DD，按本地时区"
			},
			category: {
				type: "string",
				description: "按分类筛选（模型 id 或 agent preset，不区分大小写，子串匹配）"
			},
			groupBy: {
				type: "string",
				enum: [
					"source",
					"category",
					"day",
					"none"
				],
				description: "分组维度，默认 source"
			},
			prices: {
				type: "object",
				additionalProperties: false,
				properties: {
					input: {
						type: "number",
						description: "每 1M 未缓存输入 token 的价格（USD）"
					},
					cacheHit: {
						type: "number",
						description: "每 1M 缓存命中输入 token 的价格（USD）"
					},
					cacheWrite: {
						type: "number",
						description: "每 1M 缓存写入 token 的价格（USD）"
					},
					output: {
						type: "number",
						description: "每 1M 输出 token 的价格（USD）"
					}
				}
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					totals: {
						type: "object",
						additionalProperties: false,
						properties: {
							requests: { type: "integer" },
							input: { type: "integer" },
							output: { type: "integer" },
							cacheMiss: { type: "integer" },
							cacheHit: { type: "integer" },
							cacheWrite: { type: "integer" },
							cacheHitRate: { type: "number" },
							estimatedCost: { type: "number" }
						}
					},
					groups: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								key: { type: "string" },
								requests: { type: "integer" },
								input: { type: "integer" },
								output: { type: "integer" },
								cacheMiss: { type: "integer" },
								cacheHit: { type: "integer" },
								cacheWrite: { type: "integer" },
								cacheHitRate: { type: "number" },
								estimatedCost: { type: "number" }
							}
						}
					},
					scanned: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								source: { type: "string" },
								root: { type: "string" },
								files: { type: "integer" },
								records: { type: "integer" }
							}
						}
					},
					prices: {
						type: "object",
						additionalProperties: false,
						properties: {
							input: { type: "number" },
							cacheHit: { type: "number" },
							cacheWrite: { type: "number" },
							output: { type: "number" }
						}
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: renderResult(value)
			}]
		},
		async execute(args, _exec) {
			const typed = args;
			const { records, scanned } = collectAll(config, typed.source === "all" || !typed.source ? [
				"deepseek-harness",
				"codex",
				"opencode"
			] : [typed.source]);
			return summarize(records, scanned, typed, config.prices);
		}
	}));
}
//#endregion
export { apply, inject, name, usage };

//# sourceMappingURL=index.js.map