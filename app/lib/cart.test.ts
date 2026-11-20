import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASKET_KEY,
  EMPTY_BASKET,
  MAX_PLATES,
  PAYMENT_NAMES,
  addPlan,
  addWash,
  basketTotals,
  clearWash,
  isPayment,
  loadBasket,
  removePlan,
  removeService,
  saveBasket,
  setPlates,
} from './cart.ts'
import type { KeyValueStore } from './store.ts'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

const blocked: KeyValueStore = {
  getItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
  setItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
  removeItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
}

test('services added from the price list become one wash for one vehicle', () => {
  const basket = addWash(EMPTY_BASKET, 'small', ['express', 'engine'])
  assert.deepEqual(basket.wash, { vehicle: 'small', ids: ['express', 'engine'] })
  assert.equal(basket.plan, null)
  assert.deepEqual(EMPTY_BASKET, { wash: null, plan: null }, 'the empty basket is never changed')
})

test('adding more for the same vehicle merges without repeats; another vehicle replaces the wash', () => {
  let basket = addWash(EMPTY_BASKET, 'medium', ['express'])
  basket = addWash(basket, 'medium', ['engine', 'express'])
  assert.deepEqual(basket.wash, { vehicle: 'medium', ids: ['express', 'engine'] })
  basket = addWash(basket, 'large', ['wash-wax'])
  assert.deepEqual(basket.wash, { vehicle: 'large', ids: ['wash-wax'] })
})

test('services the vehicle cannot get, and unknown ones, are not added', () => {
  const basket = addWash(EMPTY_BASKET, 'motorcycle', ['express', 'interior', 'polish'])
  assert.deepEqual(basket.wash, { vehicle: 'motorcycle', ids: ['express'] })
  assert.equal(addWash(EMPTY_BASKET, 'motorcycle', ['interior']), EMPTY_BASKET, 'nothing to add leaves the basket as it was')
})

test('removing services one by one empties the wash', () => {
  let basket = addWash(EMPTY_BASKET, 'small', ['express', 'engine'])
  basket = removeService(basket, 'express')
  assert.deepEqual(basket.wash, { vehicle: 'small', ids: ['engine'] })
  basket = removeService(basket, 'engine')
  assert.equal(basket.wash, null)
  assert.equal(clearWash(addWash(EMPTY_BASKET, 'small', ['express'])).wash, null)
})

test('one pack at a time, for a vehicle it is offered for, starting at one plate', () => {
  let basket = addPlan(EMPTY_BASKET, 'express-4', 'small')
  assert.deepEqual(basket.plan, { id: 'express-4', vehicle: 'small', plates: 1 })
  basket = addPlan(basket, 'care-4', 'medium')
  assert.deepEqual(basket.plan, { id: 'care-4', vehicle: 'medium', plates: 1 })
  assert.equal(addPlan(basket, 'care-4', 'motorcycle'), basket, 'Care 4 is not offered for motorcycles')
  assert.equal(removePlan(basket).plan, null)
})

test('the number of packs (one plate each) changes between 1 and the maximum', () => {
  let basket = addPlan(EMPTY_BASKET, 'express-8', 'large')
  basket = setPlates(basket, 3)
  assert.equal(basket.plan?.plates, 3)
  assert.equal(setPlates(basket, 0).plan?.plates, 1)
  assert.equal(setPlates(basket, 99).plan?.plates, MAX_PLATES)
  assert.equal(setPlates(basket, 2.7).plan?.plates, 2)
  assert.equal(setPlates(EMPTY_BASKET, 2), EMPTY_BASKET, 'no plan, nothing to change')
  assert.equal(addPlan(basket, 'express-8', 'large').plan?.plates, 3, 'adding the same pack again keeps its plates')
})

test('totals: the wash from the price list, the pack per plate and per month, and the item count', () => {
  let basket = addWash(EMPTY_BASKET, 'small', ['express', 'engine'])
  basket = setPlates(addPlan(basket, 'express-4', 'small'), 2)
  assert.deepEqual(basketTotals(basket), { wash: 580, minutes: 50, planEach: 650, planMonthly: 1300, items: 3 })
  assert.deepEqual(basketTotals(EMPTY_BASKET), { wash: 0, minutes: 0, planEach: 0, planMonthly: 0, items: 0 })
})

test('the basket is saved and read back', () => {
  const store = memoryStore()
  assert.deepEqual(loadBasket(store), EMPTY_BASKET)
  const basket = setPlates(addPlan(addWash(EMPTY_BASKET, 'medium', ['express']), 'care-4', 'medium'), 2)
  assert.equal(saveBasket(store, basket), true)
  assert.ok(store.data.has(BASKET_KEY))
  assert.deepEqual(loadBasket(store), basket)
})

test('a damaged or hand-edited basket is cleaned up on reading', () => {
  const store = memoryStore()
  store.setItem(BASKET_KEY, 'nope')
  assert.deepEqual(loadBasket(store), EMPTY_BASKET)
  store.setItem(BASKET_KEY, JSON.stringify({ wash: { vehicle: 'motorcycle', ids: ['express', 'glass', 'x'] }, plan: { id: 'care-4', vehicle: 'motorcycle', plates: 2 } }))
  assert.deepEqual(loadBasket(store), { wash: { vehicle: 'motorcycle', ids: ['express'] }, plan: null })
  store.setItem(BASKET_KEY, JSON.stringify({ wash: { vehicle: 'boat', ids: ['express'] }, plan: { id: 'express-8', vehicle: 'small', plates: 40 } }))
  assert.deepEqual(loadBasket(store), { wash: null, plan: { id: 'express-8', vehicle: 'small', plates: MAX_PLATES } })
  store.setItem(BASKET_KEY, JSON.stringify({ wash: null, plan: { id: 'unlimited', vehicle: 'small', plates: 1 } }))
  assert.deepEqual(loadBasket(store), EMPTY_BASKET, 'an old unlimited plan is dropped')
})

test('with storage blocked the basket reads empty and saving reports failure, without throwing', () => {
  assert.deepEqual(loadBasket(blocked), EMPTY_BASKET)
  assert.equal(saveBasket(blocked, addWash(EMPTY_BASKET, 'small', ['express'])), false)
  assert.deepEqual(loadBasket(null), EMPTY_BASKET)
})

test('payment is GCash, Maya or card, and nothing else', () => {
  assert.deepEqual(PAYMENT_NAMES, { gcash: 'GCash', maya: 'Maya', card: 'Card' })
  assert.ok(isPayment('maya'))
  assert.ok(!isPayment('cash'))
  assert.ok(!isPayment(''))
})
