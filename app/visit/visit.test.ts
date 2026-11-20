import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { CLOSED_AT, closeAll, loadPage, type Page } from '../../tests/harness.ts'
import { BOOKINGS_KEY, PLAN_KEY } from '../lib/account.ts'
import { JOIN_KEY } from '../lib/handoff.ts'

after(closeAll)

function visit(path = 'visit/', options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('visit/index.html', path, options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  return page
}
/** Text with the non-breaking spaces the page puts in durations read as plain ones. */
const text = (page: Page, selector: string) => (page.$(selector).textContent ?? '').replaceAll('\u00a0', ' ')
const error = (page: Page, selector = '#walk-in-plate-error') => (page.$(selector).hidden ? '' : text(page, `${selector} [data-error-text]`))
const join = (page: Page, plate: string) => {
  page.fill('#walk-in-plate', plate)
  page.click('[data-join-form] button[type="submit"]')
}

test('clicking the plate field keeps focus there, and typing works (no click handler on the document pulls focus away)', () => {
  const page = visit()
  page.click('#walk-in-plate')
  assert.equal(page.focused(), 'walk-in-plate')
  page.type('#walk-in-plate', 'nbc 1234')
  assert.equal(page.$<HTMLInputElement>('#walk-in-plate').value, 'nbc 1234')
  assert.equal(page.focused(), 'walk-in-plate', 'still typing in it')
  page.click('#tab-schedule')
  page.click('#schedule-plate')
  assert.equal(page.focused(), 'schedule-plate')
  page.type('#schedule-plate', 'abc')
  assert.equal(page.$<HTMLInputElement>('#schedule-plate').value, 'abc')
  // A click on plain page content lets go of focus; it never lands on a tab.
  page.click('#line-title')
  assert.notEqual(page.focused(), 'tab-walk-in')
  assert.notEqual(page.focused(), 'tab-schedule')
})

test('the walk-in and Book a time tabs: a click switches panel without taking focus, arrow keys move focus and switch', () => {
  const page = visit()
  assert.equal(page.$('#panel-schedule').hidden, true)
  page.click('#tab-schedule')
  assert.equal(page.$('#panel-schedule').hidden, false)
  assert.equal(page.$('#panel-walk-in').hidden, true)
  assert.equal(page.$('#tab-schedule').getAttribute('aria-selected'), 'true')
  page.key('ArrowLeft', page.$('#tab-schedule'))
  assert.equal(page.focused(), 'tab-walk-in')
  assert.equal(page.$('#panel-walk-in').hidden, false)
  page.key('End')
  assert.equal(page.focused(), 'tab-schedule')
  assert.equal(page.document.documentElement.dataset.visit, 'schedule')
})

test('an address ending in #book opens on Book a time', () => {
  const page = visit('visit/#book')
  assert.equal(page.$('#panel-schedule').hidden, false)
  assert.equal(page.$('#tab-schedule').getAttribute('aria-selected'), 'true')
})

test('before joining: the sample board, the wait, and the way to join', () => {
  const page = visit()
  assert.equal(page.$$('[data-bay]').length, 3)
  assert.deepEqual(page.$$('[data-bay-plate]').map((el) => el.textContent), ['ABC 1234', 'DEF 567', 'GHI 8901'])
  assert.deepEqual(page.$$('[data-queue] .plate').map((el) => el.textContent), ['123 JKL', 'MNO 2345', 'PQR 678'])
  assert.equal(text(page, '[data-status-main]'), 'Join now and a bay frees up for you in about 25 min.')
  assert.equal(page.$('[data-status-note]').hidden, true)
  assert.equal(text(page, '[data-selection]'), 'Express wash for a small car, 20 min, ₱180')
})

test('joining with a plate: you are in line, focus moves to Pause, the board runs and the line moves', () => {
  const page = visit()
  join(page, 'nbc 1234')
  assert.match(text(page, '[data-status-main]'), /^You’re 4th in line as NBC 1234\. A bay frees up in about \d+ min\.$/)
  assert.equal(page.$('[data-join-form]').hidden, true, 'the form steps aside')
  assert.equal(page.$('[data-status-note]').hidden, false, 'the demo note shows: nothing was sent')
  assert.equal(page.document.activeElement, page.$('[data-clock]'), 'focus is on the Pause button')
  assert.equal(text(page, '[data-clock-label]'), 'Pause')
  assert.deepEqual(page.$$('[data-queue] .plate').map((el) => el.textContent), ['123 JKL', 'MNO 2345', 'PQR 678', 'NBC 1234'])
  assert.equal(page.$('[data-queue] .queue-row--yours .plate').textContent, 'NBC 1234')
  assert.match(text(page, '[data-footer-status] [data-yard-text]'), /^4 in line, about \d+ min to wait$/, 'the footer follows the board')

  const first = text(page, '[data-bay-left]')
  page.advance(5000)
  assert.notEqual(text(page, '[data-bay-left]'), first, 'a bay counts down')
  // DEF 567 had 4 minutes left: its bay frees at 4 s and the first car in line pulls in.
  assert.equal(page.$$('[data-bay-plate]')[1].textContent, '123 JKL')
  assert.deepEqual(page.$$('[data-queue] .plate').map((el) => el.textContent), ['MNO 2345', 'PQR 678', 'NBC 1234'])
  assert.match(text(page, '[data-status-main]'), /^You’re 3rd in line\./)
})

test('Pause stops the board and Play starts it again; Reset puts the sample line back and focuses the plate field', () => {
  const page = visit()
  join(page, 'NBC 1234')
  page.click('[data-clock]')
  assert.equal(text(page, '[data-clock-label]'), 'Play')
  const before = page.$$('[data-queue] .plate').length
  page.advance(10_000)
  assert.equal(page.$$('[data-queue] .plate').length, before, 'paused: nothing moves')
  page.click('[data-clock]')
  page.advance(10_000)
  assert.ok(page.$$('[data-queue] .plate').length < before, 'running: cars pull in')
  page.click('[data-reset]')
  assert.equal(page.$('[data-join-form]').hidden, false)
  assert.equal(page.focused(), 'walk-in-plate')
  assert.equal(page.$<HTMLInputElement>('#walk-in-plate').value, '')
  assert.deepEqual(page.$$('[data-queue] .plate').map((el) => el.textContent), ['123 JKL', 'MNO 2345', 'PQR 678'])
})

test('plate problems show next to the field, keep what was typed and put focus back in it', () => {
  const page = visit()
  join(page, '')
  assert.equal(error(page), 'Type your plate number to join the line.')
  assert.equal(page.focused(), 'walk-in-plate')
  join(page, 'hello')
  assert.match(error(page), /^That doesn’t look like a plate number/)
  assert.equal(page.$<HTMLInputElement>('#walk-in-plate').value, 'hello')
  assert.equal(page.$('#walk-in-plate').getAttribute('aria-invalid'), 'true')
  page.type('#walk-in-plate', 'x')
  assert.equal(page.$('#walk-in-error, #walk-in-plate-error').hidden, true, 'typing clears it')
  join(page, 'mno 2345')
  assert.equal(error(page), 'MNO 2345 is already in line.')
  assert.equal(page.$$('[data-queue] .plate').length, 3, 'nothing was added')
})

test('a wash that cannot be joined says why: ceramic coating is by appointment', () => {
  const page = visit('visit/?vehicle=small&services=ceramic')
  join(page, 'NBC 1234')
  assert.match(error(page), /^Ceramic coating is by appointment/)
  assert.equal(page.$('[data-join-form]').hidden, false)
})

test('closed at night: the status says so, and the board is still a sample you can try', () => {
  const page = visit('visit/', { at: CLOSED_AT })
  assert.equal(text(page, '[data-status-main]'), 'It’s 10:00 PM in Mandaue, so we’re closed. The board runs a sample afternoon you can still try.')
  assert.equal(page.$('[data-walk-in-status]').dataset.tone, 'closed')
  assert.match(text(page, '[data-footer-status] [data-open-pill]'), /^Closed now, opens tomorrow at 7:00 AM/)
  assert.equal(text(page, '[data-footer-status] [data-yard-text]'), 'No line until 7:00 AM')
})

test('the size select moves the wash the board joins with', () => {
  const page = visit()
  page.$<HTMLSelectElement>('[data-size-select]').value = 'motorcycle'
  page.$('[data-size-select]').dispatchEvent(new page.window.Event('change', { bubbles: true }))
  assert.equal(text(page, '[data-selection]'), 'Express wash for a motorcycle, 20 min, ₱100')
  join(page, 'NBC 1234')
  assert.equal(page.$$('[data-queue] .queue-row--yours .queue-row__what')[0].textContent, 'YouMotorcycle')
})

test('a plate handed over from Home joins the line here, once, and leaves nothing in the address or storage', () => {
  const page = visit('visit/', { session: { [JOIN_KEY]: 'nbc 1234' } })
  assert.match(text(page, '[data-status-main]'), /^You’re 4th in line as NBC 1234\./)
  assert.equal(page.session(JOIN_KEY), null, 'read once, then removed')
  assert.equal(page.window.location.hash, '')
  assert.equal(page.window.location.search, '')
})

test('a handed plate that is not a plate shows the error next to the field with the value kept', () => {
  const page = visit('visit/', { session: { [JOIN_KEY]: 'hello' } })
  assert.match(error(page), /^That doesn’t look like a plate number/)
  assert.equal(page.$<HTMLInputElement>('#walk-in-plate').value, 'hello')
  assert.equal(page.focused(), 'walk-in-plate')
})

test('an empty hand-over just focuses the plate field; no hand-over leaves the page as it was', () => {
  const empty = visit('visit/', { session: { [JOIN_KEY]: '' } })
  assert.equal(empty.focused(), 'walk-in-plate')
  assert.equal(empty.session(JOIN_KEY), null)
  const none = visit()
  assert.notEqual(none.focused(), 'walk-in-plate')
  assert.equal(none.$('[data-join-form]').hidden, false)
})

function book(options: Parameters<typeof loadPage>[2] = {}, path = 'visit/#book') {
  const page = visit(path, options)
  const free = () => page.$$<HTMLInputElement>('[data-slots] input:enabled')
  const pay = (name: string) => page.click(`input[name="payment"][value="${name}"]`)
  const submit = () => page.click('[data-confirm]')
  const bookingError = () => (page.$('[data-booking-error]').hidden ? '' : text(page, '[data-booking-error] [data-error-text]'))
  const confirmation = () => (page.$('[data-confirmation]').hidden ? '' : text(page, '[data-confirmation-text]'))
  /** Picks a start time and a plate and a payment the way a keyboard user does, ending on the Book button. */
  const fillIn = (slot: HTMLInputElement, plate = 'NBC 1234', payment = 'gcash') => {
    page.focus(slot)
    page.key('Enter') // picks the time and moves to the plate field
    assert.equal(page.focused(), 'schedule-plate')
    page.fill('#schedule-plate', plate)
    pay(payment)
  }
  return { page, free, pay, submit, bookingError, confirmation, fillIn }
}

test('booking a time with the keyboard: pick a time, Enter moves on to the plate, pay, book; the account will list it', () => {
  const { page, free, submit, confirmation, fillIn } = book()
  assert.equal(page.$$('[data-days] input').length, 7)
  assert.equal(text(page, '[data-confirm]'), 'Book this time')
  const slot = free()[0]
  fillIn(slot)
  assert.equal(slot.checked, true)
  assert.match(text(page, '[data-confirm]'), /^Book \d+:\d\d [AP]M$/)
  submit()
  assert.match(confirmation(), /^Booked: Thursday 19 November at .+ for NBC 1234, paying by GCash\. Express wash for a small car, 20 min, ₱180\./)
  assert.match(confirmation(), /nothing was sent and nothing was charged\.$/)
  assert.equal(page.document.activeElement, page.$('[data-confirmation]'), 'focus goes to the confirmation')
  const saved = page.storage(BOOKINGS_KEY) as { day: string; start: number; plate: string; payment: string; ids: string[] }[]
  assert.equal(saved.length, 1)
  assert.deepEqual([saved[0].day, saved[0].start, saved[0].plate, saved[0].payment, saved[0].ids], ['2026-11-19', Number(slot.value), 'NBC 1234', 'gcash', ['express']])
})

test('a time the visitor booked shows as taken, and cannot be picked again', () => {
  const { page, free, submit, fillIn } = book()
  const slot = free()[0]
  const start = slot.value
  fillIn(slot)
  submit()
  const after = page.$<HTMLInputElement>(`[data-slots] input[value="${start}"]`)
  assert.equal(after.disabled, true)
  assert.ok(after.closest('label')?.classList.contains('slot--taken'))
  assert.match(after.closest('label')?.textContent ?? '', /Taken/)
})

test('an exact duplicate booking (same day, start and plate) is refused with a message', () => {
  const { page, free, submit, bookingError, fillIn } = book()
  const slot = free()[0]
  fillIn(slot)
  // The same booking made from another tab since this list was drawn.
  page.window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify([{ id: 'other-tab', day: '2026-11-19', start: Number(slot.value), plate: 'NBC 1234', summary: 'Express wash', payment: 'gcash', made: '2026-11-19', ids: ['express'] }]))
  submit()
  assert.match(bookingError(), /^NBC 1234 is already booked for .+ on Thursday 19 November\. Pick another time\.$/)
  assert.equal((page.storage(BOOKINGS_KEY) as unknown[]).length, 1, 'no second row')
  assert.equal(page.$('[data-confirmation]').hidden, true)
})

test('the same time with another plate is refused too: a booked time is taken', () => {
  const { page, free, submit, bookingError, fillIn } = book()
  const slot = free()[0]
  fillIn(slot, 'ABC 123')
  page.window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify([{ id: 'other-tab', day: '2026-11-19', start: Number(slot.value), plate: 'NBC 1234', summary: 'Express wash', payment: 'gcash', made: '2026-11-19', ids: ['express'] }]))
  submit()
  assert.match(bookingError(), /^You already have a booking at .+ on Thursday 19 November\. Pick another time\.$/)
})

test('booking problems are said in words: no time, a bad plate, no payment', () => {
  const { page, free, submit, bookingError, pay } = book()
  submit()
  assert.equal(bookingError(), 'Pick a start time first.')
  const slot = free()[0]
  page.focus(slot)
  page.key('Enter')
  page.fill('#schedule-plate', 'hello')
  submit()
  assert.match(text(page, '#schedule-plate-error [data-error-text]'), /^That doesn’t look like a plate number/)
  assert.equal(page.focused(), 'schedule-plate')
  page.fill('#schedule-plate', 'NBC 1234')
  submit()
  assert.equal(bookingError(), 'Choose how you’ll pay: GCash, Maya or card.')
  pay('maya')
  submit()
  assert.match(text(page, '[data-confirmation-text]'), /paying by Maya/)
})

test('picking another day redraws the times, and the book button names the chosen time', () => {
  const { page, free } = book()
  page.click('[data-days] label:nth-child(3) input')
  assert.equal(page.$<HTMLInputElement>('[data-days] input:checked').value, '2026-11-21')
  page.click(free()[1])
  assert.equal(text(page, '[data-confirm]'), `Book ${text(page, '[data-slots] input:checked + .chip__big')}`)
})

test('without storage the booking still confirms, and says it will not show in the account', () => {
  const { page, free, submit, confirmation, fillIn } = book({ blockedStorage: true })
  fillIn(free()[0])
  submit()
  assert.match(confirmation(), /This browser is blocking the site’s storage, so the booking won’t show in your account\.$/)
})

const pack = (plates: string[], since = '2026-11-05') => ({ id: 'express-4', vehicle: 'small', plates, payment: 'gcash', since })
const row = (id: string, day: string, plate: string, start = 480) => ({ id, day, start, plate, summary: 'Express wash for a small car, 20 min, ₱180', payment: 'gcash', made: day, ids: ['express'] })

test('a pack plate with a wash already booked that day is refused: a pack covers one wash a day', () => {
  const { page, free, submit, bookingError, fillIn } = book({ storage: { [PLAN_KEY]: pack(['NBC 1234']), [BOOKINGS_KEY]: [row('a', '2026-11-19', 'NBC 1234', 420)] } })
  assert.ok(free().length > 0)
  fillIn(free()[0])
  submit()
  assert.equal(bookingError(), 'NBC 1234 is on Express 4, and a pack covers one wash a day. It already has a booking on Thursday 19 November.')
  assert.equal(page.focused(), 'schedule-plate')
  assert.equal((page.storage(BOOKINGS_KEY) as unknown[]).length, 1)
})

test('a pack plate with no washes left this month is booked and told plainly the wash is charged at the bay price', () => {
  const used = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map((day, i) => row(`u${i}`, day, 'NBC 1234'))
  const { page, free, submit, confirmation, bookingError, fillIn } = book({ storage: { [PLAN_KEY]: pack(['NBC 1234']), [BOOKINGS_KEY]: used } })
  fillIn(free()[0])
  submit()
  assert.equal(bookingError(), '')
  assert.match(confirmation(), /NBC 1234’s Express 4 has no washes left in November 2026\. This wash is charged at the bay price, ₱180\./)
  assert.equal((page.storage(BOOKINGS_KEY) as unknown[]).length, 5)
})

test('a pack plate with a wash on the pack is booked with no charge note; a plate off the pack never gets one', () => {
  const on = book({ storage: { [PLAN_KEY]: pack(['NBC 1234']) } })
  on.fillIn(on.free()[0])
  on.submit()
  assert.doesNotMatch(on.confirmation(), /bay price/)
  const off = book({ storage: { [PLAN_KEY]: pack(['NBC 1234']), [BOOKINGS_KEY]: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map((day, i) => row(`u${i}`, day, 'NBC 1234')) } })
  off.fillIn(off.free()[0], 'ZZZ 999')
  off.submit()
  assert.doesNotMatch(off.confirmation(), /bay price/)
})

test('a booking before the pack starts is charged at the bay price, and says when the pack starts', () => {
  const { page, free, submit, confirmation, fillIn } = book({ storage: { [PLAN_KEY]: pack(['NBC 1234'], '2026-11-25') } })
  fillIn(free()[0])
  submit()
  assert.match(confirmation(), /NBC 1234’s Express 4 starts on 25 November 2026\. This wash is charged at the bay price, ₱180\./)
  void page
})
