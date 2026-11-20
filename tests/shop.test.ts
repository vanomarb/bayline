import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage, type Page } from './harness.ts'
import { PLAN_KEY } from '../app/lib/account.ts'
import { BASKET_KEY } from '../app/lib/cart.ts'

/* Services, Plans and Basket: the price picker, adding a wash and a pack, the replace warning, checkout. */

after(closeAll)

const text = (page: Page, selector: string) => (page.$(selector).textContent ?? '').replaceAll(' ', ' ').trim()
function load(file: string, path: string, options: Parameters<typeof loadPage>[2] = {}) {
  const page = loadPage(file, path, options)
  assert.deepEqual(page.boot(), [], 'starts without errors')
  return page
}

test('the price picker adds up the ticked services for the chosen vehicle, and says what it leaves out', () => {
  const page = load('services/index.html', 'services/')
  assert.equal(text(page, '[data-total]'), '₱180')
  assert.equal(text(page, '[data-time]'), '20 min')
  page.click('input[name="service"][value="engine"]')
  assert.equal(text(page, '[data-total]'), '₱580')
  assert.equal(text(page, '[data-time]'), '50 min')
  page.click('input[name="picker-vehicle"][value="medium"]')
  assert.equal(text(page, '[data-total]'), '₱670')
  assert.equal(text(page, '[data-total-label]'), 'Total for a medium vehicle')
  page.click('input[name="picker-vehicle"][value="motorcycle"]')
  assert.equal(text(page, '[data-total]'), '₱250')
  page.click('input[name="service"][value="glass"]')
  assert.equal(page.$<HTMLInputElement>('input[name="service"][value="glass"]').disabled, true, 'not offered for a motorcycle')
})

test('a service the vehicle cannot get stays ticked, is left out of the total, and comes back with the vehicle', () => {
  const page = load('services/index.html', 'services/')
  page.click('input[name="service"][value="glass"]')
  page.click('input[name="picker-vehicle"][value="motorcycle"]')
  assert.match(text(page, '[data-total-note]'), /^Not counted: Glass and watermark removal\./)
  assert.equal(text(page, '[data-total]'), '₱100')
  page.click('input[name="picker-vehicle"][value="small"]')
  assert.equal(text(page, '[data-total]'), '₱1,080')
  assert.equal(text(page, '[data-total-note]'), '')
})

test('Enter on a vehicle moves on to the services, and unticking everything says so', () => {
  const page = load('services/index.html', 'services/')
  page.focus('input[name="picker-vehicle"][value="small"]')
  page.key('Enter')
  assert.equal(page.document.activeElement?.getAttribute('name'), 'service')
  page.click('input[name="service"][value="express"]')
  assert.equal(text(page, '[data-total-note]'), 'Tick a service to see the total.')
})

test('Add to basket puts the ticked services in the basket, and the header badge counts them', () => {
  const page = load('services/index.html', 'services/')
  page.click('input[name="service"][value="engine"]')
  page.click('[data-add-wash]')
  assert.match(text(page, '[data-basket-status]'), /^Added to your basket: Express wash \+ Engine wash for a small car\. View basket$/)
  assert.deepEqual(page.storage(BASKET_KEY), { wash: { vehicle: 'small', ids: ['express', 'engine'] }, plan: null })
  assert.equal(text(page, '[data-basket-count]'), '2')
  assert.equal(page.$('[data-basket-status] a').getAttribute('href'), '/bayline/basket/')
})

test('adding with nothing ticked says to tick a service, and with storage blocked says the basket cannot keep it', () => {
  const page = load('services/index.html', 'services/')
  page.click('input[name="service"][value="express"]')
  page.click('[data-add-wash]')
  assert.equal(text(page, '[data-basket-status]'), 'Tick a service first, then add it to your basket.')
  const blocked = load('services/index.html', 'services/', { blockedStorage: true })
  blocked.click('[data-add-wash]')
  assert.match(text(blocked, '[data-basket-status]'), /^This browser is blocking the site’s storage/)
})

test('the pack cards show the monthly price and the saving for the chosen vehicle, and say when a pack is not offered', () => {
  const page = load('plans/index.html', 'plans/')
  const card = (id: string) => `[data-plan="${id}"]`
  assert.equal(text(page, `${card('express-4')} [data-plan-amount]`), '₱650')
  assert.equal(text(page, `${card('express-4')} [data-plan-save]`), 'Save ₱70 a month')
  page.click('input[name="plans-vehicle"][value="large"]')
  assert.equal(text(page, `${card('express-4')} [data-plan-amount]`), '₱940')
  assert.equal(text(page, `${card('care-4')} [data-plan-amount]`), '₱1,900')
  page.click('input[name="plans-vehicle"][value="motorcycle"]')
  assert.equal(text(page, `${card('care-4')} [data-plan-amount]`), 'Not for motorcycles')
  assert.equal(page.$(card('care-4')).dataset.offered, 'false')
  assert.equal(text(page, `${card('care-4')} [data-plan-single]`), 'Express 4 and Express 8 cover motorcycles.')
  assert.match(text(page, '[data-plans-live]'), /^Motorcycle: Express 4 ₱360 a month/)
})

test('Add to basket on a pack puts it in the basket; another pack in its place says what it replaced', () => {
  const page = load('plans/index.html', 'plans/')
  page.click('[data-add-plan="express-4"]')
  assert.equal(text(page, '[data-basket-status]'), 'Added to your basket: Express 4 for a small car. View basket')
  assert.deepEqual((page.storage(BASKET_KEY) as { plan: unknown }).plan, { id: 'express-4', vehicle: 'small', plates: 1 })
  page.click('[data-add-plan="express-8"]')
  assert.match(text(page, '[data-basket-status]'), /^Your basket now has Express 8 for a small car, in place of Express 4 for a small car\./)
  assert.equal(text(page, '[data-basket-count]'), '1', 'one pack at a time')
  page.click('[data-add-plan="express-8"]')
  assert.match(text(page, '[data-basket-status]'), /^Added to your basket: Express 8/, 'the same pack again is not a replacement')
})

test('the pack buttons are outline, not red: red stays for join and book', () => {
  const page = load('plans/index.html', 'plans/')
  for (const button of page.$$('[data-add-plan]')) assert.ok(!button.className.includes('bg-accent'))
})

const basketWith = (plan: unknown, wash: unknown = null) => ({ [BASKET_KEY]: { wash, plan } })

test('an empty basket says so, and points to the prices and the packs', () => {
  const page = load('basket/index.html', 'basket/')
  assert.equal(page.$('[data-basket-empty]').hidden, false)
  assert.equal(page.$('[data-basket-wash]').hidden, true)
  assert.equal(page.$('[data-basket-plan]').hidden, true)
})

test('the wash in the basket: services with prices, remove one and focus stays in the list, the total follows', () => {
  const page = load('basket/index.html', 'basket/', { storage: basketWith(null, { vehicle: 'small', ids: ['express', 'engine'] }) })
  assert.equal(page.$('[data-basket-empty]').hidden, true)
  assert.equal(page.$$('[data-wash-lines] li').length, 2)
  assert.equal(text(page, '[data-wash-total]'), '₱580')
  assert.equal(text(page, '[data-wash-time]'), '50 min')
  assert.match(page.$<HTMLAnchorElement>('[data-wash-book]').getAttribute('href') ?? '', /^\/bayline\/visit\/\?vehicle=small&services=express,engine&from=basket#book$/)
  page.click('[data-remove-service="engine"]')
  assert.equal(text(page, '[data-basket-note]'), 'Removed Engine wash.')
  assert.equal(text(page, '[data-wash-total]'), '₱180')
  assert.equal(page.document.activeElement, page.$('[data-remove-service="express"]'))
  page.click('[data-remove-service="express"]')
  assert.equal(page.$('[data-basket-empty]').hidden, false)
  assert.equal(page.document.activeElement, page.$('#basket-title'))
  assert.equal(page.storage(BASKET_KEY) && (page.storage(BASKET_KEY) as { wash: unknown }).wash, null)
})

test('the pack in the basket: packs and plates are counted, one plate field each, within one to four', () => {
  const page = load('basket/index.html', 'basket/', { storage: basketWith({ id: 'express-8', vehicle: 'small', plates: 1 }) })
  assert.equal(text(page, '[data-plan-name]'), 'Express 8')
  assert.equal(text(page, '[data-subscribe]'), 'Start for ₱1,220 a month')
  assert.equal(page.$$('[data-plate-fields] input').length, 1)
  page.click('[data-plates-step="1"]')
  assert.equal(text(page, '[data-plates]'), '2')
  assert.equal(page.$$('[data-plate-fields] input').length, 2)
  assert.equal(text(page, '[data-subscribe]'), 'Start for ₱2,440 a month')
  page.click('[data-plates-step="1"]')
  page.click('[data-plates-step="1"]')
  assert.equal(page.$<HTMLButtonElement>('[data-plates-step="1"]').disabled, true, 'four at most')
  assert.equal(page.document.activeElement, page.$('[data-plates-step="-1"]'), 'focus moves off the button that just went dead')
})

test('checkout asks for each plate and a payment, in words, and focus goes to the first problem', () => {
  const page = load('basket/index.html', 'basket/', { storage: basketWith({ id: 'express-4', vehicle: 'small', plates: 2 }) })
  page.click('[data-subscribe]')
  assert.equal(text(page, '#plan-plate-1-error'), 'Type the plate number.')
  assert.equal(page.focused(), 'plan-plate-1')
  page.fill('#plan-plate-1', 'nbc 1234')
  page.fill('#plan-plate-2', 'hello')
  page.click('[data-subscribe]')
  assert.match(text(page, '#plan-plate-2-error'), /^That doesn’t look like a plate number/)
  assert.equal(page.focused(), 'plan-plate-2')
  page.fill('#plan-plate-2', 'NBC 1234')
  page.click('[data-subscribe]')
  assert.match(text(page, '#plan-plate-2-error'), /^That plate already has a pack in this order/)
  page.fill('#plan-plate-2', 'ABC 123')
  page.click('[data-subscribe]')
  assert.equal(text(page, '[data-subscribe-error] [data-error-text]'), 'Choose how you’ll pay: GCash, Maya or card.')
  assert.equal(page.$('input[name="payment"]').matches(':focus'), true)
})

test('checkout starts the pack: saved for the account page, the basket pack emptied, focus on the confirmation', () => {
  const page = load('basket/index.html', 'basket/', { storage: basketWith({ id: 'express-4', vehicle: 'small', plates: 1 }) })
  page.fill('#plan-plate-1', 'nbc 1234')
  page.click('input[name="payment"][value="gcash"]')
  page.click('[data-subscribe]')
  assert.equal(text(page, '[data-subscribed-text]'), 'Wash pack started: Express 4 for NBC 1234, ₱650 a month by GCash. Nothing was charged: this is a demonstration site, and no payment page opened.')
  assert.equal(page.document.activeElement, page.$('[data-subscribed]'))
  assert.equal(page.$('[data-basket-plan]').hidden, true)
  const saved = page.storage(PLAN_KEY) as { id: string; plates: string[]; payment: string; since: string }
  assert.deepEqual([saved.id, saved.plates, saved.payment, saved.since], ['express-4', ['NBC 1234'], 'gcash', '2026-11-19'])
  assert.equal((page.storage(BASKET_KEY) as { plan: unknown }).plan, null)
})

test('a second pack while one is active is not silent: the basket says which pack and since when, that checking out replaces it, and the button says so', () => {
  const active = { id: 'express-4', vehicle: 'small', plates: ['NBC 1234'], payment: 'gcash', since: '2026-11-05' }
  const page = load('basket/index.html', 'basket/', { storage: { ...basketWith({ id: 'care-4', vehicle: 'medium', plates: 1 }), [PLAN_KEY]: active } })
  const note = page.$('[data-plan-active]')
  assert.equal(note.hidden, false)
  assert.equal(text(page, '[data-active-text]'), 'You already have Express 4 for a small car on NBC 1234, since 5 November 2026. Starting this pack replaces it.')
  assert.equal(text(page, '[data-subscribe]'), 'Replace my pack, ₱1,650 a month')
  page.fill('#plan-plate-1', 'DEF 567')
  page.click('input[name="payment"][value="maya"]')
  page.click('[data-subscribe]')
  assert.equal(text(page, '[data-subscribed-text]'), 'Wash pack replaced: Care 4 for DEF 567, ₱1,650 a month by Maya, in place of Express 4 for a small car. Nothing was charged: this is a demonstration site, and no payment page opened.')
  const saved = page.storage(PLAN_KEY) as { id: string; plates: string[] }
  assert.deepEqual([saved.id, saved.plates], ['care-4', ['DEF 567']], 'the new pack is the active one')
})

test('with no pack active there is no replace warning and the button says start', () => {
  const page = load('basket/index.html', 'basket/', { storage: basketWith({ id: 'care-4', vehicle: 'medium', plates: 1 }) })
  assert.equal(page.$('[data-plan-active]').hidden, true)
  assert.equal(text(page, '[data-subscribe]'), 'Start for ₱1,650 a month')
})

test('removing the pack from the basket empties it and moves focus to the heading', () => {
  const page = load('basket/index.html', 'basket/', { storage: basketWith({ id: 'express-4', vehicle: 'small', plates: 1 }) })
  page.click('[data-remove-plan]')
  assert.equal(text(page, '[data-basket-note]'), 'Removed the Express 4 pack.')
  assert.equal(page.$('[data-basket-empty]').hidden, false)
  assert.equal(page.document.activeElement, page.$('#basket-title'))
})

test('a basket full of nonsense reads as empty, and blocked storage says the basket cannot be kept', () => {
  const bad = load('basket/index.html', 'basket/', { storage: { [BASKET_KEY]: { wash: { vehicle: 'tank', ids: ['x'] }, plan: { id: 'nope', vehicle: 'small', plates: 99 } } } })
  assert.equal(bad.$('[data-basket-empty]').hidden, false)
  const blocked = load('basket/index.html', 'basket/', { blockedStorage: true })
  assert.equal(blocked.$('[data-basket-empty]').hidden, false)
})
