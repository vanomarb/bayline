import type { Vehicle } from './services.ts'

export interface Car {
  plate: string
  vehicle: Vehicle
  /** In a bay: minutes until it's done. In line: how long its wash will take. */
  minutesLeft: number
  mine?: true
}

export interface QueueState {
  bays: (Car | null)[]
  waiting: Car[]
}

export interface QueueEvent {
  type: 'bay-free' | 'my-turn'
  bay: number
}

/** The yard the page opens on; the plates are made-up samples, not customers. */
export function seedQueue(): QueueState {
  return {
    bays: [
      { plate: 'ABC 1234', vehicle: 'small', minutesLeft: 12 },
      { plate: 'DEF 567', vehicle: 'medium', minutesLeft: 4 },
      { plate: 'GHI 8901', vehicle: 'large', minutesLeft: 25 },
    ],
    waiting: [
      { plate: '123 JKL', vehicle: 'motorcycle', minutesLeft: 20 },
      { plate: 'MNO 2345', vehicle: 'small', minutesLeft: 35 },
      { plate: 'PQR 678', vehicle: 'medium', minutesLeft: 20 },
    ],
  }
}

/** The earliest-free-bay rule: each waiting car, in order, takes whichever bay frees up first. */
function plan(state: QueueState): { starts: number[]; freeAt: number[] } {
  const freeAt = state.bays.map((car) => car?.minutesLeft ?? 0)
  const starts = state.waiting.map((car) => {
    const bay = freeAt.indexOf(Math.min(...freeAt))
    const start = freeAt[bay]
    freeAt[bay] = start + car.minutesLeft
    return start
  })
  return { starts, freeAt }
}

/** Minutes until a bay frees up for each car in line, front first. */
export function waitTimes(state: QueueState): number[] {
  return plan(state).starts
}

/** Minutes until a bay frees up for a car that joins the back of the line now. */
export function waitForNext(state: QueueState): number {
  return Math.min(...plan(state).freeAt)
}

/** `position` is 1-based. */
export function join(state: QueueState, car: Car): { state: QueueState; position: number; etaMinutes: number } {
  return {
    state: { bays: [...state.bays], waiting: [...state.waiting, car] },
    position: state.waiting.length + 1,
    etaMinutes: waitForNext(state),
  }
}

/** Free bays fill from the front of the line first (`my-turn` for the visitor's car); then bays count down and finished cars leave. */
export function tick(state: QueueState, minutes: number): { state: QueueState; events: QueueEvent[] } {
  const bays = [...state.bays]
  const waiting = [...state.waiting]
  const events: QueueEvent[] = []

  bays.forEach((car, bay) => {
    if (car !== null) return
    const next = waiting.shift()
    if (next === undefined) return
    bays[bay] = next
    if (next.mine) events.push({ type: 'my-turn', bay })
  })

  bays.forEach((car, bay) => {
    if (car === null) return
    const minutesLeft = car.minutesLeft - minutes
    if (minutesLeft > 0) {
      bays[bay] = { ...car, minutesLeft }
    } else {
      bays[bay] = null
      events.push({ type: 'bay-free', bay })
    }
  })

  return { state: { bays, waiting }, events }
}
