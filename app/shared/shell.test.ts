import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { CLOSED_AT, closeAll, loadPage, type Page } from '../../tests/harness.ts'
import { BASKET_KEY } from '../lib/cart.ts'
import { SESSION_KEY } from '../lib/account.ts'

/* The shell every page shares. Any page will do; Plans is a quiet one. */

after(closeAll)

function plans(options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('plans/index.html', 'plans/', options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  return page
}
const text = (page: Page, selector: string) => (page.$(selector).textContent ?? '').replaceAll(' ', ' ').trim()
const menu = (page: Page) => page.$<HTMLDialogElement>('#site-menu')
const toggle = (page: Page) => page.$<HTMLButtonElement>('[data-menu-toggle]')

test('the phone menu is a full-screen dialog: the Menu button opens it, focus lands on Close menu, the button says expanded', () => {
  const page = plans()
  assert.equal(menu(page).open, false)
  assert.equal(toggle(page).getAttribute('aria-expanded'), 'false')
  page.click(toggle(page))
  assert.equal(menu(page).open, true)
  assert.equal(toggle(page).getAttribute('aria-expanded'), 'true')
  assert.equal(page.document.activeElement, page.$('[data-menu-close]'), 'focus moves into the menu, to the close button')
  assert.equal(page.$('[data-menu-close]').getAttribute('aria-label'), 'Close menu')
  assert.equal(menu(page).getAttribute('aria-label'), 'Menu')
})

test('Escape closes the phone menu and focus goes back to the Menu button', () => {
  const page = plans()
  page.click(toggle(page))
  page.key('Escape')
  assert.equal(menu(page).open, false)
  assert.equal(toggle(page).getAttribute('aria-expanded'), 'false')
  assert.equal(page.document.activeElement, toggle(page))
})

test('the close button closes the phone menu and focus goes back to the Menu button', () => {
  const page = plans()
  page.click(toggle(page))
  page.click('[data-menu-close]')
  assert.equal(menu(page).open, false)
  assert.equal(page.document.activeElement, toggle(page))
})

test('a tap on the dialog’s own box (the backdrop, if it is ever smaller than the screen) closes the menu', () => {
  const page = plans()
  page.click(toggle(page))
  page.click(menu(page))
  assert.equal(menu(page).open, false)
  assert.equal(page.document.activeElement, toggle(page))
})

test('a link in the phone menu closes it, and the menu can be opened again', () => {
  const page = plans()
  page.click(toggle(page))
  page.click('#site-menu a[data-nav="visit"]')
  assert.equal(menu(page).open, false)
  page.click(toggle(page))
  assert.equal(menu(page).open, true)
})

test('the phone menu says whether Bayline is open, lists the four pages and ends with the red Join the line', () => {
  const page = plans()
  assert.equal(text(page, '#site-menu [data-open-pill]'), 'Open now, until 8:00 PM')
  const rows = page.$$<HTMLAnchorElement>('#site-menu nav a')
  assert.deepEqual(rows.map((a) => a.textContent), ['Prices', 'Wash packs', 'The line', 'Location'])
  assert.deepEqual(rows.map((a) => a.getAttribute('href')), ['/bayline/services/', '/bayline/plans/', '/bayline/visit/', '/bayline/location/'])
  assert.equal(page.$('#site-menu a[aria-current="page"]').textContent, 'Wash packs', 'the current page is marked')
  const last = page.$$<HTMLAnchorElement>('#site-menu a').at(-1)!
  assert.equal(last.textContent, 'Join the line')
  assert.ok(last.className.includes('bg-accent'))
  const night = plans({ at: CLOSED_AT })
  assert.equal(text(night, '#site-menu [data-open-pill]'), 'Closed now, opens tomorrow at 7:00 AM')
})

test('growing to the desktop nav closes an open menu, and focus is not sent to the hidden button', () => {
  const page = plans()
  page.click(toggle(page))
  page.resize(true)
  assert.equal(menu(page).open, false)
  assert.notEqual(page.document.activeElement, toggle(page))
})

test('the About this site link opens the concept dialog, Close and Escape shut it, and focus returns to the link', () => {
  const page = plans()
  const link = page.$('[data-footer-status] ~ * [data-concept], footer [data-concept]')
  page.click(link)
  const dialog = page.$<HTMLDialogElement>('#concept-dialog')
  assert.equal(dialog.open, true)
  page.click('[data-dialog-close]')
  assert.equal(dialog.open, false)
  assert.equal(page.document.activeElement, link)
  page.click(link)
  page.key('Escape')
  assert.equal(dialog.open, false)
  assert.equal(page.document.activeElement, link)
})

test('the header says Sign in until there is a session, then Account', () => {
  const out = plans()
  assert.equal(out.document.documentElement.hasAttribute('data-signed-in'), false)
  const session = { firstName: 'Ana', contact: 'ana@example.com', kind: 'email', since: '2026-11-01' }
  const signed = plans({ storage: { [SESSION_KEY]: session } })
  assert.equal(signed.document.documentElement.hasAttribute('data-signed-in'), true)
  const broken = plans({ storage: { [SESSION_KEY]: { firstName: '', contact: 'x', kind: 'email', since: 'soon' } } })
  assert.equal(broken.document.documentElement.hasAttribute('data-signed-in'), false, 'a damaged session is not a session')
})

test('the basket badge counts what is in the basket and hides at zero', () => {
  const empty = plans()
  assert.equal(empty.$('[data-basket-badge]').hidden, true)
  const full = plans({ storage: { [BASKET_KEY]: { wash: { vehicle: 'small', ids: ['express', 'engine'] }, plan: { id: 'express-4', vehicle: 'small', plates: 1 } } } })
  assert.equal(full.$('[data-basket-badge]').hidden, false)
  assert.equal(text(full, '[data-basket-count]'), '3')
  assert.equal(text(full, '[data-basket-unit]'), 'items')
})

test('the footer says whether Bayline is open and the sample line, and follows the clock at closing time', () => {
  const page = plans({ at: '2026-11-19T19:59:00+08:00' })
  assert.equal(page.$('[data-footer-status] [data-hours]').dataset.open, 'true')
  assert.equal(text(page, '[data-footer-status] [data-yard-text]'), '3 in line, about 25 min to wait')
  page.advance(60_000)
  assert.equal(page.$('[data-footer-status] [data-hours]').dataset.open, 'false')
  assert.equal(text(page, '[data-footer-status] [data-open-pill]'), 'Closed now, opens tomorrow at 7:00 AM')
  assert.equal(text(page, '[data-footer-status] [data-yard-text]'), 'No line until 7:00 AM')
})

test('scroll reveal: items are hidden only once the script marks them, reveal once, and never under reduced motion', () => {
  const still = plans()
  assert.equal(still.$$('.reveal-item').length, 0, 'reduced motion: the page just shows')

  const page = plans({ reducedMotion: false })
  const items = page.$$('.reveal-item')
  assert.ok(items.length > 0, 'the script marks the items')
  const waiting = items.find((item) => !item.classList.contains('is-revealed'))
  assert.ok(waiting, 'jsdom has no layout, so nothing counts as on screen and every item waits')
  page.intersect(waiting)
  assert.ok(waiting.classList.contains('is-revealed'), 'revealed when it enters the viewport')
  waiting.classList.remove('is-revealed')
  page.intersect(waiting) // already unobserved: it reveals once and never again
  assert.ok(!waiting.classList.contains('is-revealed'))
})
