import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type Page } from '../../tests/harness.ts'
import { BOOKINGS_KEY, PLAN_KEY, SESSION_KEY } from '../lib/account.ts'
import { CLOSED_AT } from '../../tests/harness.ts'

/* Account, plus Location's hours and the Contact form. */

after(closeAll)

const text = (page: Page, selector: string) => (page.$(selector).textContent ?? '').replaceAll(' ', ' ').trim()
function load(file: string, path: string, options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage(file, path, options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  return page
}
const account = (options: Parameters<typeof loadPage>[2] = {}) => load('account/index.html', 'account/', options)
const fieldError = (page: Page, id: string) => (page.$(`#${id}-error`).hidden ? '' : text(page, `#${id}-error [data-error-text]`))
const signedIn = (page: Page) => page.document.documentElement.hasAttribute('data-signed-in')

const session = { firstName: 'Ana', contact: 'ana@example.com', kind: 'email', since: '2026-11-01' }
const row = (id: string, day: string, start: number, plate = 'NBC 1234') => ({ id, day, start, plate, summary: 'Express wash for a small car, 20 min, ₱180', payment: 'gcash', made: '2026-11-10', ids: ['express'] })
const pack = { id: 'express-4', vehicle: 'small', plates: ['NBC 1234'], payment: 'gcash', since: '2026-11-05' }

test('sign-in step 1: terse errors next to the fields, focus on the first problem, then step 2 with the code on screen', () => {
  const page = account()
  assert.equal(signedIn(page), false)
  assert.equal(page.$('[data-code-step]').hidden, true)
  page.click('[data-contact-step] button[type="submit"]')
  assert.equal(fieldError(page, 'sign-in-name'), 'First name needed.')
  assert.equal(fieldError(page, 'sign-in-contact'), 'Email or mobile number needed.')
  assert.equal(page.focused(), 'sign-in-name')
  page.type('#sign-in-name', 'Ana')
  assert.equal(fieldError(page, 'sign-in-name'), '', 'typing clears the error')
  page.type('#sign-in-contact', 'ana@example')
  page.click('[data-contact-step] button[type="submit"]')
  assert.match(fieldError(page, 'sign-in-contact'), /^Not an email or a mobile number\./)
  assert.equal(page.focused(), 'sign-in-contact')
  page.fill('#sign-in-contact', '0917 123 4567')
  page.click('[data-contact-step] button[type="submit"]')
  assert.equal(page.$('[data-contact-step]').hidden, true)
  assert.equal(page.$('[data-code-step]').hidden, false)
  assert.equal(page.focused(), 'sign-in-code', 'focus goes straight to the code field')
  assert.equal(text(page, '[data-code-contact]'), 'For +63 917 123 4567')
  assert.match(text(page, '[data-demo-code]'), /^\d{4}$/)
})

test('sign-in step 2: a wrong code is refused in words, the right one signs in and the account opens', () => {
  const page = account()
  page.fill('#sign-in-name', 'Ana')
  page.fill('#sign-in-contact', 'Ana@Example.com')
  page.click('[data-contact-step] button[type="submit"]')
  const code = text(page, '[data-demo-code]')
  page.click('[data-code-step] button[type="submit"]')
  assert.equal(fieldError(page, 'sign-in-code'), 'Four digits needed.')
  page.fill('#sign-in-code', code === '1234' ? '4321' : '1234')
  page.click('[data-code-step] button[type="submit"]')
  assert.equal(fieldError(page, 'sign-in-code'), 'Doesn’t match. Type the four digits on the plate above.')
  assert.equal(page.$('#sign-in-code').getAttribute('aria-invalid'), 'true')
  assert.equal(signedIn(page), false)
  page.fill('#sign-in-code', code)
  page.click('[data-code-step] button[type="submit"]')
  assert.equal(signedIn(page), true)
  assert.equal(page.document.activeElement, page.$('#account-title'))
  assert.equal(text(page, '[data-account-who]'), 'Signed in as Ana, with a•••@example.com.')
  assert.deepEqual(page.storage(SESSION_KEY), { firstName: 'Ana', contact: 'ana@example.com', kind: 'email', since: '2026-11-19' })
})

test('"Back to step 1" returns to the first step with focus in the contact field', () => {
  const page = account()
  page.fill('#sign-in-name', 'Ana')
  page.fill('#sign-in-contact', '09171234567')
  page.click('[data-contact-step] button[type="submit"]')
  page.click('[data-change-contact]')
  assert.equal(page.$('[data-contact-step]').hidden, false)
  assert.equal(page.$('[data-code-step]').hidden, true)
  assert.equal(page.focused(), 'sign-in-contact')
})

test('sign-in with blocked storage says so instead of pretending', () => {
  const page = account({ blockedStorage: true })
  page.fill('#sign-in-name', 'Ana')
  page.fill('#sign-in-contact', '09171234567')
  page.click('[data-contact-step] button[type="submit"]')
  page.fill('#sign-in-code', text(page, '[data-demo-code]'))
  page.click('[data-code-step] button[type="submit"]')
  assert.equal(signedIn(page), false)
  assert.match(text(page, '[data-storage-error]'), /^This browser blocks site storage/)
})

test('sign out returns to the first step, with focus on the Sign in heading', () => {
  const page = account({ storage: { [SESSION_KEY]: session } })
  assert.equal(signedIn(page), true)
  page.click('[data-sign-out]')
  assert.equal(signedIn(page), false)
  assert.equal(page.storage(SESSION_KEY), null)
  assert.equal(page.$('[data-contact-step]').hidden, false)
  assert.equal(page.document.activeElement, page.$('#sign-in-title'))
})

test('signed in with no pack and no bookings: it says so and points to the packs and to booking', () => {
  const page = account({ storage: { [SESSION_KEY]: session } })
  assert.equal(page.$('[data-plan-none]').hidden, false)
  assert.equal(page.$('[data-plan-current]').hidden, true)
  assert.equal(page.$('[data-bookings-none]').hidden, false)
  assert.equal(page.$('[data-bookings-list]').hidden, true)
})

test('the pack view: the pack, its plate, the price, since when, and the washes left this month', () => {
  const page = account({ storage: { [SESSION_KEY]: session, [PLAN_KEY]: pack, [BOOKINGS_KEY]: [row('a', '2026-11-06', 480), row('b', '2026-11-12', 480)] } })
  assert.equal(page.$('[data-plan-current]').hidden, false)
  assert.equal(text(page, '[data-plan-name]'), 'Express 4')
  assert.equal(text(page, '[data-plan-vehicle]'), 'Small car, 1 plate')
  assert.equal(text(page, '[data-plan-plates]'), 'NBC 1234')
  assert.equal(text(page, '[data-plan-price]'), '₱650 a month, paid by GCash')
  assert.equal(text(page, '[data-plan-since]'), 'Started 5 November 2026')
  assert.deepEqual(page.$$('[data-plan-left] li').map((li) => li.textContent), ['2 of 4 express washes left this month'])
})

test('washes left count only bookings from the day the pack started', () => {
  const before = row('early', '2026-11-02', 480) // before the pack's start date, same month
  const page = account({ storage: { [SESSION_KEY]: session, [PLAN_KEY]: pack, [BOOKINGS_KEY]: [before, row('a', '2026-11-06', 480)] } })
  assert.deepEqual(page.$$('[data-plan-left] li').map((li) => li.textContent), ['3 of 4 express washes left this month'])
})

test('the bookings view: each booking by day and time, past ones marked, cancel one and focus goes to the heading', () => {
  const page = account({ storage: { [SESSION_KEY]: session, [BOOKINGS_KEY]: [row('b', '2026-11-25', 540), row('a', '2026-11-18', 480)] } })
  const items = page.$$('[data-bookings-list] li')
  assert.equal(items.length, 2)
  assert.match(items[0].textContent ?? '', /^Wednesday 18 November, 8:00 AMPast/)
  assert.match(items[1].textContent ?? '', /^Wednesday 25 November, 9:00 AM/)
  assert.ok(!/Past/.test(items[1].textContent ?? ''))
  assert.match(items[0].textContent ?? '', /NBC 1234.*Express wash for a small car, 20 min, ₱180.*Paid by GCash/)
  page.click(items[1].querySelector('button')!)
  assert.equal(text(page, '[data-account-status]'), 'Booking cancelled: Wednesday 25 November at 9:00 AM.')
  assert.equal(page.$$('[data-bookings-list] li').length, 1)
  assert.equal(page.document.activeElement, page.$('#bookings-heading'))
  assert.equal((page.storage(BOOKINGS_KEY) as unknown[]).length, 1)
  page.click('[data-bookings-list] button')
  assert.equal(page.$('[data-bookings-none]').hidden, false)
})

test('cancelling a booking gives the wash back to the pack', () => {
  const page = account({ storage: { [SESSION_KEY]: session, [PLAN_KEY]: pack, [BOOKINGS_KEY]: [row('a', '2026-11-25', 480)] } })
  assert.deepEqual(page.$$('[data-plan-left] li').map((li) => li.textContent), ['3 of 4 express washes left this month'])
  page.click('[data-bookings-list] button')
  assert.deepEqual(page.$$('[data-plan-left] li').map((li) => li.textContent), ['4 of 4 express washes left this month'])
})

test('cancel pack: the pack goes, the status says it will not renew, and focus goes to the pack heading', () => {
  const page = account({ storage: { [SESSION_KEY]: session, [PLAN_KEY]: pack } })
  page.click('[data-end-plan]')
  assert.equal(text(page, '[data-account-status]'), 'Pack cancelled. It won’t renew, and nothing was charged.')
  assert.equal(page.$('[data-plan-none]').hidden, false)
  assert.equal(page.storage(PLAN_KEY), null)
  assert.equal(page.document.activeElement, page.$('#plan-heading'))
})

test('a damaged pack or booking in storage is dropped, not shown', () => {
  const page = account({ storage: { [SESSION_KEY]: session, [PLAN_KEY]: { id: 'express-4', vehicle: 'tank' }, [BOOKINGS_KEY]: [{ id: 1 }, 'x'] } })
  assert.equal(page.$('[data-plan-none]').hidden, false)
  assert.equal(page.$('[data-bookings-none]').hidden, false)
})

test('Location says whether Bayline is open now and until when, and when it opens next after closing', () => {
  const open = load('location/index.html', 'location/')
  assert.equal(open.$('[data-hours]').dataset.open, 'true')
  assert.equal(text(open, '[data-open-pill]'), 'Open now, until 8:00 PM')
  assert.equal(text(open, '[data-hours-clock]'), 'It’s 10:30 AM in Mandaue')
  const night = load('location/index.html', 'location/', { at: CLOSED_AT })
  assert.equal(night.$('[data-hours]').dataset.open, 'false')
  assert.equal(text(night, '[data-open-pill]'), 'Closed now, opens tomorrow at 7:00 AM')
  const early = load('location/index.html', 'location/', { at: '2026-11-19T05:30:00+08:00' })
  assert.equal(text(early, '[data-open-pill]'), 'Closed now, opens today at 7:00 AM')
  early.advance(2 * 60 * 60 * 1000) // two hours on: the page rechecks every 30 seconds
  assert.equal(text(early, '[data-open-pill]'), 'Open now, until 8:00 PM')
})

test('the contact form checks what you type, says nothing was sent, and keeps nothing', () => {
  const page = load('contact/index.html', 'contact/')
  page.click('[data-contact-form] button[type="submit"]')
  assert.equal(fieldError(page, 'contact-name'), 'Type your name.')
  assert.equal(page.focused(), 'contact-name')
  page.type('#contact-name', 'Ana')
  page.type('#contact-reply', 'nope')
  page.type('#contact-message', 'Hello')
  page.click('[data-contact-form] button[type="submit"]')
  assert.notEqual(fieldError(page, 'contact-reply'), '')
  assert.equal(page.focused(), 'contact-reply')
  page.fill('#contact-reply', 'ana@example.com')
  page.click('[data-contact-form] button[type="submit"]')
  assert.equal(page.$('[data-form-done]').hidden, false)
  assert.match(text(page, '[data-done-text]'), /^Thanks, .*This is a demonstration site, so your message wasn’t sent and nobody will reply\.$/)
  assert.equal(page.document.activeElement, page.$('[data-form-done]'))
  assert.equal(page.$<HTMLInputElement>('#contact-name').value, '', 'the form is cleared')
  assert.equal(page.window.localStorage.length, 0, 'nothing is stored either')
})
