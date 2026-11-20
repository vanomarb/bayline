import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JOIN_KEY, selectionFromQuery, selectionToQuery, stashPlate, takePlate } from './handoff.ts'
import type { KeyValueStore } from './store.ts'

test('a selection travels as a short query string and comes back the same', () => {
  const query = selectionToQuery({ vehicle: 'medium', ids: ['express', 'engine'] })
  assert.equal(query, 'vehicle=medium&services=express,engine')
  assert.deepEqual(selectionFromQuery(`?${query}`), { vehicle: 'medium', ids: ['express', 'engine'] })
})

test('no query, or one without a vehicle, means no hand-off', () => {
  assert.equal(selectionFromQuery(''), null)
  assert.equal(selectionFromQuery('?services=express'), null)
  assert.equal(selectionFromQuery('?vehicle=truck&services=express'), null)
})

test('unknown and repeated services are dropped, and nothing ticked is allowed', () => {
  assert.deepEqual(selectionFromQuery('?vehicle=large&services=express,polish,express,ceramic'), { vehicle: 'large', ids: ['express', 'ceramic'] })
  assert.deepEqual(selectionFromQuery('?vehicle=motorcycle&services='), { vehicle: 'motorcycle', ids: [] })
  assert.deepEqual(selectionFromQuery('?vehicle=small'), { vehicle: 'small', ids: [] })
})

test('hand-edited or hostile input never throws', () => {
  assert.equal(selectionFromQuery('?vehicle=%E0%A4%A'), null)
  assert.deepEqual(selectionFromQuery(`?vehicle=small&services=${'x,'.repeat(5000)}`), { vehicle: 'small', ids: [] })
})

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

test('a plate typed on Home waits in session storage, never the address, and is read once', () => {
  const store = memory()
  assert.equal(stashPlate(store, '  nbc 1234 '), true)
  assert.equal(store.data.get(JOIN_KEY), '"nbc 1234"')
  assert.equal(takePlate(store), 'nbc 1234')
  assert.equal(store.data.has(JOIN_KEY), false, 'removed as it is read')
  assert.equal(takePlate(store), null, 'a second read finds nothing')
})

test('an empty field is still a hand-off: the line page focuses its form', () => {
  const store = memory()
  stashPlate(store, '   ')
  assert.equal(takePlate(store), '')
})

test('nothing left means no hand-off, and a damaged or oversized value never throws', () => {
  const store = memory()
  assert.equal(takePlate(store), null)
  store.data.set(JOIN_KEY, '{not json')
  assert.equal(takePlate(store), null)
  store.data.set(JOIN_KEY, '42')
  assert.equal(takePlate(store), null)
  stashPlate(store, 'A'.repeat(200))
  assert.equal(takePlate(store)?.length, 24)
})

test('blocked storage loses the plate but never throws', () => {
  const blocked: KeyValueStore = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
    removeItem: () => {
      throw new Error('blocked')
    },
  }
  assert.equal(stashPlate(blocked, 'NBC 1234'), false)
  assert.equal(takePlate(blocked), null)
  assert.equal(stashPlate(null, 'NBC 1234'), false)
  assert.equal(takePlate(null), null)
})
