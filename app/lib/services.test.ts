import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SERVICES, isVehicle, quote } from './services.ts'

test('quote totals price and time and flags what a vehicle cannot get', () => {
  assert.deepEqual(quote('small', ['express', 'engine']), { total: 580, minutes: 50, unavailable: [] })
  assert.deepEqual(quote('motorcycle', ['express', 'wash-vacuum']), { total: 100, minutes: 20, unavailable: ['wash-vacuum'] })
})

test('the price list matches the brief', () => {
  assert.deepEqual(SERVICES.map((s) => [s.id, s.minutes]), [
    ['express', 20], ['wash-vacuum', 35], ['wash-wax', 50], ['engine', 30], ['glass', 90], ['interior', 180], ['ceramic', 480],
  ])
  assert.deepEqual(SERVICES.find((s) => s.id === 'ceramic')?.prices, { small: 12000, medium: 15000, large: 18000, motorcycle: 4500 })
  assert.equal(SERVICES.find((s) => s.id === 'ceramic')?.appointmentOnly, true)
  assert.equal(SERVICES.filter((s) => s.appointmentOnly).length, 1)
  assert.deepEqual(SERVICES.filter((s) => s.prices.motorcycle === undefined).map((s) => s.id), ['wash-vacuum', 'glass', 'interior'])
})

test('quote ignores repeats, flags unknown ids and handles an empty list', () => {
  assert.deepEqual(quote('medium', ['express', 'express']), { total: 220, minutes: 20, unavailable: [] })
  assert.deepEqual(quote('large', ['express', 'polish']), { total: 260, minutes: 20, unavailable: ['polish'] })
  assert.deepEqual(quote('small', []), { total: 0, minutes: 0, unavailable: [] })
})

test('isVehicle only accepts the four vehicle sizes', () => {
  assert.ok(isVehicle('motorcycle'))
  assert.equal(isVehicle('truck'), false)
  assert.equal(isVehicle(''), false)
})
