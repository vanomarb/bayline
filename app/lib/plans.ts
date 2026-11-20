import { findService, type Vehicle } from './services.ts'

// The code says "plan"; the pages say "wash pack".

export type PlanId = 'express-4' | 'express-8' | 'care-4'

/** One kind of wash in a pack and how many a month, with how the account page counts it ("3 of 4 express washes"). */
export interface PackItem {
  service: string
  count: number
  one: string
  many: string
}

export interface Plan {
  id: PlanId
  name: string
  /** What a month holds, as the plans page says it. */
  includes: string
  items: PackItem[]
  /** Per plate, none where a service in it isn't offered; 80 to 92% of paying per wash, ending in 0 (plans.test.ts checks). */
  prices: Partial<Record<Vehicle, number>>
}

/** The fair-use rules every pack carries, shown on the plans page, in the FAQ and in the Terms. */
export const PACK_RULES = {
  platesPerPack: 1,
  washesPerDay: 1,
  carryOver: false,
  cancelBy: 'before the next month starts',
} as const

export const PLANS: Plan[] = [
  {
    id: 'express-4',
    name: 'Express 4',
    includes: '4 express washes a month, about one a week.',
    items: [{ service: 'express', count: 4, one: 'express wash', many: 'express washes' }],
    prices: { small: 650, medium: 790, large: 940, motorcycle: 360 },
  },
  {
    id: 'express-8',
    name: 'Express 8',
    includes: '8 express washes a month, about two a week.',
    items: [{ service: 'express', count: 8, one: 'express wash', many: 'express washes' }],
    prices: { small: 1220, medium: 1490, large: 1770, motorcycle: 680 },
  },
  {
    id: 'care-4',
    name: 'Care 4',
    includes: '4 washes with a vacuum a month, one of them with a hand wax.',
    items: [
      { service: 'wash-vacuum', count: 4, one: 'wash and vacuum', many: 'washes and vacuums' },
      { service: 'wash-wax', count: 1, one: 'wash with hand wax', many: 'washes with hand wax' },
    ],
    prices: { small: 1410, medium: 1650, large: 1900 },
  },
]

export function findPlan(id: PlanId): Plan | undefined {
  return PLANS.find((plan) => plan.id === id)
}

export function washesPerMonth(plan: Plan): number {
  return plan.items.reduce((sum, item) => sum + item.count, 0)
}

/** What the same washes cost paid one by one, or null where a wash in the pack isn't offered for the vehicle. */
export function perWashTotal(plan: Plan, vehicle: Vehicle): number | null {
  let total = 0
  for (const item of plan.items) {
    const price = findService(item.service)?.prices[vehicle]
    if (price === undefined) return null
    total += price * item.count
  }
  return total
}

/** The monthly price for one plate, or null where the pack isn't offered. */
export function packPrice(plan: Plan, vehicle: Vehicle): number | null {
  return perWashTotal(plan, vehicle) === null ? null : (plan.prices[vehicle] ?? null)
}

/** How much less the pack costs than paying per wash, a month, or null where it isn't offered. */
export function savings(plan: Plan, vehicle: Vehicle): number | null {
  const total = perWashTotal(plan, vehicle)
  const price = packPrice(plan, vehicle)
  return total === null || price === null ? null : total - price
}

export interface UsedWash {
  /** YYYY-MM-DD */
  day: string
  plate: string
  ids: string[]
}

/**
 * Each plate has its own pack. A booking uses one wash from the first item it covers with some left, one a day per plate,
 * from `since` (YYYY-MM-DD) on; other plates and months don't count, and nothing goes below zero.
 */
export function washesLeft(plan: Plan, plates: string[], bookings: UsedWash[], month: string, since = ''): { service: string; count: number; left: number }[] {
  const left = plan.items.map((item) => ({ service: item.service, count: item.count * plates.length, left: item.count * plates.length }))
  const used = new Set<string>()
  for (const booking of [...bookings].sort((a, b) => a.day.localeCompare(b.day))) {
    const key = `${booking.plate}|${booking.day}`
    if (!booking.day.startsWith(`${month}-`) || booking.day < since || !plates.includes(booking.plate) || used.has(key)) continue
    const slot = left.find((item) => item.left > 0 && booking.ids.includes(item.service))
    if (!slot) continue
    slot.left -= 1
    used.add(key)
  }
  return left
}

export type PackBooking =
  | { kind: 'not-on-pack' }
  /** The pack allows one wash a day per plate, and this plate already has one that day. */
  | { kind: 'one-a-day' }
  | { kind: 'covered' }
  /** On the pack but not covered: the wash is charged at the bay price. */
  | { kind: 'charged'; why: 'not-started' | 'none-left' | 'not-included' }

/**
 * One wash a day per pack plate. A wash counts against the pack only from its start day, in a service it includes,
 * while the month has washes left for that plate; anything else on a pack plate is charged at the bay price.
 */
export function packBooking(plan: Plan, plates: string[], since: string, bookings: UsedWash[], day: string, plate: string, ids: string[]): PackBooking {
  if (!plates.includes(plate)) return { kind: 'not-on-pack' }
  if (bookings.some((b) => b.plate === plate && b.day === day)) return { kind: 'one-a-day' }
  if (day < since) return { kind: 'charged', why: 'not-started' }
  if (!plan.items.some((item) => ids.includes(item.service))) return { kind: 'charged', why: 'not-included' }
  const left = washesLeft(plan, [plate], bookings, day.slice(0, 7), since)
  return left.some((item) => item.left > 0 && ids.includes(item.service)) ? { kind: 'covered' } : { kind: 'charged', why: 'none-left' }
}
