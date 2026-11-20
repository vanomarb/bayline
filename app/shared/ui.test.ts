import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectionSummary } from './ui.ts'

const template = '{services} for a {vehicle}, {duration}, {price}'

test('the selection sentence keeps each time and price on one line', () => {
  const text = selectionSummary({ vehicle: 'small', ids: ['express'] }, template)
  assert.match(text, /^Express wash for a small car, 20 min, ₱180$/)
  const long = selectionSummary({ vehicle: 'small', ids: ['express', 'wash-wax', 'engine'] }, template)
  assert.ok(!/\d [hm]/.test(long), `no breaking space inside a value: ${long}`)
})
