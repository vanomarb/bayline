import { findPlan, type PlanId } from './plans.ts'
import { findService, isVehicle, quote, type Vehicle } from './services.ts'
import { isRecord, readJSON, writeJSON, type KeyValueStore } from './store.ts'

/** One visit's wash: one job for one plate. */
export interface BasketWash {
  vehicle: Vehicle
  ids: string[]
}

/** `plates` is how many packs, one registered plate each. */
export interface BasketPlan {
  id: PlanId
  vehicle: Vehicle
  plates: number
}

export interface Basket {
  wash: BasketWash | null
  plan: BasketPlan | null
}

export const BASKET_KEY = 'bayline.basket'
export const MAX_PLATES = 4
export const EMPTY_BASKET: Basket = Object.freeze({ wash: null, plan: null }) as Basket

/** Never a card or account number: the app or the card page takes those. */
export type Payment = 'gcash' | 'maya' | 'card'
export const PAYMENT_NAMES: Record<Payment, string> = { gcash: 'GCash', maya: 'Maya', card: 'Card' }

export function isPayment(value: unknown): value is Payment {
  return typeof value === 'string' && Object.hasOwn(PAYMENT_NAMES, value)
}

const offered = (vehicle: Vehicle) => (id: string) => findService(id)?.prices[vehicle] !== undefined
const planOffered = (id: string, vehicle: Vehicle) => findPlan(id as PlanId)?.prices[vehicle] !== undefined
const clampPlates = (n: number) => Math.min(MAX_PLATES, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)))

/**
 * The same vehicle merges into the wash (no repeats); another vehicle replaces it, as one visit is one plate.
 * Services the vehicle can't get are left out, and if none are left the basket comes back unchanged.
 */
export function addWash(basket: Basket, vehicle: Vehicle, ids: string[]): Basket {
  const adding = [...new Set(ids)].filter(offered(vehicle))
  if (adding.length === 0) return basket
  const kept = basket.wash?.vehicle === vehicle ? basket.wash.ids : []
  return { ...basket, wash: { vehicle, ids: [...new Set([...kept, ...adding])] } }
}

export function removeService(basket: Basket, id: string): Basket {
  if (!basket.wash) return basket
  const ids = basket.wash.ids.filter((kept) => kept !== id)
  return { ...basket, wash: ids.length === 0 ? null : { ...basket.wash, ids } }
}

export function clearWash(basket: Basket): Basket {
  return { ...basket, wash: null }
}

/** One pack at a time. Adding the pack already there keeps its count; a pack the vehicle can't have is ignored. */
export function addPlan(basket: Basket, id: PlanId, vehicle: Vehicle): Basket {
  if (!planOffered(id, vehicle)) return basket
  const same = basket.plan?.id === id && basket.plan.vehicle === vehicle
  return { ...basket, plan: { id, vehicle, plates: same ? basket.plan!.plates : 1 } }
}

/** How many packs (one plate each), clamped to 1..MAX_PLATES. */
export function setPlates(basket: Basket, plates: number): Basket {
  if (!basket.plan) return basket
  return { ...basket, plan: { ...basket.plan, plates: clampPlates(plates) } }
}

export function removePlan(basket: Basket): Basket {
  return { ...basket, plan: null }
}

export interface BasketTotals {
  wash: number
  minutes: number
  /** The pack's monthly price for one plate, and for all of them. */
  planEach: number
  planMonthly: number
  /** Services plus one for a pack: the number on the header badge. */
  items: number
}

export function basketTotals(basket: Basket): BasketTotals {
  const { total, minutes } = basket.wash ? quote(basket.wash.vehicle, basket.wash.ids) : { total: 0, minutes: 0 }
  const planEach = basket.plan ? (findPlan(basket.plan.id)?.prices[basket.plan.vehicle] ?? 0) : 0
  return {
    wash: total,
    minutes,
    planEach,
    planMonthly: planEach * (basket.plan?.plates ?? 0),
    items: (basket.wash?.ids.length ?? 0) + (basket.plan ? 1 : 0),
  }
}

/** The saved basket, cleaned of anything the price list no longer allows. Empty when missing, damaged or blocked. */
export function loadBasket(store: KeyValueStore | null): Basket {
  const saved = readJSON(store, BASKET_KEY)
  if (!isRecord(saved)) return EMPTY_BASKET
  let basket: Basket = EMPTY_BASKET
  const wash = saved.wash
  if (isRecord(wash) && typeof wash.vehicle === 'string' && isVehicle(wash.vehicle) && Array.isArray(wash.ids)) {
    basket = addWash(basket, wash.vehicle, wash.ids.filter((id): id is string => typeof id === 'string'))
  }
  const plan = saved.plan
  if (isRecord(plan) && typeof plan.id === 'string' && typeof plan.vehicle === 'string' && isVehicle(plan.vehicle)) {
    basket = addPlan(basket, plan.id as PlanId, plan.vehicle)
    if (typeof plan.plates === 'number') basket = setPlates(basket, plan.plates)
  }
  return basket
}

export function saveBasket(store: KeyValueStore | null, basket: Basket): boolean {
  return writeJSON(store, BASKET_KEY, basket)
}
