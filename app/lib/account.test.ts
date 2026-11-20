import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOOKINGS_KEY,
  PLAN_KEY,
  SESSION_KEY,
  addBooking,
  clearSession,
  codeMatches,
  demoCode,
  endPlan,
  loadBookings,
  loadPlan,
  loadSession,
  maskContact,
  readContact,
  readFirstName,
  removeBooking,
  savePlan,
  saveSession,
  type Booking,
} from './account.ts'
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

// What a browser with site data blocked does: every call throws.
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

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  day: '2026-11-20',
  start: 600,
  plate: 'NBC 1234',
  summary: 'Express wash for a small car, 20 min, ₱180',
  payment: 'gcash',
  made: '2026-11-18',
  ids: ['express'],
  ...over,
})

test('an email address is accepted and lowercased', () => {
  assert.deepEqual(readContact('  Ana.Reyes@Example.com '), { ok: true, kind: 'email', value: 'ana.reyes@example.com' })
  assert.deepEqual(readContact('ana@example'), { ok: false, problem: 'invalid' })
  assert.deepEqual(readContact('ana @example.com'), { ok: false, problem: 'invalid' })
})

test('a Philippine mobile number is accepted in the usual ways of writing it, and shown one way', () => {
  for (const input of ['09171234567', '0917 123 4567', '0917-123-4567', '+639171234567', '+63 917 123 4567', '639171234567']) {
    assert.deepEqual(readContact(input), { ok: true, kind: 'mobile', value: '+63 917 123 4567' }, input)
  }
  for (const input of ['0917123456', '08171234567', '+6391712345678', '1234']) {
    assert.deepEqual(readContact(input), { ok: false, problem: 'invalid' }, input)
  }
})

test('an empty contact says it is empty, not invalid', () => {
  assert.deepEqual(readContact(''), { ok: false, problem: 'empty' })
  assert.deepEqual(readContact('   '), { ok: false, problem: 'empty' })
})

test('the first name is trimmed, single-spaced and kept short', () => {
  assert.deepEqual(readFirstName('  Ana   Marie '), { ok: true, value: 'Ana Marie' })
  assert.deepEqual(readFirstName(''), { ok: false, problem: 'empty' })
  assert.deepEqual(readFirstName('x'.repeat(31)), { ok: false, problem: 'long' })
})

test('the demo code is always four digits and checked without spaces', () => {
  assert.equal(demoCode(() => 0), '1000')
  assert.equal(demoCode(() => 0.4246), '4821')
  assert.equal(demoCode(() => 0.99999), '9999')
  for (let i = 0; i < 50; i++) assert.match(demoCode(), /^[1-9]\d{3}$/)
  assert.ok(codeMatches(' 48 21 ', '4821'))
  assert.ok(!codeMatches('4812', '4821'))
  assert.ok(!codeMatches('', '4821'))
})

test('a contact is masked for the account page', () => {
  assert.equal(maskContact('email', 'ana.reyes@example.com'), 'a•••@example.com')
  assert.equal(maskContact('mobile', '+63 917 123 4567'), '+63 9•• ••• 4567')
})

test('a session is saved, read back and cleared', () => {
  const store = memoryStore()
  assert.equal(loadSession(store), null)
  const session = { firstName: 'Ana', contact: '+63 917 123 4567', kind: 'mobile' as const, since: '2026-11-18' }
  assert.equal(saveSession(store, session), true)
  assert.ok(store.data.has(SESSION_KEY))
  assert.deepEqual(loadSession(store), session)
  assert.equal(clearSession(store), true)
  assert.equal(loadSession(store), null)
})

test('a damaged or hand-edited session reads as signed out', () => {
  const store = memoryStore()
  store.setItem(SESSION_KEY, '{not json')
  assert.equal(loadSession(store), null)
  store.setItem(SESSION_KEY, JSON.stringify({ firstName: '', contact: 'x', kind: 'fax', since: 1 }))
  assert.equal(loadSession(store), null)
})

test('with storage blocked nothing throws: signed out, and saving reports failure', () => {
  assert.equal(loadSession(blocked), null)
  assert.equal(saveSession(blocked, { firstName: 'Ana', contact: 'ana@example.com', kind: 'email', since: '2026-11-18' }), false)
  assert.equal(clearSession(blocked), false)
  assert.equal(loadSession(null), null)
  assert.deepEqual(loadBookings(blocked), [])
  assert.equal(addBooking(blocked, booking()), false)
  assert.equal(loadPlan(blocked), null)
})

test('bookings made on the site are kept in date and time order, and can be cancelled', () => {
  const store = memoryStore()
  assert.deepEqual(loadBookings(store), [])
  assert.equal(addBooking(store, booking({ id: 'late', day: '2026-11-21', start: 540 })), true)
  assert.equal(addBooking(store, booking({ id: 'early', day: '2026-11-20', start: 900 })), true)
  assert.equal(addBooking(store, booking({ id: 'earliest', day: '2026-11-20', start: 420 })), true)
  assert.deepEqual(loadBookings(store).map((b) => b.id), ['earliest', 'early', 'late'])
  assert.equal(removeBooking(store, 'early'), true)
  assert.deepEqual(loadBookings(store).map((b) => b.id), ['earliest', 'late'])
  assert.ok(store.data.has(BOOKINGS_KEY))
})

test('a damaged booking is dropped, the rest still read', () => {
  const store = memoryStore()
  store.setItem(BOOKINGS_KEY, JSON.stringify([booking(), { id: 'x', day: 'soon' }, booking({ id: 'b2', payment: 'cash' as never }), booking({ id: 'b3', ids: 'express' as never })]))
  assert.deepEqual(loadBookings(store).map((b) => b.id), ['b1'])
})

test('a booking saved before services were recorded reads with no services', () => {
  const store = memoryStore()
  const { ids: _ids, ...old } = booking({ id: 'old' })
  store.setItem(BOOKINGS_KEY, JSON.stringify([old]))
  assert.deepEqual(loadBookings(store)[0].ids, [])
})

test('a wash pack is saved with its plates and payment, and can be cancelled', () => {
  const store = memoryStore()
  assert.equal(loadPlan(store), null)
  const plan = { id: 'express-8' as const, vehicle: 'small' as const, plates: ['NBC 1234'], payment: 'maya' as const, since: '2026-11-18' }
  assert.equal(savePlan(store, plan), true)
  assert.deepEqual(loadPlan(store), plan)
  assert.ok(store.data.has(PLAN_KEY))
  assert.equal(endPlan(store), true)
  assert.equal(loadPlan(store), null)
})

test('a pack for a vehicle it is not offered for, without plates, or from the old unlimited plans, reads as no pack', () => {
  const store = memoryStore()
  store.setItem(PLAN_KEY, JSON.stringify({ id: 'care-4', vehicle: 'motorcycle', plates: ['123 ABC'], payment: 'card', since: '2026-11-18' }))
  assert.equal(loadPlan(store), null)
  store.setItem(PLAN_KEY, JSON.stringify({ id: 'express-4', vehicle: 'small', plates: [], payment: 'card', since: '2026-11-18' }))
  assert.equal(loadPlan(store), null)
  store.setItem(PLAN_KEY, JSON.stringify({ id: 'unlimited', vehicle: 'small', plates: ['NBC 1234'], payment: 'card', since: '2026-11-18' }))
  assert.equal(loadPlan(store), null)
})
