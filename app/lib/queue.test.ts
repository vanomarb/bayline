import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, seedQueue, tick, waitForNext, waitTimes, type Car, type QueueState } from './queue.ts'
import { isValidPlate } from './plates.ts'

const mine: Car = { plate: 'NBC 1234', vehicle: 'small', minutesLeft: 20, mine: true }

test('joining a full yard queues behind the waiting cars', () => {
  const { position, etaMinutes } = join(seedQueue(), { plate: 'NBC 1234', vehicle: 'small', minutesLeft: 20, mine: true })
  assert.equal(position, 4); assert.ok(etaMinutes > 0)
})

test('ticking moves the next car into a free bay and tells me when it is my turn', () => {
  let { state } = join({ bays: [null, { plate: 'XYZ 111', vehicle: 'small', minutesLeft: 5 }, null], waiting: [] }, { plate: 'NBC 1234', vehicle: 'small', minutesLeft: 20, mine: true })
  const result = tick(state, 1)
  assert.ok(result.events.some((e) => e.type === 'my-turn'))
})

test('the seeded yard is fixed: three busy bays, three waiting, sample plates', () => {
  const seed = seedQueue()
  assert.deepEqual(seed, seedQueue())
  assert.equal(seed.bays.length, 3)
  assert.ok(seed.bays.every((car) => car !== null && car.minutesLeft > 0))
  assert.equal(seed.waiting.length, 3)
  const plates = [...seed.bays, ...seed.waiting].map((car) => car?.plate ?? '')
  assert.equal(new Set(plates).size, 6)
  assert.ok(plates.every(isValidPlate))
  assert.ok([...seed.bays, ...seed.waiting].every((car) => car?.mine === undefined))
})

test('waits follow the earliest-free-bay rule', () => {
  const seed = seedQueue()
  assert.deepEqual(waitTimes(seed), [4, 12, 24])
  assert.equal(waitForNext(seed), 25) // the wait sign's 'about 25 minutes' is exact on the first load
  assert.equal(join(seed, mine).etaMinutes, 25)
  assert.equal(waitForNext({ bays: [null, null, null], waiting: [] }), 0)
})

test('join appends without touching the state it was given', () => {
  const seed = seedQueue()
  const before = structuredClone(seed)
  const { state } = join(seed, mine)
  assert.deepEqual(seed, before)
  assert.equal(state.waiting.at(-1), mine)
  assert.equal(state.waiting.length, 4)
})

test('a finished car frees its bay and the next car takes it on the following tick', () => {
  const start: QueueState = { bays: [{ plate: 'ABC 1234', vehicle: 'small', minutesLeft: 1 }, null], waiting: [{ plate: 'DEF 567', vehicle: 'medium', minutesLeft: 20 }] }
  const first = tick(start, 1)
  assert.deepEqual(first.events, [{ type: 'bay-free', bay: 0 }])
  assert.equal(first.state.bays[1]?.plate, 'DEF 567')
  assert.equal(first.state.bays[1]?.minutesLeft, 19)
  assert.equal(first.state.bays[0], null)
  assert.deepEqual(start.bays[0], { plate: 'ABC 1234', vehicle: 'small', minutesLeft: 1 })
})

test('my turn comes one tick after my wait runs out, in the bay that frees first', () => {
  let { state, etaMinutes } = join(seedQueue(), mine)
  for (let minute = 1; minute <= etaMinutes; minute++) {
    const result = tick(state, 1)
    assert.equal(result.events.some((e) => e.type === 'my-turn'), false, `minute ${minute}`)
    state = result.state
  }
  assert.deepEqual(waitTimes(state).at(-1), 0)
  const turn = tick(state, 1)
  assert.deepEqual(turn.events.filter((e) => e.type === 'my-turn'), [{ type: 'my-turn', bay: 2 }])
})

test('the yard empties out once every car is done', () => {
  let state = seedQueue()
  for (let minute = 0; minute < 120; minute++) state = tick(state, 1).state
  assert.deepEqual(state, { bays: [null, null, null], waiting: [] })
})
