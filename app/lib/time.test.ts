import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDaysISO, formatClock, manilaTime } from './time.ts'

test('manilaTime converts from UTC', () => {
  assert.deepEqual(manilaTime(new Date(Date.UTC(2026, 10, 18, 16, 30))), { isoDate: '2026-11-19', weekday: 4, minutes: 30 })
})

test('formatClock uses 12-hour time', () => {
  assert.equal(formatClock(0), '12:00 AM'); assert.equal(formatClock(465), '7:45 AM'); assert.equal(formatClock(1305), '9:45 PM')
})

test('addDaysISO crosses months', () => { assert.equal(addDaysISO('2026-11-30', 1), '2026-12-01') })

import { fullDate, longDate, monthName, utcDay, weekdayShort } from './time.ts'

test('the date helpers read a YYYY-MM-DD in UTC, so no local offset moves the day', () => {
  assert.equal(utcDay('2026-11-19').toISOString(), '2026-11-19T00:00:00.000Z')
  assert.equal(fullDate('2026-11-19'), 'Thursday 19 November')
  assert.equal(longDate('2026-11-19'), '19 November 2026')
  assert.equal(weekdayShort('2026-11-19'), 'Thu')
  assert.equal(monthName('2026-11'), 'November 2026')
})
