import { addDaysISO, manilaTime, weekdayOf } from './time.ts'

/** 7:00 AM and 8:00 PM, as minutes since midnight in Manila. */
export const OPENS = 420
export const CLOSES = 1200
/** Full-day jobs (ceramic coating) are dropped off at 8:00 AM. */
export const DAY_JOB_START = 480
const DAY_JOB_MINUTES = 480
const STEP = 30

export interface Slot {
  start: number
  available: boolean
}

export function isOpen(at: Date): boolean {
  const { minutes } = manilaTime(at)
  return minutes >= OPENS && minutes < CLOSES
}

/** Whether Bayline is open at `at`, and when it opens next: later today (before 7:00 AM) or tomorrow (from 8:00 PM). */
export function hoursStatus(at: Date): { open: boolean; opens: 'today' | 'tomorrow' | null } {
  if (isOpen(at)) return { open: true, opens: null }
  return { open: false, opens: manilaTime(at).minutes < OPENS ? 'today' : 'tomorrow' }
}

/**
 * A 30-minute grid from 7:00 AM of jobs that finish by 8:00 PM (full-day jobs: 8:00 AM only), judged from `at` in Manila.
 * Past times are unavailable; some are taken, the same ones every time for a date, and so are `booked`.
 */
export function scheduleSlots(isoDate: string, minutes: number, at: Date, booked: readonly number[] = []): Slot[] {
  const now = manilaTime(at)
  const length = Math.max(minutes, 1)
  const starts: number[] = []
  if (length >= DAY_JOB_MINUTES) {
    if (DAY_JOB_START + length <= CLOSES) starts.push(DAY_JOB_START)
  } else {
    for (let start = OPENS; start + length <= CLOSES; start += STEP) starts.push(start)
  }
  return starts.map((start) => {
    const past = isoDate < now.isoDate || (isoDate === now.isoDate && start <= now.minutes)
    return { start, available: !past && !isTaken(isoDate, start) && !booked.includes(start) }
  })
}

/** So a visitor after closing lands on tomorrow, not an empty today. Falls back to `fromIso`. */
export function firstOpenDay(fromIso: string, days: number, minutes: number, at: Date, bookedOn: (isoDate: string) => readonly number[] = () => []): string {
  for (let offset = 0; offset < days; offset++) {
    const isoDate = addDaysISO(fromIso, offset)
    if (scheduleSlots(isoDate, minutes, at, bookedOn(isoDate)).some((slot) => slot.available)) return isoDate
  }
  return fromIso
}

/** Weekends fill up more. The share is out of 100 slots. */
function isTaken(isoDate: string, start: number): boolean {
  const weekday = weekdayOf(isoDate)
  const share = weekday === 0 || weekday === 6 ? 40 : 25
  return hash(`${isoDate} ${start}`) % 100 < share
}

/** FNV-1a with a final mix, so neighbouring slots don't fall into a pattern. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
