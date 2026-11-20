import { isPayment, type Payment } from './cart.ts'
import { findPlan, type PlanId } from './plans.ts'
import { isVehicle, type Vehicle } from './services.ts'
import { isISODate, isRecord, readJSON, removeKey, writeJSON, type KeyValueStore } from './store.ts'

// There is never a password, and nothing is sent. The keys below are listed on the Privacy and Cookie pages.

export const SESSION_KEY = 'bayline.session'
export const BOOKINGS_KEY = 'bayline.bookings'
export const PLAN_KEY = 'bayline.plan'

export type ContactKind = 'email' | 'mobile'
export type ContactResult = { ok: true; kind: ContactKind; value: string } | { ok: false; problem: 'empty' | 'invalid' }

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const MAX_NAME = 30

/** An email (lowercased), or a mobile as 09171234567, 0917 123 4567, +63 917 123 4567 or 639171234567 → '+63 917 123 4567'. */
export function readContact(input: string): ContactResult {
  const text = input.trim()
  if (text === '') return { ok: false, problem: 'empty' }
  if (text.includes('@')) return EMAIL.test(text) ? { ok: true, kind: 'email', value: text.toLowerCase() } : { ok: false, problem: 'invalid' }
  const digits = text.replace(/[\s\-().]/g, '')
  const local = digits.match(/^(?:0|\+63|63)(9\d{9})$/)?.[1]
  if (local === undefined) return { ok: false, problem: 'invalid' }
  return { ok: true, kind: 'mobile', value: `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` }
}

export function readFirstName(input: string): { ok: true; value: string } | { ok: false; problem: 'empty' | 'long' } {
  const value = input.trim().replace(/\s+/g, ' ')
  if (value === '') return { ok: false, problem: 'empty' }
  if (value.length > MAX_NAME) return { ok: false, problem: 'long' }
  return { ok: true, value }
}

/** 1000 to 9999, shown on screen ("Demo code: 4821"); nothing is sent. */
export function demoCode(random: () => number = Math.random): string {
  return String(Math.floor(1000 + random() * 9000))
}

export function codeMatches(entered: string, code: string): boolean {
  const digits = entered.replace(/\D/g, '')
  return digits !== '' && digits === code
}

/** 'a•••@example.com', or '+63 9•• ••• 4567': enough to recognise, not enough to read over a shoulder. */
export function maskContact(kind: ContactKind, value: string): string {
  if (kind === 'email') {
    const [name, domain] = value.split('@')
    return `${name.slice(0, 1)}•••@${domain}`
  }
  return `+63 9•• ••• ${value.slice(-4)}`
}

export interface Session {
  firstName: string
  contact: string
  kind: ContactKind
  /** YYYY-MM-DD, Manila date */
  since: string
}

export function loadSession(store: KeyValueStore | null): Session | null {
  const saved = readJSON(store, SESSION_KEY)
  if (!isRecord(saved)) return null
  const name = typeof saved.firstName === 'string' ? readFirstName(saved.firstName) : null
  const contact = typeof saved.contact === 'string' ? readContact(saved.contact) : null
  if (!name?.ok || !contact?.ok || contact.kind !== saved.kind || !isISODate(saved.since)) return null
  return { firstName: name.value, contact: contact.value, kind: contact.kind, since: saved.since }
}

export function saveSession(store: KeyValueStore | null, session: Session): boolean {
  return writeJSON(store, SESSION_KEY, session)
}

export function clearSession(store: KeyValueStore | null): boolean {
  return removeKey(store, SESSION_KEY)
}

/** A time booked on the Visit page, kept so the account page can list it. */
export interface Booking {
  id: string
  /** YYYY-MM-DD, Manila date */
  day: string
  /** Start, in minutes after midnight */
  start: number
  plate: string
  /** "Express wash for a small car, 20 min, ₱180" */
  summary: string
  payment: Payment
  /** The Manila date it was made on */
  made: string
  /** The services booked, so the account page can count a wash pack's washes left */
  ids: string[]
}

function isBooking(value: unknown): value is Booking {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isISODate(value.day) &&
    typeof value.start === 'number' &&
    Number.isInteger(value.start) &&
    typeof value.plate === 'string' &&
    typeof value.summary === 'string' &&
    isPayment(value.payment) &&
    isISODate(value.made) &&
    (value.ids === undefined || (Array.isArray(value.ids) && value.ids.every((id) => typeof id === 'string')))
  )
}

/** In date and time order. Damaged entries are dropped, one without services reads as none, and blocked storage as empty. */
export function loadBookings(store: KeyValueStore | null): Booking[] {
  const saved = readJSON(store, BOOKINGS_KEY)
  if (!Array.isArray(saved)) return []
  return saved
    .filter(isBooking)
    .map((booking) => ({ ...booking, ids: booking.ids ?? [] }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
}

export function addBooking(store: KeyValueStore | null, booking: Booking): boolean {
  if (store === null) return false
  try {
    store.getItem(BOOKINGS_KEY) // throws first where storage is blocked
  } catch {
    return false
  }
  return writeJSON(store, BOOKINGS_KEY, [...loadBookings(store).filter((b) => b.id !== booking.id), booking])
}

export function removeBooking(store: KeyValueStore | null, id: string): boolean {
  return writeJSON(store, BOOKINGS_KEY, loadBookings(store).filter((b) => b.id !== id))
}

/** The wash pack started from the basket (one plate per pack). */
export interface PlanSubscription {
  id: PlanId
  vehicle: Vehicle
  plates: string[]
  payment: Payment
  /** YYYY-MM-DD, Manila date */
  since: string
}

export function loadPlan(store: KeyValueStore | null): PlanSubscription | null {
  const saved = readJSON(store, PLAN_KEY)
  if (!isRecord(saved) || typeof saved.id !== 'string' || typeof saved.vehicle !== 'string' || !isVehicle(saved.vehicle)) return null
  if (findPlan(saved.id as PlanId)?.prices[saved.vehicle] === undefined) return null
  const plates = Array.isArray(saved.plates) ? saved.plates.filter((p): p is string => typeof p === 'string' && p !== '') : []
  if (plates.length === 0 || !isPayment(saved.payment) || !isISODate(saved.since)) return null
  return { id: saved.id as PlanId, vehicle: saved.vehicle, plates, payment: saved.payment, since: saved.since }
}

export function savePlan(store: KeyValueStore | null, plan: PlanSubscription): boolean {
  return writeJSON(store, PLAN_KEY, plan)
}

export function endPlan(store: KeyValueStore | null): boolean {
  return removeKey(store, PLAN_KEY)
}
