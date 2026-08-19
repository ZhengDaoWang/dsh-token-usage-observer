import { defineConfig } from 'tsdown'

/**
 * Dual-face build for the dsh-token-usage-observer plugin:
 *
 * 1. Node half (src/index.ts) -> lib/index.js + lib/index.d.ts — the host
 *    plugin: `usage_stats` agent tool + the /dsh-token-usage HTTP routes.
 * 2. Browser client half (src/client/index.ts) -> lib/client.js — the WebUI
 *    dashboard bundle in the `window.__ModuleLoader__.load({id, factory})`
 *    closure-factory format (externals resolved through the injected require
 *    from the loader module table; no globals, no import map).
 *
 * The client bundle mirrors the official dsh web plugin build preset
 * (platform module table + banner/footer wrapper). CSS is injected at runtime
 * from styles.ts (plain CSS string), so no CSS-module build pipeline is
 * needed.
 */

/** The module specifiers the shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** Externals resolved from the loader module table. */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

export default defineConfig([
  {
    // ---- Node half ---------------------------------------------------------
    name: 'dsh-token-usage-observer',
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    dts: true,
    clean: false,
    deps: {
      neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
    },
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  },
  {
    // ---- Browser client half ----------------------------------------------
    name: 'dsh-token-usage-observer/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      // tsdown auto-externalizes package dependencies; anything NOT in the
      // loader module table must inline instead. A require() the table cannot
      // answer is a guaranteed runtime throw, so the rule is the table list
      // itself: no opinion for table entries (external above wins), bundle
      // everything else.
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "dsh-token-usage-observer", factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
