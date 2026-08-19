import { Context } from "@deepseek-ai/cordis";
//#region src/types.d.ts
/** Shared types for the usage observer collectors. */
type Source = 'deepseek-harness' | 'codex' | 'opencode';
interface Prices {
  /** USD per 1M uncached input tokens. */
  input: number;
  /** USD per 1M cached input tokens. */
  cacheHit: number;
  /** USD per 1M cache-write input tokens. */
  cacheWrite: number;
  /** USD per 1M output tokens. */
  output: number;
}
/** Plugin configuration. */
interface PluginConfig {
  /** Root directories to scan, per source. Overrides defaults. */
  paths?: Partial<Record<Source, string[]>>;
  /** OpenCode SQLite database files. Overrides the default discovery. */
  opencodeDbs?: string[];
  /** Default prices per 1M tokens, in USD. */
  prices?: Partial<Prices>;
}
//#endregion
//#region src/index.d.ts
declare const name = "dsh-token-usage-observer";
declare const inject: string[];
declare const usage = "统计本机 DeepSeek Harness / Codex / OpenCode 的 token 用量与费用";
declare function apply(ctx: Context, config?: PluginConfig): void;
//#endregion
export { apply, inject, name, usage };
//# sourceMappingURL=index.d.ts.map