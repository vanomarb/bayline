import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./visit-switch.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// <html> carries data-visit, so a bare closest('[data-visit]') on a document click matches every click and pulls focus.
test('no click handler matches a bare [data-visit], which <html> always carries', () => {
  for (const [, , selector] of source.matchAll(/closest(?:<[^>]*>)?\(\s*(['"`])(.*?)\1/g)) {
    assert.ok(!/(^|[\s,])\[data-visit[\]=]/.test(selector), `unscoped selector: ${selector}`)
  }
  assert.ok(!/document\.addEventListener\(\s*'click'/.test(source), 'document-level click handler')
})

test('the tab switch moves focus only for keyboard navigation', () => {
  const calls = [...source.matchAll(/select\([^)]*(true|false)\)/g)].map((m) => m[1])
  assert.ok(calls.includes('true'))
  assert.equal(source.match(/\.focus\(/g)?.length, 1)
})
