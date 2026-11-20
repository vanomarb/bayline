import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { CLOSED_AT, closeAll, loadPage, type Page } from '../../tests/harness.ts'
import { JOIN_KEY } from '../lib/handoff.ts'
import { peso } from '../lib/format.ts'
import { SERVICES, VEHICLES } from '../lib/services.ts'

after(closeAll)

function home(options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage('index.html', '', options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  return page
}
const text = (page: Page, selector: string) => (page.$(selector).textContent ?? '').replaceAll(' ', ' ').trim()

test('the board is drawn from the sample yard: three bays, the line, and the wait sign for the next car', () => {
  const page = home()
  assert.deepEqual(page.$$('[data-bay-plate]').map((el) => el.textContent), ['ABC 1234', 'DEF 567', 'GHI 8901'])
  assert.deepEqual(page.$$('[data-bay-size]').map((el) => el.textContent), ['Small car', 'Medium vehicle', 'Large vehicle'])
  assert.deepEqual(page.$$('[data-queue] .plate').map((el) => el.textContent), ['123 JKL', 'MNO 2345', 'PQR 678'])
  assert.equal(page.$$('[data-bay] img').length, 3, 'a photo of the vehicle class in each bay')
  assert.equal(page.$('[data-bay] img').getAttribute('src'), '/bayline/photos/vehicle-small-sedan-400.webp', 'under the site’s base path')
  assert.equal(page.$('[data-queue-empty]').hidden, true)
  const sign = page.$('[data-wait-sign]')
  assert.equal(sign.dataset.state, 'open')
  assert.equal(text(page, '[data-wait-number]'), '25')
  assert.equal(text(page, '[data-wait-unit]'), 'min')
  assert.equal(text(page, '[data-wait-yard]'), '3 of 3 bays busy, 3 in line')
})

test('the board does not run on Home: time passing changes nothing', () => {
  const page = home()
  page.advance(120_000)
  assert.deepEqual(page.$$('[data-bay-plate]').map((el) => el.textContent), ['ABC 1234', 'DEF 567', 'GHI 8901'])
  assert.equal(text(page, '[data-wait-number]'), '25')
  assert.equal(page.$$('[data-clock]').length, 0, 'no Play button here: joining happens on the line page')
})

test('after closing the wait sign says closed, with the time in Mandaue, and the hours line says when it opens', () => {
  const page = home({ at: CLOSED_AT })
  assert.equal(page.$('[data-wait-sign]').dataset.state, 'closed')
  assert.equal(text(page, '[data-wait-clock]'), 'It’s 10:00 PM in Mandaue')
  assert.equal(page.$('#where [data-hours]').dataset.open, 'false')
  assert.equal(text(page, '#where [data-open-pill]'), 'Closed now, opens tomorrow at 7:00 AM')
})

test('the wait sign and the where line follow the clock as it passes 8:00 PM', () => {
  const page = home({ at: '2026-11-19T19:59:00+08:00' })
  assert.equal(page.$('[data-wait-sign]').dataset.state, 'open')
  assert.equal(text(page, '#where [data-open-pill]'), 'Open now, until 8:00 PM')
  page.advance(90_000) // the page rechecks every 30 seconds
  assert.equal(page.$('[data-wait-sign]').dataset.state, 'closed')
  assert.equal(text(page, '#where [data-open-pill]'), 'Closed now, opens tomorrow at 7:00 AM')
})

test('the join strip: a plate goes to the line page through session storage, not the address', () => {
  const page = home()
  page.click('#home-plate')
  assert.equal(page.focused(), 'home-plate')
  page.type('#home-plate', 'nbc 1234')
  page.key('Enter')
  assert.deepEqual(page.navigations, ['https://bayline.test/bayline/visit/'], 'opens the line page, with nothing after it')
  assert.equal(page.session(JOIN_KEY), 'nbc 1234')
  assert.equal(page.window.location.hash, '')
  assert.equal(page.window.location.search, '')
  assert.equal(page.window.localStorage.length, 0, 'and nothing in local storage')
})

test('the whole route: typed on Home, joined on the line page, with the plate gone from storage afterwards', () => {
  const start = home()
  start.fill('#home-plate', 'nbc 1234')
  start.click('[data-join-handoff] button[type="submit"]')
  const left = start.session(JOIN_KEY)
  const visit = loadPage('visit/index.html', 'visit/', { session: { [JOIN_KEY]: left } })
  assert.deepEqual(visit.boot(), [])
  assert.match(text(visit, '[data-status-main]'), /^You’re 4th in line as NBC 1234\./)
  assert.equal(visit.session(JOIN_KEY), null)
  assert.equal(visit.window.location.hash, '')
})

test('an empty plate still goes to the line page, which focuses its own field', () => {
  const page = home()
  page.click('[data-join-handoff] button[type="submit"]')
  assert.equal(page.navigations.length, 1)
  assert.equal(page.session(JOIN_KEY), '')
})

test('blocked session storage never stops the strip: the line page just opens', () => {
  const page = home()
  Object.defineProperty(page.window, 'sessionStorage', {
    get: () => {
      throw new page.window.DOMException('blocked', 'SecurityError')
    },
  })
  page.fill('#home-plate', 'NBC 1234')
  page.click('[data-join-handoff] button[type="submit"]')
  assert.equal(page.navigations.length, 1)
})

test('the price table: all seven services by four vehicles, from the same price list the site adds up with', () => {
  const page = home()
  const rows = page.$$('[data-home-prices] tr[data-service]')
  assert.deepEqual(rows.map((row) => row.dataset.service), SERVICES.map((s) => s.id))
  for (const service of SERVICES) {
    const row = rows.find((r) => r.dataset.service === service.id)!
    for (const vehicle of VEHICLES) {
      const cell = row.querySelector(`td[data-v="${vehicle}"]`)?.textContent
      const price = service.prices[vehicle]
      assert.equal(cell, price === undefined ? 'Not offered' : peso(price), `${service.id} ${vehicle}`)
    }
  }
  assert.equal(page.$$('[data-home-prices] thead th[data-v] img').length, 4, 'a cut-out in every vehicle column')
  assert.equal(text(page, '[data-service="ceramic"] th'), 'Ceramic coating1 dayBy appointment')
})

test('the packs strip and where: a link to the packs in outline, and the hours with today’s status', () => {
  const page = home()
  const link = page.$<HTMLAnchorElement>('#packs a')
  assert.equal(link.getAttribute('href'), '/bayline/plans/')
  assert.ok(!link.className.includes('bg-accent'), 'red stays for join and book')
  assert.equal(text(page, '[data-save="express-8"]'), '₱220')
  assert.match(text(page, '#where'), /Every day, 7:00 AM to 8:00 PM/)
  assert.equal(text(page, '#where [data-hours-clock]'), 'It’s 10:30 AM in Mandaue')
})

test('the footer strip on Home: open now, and the sample line’s wait', () => {
  const page = home()
  assert.equal(text(page, '[data-footer-status] [data-open-pill]'), 'Open now, until 8:00 PM')
  assert.equal(text(page, '[data-footer-status] [data-yard-text]'), '3 in line, about 25 min to wait')
})
