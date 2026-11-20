import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { duration, peso } from '../app/lib/format.ts'
import { PLANS, perWashTotal, savings } from '../app/lib/plans.ts'
import { SERVICES, VEHICLES, type Vehicle } from '../app/lib/services.ts'

// The price tables, pack fallbacks and FAQ are hand-written HTML; these keep them equal to SERVICES and PLANS.
const page = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const services = page('../app/services/index.html')
const plansPage = page('../app/plans/index.html')
const location = page('../app/location/index.html')
const home = page('../app/index.html')

test('every price and time in the price table matches SERVICES', () => {
  const rows = [...services.matchAll(/<tr data-service="([\w-]+)">([\s\S]*?)<\/tr>/g)]
  assert.deepEqual(rows.map(([, id]) => id), SERVICES.map((service) => service.id))
  for (const [, id, row] of rows) {
    const service = SERVICES.find((s) => s.id === id)!
    assert.ok(row.includes(`<span class="service__name">${service.name}</span>`), `${id}: name`)
    assert.equal(row.match(/<td class="time num">([^<]*)<\/td>/)?.[1], duration(service.minutes), `${id}: time`)
    for (const vehicle of VEHICLES) {
      const cell = row.match(new RegExp(`<td class="price num[^"]*" data-v="${vehicle}">([^<]*)</td>`))?.[1]
      const price = service.prices[vehicle]
      assert.equal(cell, price === undefined ? 'Not offered' : peso(price), `${id}: ${vehicle}`)
    }
    assert.equal(row.includes('By appointment'), service.appointmentOnly === true, `${id}: appointment tag`)
  }
})

test('every pack price, saving and per-wash total, in the no-script fallback and the first card, matches PLANS', () => {
  for (const plan of PLANS) {
    const card = plansPage.match(new RegExp(`<article class="plan-card" data-plan="${plan.id}"[\\s\\S]*?</article>`))?.[0] ?? ''
    assert.ok(card.includes(`<h3>${plan.name}</h3>`), `${plan.id}: name`)
    assert.ok(card.includes(`data-plan-includes>${plan.includes}</p>`), `${plan.id}: what it includes`)
    const fallback = card.match(/<dl class="plan-all" data-fallback>([\s\S]*?)<\/dl>/)?.[1] ?? ''
    const rows = [...fallback.matchAll(/<dt>([^<]*)<\/dt>\s*<dd[^>]*>([^<]*)<\/dd>/g)].map(([, name, shown]) => [name.toLowerCase(), shown])
    assert.deepEqual(rows.map(([vehicle]) => vehicle), [...VEHICLES], `${plan.id}: vehicles`)
    for (const [vehicle, shown] of rows) {
      const price = plan.prices[vehicle as Vehicle]
      assert.equal(shown, price === undefined ? 'Not offered for motorcycles' : peso(price), `${plan.id}: ${vehicle}`)
    }
    // The enhanced card starts on the small car, the price list's default vehicle.
    assert.equal(card.match(/data-plan-amount[^>]*>([^<]*)</)?.[1], peso(plan.prices.small ?? 0), `${plan.id}: first card price`)
    assert.equal(card.match(/data-plan-save[^>]*>([^<]*)</)?.[1], `Save ${peso(savings(plan, 'small') ?? 0)} a month`, `${plan.id}: first saving`)
    assert.equal(card.match(/data-plan-single[^>]*>([^<]*)</)?.[1], `${peso(perWashTotal(plan, 'small') ?? 0)} if you pay per wash`, `${plan.id}: per-wash total`)
  }
})

test('the FAQ quotes the same prices', () => {
  // Each <summary> carries layout classes and ends with the inline caret icon placeholder.
  const answer = (question: string) => location.match(new RegExp(`<summary[^>]*>${question}(?:<i [^>]*></i>)?</summary>\\s*<p[^>]*>([^<]*)</p>`))?.[1] ?? ''
  const motorcycles = answer('Do you wash motorcycles\\?')
  for (const service of SERVICES) {
    const price = service.prices.motorcycle
    if (price !== undefined) assert.ok(motorcycles.includes(peso(price)), `motorcycle ${service.id}`)
  }
  const packs = answer('How do the wash packs work\\?')
  const range = (id: string) => Object.values(PLANS.find((p) => p.id === id)!.prices)
  for (const id of ['express-4', 'express-8']) {
    const prices = range(id)
    assert.ok(packs.includes(`${peso(Math.min(...prices))} to ${peso(Math.max(...prices))}`), `${id} range`)
  }
  assert.ok(packs.includes(`from ${peso(Math.min(...range('care-4')))}`), 'care-4 from')
  assert.ok(packs.includes('one wash a day') && packs.includes('carry over') && packs.includes('one registered plate'), 'the rules')
  assert.ok(answer('Do I need to book ceramic coating\\?').includes('8:00 AM'), 'ceramic drop-off')
})

test('the home price table shows every service, its time and each vehicle’s price, as in SERVICES', () => {
  const table = home.match(/<table[^>]*data-home-prices[\s\S]*?<\/table>/)?.[0] ?? ''
  assert.ok(table, 'a price table on Home')
  // The vehicle cut-outs head the columns, in the price list's order.
  const heads = [...table.matchAll(/<th scope="col"[^>]*data-v="([\w-]+)"[^>]*>([\s\S]*?)<\/th>/g)]
  assert.deepEqual(heads.map(([, vehicle]) => vehicle), [...VEHICLES])
  for (const [, vehicle, cell] of heads) assert.match(cell, /<img [^>]*src="\/photos\/vehicle-[\w-]+-400\.webp"[^>]*alt=""/, `${vehicle}: cut-out header`)

  const rows = [...table.matchAll(/<tr data-service="([\w-]+)">([\s\S]*?)<\/tr>/g)]
  assert.deepEqual(rows.map(([, id]) => id), SERVICES.map((service) => service.id))
  for (const [, id, row] of rows) {
    const service = SERVICES.find((s) => s.id === id)!
    assert.ok(row.includes(`>${service.name}</span>`), `${id}: name`)
    assert.equal(row.match(/data-time>([^<]*)</)?.[1], duration(service.minutes), `${id}: time`)
    for (const vehicle of VEHICLES) {
      const cell = row.match(new RegExp(`<td [^>]*data-v="${vehicle}"[^>]*>([^<]*)</td>`))?.[1]
      const price = service.prices[vehicle]
      assert.equal(cell, price === undefined ? 'Not offered' : peso(price), `${id}: ${vehicle}`)
    }
    assert.equal(row.includes('By appointment'), service.appointmentOnly === true, `${id}: appointment note`)
  }
})
