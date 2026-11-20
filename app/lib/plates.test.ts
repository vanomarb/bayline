import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidPlate, normalizePlate } from './plates.ts'

test('plates normalise and validate', () => {
  assert.equal(normalizePlate(' nbc-1234 '), 'NBC 1234'); assert.equal(normalizePlate('nbc1234'), 'NBC 1234')
  assert.ok(isValidPlate('abc 123')); assert.ok(isValidPlate('123abc')); assert.ok(isValidPlate('AB 12345'))
  assert.equal(isValidPlate(''), false); assert.equal(isValidPlate('12'), false); assert.equal(isValidPlate('ABCD 12345'), false)
})

test('every accepted format survives messy typing', () => {
  assert.equal(normalizePlate('abc.1234'), 'ABC 1234')
  assert.equal(normalizePlate('  1234  ab '), '1234 AB')
  assert.equal(normalizePlate('ab_12345'), 'AB 12345')
  // \u2013 is the dash a phone keyboard's smart punctuation can turn a hyphen into
  for (const plate of ['ABC 1234', 'ABC 123', '123 ABC', '1234 AB', 'AB 12345', 'nbc\u20131234', 'Nbc 1234']) {
    assert.ok(isValidPlate(plate), plate)
  }
})

test('nonsense, mixed-up and overlong input is rejected without throwing', () => {
  for (const plate of ['   ', '----', 'A1B2C3', 'ABC 12', '12345 AB', 'ABC1234X', 'NBC 1234 5678']) {
    assert.equal(isValidPlate(plate), false, plate)
  }
  const long = 'nbc-1234'.repeat(5000)
  assert.equal(isValidPlate(long), false)
  assert.equal(typeof normalizePlate(long), 'string')
})
