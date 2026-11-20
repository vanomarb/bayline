import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PACK_RULES, PLANS, findPlan, packBooking, packPrice, perWashTotal, savings, washesLeft, washesPerMonth } from './plans.ts'
import { VEHICLES } from './services.ts'

const pack = (id: string) => findPlan(id as never)!

test('three capped monthly packs, and nothing unlimited', () => {
  assert.deepEqual(PLANS.map((p) => p.id), ['express-4', 'express-8', 'care-4'])
  assert.deepEqual(PLANS.map((p) => washesPerMonth(p)), [4, 8, 5])
  for (const plan of PLANS) {
    assert.ok(!/unlimited/i.test(`${plan.name} ${plan.includes}`), `${plan.id}: no unlimited wording`)
    for (const item of plan.items) assert.ok(Number.isInteger(item.count) && item.count >= 1 && item.count <= 8, `${plan.id}: ${item.service} capped`)
  }
})

test('every pack, for every vehicle size it is offered for, costs 80% to 92% of paying per wash, in a clean figure', () => {
  for (const plan of PLANS) {
    for (const vehicle of VEHICLES) {
      const total = perWashTotal(plan, vehicle)
      const price = packPrice(plan, vehicle)
      if (total === null) {
        assert.equal(price, null, `${plan.id} ${vehicle}: not offered, so no price`)
        assert.equal(plan.prices[vehicle], undefined, `${plan.id} ${vehicle}: no stray price`)
        continue
      }
      assert.ok(price !== null, `${plan.id} ${vehicle}: priced`)
      const ratio = price / total
      assert.ok(ratio >= 0.8 && ratio <= 0.92, `${plan.id} ${vehicle}: ${price} is ${(ratio * 100).toFixed(1)}% of ${total}`)
      assert.equal(price % 10, 0, `${plan.id} ${vehicle}: a clean peso figure`)
      assert.equal(savings(plan, vehicle), total - price, `${plan.id} ${vehicle}: savings`)
    }
  }
})

test('express packs cover every size; Care 4 needs the vacuum, so not motorcycles', () => {
  for (const vehicle of VEHICLES) {
    assert.ok(packPrice(pack('express-4'), vehicle) !== null)
    assert.ok(packPrice(pack('express-8'), vehicle) !== null)
  }
  assert.equal(packPrice(pack('care-4'), 'motorcycle'), null)
})

test('per-wash totals come from the price list', () => {
  assert.equal(perWashTotal(pack('express-4'), 'small'), 4 * 180)
  assert.equal(perWashTotal(pack('express-8'), 'motorcycle'), 8 * 100)
  assert.equal(perWashTotal(pack('care-4'), 'large'), 4 * 380 + 640)
  assert.equal(savings(pack('express-8'), 'small'), 1440 - 1220)
})

test('the fair-use rules are part of the data: one plate, one wash a day, no carry-over, cancel before the next month', () => {
  assert.deepEqual(PACK_RULES, { platesPerPack: 1, washesPerDay: 1, carryOver: false, cancelBy: 'before the next month starts' })
})

test('washes left this month: only this month, only the pack plates and services, at most one a day per plate', () => {
  const bookings = [
    { day: '2026-11-03', plate: 'NBC 1234', ids: ['express'] },
    { day: '2026-11-03', plate: 'NBC 1234', ids: ['express', 'engine'] }, // same plate, same day: the pack covers one
    { day: '2026-11-10', plate: 'NBC 1234', ids: ['express'] },
    { day: '2026-10-28', plate: 'NBC 1234', ids: ['express'] }, // last month
    { day: '2026-11-12', plate: 'ABC 123', ids: ['express'] }, // another plate
    { day: '2026-11-14', plate: 'NBC 1234', ids: ['interior'] }, // not covered
  ]
  assert.deepEqual(washesLeft(pack('express-4'), ['NBC 1234'], bookings, '2026-11'), [{ service: 'express', count: 4, left: 2 }])
  assert.deepEqual(washesLeft(pack('express-4'), ['NBC 1234', 'ABC 123'], bookings, '2026-11'), [{ service: 'express', count: 8, left: 5 }])
  const care = washesLeft(pack('care-4'), ['NBC 1234'], [{ day: '2026-11-05', plate: 'NBC 1234', ids: ['wash-wax'] }], '2026-11')
  assert.deepEqual(care, [{ service: 'wash-vacuum', count: 4, left: 4 }, { service: 'wash-wax', count: 1, left: 0 }])
  const capped = washesLeft(pack('express-4'), ['NBC 1234'], Array.from({ length: 9 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, plate: 'NBC 1234', ids: ['express'] })), '2026-11')
  assert.deepEqual(capped, [{ service: 'express', count: 4, left: 0 }], 'never below zero')
})

test('washes left count only bookings on or after the day the pack started', () => {
  const bookings = [
    { day: '2026-11-02', plate: 'NBC 1234', ids: ['express'] }, // before the pack
    { day: '2026-11-04', plate: 'NBC 1234', ids: ['express'] },
    { day: '2026-11-09', plate: 'NBC 1234', ids: ['express'] },
  ]
  assert.deepEqual(washesLeft(pack('express-4'), ['NBC 1234'], bookings, '2026-11'), [{ service: 'express', count: 4, left: 1 }], 'no start date: all three count')
  assert.deepEqual(washesLeft(pack('express-4'), ['NBC 1234'], bookings, '2026-11', '2026-11-04'), [{ service: 'express', count: 4, left: 2 }], 'from the start day')
  assert.deepEqual(washesLeft(pack('express-4'), ['NBC 1234'], bookings, '2026-11', '2026-11-10'), [{ service: 'express', count: 4, left: 4 }], 'a pack started later has them all')
})

test('a booking on a pack plate: one a day, and what the pack does not cover is charged at the bay price', () => {
  const plan = pack('express-4')
  const on = (bookings: { day: string; plate: string; ids: string[] }[], day: string, plate = 'NBC 1234', ids = ['express']) => packBooking(plan, ['NBC 1234'], '2026-11-05', bookings, day, plate, ids)
  assert.deepEqual(on([], '2026-11-20', 'ZZZ 999'), { kind: 'not-on-pack' })
  assert.deepEqual(on([], '2026-11-20'), { kind: 'covered' })
  assert.deepEqual(on([{ day: '2026-11-20', plate: 'NBC 1234', ids: ['engine'] }], '2026-11-20'), { kind: 'one-a-day' })
  assert.deepEqual(on([], '2026-11-04'), { kind: 'charged', why: 'not-started' })
  assert.deepEqual(on([], '2026-11-20', 'NBC 1234', ['interior']), { kind: 'charged', why: 'not-included' })
  const used = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map((day) => ({ day, plate: 'NBC 1234', ids: ['express'] }))
  assert.deepEqual(on(used, '2026-11-20'), { kind: 'charged', why: 'none-left' }, 'four of four used')
  assert.deepEqual(on(used, '2026-12-02'), { kind: 'covered' }, 'next month starts fresh')
})
