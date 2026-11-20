import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstOpenDay, hoursStatus, isOpen, scheduleSlots } from './schedule.ts'

test('schedule hides past slots and long jobs that would run past closing', () => {
  const at = new Date(Date.UTC(2026, 10, 18, 7, 10)) // 15:10 Manila
  const today = scheduleSlots('2026-11-18', 35, at)
  assert.ok(today.filter((s) => s.start < 930).every((s) => !s.available))
  assert.equal(Math.max(...scheduleSlots('2026-11-19', 180, at).map((s) => s.start)), 1020)
  assert.deepEqual(scheduleSlots('2026-11-19', 480, at).map((s) => s.start), [480])
})

const at = new Date(Date.UTC(2026, 10, 18, 7, 10)) // Wednesday 18 November, 3:10 PM in Manila

test('slots run every 30 minutes from 7:00 AM and must finish by 8:00 PM', () => {
  const express = scheduleSlots('2026-11-19', 20, at).map((s) => s.start)
  assert.equal(express[0], 420)
  assert.equal(express.at(-1), 1170)
  assert.ok(express.every((start, i) => i === 0 || start - express[i - 1] === 30))
  assert.equal(scheduleSlots('2026-11-19', 35, at).at(-1)?.start, 1140)
  assert.equal(scheduleSlots('2026-11-19', 0, at).at(-1)?.start, 1170)
})

test('later today stays bookable, and a full day of work that cannot fit returns nothing', () => {
  const today = scheduleSlots('2026-11-18', 35, at)
  assert.ok(today.some((s) => s.start >= 930 && s.available))
  assert.deepEqual(scheduleSlots('2026-11-19', 480 + 180 + 90, at), [])
  assert.deepEqual(scheduleSlots('2026-11-19', 480 + 50, at).map((s) => s.start), [480])
})

test('taken slots come from the date, the same way every time', () => {
  const thursday = scheduleSlots('2026-11-19', 20, at)
  assert.deepEqual(thursday, scheduleSlots('2026-11-19', 20, at))
  assert.ok(thursday.some((s) => s.available))
  assert.ok(thursday.some((s) => !s.available))
  const friday = scheduleSlots('2026-11-20', 20, at)
  assert.notDeepEqual(thursday.map((s) => s.available), friday.map((s) => s.available))
})

test('a visitor whose own clock still says the 18th books in Manila time', () => {
  const lateNightUtc = new Date(Date.UTC(2026, 10, 18, 16, 30)) // 00:30 on the 19th in Manila
  assert.ok(scheduleSlots('2026-11-18', 20, lateNightUtc).every((s) => !s.available))
  const nineteenth = scheduleSlots('2026-11-19', 20, lateNightUtc)
  assert.deepEqual(nineteenth, scheduleSlots('2026-11-19', 20, at))
})

test('the schedule opens on the first day that still has a free start time', () => {
  const evening = new Date(Date.UTC(2026, 10, 18, 13, 0)) // 9:00 PM on the 18th in Manila: today is over
  assert.equal(firstOpenDay('2026-11-18', 7, 20, evening), '2026-11-19')
  assert.equal(firstOpenDay('2026-11-18', 7, 35, at), '2026-11-18') // 3:10 PM: later today still has times
  const ceramic = firstOpenDay('2026-11-18', 7, 480, at) // today's 8:00 AM drop-off has gone
  assert.ok(ceramic > '2026-11-18')
  assert.ok(scheduleSlots(ceramic, 480, at).some((s) => s.available))
  assert.equal(firstOpenDay('2026-11-18', 7, 480 + 300, at), '2026-11-18') // fits no day: stay on the first
})

test('open from 7:00 AM until 8:00 PM, Manila time', () => {
  assert.equal(isOpen(at), true)
  assert.equal(isOpen(new Date(Date.UTC(2026, 10, 17, 23, 0))), true) // 7:00 AM
  assert.equal(isOpen(new Date(Date.UTC(2026, 10, 17, 22, 59))), false) // 6:59 AM
  assert.equal(isOpen(new Date(Date.UTC(2026, 10, 18, 11, 59))), true) // 7:59 PM
  assert.equal(isOpen(new Date(Date.UTC(2026, 10, 18, 12, 0))), false) // 8:00 PM
})

test('the hours line says when Bayline opens next, in Manila time', () => {
  const manila = (hour: number, minute: number) => new Date(Date.UTC(2026, 10, 18, hour - 8, minute))
  assert.deepEqual(hoursStatus(manila(15, 10)), { open: true, opens: null })
  assert.deepEqual(hoursStatus(manila(7, 0)), { open: true, opens: null })
  assert.deepEqual(hoursStatus(manila(6, 59)), { open: false, opens: 'today' }) // before 7:00 AM
  assert.deepEqual(hoursStatus(manila(3, 30)), { open: false, opens: 'today' })
  assert.deepEqual(hoursStatus(manila(20, 0)), { open: false, opens: 'tomorrow' }) // closing time
  assert.deepEqual(hoursStatus(manila(23, 59)), { open: false, opens: 'tomorrow' })
  // a visitor whose own clock is still on the 17th (UTC) gets Manila's answer
  assert.deepEqual(hoursStatus(new Date(Date.UTC(2026, 10, 17, 17, 0))), { open: false, opens: 'today' }) // 1:00 AM on the 18th
})

test('start times the visitor has booked show as taken', () => {
  const free = scheduleSlots('2026-11-19', 20, at).find((s) => s.available)!
  const booked = scheduleSlots('2026-11-19', 20, at, [free.start])
  assert.equal(booked.find((s) => s.start === free.start)?.available, false)
  assert.equal(booked.filter((s) => s.available).length, scheduleSlots('2026-11-19', 20, at).filter((s) => s.available).length - 1)
})

test('the first open day skips a day whose every free time the visitor has booked', () => {
  const day = '2026-11-19'
  const all = scheduleSlots(day, 20, at).filter((s) => s.available).map((s) => s.start)
  assert.equal(firstOpenDay(day, 7, 20, at), day)
  assert.notEqual(firstOpenDay(day, 7, 20, at, (iso) => (iso === day ? all : [])), day)
})
