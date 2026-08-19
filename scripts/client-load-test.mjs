/**
 * Client bundle load test: verifies the built lib/client.js registers through
 * the `window.__ModuleLoader__` contract and exports the cordis client face
 * (apply / inject). Runs the real bundle inside a `node:vm` context with a
 * minimal DOM + require stub, so the factory executes exactly as in the GUI.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(__dirname, '..', 'lib', 'client.js'), 'utf8')

// --- minimal DOM stub --------------------------------------------------------
function createElementStub(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    attributes: {},
    className: '',
    textContent: '',
    innerHTML: '',
    parentElement: null,
    isConnected: true,
    setAttribute(k, v) { this.attributes[k] = String(v) },
    removeAttribute(k) { delete this.attributes[k] },
    getAttribute(k) { return this.attributes[k] },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child },
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this) },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null },
    closest() { return null },
    matches() { return false },
  }
  return el
}

const body = createElementStub('body')
const head = createElementStub('head')
const column = createElementStub('div')
column.className = 'centerCol'
const documentElement = createElementStub('html')

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  URLSearchParams,
  AbortController,
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
  MutationObserver: class { observe() {} disconnect() {} },
  fetch: async () => ({ ok: true, json: async () => ({ totals: { requests: 0 }, groups: [], scanned: [], prices: {} }) }),
  document: {
    body,
    head,
    documentElement,
    createElement: createElementStub,
    querySelector(sel) { return String(sel).includes('centerCol') ? column : null },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true },
  },
}
sandbox.window = sandbox

// --- module loader stub -------------------------------------------------------
let registered = null
sandbox.window.__ModuleLoader__ = { load(entry) { registered = entry } }

vm.createContext(sandbox)
vm.runInContext(bundle, sandbox)

if (registered === null) throw new Error('FAIL: bundle did not register with __ModuleLoader__')
if (registered.id !== 'dsh-token-usage-observer') throw new Error(`FAIL: wrong id ${registered.id}`)

// --- require stub (platform modules only) --------------------------------------
const stubRequire = (specifier) => {
  if (specifier === 'react') return { useState: () => [], useEffect: () => {}, useCallback: (f) => f, useRef: () => ({ current: 0 }) }
  if (specifier === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: null }
  if (specifier === 'react-dom/client') return { createRoot: () => ({ render() {}, unmount() {} }) }
  throw new Error(`unexpected require: ${specifier}`)
}

const module = { exports: {} }
const factoryResult = registered.factory(stubRequire)
const face = factoryResult ?? module.exports

if (typeof face.apply !== 'function') throw new Error('FAIL: exports.apply missing')
if (!Array.isArray(face.inject)) throw new Error('FAIL: exports.inject missing')

// --- exercise apply(ctx) with a fake client context ----------------------------
const ctx = { effect(fn) { this._disposer = typeof fn === 'function' ? fn() : fn } }
face.apply(ctx)
if (typeof ctx._disposer !== 'function') throw new Error('FAIL: apply did not install a disposer')

console.log('OK: client bundle registered (id=' + registered.id + ')')
console.log('OK: exports.apply / inject present')
console.log('OK: apply(ctx) executed without throwing; disposer installed')
console.log('CLIENT LOAD TEST PASSED')
