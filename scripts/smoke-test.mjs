/**
 * Smoke test for the dsh-token-usage-observer host half.
 * Runs the built lib against real local logs and exercises the HTTP route
 * handler with fake req/res objects. Not part of the shipped plugin.
 */
import { homedir } from 'node:os'

const { makeStatsRoutes } = await import('../lib/index.js')

// --- 1. fake req/res ---------------------------------------------------------
function fakeRequest(overrides = {}) {
  return {
    method: 'GET',
    url: '/dsh-token-usage/stats',
    headers: { host: '127.0.0.1:8080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  }
}
function fakeResponse() {
  const res = {
    status: 0,
    body: '',
    headers: {},
    writeHead(status, headers) { this.status = status; this.headers = headers || {} },
    end(body) { this.body = body },
  }
  return res
}

async function run() {
  const home = homedir()
  const config = {
    prices: { input: 0.14, cacheHit: 0.014, cacheWrite: 0, output: 0.28 },
  }
  const [route] = makeStatsRoutes(config)
  if (route.kind !== 'exact' || route.path !== '/dsh-token-usage/stats') {
    console.error('FAIL: route shape wrong', route)
    process.exit(1)
  }

  // --- 1a. forbidden (non-loopback) -----------------------------------------
  const res403 = fakeResponse()
  route.handler(fakeRequest({ socket: { remoteAddress: '10.0.0.1' } }), res403)
  console.log('1a non-loopback ->', res403.status, res403.body)
  if (res403.status !== 403) throw new Error('expected 403 for non-loopback')

  // --- 1b. all sources, no filters ------------------------------------------
  const res200 = fakeResponse()
  route.handler(fakeRequest(), res200)
  console.log('1b all sources ->', res200.status)
  if (res200.status !== 200) throw new Error(`expected 200, got ${res200.status}: ${res200.body}`)
  const parsed = JSON.parse(res200.body)
  console.log('   totals:', JSON.stringify(parsed.totals))
  console.log('   groups:', parsed.groups.length)
  console.log('   scanned:', JSON.stringify(parsed.scanned.map(s => ({ source: s.source, files: s.files, records: s.records }))))
  if (typeof parsed.totals.estimatedCost !== 'number') throw new Error('totals.estimatedCost missing')

  // --- 1c. invalid price ------------------------------------------------------
  const res400 = fakeResponse()
  route.handler(fakeRequest({ url: '/dsh-token-usage/stats?input=abc' }), res400)
  console.log('1c invalid price ->', res400.status, res400.body)
  if (res400.status !== 400) throw new Error('expected 400 for invalid price')

  // --- 1d. filtered query ----------------------------------------------------
  const resFiltered = fakeResponse()
  route.handler(fakeRequest({ url: '/dsh-token-usage/stats?source=deepseek-harness&groupBy=category&from=2026-08-01' }), resFiltered)
  console.log('1d filtered ->', resFiltered.status)
  if (resFiltered.status !== 200) throw new Error('filtered request failed')
  const filtered = JSON.parse(resFiltered.body)
  console.log('   totals:', JSON.stringify(filtered.totals))

  // --- 1e. method not allowed -------------------------------------------------
  const res405 = fakeResponse()
  route.handler(fakeRequest({ method: 'POST' }), res405)
  console.log('1e POST ->', res405.status)
  if (res405.status !== 405) throw new Error('expected 405 for POST')

  console.log('SMOKE TEST PASSED')
}

run().catch((error) => {
  console.error('SMOKE TEST FAILED:', error)
  process.exit(1)
})
