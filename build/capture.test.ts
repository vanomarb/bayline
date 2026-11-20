import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureAt } from './capture.ts'

const AT = '2026-11-19T10:30:00+08:00'
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('a pinned clock is honoured only in capture mode', () => {
  assert.equal(captureAt('capture', AT), AT)
  for (const mode of ['production', 'development', 'test', '']) assert.equal(captureAt(mode, AT), '', mode)
})

test('an unset or unparseable capture time pins nothing, even in capture mode', () => {
  assert.equal(captureAt('capture', undefined), '')
  assert.equal(captureAt('capture', ''), '')
  assert.equal(captureAt('capture', 'tomorrow-ish'), '')
})

test('the clock shim reads the mode-guarded define, never the raw environment variable', () => {
  const shim = read('../app/capture-clock.ts')
  assert.ok(!/import\.meta\.env\.VITE_CAPTURE_AT/.test(shim.replace(/\/\/.*$/gm, '')), 'raw env read in capture-clock.ts')
  assert.match(shim, /__CAPTURE_AT__/)
  const config = read('../vite.config.ts')
  assert.match(config, /captureAt\(mode/)
})

test('only the capture scripts pass --mode capture', () => {
  const scripts = JSON.parse(read('../package.json')).scripts as Record<string, string>
  assert.match(scripts['build:capture'], /--mode capture/)
  assert.match(scripts['preview:capture'], /--mode capture/)
  for (const name of ['build', 'preview', 'dev']) assert.ok(!/capture/.test(scripts[name]), name)
})

// The shim runs on import, so each case imports a fresh copy with the define set, then puts the real Date back.
async function withPinnedClock(run: () => void): Promise<void> {
  const RealDate = globalThis.Date
  Object.assign(globalThis, { __CAPTURE_AT__: AT })
  try {
    await import(`../app/capture-clock.ts?pinned=${Math.random()}`)
    run()
  } finally {
    globalThis.Date = RealDate
    delete (globalThis as Record<string, unknown>).__CAPTURE_AT__
  }
}

test('the pinned Date works with new, Date.now() and, as a function without new, as the date string', async () => {
  await withPinnedClock(() => {
    const at = Date.parse(AT)
    assert.ok(Math.abs(new Date().getTime() - at) < 5000, 'new Date()')
    assert.ok(Math.abs(Date.now() - at) < 5000, 'Date.now()')
    assert.equal(new Date('2026-01-02T00:00:00Z').toISOString(), '2026-01-02T00:00:00.000Z', 'arguments still work')
    assert.ok(new Date() instanceof Date)
    const text = (Date as unknown as () => string)()
    assert.equal(typeof text, 'string', 'Date() returns a string like the real one')
    assert.match(text, /2026/, 'and it is the pinned moment')
  })
})

test('without the define the clock stays real', async () => {
  const RealDate = globalThis.Date
  Object.assign(globalThis, { __CAPTURE_AT__: '' })
  try {
    await import(`../app/capture-clock.ts?unpinned=${Math.random()}`)
    assert.equal(globalThis.Date, RealDate)
  } finally {
    delete (globalThis as Record<string, unknown>).__CAPTURE_AT__
  }
})
