window.__ModuleLoader__.load({
	id: "dsh-token-usage-observer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/** URL prefix of the token-usage route family (host half owns the routes). */
		const STATS_API_PREFIX = "/dsh-token-usage";
		const REQUEST_TIMEOUT_MS = 3e4;
		/** Error carrying the route's JSON error message. */
		var StatsApiError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "StatsApiError";
			}
		};
		async function readJson(response) {
			const body = await response.json();
			if (!response.ok) throw new StatsApiError(body.error ?? `token-usage request failed: ${response.status}`);
			return body;
		}
		var StatsApi = class {
			/**
			* Fetch aggregated token usage.
			* @param query - filters; omitted fields use host defaults.
			* @returns the aggregated result (totals, groups, scanned diagnostics, prices).
			*/
			async stats(query = {}) {
				const params = new URLSearchParams();
				if (query.source !== void 0 && query.source !== "all") params.set("source", query.source);
				if (query.from !== void 0 && query.from !== "") params.set("from", query.from);
				if (query.to !== void 0 && query.to !== "") params.set("to", query.to);
				if (query.category !== void 0 && query.category !== "") params.set("category", query.category);
				if (query.groupBy !== void 0 && query.groupBy !== "source") params.set("groupBy", query.groupBy);
				if (query.prices !== void 0) {
					for (const [key, value] of Object.entries(query.prices)) if (typeof value === "number" && Number.isFinite(value)) params.set(key, String(value));
				}
				const queryString = params.toString();
				const url = `${STATS_API_PREFIX}/stats${queryString === "" ? "" : `?${queryString}`}`;
				const controller = new AbortController();
				const timeout = globalThis.setTimeout(() => {
					controller.abort();
				}, REQUEST_TIMEOUT_MS);
				try {
					return await readJson(await fetch(url, {
						cache: "no-store",
						signal: controller.signal
					}));
				} catch (error) {
					if (controller.signal.aborted) throw new StatsApiError(`token-usage Host request timed out after ${REQUEST_TIMEOUT_MS / 1e3}s`);
					throw error;
				} finally {
					globalThis.clearTimeout(timeout);
				}
			}
		};
		//#endregion
		//#region src/client/controller.ts
		var PanelController = class {
			open = false;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return { panelOpen: this.open };
			}
			toggle() {
				this.open = !this.open;
				this.notify();
			}
			close() {
				if (!this.open) return;
				this.open = false;
				this.notify();
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			notify() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/types.ts
		const SOURCES = [
			"deepseek-harness",
			"codex",
			"opencode"
		];
		const SOURCE_LABELS = {
			"deepseek-harness": "DeepSeek Harness",
			codex: "Codex (ChatGPT)",
			opencode: "OpenCode"
		};
		//#endregion
		//#region src/client/Dashboard.tsx
		/**
		* Token-usage dashboard — the WebUI surface of the plugin.
		*
		* Filter bar (source / time range / category / groupBy / prices) drives a
		* fetch to the host stats route; the result renders as summary cards, a
		* totals distribution chart (stacked token bars per group), a per-session
		* detail list, and scan diagnostics. Plain React, no UI kit; styles come from
		* the injected plugin stylesheet (`dsh-tu-*` classes).
		*/
		const DEFAULT_PRICES = {
			input: .14,
			cacheHit: .014,
			cacheWrite: 0,
			output: .28
		};
		const GROUPBY_OPTIONS = [
			{
				value: "source",
				label: "按来源"
			},
			{
				value: "category",
				label: "按分类"
			},
			{
				value: "day",
				label: "按日期"
			},
			{
				value: "none",
				label: "不分组"
			}
		];
		function fmt(n) {
			return n.toLocaleString("en-US");
		}
		function pct(rate) {
			return `${(rate * 100).toFixed(2)}%`;
		}
		function usd(cost) {
			if (cost >= 100) return `$${cost.toFixed(2)}`;
			if (cost >= .01) return `$${cost.toFixed(4)}`;
			return `$${cost.toFixed(6)}`;
		}
		/** Short session id: keep the tail of the id after the last `-` segment run. */
		function shortSession(session) {
			if (session.length <= 16) return session;
			const tail = session.split("-").filter(Boolean).pop() ?? session;
			return tail.length > 12 ? `…${tail.slice(-12)}` : `…${tail}`;
		}
		/** Display label for a session row: the real name when available, else the short id. */
		function sessionLabel(session) {
			const name = session.sessionName?.trim();
			return name !== void 0 && name !== "" ? name : shortSession(session.session);
		}
		function Dashboard({ api }) {
			const [source, setSource] = (0, react.useState)("all");
			const [from, setFrom] = (0, react.useState)("");
			const [to, setTo] = (0, react.useState)("");
			const [category, setCategory] = (0, react.useState)("");
			const [groupBy, setGroupBy] = (0, react.useState)("source");
			const [priceInput, setPriceInput] = (0, react.useState)(String(DEFAULT_PRICES.input));
			const [priceCacheHit, setPriceCacheHit] = (0, react.useState)(String(DEFAULT_PRICES.cacheHit));
			const [priceCacheWrite, setPriceCacheWrite] = (0, react.useState)(String(DEFAULT_PRICES.cacheWrite));
			const [priceOutput, setPriceOutput] = (0, react.useState)(String(DEFAULT_PRICES.output));
			const [result, setResult] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [lastQuery, setLastQuery] = (0, react.useState)(null);
			const requestSeq = (0, react.useRef)(0);
			const buildQuery = (0, react.useCallback)(() => {
				const num = (raw) => {
					const value = Number(raw);
					return raw !== "" && Number.isFinite(value) && value >= 0 ? value : void 0;
				};
				const prices = {
					input: num(priceInput),
					cacheHit: num(priceCacheHit),
					cacheWrite: num(priceCacheWrite),
					output: num(priceOutput)
				};
				const hasAnyPrice = Object.values(prices).some((v) => v !== void 0);
				return {
					source,
					from: from || void 0,
					to: to || void 0,
					category: category.trim() || void 0,
					groupBy,
					...hasAnyPrice ? { prices } : {}
				};
			}, [
				source,
				from,
				to,
				category,
				groupBy,
				priceInput,
				priceCacheHit,
				priceCacheWrite,
				priceOutput
			]);
			const run = (0, react.useCallback)(async (query, signal) => {
				const seq = ++requestSeq.current;
				setLoading(true);
				setError(null);
				try {
					const value = await api.stats(query);
					if (seq !== requestSeq.current) return;
					setResult(value);
					setLastQuery(query);
				} catch (caught) {
					if (seq !== requestSeq.current) return;
					const message = caught instanceof StatsApiError ? caught.message : caught instanceof Error ? caught.message : String(caught);
					if (signal?.aborted) return;
					setError(message);
					setResult(null);
				} finally {
					if (seq === requestSeq.current) setLoading(false);
				}
			}, [api]);
			(0, react.useEffect)(() => {
				const query = buildQuery();
				if (lastQuery !== null && JSON.stringify(query) === JSON.stringify(lastQuery)) return;
				const controller = new AbortController();
				const timer = globalThis.setTimeout(() => {
					run(query, controller.signal);
				}, 250);
				return () => {
					globalThis.clearTimeout(timer);
					controller.abort();
				};
			}, [
				buildQuery,
				run,
				lastQuery
			]);
			const refresh = (0, react.useCallback)(() => {
				setLastQuery(null);
				run(buildQuery());
			}, [buildQuery, run]);
			const totals = result?.totals;
			const groups = result?.groups ?? [];
			const sessions = result?.sessions ?? [];
			const sourceLabel = (key) => {
				if (key in SOURCE_LABELS) return SOURCE_LABELS[key];
				return key;
			};
			const maxTotal = Math.max(1, ...groups.map((g) => g.cacheMiss + g.cacheHit + g.cacheWrite + g.output));
			const barSeg = (value) => `${Math.max(0, value / maxTotal * 100)}%`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-tu-dashboard",
				"data-dsh-plugin": "token-usage-observer",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-tu-header",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: "dsh-tu-title",
								children: "Token 用量统计"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-tu-subtitle",
								children: "DeepSeek Harness / Codex (ChatGPT) / OpenCode"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-tu-spacer" }),
							loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-tu-loading",
								children: "统计中…"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-tu-button",
								onClick: refresh,
								disabled: loading,
								children: loading ? "刷新中…" : "刷新"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-tu-filters",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "来源"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: "dsh-tu-select",
									value: source,
									onChange: (e) => setSource(e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "all",
										children: "全部"
									}), SOURCES.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: s,
										children: SOURCE_LABELS[s]
									}, s))]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "起始日期"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-tu-input",
									type: "date",
									value: from,
									onChange: (e) => setFrom(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "结束日期"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-tu-input",
									type: "date",
									value: to,
									onChange: (e) => setTo(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "分类筛选（模型 / preset）"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-tu-input",
									type: "text",
									placeholder: "如 deepseek-chat",
									value: category,
									onChange: (e) => setCategory(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "图表分组维度"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: "dsh-tu-select",
									value: groupBy,
									onChange: (e) => setGroupBy(e.target.value),
									children: GROUPBY_OPTIONS.map((o) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: o.value,
										children: o.label
									}, o.value))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "输入价 $/1M（未缓存）"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-tu-input",
									type: "number",
									min: "0",
									step: "0.001",
									value: priceInput,
									onChange: (e) => setPriceInput(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "缓存命中价 $/1M"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-tu-input",
									type: "number",
									min: "0",
									step: "0.001",
									value: priceCacheHit,
									onChange: (e) => setPriceCacheHit(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "缓存写入价 $/1M"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-tu-input",
									type: "number",
									min: "0",
									step: "0.001",
									value: priceCacheWrite,
									onChange: (e) => setPriceCacheWrite(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-tu-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-fieldLabel",
									children: "输出价 $/1M"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-tu-input",
									type: "number",
									min: "0",
									step: "0.001",
									value: priceOutput,
									onChange: (e) => setPriceOutput(e.target.value)
								})]
							})
						]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-tu-error",
						children: ["统计失败：", error]
					}),
					totals !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-tu-cards",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardValue",
									children: fmt(totals.requests)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardLabel",
									children: "请求数"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardValue",
									children: fmt(totals.cacheMiss)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardLabel",
									children: "输入（缓存未命中）"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardValue",
									children: fmt(totals.cacheHit)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardLabel",
									children: "输入（缓存命中）"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardValue",
									children: fmt(totals.cacheWrite)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardLabel",
									children: "缓存写入"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardValue",
									children: fmt(totals.output)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardLabel",
									children: "输出"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardValue",
									children: pct(totals.cacheHitRate)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardLabel",
									children: "缓存命中率"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardValue dsh-tu-cardCost",
									children: usd(totals.estimatedCost)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-tu-cardLabel",
									children: "预计费用"
								})]
							})
						]
					}),
					result !== null && groups.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-tu-chart",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
								className: "dsh-tu-sectionTitle",
								children: [
									"总量分布（",
									sourceLabel((groupBy ?? "source") === "none" ? "total" : groupBy ?? "source"),
									"）"
								]
							}),
							groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-chartRow",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-tu-chartLabel",
										title: group.key,
										children: sourceLabel(group.key)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-tu-chartBar",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dsh-tu-chartSegMiss",
												style: { width: barSeg(group.cacheMiss) }
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dsh-tu-chartSegHit",
												style: { width: barSeg(group.cacheHit) }
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dsh-tu-chartSegWrite",
												style: { width: barSeg(group.cacheWrite) }
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dsh-tu-chartSegOutput",
												style: { width: barSeg(group.output) }
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-tu-chartValue",
										title: `请求 ${fmt(group.requests)} · 输入(未缓存) ${fmt(group.cacheMiss)} · 输入(缓存命中) ${fmt(group.cacheHit)} · 缓存写入 ${fmt(group.cacheWrite)} · 输出 ${fmt(group.output)} · 命中率 ${pct(group.cacheHitRate)}`,
										children: usd(group.estimatedCost)
									})
								]
							}, group.key)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-tu-chartLegend",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-tu-legendItem",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-tu-legendSwatch dsh-tu-chartSegMiss" }), "输入(未缓存)"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-tu-legendItem",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-tu-legendSwatch dsh-tu-chartSegHit" }), "输入(缓存命中)"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-tu-legendItem",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-tu-legendSwatch dsh-tu-chartSegWrite" }), "缓存写入"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-tu-legendItem",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-tu-legendSwatch dsh-tu-chartSegOutput" }), "输出"]
									})
								]
							})
						]
					}),
					result !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-tu-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
							className: "dsh-tu-sectionTitle",
							children: [
								"会话明细（",
								sessions.length,
								"，按费用降序）"
							]
						}), sessions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-tu-empty",
							children: "无匹配记录"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-tu-tableWrap",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
								className: "dsh-tu-table",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
										className: "dsh-tu-left",
										children: "来源"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
										className: "dsh-tu-left",
										children: "会话名称"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
										className: "dsh-tu-left",
										children: "会话 ID"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
										className: "dsh-tu-left",
										children: "模型 / 预设"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
										className: "dsh-tu-left",
										children: "最近时间"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "请求数" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "输入(未缓存)" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "输入(缓存命中)" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "缓存写入" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "输出" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "命中率" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "费用" })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: sessions.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: "dsh-tu-left",
										children: sourceLabel(session.source)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: "dsh-tu-left",
										title: session.sessionName ?? session.session,
										children: sessionLabel(session)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: "dsh-tu-left",
										title: session.session,
										children: shortSession(session.session)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: "dsh-tu-left",
										title: session.category,
										children: session.category
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: "dsh-tu-left",
										children: session.timestamp > 0 ? new Date(session.timestamp).toISOString().slice(0, 10) : "-"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: fmt(session.requests) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: fmt(session.cacheMiss) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: fmt(session.cacheHit) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: fmt(session.cacheWrite) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: fmt(session.output) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: pct(session.cacheHitRate) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: usd(session.estimatedCost) })
								] }, session.key)) })]
							})
						})]
					}),
					result !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-tu-scanned",
						children: [result.scanned.map((scan) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							SOURCE_LABELS[scan.source] ?? scan.source,
							"：",
							scan.files,
							" 个文件 / ",
							scan.records,
							" 条记录 ← ",
							scan.root
						] }, scan.source)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							"价格：输入 $",
							result.prices.input,
							"/1M · 缓存命中 $",
							result.prices.cacheHit,
							"/1M · 缓存写入 $",
							result.prices.cacheWrite,
							"/1M · 输出 $",
							result.prices.output,
							"/1M"
						] })]
					})
				]
			});
		}
		//#endregion
		//#region src/client/mount.tsx
		/**
		* Dashboard view mounting.
		*
		* The `conversation` slot is single-occupant (ui-conversation) and external
		* plugins cannot declare slots, so the dashboard takes over the center column
		* at the DOM level: a container is appended inside the center column
		* (`[data-pane="conversation"]`, `[class*="centerCol"]`) as an extra trailing
		* child React never manages, and a stylesheet rule hides the conversation
		* content while the dashboard is active. Toggling is a data attribute on
		* `<html>` — no React involvement, so the conversation subtree underneath
		* stays mounted and stateful.
		*/
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"], [class*=\"centerCol\"]";
		const ACTIVE_ATTR = "data-dsh-token-usage-active";
		/** The sibling panels' activation attributes, removed when this panel opens. */
		const OTHER_ACTIVE_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
		/** Cross-plugin activation event; detail is the activating panel name. */
		const ACTIVATE_EVENT = "dsh-panel-activate";
		const PANEL_NAME = "token-usage";
		/** Find the center column, or undefined while the frame is not mounted. */
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		/**
		* Mount the dashboard React tree into the center column and bind its
		* visibility to the controller's panelOpen state.
		* @param controller - the panel controller driving the view.
		* @param api - stats HTTP client handed to the dashboard.
		* @returns disposer unmounting the tree and restoring the column.
		*/
		function mountPanel(controller, api) {
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) return;
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshTokenUsageView = "";
				container.dataset.dshPlugin = "token-usage-observer";
				container.className = "dsh-tu-view";
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dashboard, { api }));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyActive = () => {
				if (controller.getSnapshot().panelOpen) {
					for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
			};
			const onOtherActivate = (event) => {
				const detail = event.detail;
				if ((detail === "taskboard" || detail === "ssh") && controller.getSnapshot().panelOpen) controller.close();
			};
			const SIDEBAR_ROW_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
			const onClickSidebarRow = (event) => {
				if (!controller.getSnapshot().panelOpen) return;
				const target = event.target;
				if (target === null) return;
				if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close();
			};
			document.addEventListener("click", onClickSidebarRow, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
			const unsubscribe = controller.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				document.removeEventListener("click", onClickSidebarRow, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		//#endregion
		//#region src/client/sidebar-entry.ts
		/** Find the sidebar shell root element, or undefined while not yet mounted. */
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		/** The New Session button: nested in the logo row on current shells, a direct child on legacy shells. */
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		/** Build the entry row (a detached button; insert once the shell is up). */
		function createEntry(options) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.setAttribute(options.rowAttribute, "");
			if (options.plugin !== void 0) {
				entry.setAttribute("data-dsh-plugin", options.plugin);
				entry.setAttribute("data-dsh-part", "sidebar-entry");
			}
			entry.className = options.css["entry"] ?? "";
			entry.setAttribute("aria-label", options.label());
			if (options.tooltip !== void 0) entry.setAttribute("title", options.tooltip());
			entry.innerHTML = `<span class="${options.css["entryIcon"] ?? ""}">${options.icon}</span><span class="${options.css["entryLabel"] ?? ""}">${options.label()}</span>`;
			entry.addEventListener("click", options.onToggle);
			return entry;
		}
		/** Re-insert the entry after the New Session row (before the browser region). */
		function placeEntry(root, entry, options) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			if (entry.parentElement !== root) {
				const row = button.closest("[class*=\"logoRow\"]");
				const base = row !== null && row.parentElement === root ? row : button;
				const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches(options.familySelectors.join(", ")));
				const anchor = options.position === "before" ? family.length > 0 ? family[0] : base.nextElementSibling : family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling;
				root.insertBefore(entry, anchor);
			}
			return true;
		}
		/**
		* Mount the sidebar entry, waiting for the shell to render and self-healing
		* on later React re-renders.
		* @param options - the row's attribute/icon/copy/action/ordering configuration.
		* @returns disposer removing the entry and its observers.
		*/
		function mountSidebarEntry(options) {
			if (typeof document !== "undefined" && document.querySelector(options.rowSelector) !== null) return () => {};
			const entry = createEntry(options);
			let root;
			let placed = false;
			const tryPlace = () => {
				if (root !== void 0 && !root.isConnected) {
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				if (placed) {
					if (document.body.contains(entry)) return;
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntry(root, entry, options);
				if (placed) rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				if (!root.contains(entry)) placed = placeEntry(root, entry, options);
			});
			const unsubscribeActive = options.active === void 0 ? void 0 : (() => {
				const syncActive = () => {
					if (options.active.isOpen()) entry.dataset.active = "true";
					else delete entry.dataset.active;
				};
				const unsubscribe = options.active.subscribe(syncActive);
				syncActive();
				return unsubscribe;
			})();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribeActive?.();
				entry.remove();
			};
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* Dashboard + sidebar-entry styles, injected as a single `<style>` tag.
		*
		* Plain CSS (no CSS-module build pipeline): the class names below are
		* globally unique (`dsh-tu-*`) and scoped by the plugin's own data
		* attributes, so nothing leaks into the rest of the GUI. Colors ride the dsh
		* `--dsw-*` theme tokens so the dashboard follows the active theme/skin.
		*/
		const STYLES = `
/* --- sidebar entry row ------------------------------------------------------- */

.dsh-tu-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.dsh-tu-entry:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover);
  color: var(--dsw-alias-label-primary);
}

.dsh-tu-entry[data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.dsh-tu-entryIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.dsh-tu-entryLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-dsh-frame][data-sidebar-collapsed] .dsh-tu-entry {
  justify-content: center;
  padding: 0;
  width: 100%;
}

[data-dsh-frame][data-sidebar-collapsed] .dsh-tu-entryLabel {
  display: none;
}

/* --- center-column takeover (global rules, attribute-scoped) ------------------ */

[data-pane='conversation'],
[class*='centerCol'] {
  position: relative;
}

[data-dsh-token-usage-view] {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
}

html[data-dsh-token-usage-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-dsh-token-usage-view] {
  display: block;
}

html[data-dsh-token-usage-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-pane='conversation'] > :not([data-dsh-token-usage-view]),
html[data-dsh-token-usage-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [class*='centerCol'] > :not([data-dsh-token-usage-view]) {
  display: none !important;
}

/* --- dashboard frame ---------------------------------------------------------- */

.dsh-tu-dashboard {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 20px;
  gap: 12px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  font-size: 13px;
}

.dsh-tu-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  flex-wrap: wrap;
}

.dsh-tu-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}

.dsh-tu-subtitle {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dsh-tu-spacer {
  flex: 1;
}

.dsh-tu-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.dsh-tu-button:hover {
  border-color: var(--dsw-alias-border-l1);
}

.dsh-tu-button:disabled {
  opacity: 0.6;
  cursor: default;
}

/* --- filter bar --------------------------------------------------------------- */

.dsh-tu-filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  flex: none;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-input-major);
}

.dsh-tu-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.dsh-tu-fieldLabel {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dsh-tu-input,
.dsh-tu-select {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  outline: none;
  min-width: 0;
}

.dsh-tu-input:focus,
.dsh-tu-select:focus {
  border-color: var(--dsw-alias-border-l1);
}

/* --- totals cards -------------------------------------------------------------- */

.dsh-tu-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  flex: none;
}

.dsh-tu-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-input-major);
  min-width: 0;
}

.dsh-tu-cardValue {
  font-size: 17px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-tu-cardLabel {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dsh-tu-cardCost {
  color: var(--dsw-alias-accent);
}

/* --- totals chart (source/category/day distribution) -------------------------- */

.dsh-tu-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: none;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-input-major);
}

.dsh-tu-chartRow {
  display: grid;
  grid-template-columns: minmax(96px, 180px) 1fr auto;
  align-items: center;
  gap: 10px;
}

.dsh-tu-chartLabel {
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-tu-chartBar {
  display: flex;
  height: 14px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  min-width: 40px;
}

.dsh-tu-chartSegMiss {
  background: #4c8dff;
}

.dsh-tu-chartSegHit {
  background: #2ecc71;
}

.dsh-tu-chartSegWrite {
  background: #f5a623;
}

.dsh-tu-chartSegOutput {
  background: #e5484d;
}

.dsh-tu-chartValue {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}

.dsh-tu-chartLegend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  flex: none;
}

.dsh-tu-legendItem {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dsh-tu-legendSwatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

/* --- groups table -------------------------------------------------------------- */

.dsh-tu-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  flex: 1;
}

.dsh-tu-sectionTitle {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  flex: none;
}

.dsh-tu-tableWrap {
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  flex: 1;
  min-height: 0;
}

.dsh-tu-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
}

.dsh-tu-table th {
  position: sticky;
  top: 0;
  text-align: right;
  padding: 6px 10px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-specific-input-major);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  white-space: nowrap;
  z-index: 1;
}

.dsh-tu-table th.dsh-tu-left {
  text-align: left;
}

.dsh-tu-table td {
  padding: 5px 10px;
  text-align: right;
  border-bottom: 1px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dsh-tu-table td.dsh-tu-left {
  text-align: left;
}

.dsh-tu-table tr:last-child td {
  border-bottom: none;
}

.dsh-tu-table tbody tr:hover td {
  background: var(--dsw-specific-sidebar-nav-item-hover);
}

.dsh-tu-empty {
  padding: 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-tu-error {
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-danger, #e5484d);
  border-radius: 8px;
  color: var(--dsw-alias-danger, #e5484d);
  background: var(--dsw-specific-input-major);
  font-size: 12px;
  white-space: pre-wrap;
}

.dsh-tu-loading {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dsh-tu-scanned {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  flex: none;
}
`;
		let injected = false;
		/** Inject the plugin stylesheet once (idempotent; the loader removes plugin-owned tags on unload). */
		function injectStyles() {
			if (injected || typeof document === "undefined") return;
			injected = true;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-token-usage-observer";
			tag.dataset.pluginCss = "dsh-token-usage-observer/all";
			tag.textContent = STYLES;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services (none beyond the cordis core — the dashboard talks to the host over HTTP). */
		const inject = [];
		/**
		* Mount the token-usage dashboard.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			injectStyles();
			const controller = new PanelController();
			const api = new StatsApi();
			const disposers = [];
			try {
				disposers.push(mountSidebarEntry({
					rowAttribute: "data-dsh-token-usage-entry",
					rowSelector: "[data-dsh-token-usage-entry]",
					plugin: "token-usage-observer",
					icon: "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 12.5v-3M6.5 12.5v-6M10 12.5v-8M13.5 12.5v-4\"/><rect x=\"1.5\" y=\"1.5\" width=\"13\" height=\"13\" rx=\"1.5\"/></svg>",
					css: {
						entry: "dsh-tu-entry",
						entryIcon: "dsh-tu-entryIcon",
						entryLabel: "dsh-tu-entryLabel"
					},
					label: () => "Token 统计",
					tooltip: () => "本机 token 用量统计看板",
					onToggle: () => {
						controller.toggle();
					},
					position: "after",
					familySelectors: [
						"[data-dsh-taskboard-entry]",
						"[data-dsh-ssh-entry]",
						"[data-dsh-token-usage-entry]"
					],
					active: {
						subscribe: (listener) => controller.subscribe(listener),
						isOpen: () => controller.getSnapshot().panelOpen
					}
				}));
				disposers.push(mountPanel(controller, api));
			} catch (error) {
				console.warn("[dsh-token-usage-observer] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-token-usage-observer: ui mounts");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map