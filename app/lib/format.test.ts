import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duration, fill, ordinal, peso } from './format.ts'

test('peso formats without decimals', () => {
  assert.equal(peso(85), '₱85'); assert.equal(peso(1290), '₱1,290'); assert.equal(peso(45000), '₱45,000')
})

test('duration reads like the price list', () => {
  assert.equal(duration(20), '20 min')
  assert.equal(duration(90), '1 h 30 min')
  assert.equal(duration(180), '3 h')
  assert.equal(duration(480), '1 day')
  assert.equal(duration(480 + 50), '1 day')
  assert.equal(duration(480 + 300), 'Over a day')
})

test('ordinal suffixes, including the teens', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd'])
})

test('fill swaps {keys} for values and leaves unknown keys alone', () => {
  assert.equal(fill('Bay {bay} is ready for {plate}', { bay: 2, plate: 'NBC 1234' }), 'Bay 2 is ready for NBC 1234')
  assert.equal(fill('{missing} stays', {}), '{missing} stays')
})
