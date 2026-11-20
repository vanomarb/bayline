/** A moment as the clock reads in Mandaue (Asia/Manila), whatever the visitor's own time zone. */
export interface ManilaTime {
  /** YYYY-MM-DD */
  isoDate: string
  /** 0 = Sunday */
  weekday: number
  /** Minutes since midnight */
  minutes: number
}

const manilaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function manilaTime(at: Date): ManilaTime {
  const part: Record<string, string> = {}
  for (const { type, value } of manilaParts.formatToParts(at)) part[type] = value
  const isoDate = `${part.year}-${part.month}-${part.day}`
  return {
    isoDate,
    weekday: weekdayOf(isoDate),
    minutes: Number(part.hour) * 60 + Number(part.minute),
  }
}

/** Calendar arithmetic on YYYY-MM-DD strings, done in UTC so no local offset can shift the day. */
export function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday, for a YYYY-MM-DD date. */
export function weekdayOf(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** 12-hour clock, e.g. 465 → '7:45 AM'. Minutes past midnight wrap around. */
export function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const hours = Math.floor(wrapped / 60)
  const mins = wrapped % 60
  return `${hours % 12 || 12}:${String(mins).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

/** A YYYY-MM-DD date as a Date at UTC midnight, so formatting it in UTC never shifts the day. */
export function utcDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** "Thursday, 19 November" for a YYYY-MM-DD date (a Manila date, written in UTC so no local offset moves it). */
export const fullDate = (isoDate: string): string => FULL_DATE.format(utcDay(isoDate))
const FULL_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** "19 November 2026" for a YYYY-MM-DD date. */
export const longDate = (isoDate: string): string => LONG_DATE.format(utcDay(isoDate))
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "Thu" for a YYYY-MM-DD date. */
export const weekdayShort = (isoDate: string): string => WEEKDAY_SHORT.format(utcDay(isoDate))
const WEEKDAY_SHORT = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

/** "November 2026" for a YYYY-MM month. */
export const monthName = (month: string): string => MONTH_NAME.format(utcDay(`${month}-01`))
const MONTH_NAME = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
