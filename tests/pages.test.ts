import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { peso } from '../app/lib/format.ts'
import { PACK_RULES, PLANS, savings } from '../app/lib/plans.ts'
import { SERVICES, VEHICLES } from '../app/lib/services.ts'
import { PARTIAL_FILES, type PartialName } from '../build/partials.ts'
import { LOCAL_SITE_URL } from '../app/lib/site.ts'

// Every page as written: the build only adds the partials, inlines icons and fills in %VITE_SITE_URL%.
const PAGES = [
  { key: 'home', file: '../app/index.html', path: '' },
  { key: 'services', file: '../app/services/index.html', path: 'services/' },
  { key: 'plans', file: '../app/plans/index.html', path: 'plans/' },
  { key: 'visit', file: '../app/visit/index.html', path: 'visit/' },
  { key: 'location', file: '../app/location/index.html', path: 'location/' },
  { key: 'account', file: '../app/account/index.html', path: 'account/' },
  { key: 'basket', file: '../app/basket/index.html', path: 'basket/' },
  { key: 'about', file: '../app/about/index.html', path: 'about/' },
  { key: 'contact', file: '../app/contact/index.html', path: 'contact/' },
  { key: 'terms', file: '../app/terms/index.html', path: 'terms/' },
  { key: 'privacy', file: '../app/privacy/index.html', path: 'privacy/' },
  { key: 'cookies', file: '../app/cookies/index.html', path: 'cookies/' },
  { key: 'accessibility', file: '../app/accessibility/index.html', path: 'accessibility/' },
] as const

const COMPANY_PAGES = ['about', 'contact', 'terms', 'privacy', 'cookies', 'accessibility'] as const
const LEGAL_PAGES = ['terms', 'privacy', 'cookies'] as const

const DISCLOSURE = 'Bayline is a concept brand. This is a demonstration site: nothing you enter here is sent, and no payments are taken.'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const pageOf = (key: string) => read(PAGES.find((page) => page.key === key)!.file)
const meta = (html: string, attr: 'name' | 'property', key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1]
const header = read('../app/components/header.html')
const footer = read('../app/components/footer.html')

function filesIn(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(new URL(`${entry.name}/`, dir)) : entry.name.endsWith('.ts') ? [new URL(entry.name, dir)] : [],
  )
}

/** Every TypeScript file under app/, build/ and tests/, tests included. */
const sourceFiles = (): URL[] => ['../app/', '../build/', '../tests/'].flatMap((dir) => filesIn(new URL(dir, import.meta.url)))

test('.env stays out of git, and .env.example shows the local site address', () => {
  assert.match(read('../.gitignore'), /^\.env$/m, '.env is ignored')
  assert.ok(read('../.env.example').split('\n').includes(`VITE_SITE_URL=${LOCAL_SITE_URL}`), '.env.example names VITE_SITE_URL')
})

test('every page exists with its own title, description, canonical, Open Graph and noindex', () => {
  const titles = new Set<string>()
  for (const page of PAGES) {
    assert.ok(existsSync(new URL(page.file, import.meta.url)), `${page.file} exists`)
    const html = read(page.file)
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? ''
    assert.ok(title.includes('Bayline'), `${page.file}: title`)
    titles.add(title)
    const description = meta(html, 'name', 'description') ?? ''
    assert.ok(description.length >= 50 && description.length <= 160, `${page.file}: description length ${description.length}`)
    const url = `%VITE_SITE_URL%${page.path}`
    assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), `${page.file}: canonical`)
    assert.equal(meta(html, 'property', 'og:url'), url, `${page.file}: og:url`)
    assert.equal(meta(html, 'property', 'og:image'), '%VITE_SITE_URL%og.png', `${page.file}: og:image`)
    assert.equal(meta(html, 'name', 'twitter:image'), '%VITE_SITE_URL%og.png', `${page.file}: twitter:image`)
    assert.equal(meta(html, 'property', 'og:title'), title, `${page.file}: og:title`)
    assert.equal(meta(html, 'name', 'robots'), 'noindex', `${page.file}: noindex`)
    assert.ok(html.includes('<link rel="icon" href="/favicon.svg"'), `${page.file}: favicon`)
    // Sets html.js and, for a saved session, data-signed-in before first paint, so the header never shifts.
    assert.ok(html.includes("localStorage.getItem('bayline.session')"), `${page.file}: boot script`)
  }
  assert.equal(titles.size, PAGES.length, 'titles are unique')
})

test('every page is a build input', () => {
  const config = read('../vite.config.ts')
  const keys = read('../build/partials.ts')
  for (const page of PAGES.slice(1)) assert.ok(config.includes(`'${page.path}index.html'`), `vite.config.ts builds ${page.path}`)
  for (const page of PAGES) assert.ok(keys.includes(`'${page.key}'`), `partials.ts knows the page key ${page.key}`)
})

test('every page takes the shared header and footer, naming itself so the nav can mark it', () => {
  for (const page of PAGES) {
    const html = read(page.file)
    assert.ok(html.includes(`<!-- @include header current="${page.key}" -->`), `${page.file}: header include`)
    assert.ok(html.includes('<!-- @include footer -->'), `${page.file}: footer include`)
  }
  for (const key of ['services', 'plans', 'visit', 'location', 'account', 'basket']) {
    assert.ok(header.includes(`href="%BASE_URL%${key}/" data-nav="${key}"`), `header links to ${key}`)
  }
  assert.ok(header.includes('>Sign in<'), 'header says Sign in')
})

test('the footer is a signboard: the live status strip first, one row of links, then the legal line; no columns', () => {
  const bar = footer.slice(0, footer.indexOf('<dialog'))
  const at = (marker: string) => bar.indexOf(marker)
  assert.ok(at('data-footer-status') > -1 && at('data-footer-status') < at('aria-label="Footer"') && at('aria-label="Footer"') < at('data-legal-row'), 'status strip, links row, legal line, in that order')

  const strip = bar.slice(at('data-footer-status'), at('aria-label="Footer"'))
  for (const marker of ['data-hours', 'data-msg-closed-today', 'data-msg-closed-tomorrow', 'data-open-pill', 'data-yard-line', 'data-msg-line-closed', 'Every day, 7:00 AM to 8:00 PM', 'Subangdaku, Mandaue City']) {
    assert.ok(strip.includes(marker), `status strip: ${marker}`)
  }
  const join = strip.match(/<a [^>]*>Join the line<\/a>/)?.[0] ?? ''
  assert.ok(join.includes('href="%BASE_URL%visit/"') && join.includes('bg-accent'), 'status strip: the red Join the line')

  const links = bar.slice(at('aria-label="Footer"'), at('data-legal-row'))
  assert.equal((bar.match(/<nav\b/g) ?? []).length, 1, 'one links row')
  assert.ok(!/<h2\b/.test(bar), 'no column headings')
  for (const key of ['services', 'plans', 'visit', 'location', 'about', 'contact', 'accessibility', 'account']) {
    assert.ok(links.includes(`href="%BASE_URL%${key}/" data-nav="${key}"`), `links row: ${key}`)
  }
  assert.ok(links.includes('href="%BASE_URL%location/#faq"'), 'links row: FAQ')
  assert.ok(pageOf('location').includes('id="faq"'), 'the FAQ it points to')

  const legal = bar.match(/<div[^>]*data-legal-row[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
  for (const key of LEGAL_PAGES) assert.ok(legal.includes(`href="%BASE_URL%${key}/" data-nav="${key}"`), `legal line: ${key}`)
  for (const name of ['Terms of Service', 'Privacy Policy', 'Cookie Policy']) assert.ok(legal.includes(`>${name}</a>`), `legal line: ${name}`)
  assert.ok(!/(facebook|instagram|tiktok|twitter|x)\.com/i.test(footer), 'no social links')
})

test('no newsletter: the footer form and everything that only served it are gone', () => {
  const bar = footer.slice(0, footer.indexOf('<dialog'))
  assert.ok(!/<form\b/.test(bar) && !/type="email"/.test(bar), 'no form in the footer')
  for (const file of [...PAGES.map((p) => p.file), '../app/404.html', '../app/components/header.html', '../app/components/footer.html']) {
    assert.ok(!/newsletter|data-newsletter/i.test(read(file)), `${file}: no newsletter`)
  }
  assert.ok(!read('../app/main.ts').includes('data-newsletter'), 'main.ts starts no newsletter form')
  assert.ok(!/newsletter/i.test(read('../app/contact/mock-form.ts')), 'the mock form serves the contact form only')
  assert.ok(pageOf('contact').includes('data-contact-form'), 'the contact form still uses it')
})

test('honesty without a footer disclosure: About this site in the legal row, the statement on Terms, notes by the main actions', () => {
  const footerBar = footer.slice(0, footer.indexOf('<dialog'))
  assert.ok(!footerBar.includes(DISCLOSURE) && !footerBar.includes('concept brand'), 'no disclosure line in the footer itself')
  const legalRow = footer.match(/<div[^>]*data-legal-row[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
  assert.ok(legalRow.includes('© 2026 Bayline'), 'legal row: copyright')
  assert.match(legalRow, /<a [^>]*data-concept[^>]*>(<svg[\s\S]*?<\/svg>|<i [^>]*><\/i>)?About this site<\/a>/, 'legal row: About this site opens the dialog')
  const dialog = footer.match(/<dialog[^>]*id="concept-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? ''
  assert.ok(dialog.includes('>About this site</h2>') && dialog.includes('demonstration site'), 'dialog title and statement')
  assert.ok(!/href="https?:/.test(dialog), 'no outside links in the dialog')
  assert.ok(footer.includes('Photo credits'), 'photo credits')
  assert.ok(pageOf('terms').includes(DISCLOSURE), 'Terms states the demonstration')
  const home = pageOf('home')
  const opening = home.match(/<section[^>]*id="board"[\s\S]*?<\/section>/)?.[0] ?? ''
  const join = opening.slice(opening.indexOf('data-join-handoff'))
  assert.match(join, /^[^]*?<\/form>\s*<p [^>]*>Sample board\.[^<]*concept[^<]*<a [^>]*data-concept[^>]*>About this site<\/a><\/p>/, 'Home: the concept note, in Bayline’s words, right under the join form')
  assert.ok(!/is a concept brand, and this is a demonstration site/.test(home), 'Home: not the shared hero-note wording')
  const visit = pageOf('visit')
  assert.equal((visit.match(/concept brand/g) ?? []).length, 1, 'Visit: exactly one concept note')
  const booking = visit.slice(visit.indexOf('data-booking-form'), visit.indexOf('</form>', visit.indexOf('data-booking-form')))
  assert.match(booking, /data-confirm>[\s\S]*?concept brand[^<]*<a [^>]*data-concept/, 'Visit: the concept note by the booking form\'s submit button')
  assert.ok(!/board|sample/i.test(booking.slice(booking.indexOf('data-confirm>'))), 'Visit: the booking note covers only the booking')
  const caption = visit.match(/<p [^>]*data-board-caption[^>]*>([\s\S]*?)<\/p>/)
  assert.ok(caption && /sample data/.test(caption[1]) && /not a live feed/.test(caption[1]), 'Visit: the board says it shows sample data, not live')
  assert.ok(visit.indexOf('data-board-caption') < visit.indexOf('id="panel-walk-in"') && visit.indexOf('data-board-caption') < visit.indexOf('id="panel-schedule"'), 'Visit: the caption sits outside both tabs, so both show it')
  for (const file of [...PAGES.map((p) => p.file), '../app/404.html', '../app/components/header.html', '../app/components/footer.html']) {
    assert.ok(!/href="[^"]*#disclosure"/.test(read(file)), `${file}: no link to the removed #disclosure`)
  }
  for (const page of PAGES) assert.ok(!/real business\?/i.test(read(page.file)), `${page.file}: no "real business?" FAQ`)
})

test('every page loads the one script, and it starts the scroll reveal', () => {
  for (const page of [...PAGES.map((p) => p.file), '../app/404.html']) assert.ok(read(page).includes('<script type="module" src="/main.ts"></script>'), `${page}: main.ts`)
  assert.ok(read('../app/main.ts').includes('boot()') && read('../app/boot.ts').includes('initReveal()'), 'main.ts boots the page, which starts the reveal')
  const css = read('../app/styles/main.css')
  assert.match(css, /html\.js \.reveal-item:not\(\.is-revealed\)/, 'the hidden start state needs the js class on <html>')
  assert.ok(!css.includes('html.reveal'), 'one gate: the js class')
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*html\.js \.reveal-item:not\(\.is-revealed\) \{\s*opacity: 1;/, 'reduced motion shows everything')
})

test('the product names no author: no name, handle, portfolio or code host on any page, partial or source file', () => {
  const author = /va[n]\s*omar|benaire[s]|designed\s+and\s+built|githu[b]/i
  const files = [...PAGES.map((page) => page.file), '../app/404.html', '../app/components/header.html', '../app/components/footer.html']
  for (const file of files) assert.ok(!author.test(read(file)), `${file}: no author`)
  for (const url of sourceFiles()) assert.ok(!author.test(readFileSync(url, 'utf8')), `${url.pathname}: no author`)
})

test('no password field and no card, CVV or account number field anywhere', () => {
  const html = [...PAGES.map((page) => read(page.file)), read('../app/404.html'), header, footer].join('\n')
  const code = sourceFiles().filter((url) => !url.pathname.endsWith('.test.ts')).map((url) => readFileSync(url, 'utf8')).join('\n')
  assert.ok(!/type\s*=\s*["']password/i.test(html + code), 'no password input')
  assert.ok(!/\.type\s*=\s*['"]password/.test(code), 'no password input made in code')
  assert.ok(!/autocomplete="cc-|['"]cc-(number|csc|exp)/.test(html + code), 'no card autofill fields')
  const fields = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map(([tag]) => tag)
  const labels = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map(([, text]) => text.replace(/<[^>]+>/g, ''))
  const banned = /card.?(number|no\b)|\bcvv|\bcvc|security code|account.?(number|no\b)|expir/i
  for (const field of fields) assert.ok(!banned.test(field), `field: ${field}`)
  for (const label of labels) assert.ok(!banned.test(label), `label: ${label}`)
  assert.ok(fields.length > 10, `found ${fields.length} fields`)
})

test('the sign-in asks for an email or mobile number and shows a demo code on screen', () => {
  const account = pageOf('account')
  assert.ok(account.includes('data-sign-in'), 'sign-in form')
  assert.ok(account.includes('autocomplete="one-time-code"'), 'one-time code field')
  assert.ok(account.includes('data-msg-code="{code}"') && /Demo code[\s\S]{0,200}data-demo-code/.test(account), 'the code is shown on screen, labelled as the demo code')
  assert.ok(account.includes('A mobile number starting with 09'), 'no example number that could be real')
  assert.ok(account.includes('data-account'), 'the signed-in view')
  assert.ok(account.includes('Your wash pack') && account.includes('Your bookings'), 'pack and bookings')
  assert.ok(account.includes('data-plan-left'), 'washes left this month')
  assert.ok(account.includes('data-sign-out'), 'sign out')
})

test('the sign-in speaks like the counter: two numbered steps, the code on a plate chip, and a board of what the account holds', () => {
  const account = pageOf('account')
  const signIn = account.slice(account.indexOf('data-signed-out'), account.indexOf('<!-- Signed in -->'))
  assert.ok(!/use a different/i.test(account), 'not the shared "Use a different email or number"')
  assert.ok(!/With an account/.test(account), 'not the paired "With an account" list')
  const step = (marker: string) => signIn.match(new RegExp(`<form[^>]*${marker}[\\s\\S]*?</form>`))?.[0] ?? ''
  assert.ok(step('data-contact-step').includes('Step 1 of 2') && step('data-code-step').includes('Step 2 of 2'), 'the steps are numbered, because they are a sequence')
  assert.match(signIn, /<span class="plate[^"]*"[^>]*data-demo-code>/, 'the code reads like a plate')
  assert.match(signIn, /<button [^>]*data-change-contact>Back to step 1<\/button>/, 'going back says where it goes')
  for (const key of ['msg-name-empty', 'msg-contact-empty', 'msg-contact-invalid', 'msg-code-empty', 'msg-code-wrong', 'msg-storage']) {
    assert.match(signIn, new RegExp(`data-${key}="[^"]+"`), `copy for ${key}`)
  }
  const board = signIn.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? ''
  assert.match(board, /^<aside [^>]*bg-graphite/, 'what the account holds is a board, on graphite')
  assert.equal((board.match(/<li\b/g) ?? []).length, 3, 'three rows: pack, washes left, bookings')
})

test('checkout pays by GCash, Maya or card, and only those', () => {
  for (const key of ['basket', 'visit']) {
    const values = [...pageOf(key).matchAll(/name="payment" value="([^"]+)"/g)].map(([, value]) => value)
    assert.deepEqual(values, ['gcash', 'maya', 'card'], `${key}: payment choices`)
  }
  assert.ok(pageOf('basket').includes('Nothing was charged'), 'basket confirmation says nothing was charged')
  assert.ok(pageOf('visit').includes('nothing was charged'), 'booking confirmation says nothing was charged')
})

test('each interaction lives on its own page only', () => {
  const has = (file: string, marker: string) => read(file).includes(marker)
  for (const page of PAGES) {
    assert.equal(has(page.file, 'data-price-picker'), page.key === 'services', `${page.file}: price picker`)
    assert.equal(has(page.file, 'data-add-wash'), page.key === 'services', `${page.file}: add the wash to the basket`)
    assert.equal(has(page.file, 'data-bay-board'), page.key === 'visit', `${page.file}: bay board (joining)`)
    assert.equal(has(page.file, 'data-board-preview'), page.key === 'home', `${page.file}: the board, read-only`)
    assert.equal(has(page.file, 'data-join-handoff'), page.key === 'home', `${page.file}: plate hand-off to the join form`)
    assert.equal(has(page.file, '<!-- @include bays -->'), page.key === 'home' || page.key === 'visit', `${page.file}: the shared bay tiles`)
    assert.equal(has(page.file, 'data-schedule'), page.key === 'visit', `${page.file}: schedule`)
    assert.equal(has(page.file, 'data-sign-in'), page.key === 'account', `${page.file}: sign-in`)
    assert.equal(has(page.file, 'data-basket-page'), page.key === 'basket', `${page.file}: basket`)
    assert.equal(has(page.file, 'data-contact-form'), page.key === 'contact', `${page.file}: contact form`)
    for (const plan of PLANS) {
      assert.equal(has(page.file, `<article class="plan-card" data-plan="${plan.id}"`), page.key === 'plans', `${page.file}: plan ${plan.id}`)
      assert.equal(has(page.file, `data-add-plan="${plan.id}"`), page.key === 'plans', `${page.file}: add plan ${plan.id}`)
    }
  }
})

const homeMain = () => {
  const home = pageOf('home')
  return home.slice(home.indexOf('<main'), home.indexOf('</main>'))
}
const homeSection = (id: string) => homeMain().match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] ?? ''

test('Home leads with the live board: the headline, the bays and the line, the wait, and the way into the join form', () => {
  const main = homeMain()
  const sections = [...main.matchAll(/<section\b[^>]*\bid="([\w-]+)"/g)].map(([, id]) => id)
  assert.deepEqual(sections, ['board', 'prices', 'packs', 'where'], 'board, prices, packs strip, where')
  const board = homeSection('board')
  assert.match(board, /<h1\b/, 'the headline opens the board')
  assert.ok(board.includes('data-board-preview') && board.includes('<!-- @include bays -->') && board.includes('<!-- @include line -->'), 'the Visit page’s bay tiles and line, drawn by the same code')
  assert.ok(board.includes('data-wait-sign'), 'the wait, with open or closed now')
  const form = board.match(/<form [^>]*data-join-handoff[^>]*>/)?.[0] ?? ''
  assert.ok(form.includes('action="/bayline/visit/"') && form.includes('data-enhanced'), 'the plate goes to the one join form, on the line page')
  assert.match(board, /<input [^>]*id="home-plate"[^>]*name="plate"/, 'a plate field')
  assert.match(board, /<button [^>]*type="submit"[^>]*>Join the line<\/button>/, 'Join the line')
  assert.ok(board.indexOf('data-join-handoff') < board.indexOf('<!-- @include bays -->'), 'phones reach the plate field before the board')
  assert.match(board, /<a [^>]*data-fallback[^>]*href="\/bayline\/visit\/"|<p [^>]*data-fallback[\s\S]*?href="\/bayline\/visit\/"/, 'without scripts: a plain link to the line page')
})

test('a plate typed on Home reaches the one join form through session storage, never the address', () => {
  const handoff = read('../app/home/join-handoff.ts')
  assert.ok(handoff.includes('stashPlate(') && handoff.includes('location.assign('), 'Home opens the line page with the plate left behind')
  assert.ok(!/\.search\s*=|searchParams|\.hash\s*=|plateToHash/.test(handoff), 'never in the query string or the fragment')
  assert.ok(read('../app/boot.ts').includes('initBayBoard(root, takeHandedPlate())'), 'the line page reads it, once')
  const board = read('../app/components/bay-board/bay-board.ts')
  assert.ok(board.includes('form.requestSubmit()'), 'and submits its own form with it, so that form checks the plate')
  assert.ok(!board.includes('history.replaceState('), 'nothing in the address to drop')
})

test('Home after the board: the price table, the packs strip and where; no benefits row, no How steps, no account band, no closing band', () => {
  const home = pageOf('home')
  const main = homeMain()
  for (const id of ['offer', 'benefits', 'how', 'membership', 'closing']) assert.ok(!main.includes(`id="${id}"`), `no ${id} section`)
  assert.ok(!/<h2[^>]*>\s*How\b/i.test(main), 'no "How … works" heading')
  assert.ok(!/<ol\b/.test(main), 'no numbered steps')
  assert.ok(!/in one place|in your pocket/i.test(main), 'no account-band headline')
  assert.ok(!/<section[^>]*\bbg-graphite\b/.test(main.slice(main.indexOf('id="prices"'))), 'only the board is graphite, so the footer never meets a dark band')

  const prices = homeSection('prices')
  assert.ok(prices.includes('data-home-prices') && prices.includes('href="/bayline/services/"'), 'the price table, linking to Prices')

  const packs = homeSection('packs')
  const express8 = PLANS.find((p) => p.id === 'express-8')!
  assert.ok(packs.includes('Twice a week, for less'), 'the packs strip')
  assert.ok(packs.includes(`data-teaser="express-8">${peso(express8.prices.small!)}<`), 'quotes Express 8')
  assert.ok(packs.includes(`data-save="express-8">${peso(savings(express8, 'small')!)}<`), 'and what it saves')
  assert.ok(!/<(ul|ol|article)\b/.test(packs), 'a strip, not a full section of pack rows')
  const packsLink = packs.match(/<a [^>]*href="\/bayline\/plans\/"[^>]*>/)?.[0] ?? ''
  assert.ok(packsLink && !packsLink.includes('bg-accent'), 'links to Plans, in outline: red is for join and book')

  const where = homeSection('where')
  assert.ok(where.includes('Subangdaku, Mandaue City') && where.includes('Every day, 7:00 AM to 8:00 PM'), 'the area and the one-line hours')
  assert.ok(where.includes('data-msg-closed-today') && where.includes('data-msg-closed-tomorrow') && where.includes('data-open-pill'), 'today’s status, in the keys hoursStatus fills')
  assert.ok(where.includes('href="/bayline/location/"'), 'links to Location')

  for (const path of ['services/', 'plans/', 'visit/', 'location/']) assert.ok(home.includes(`href="/bayline/${path}`), `home links to ${path}`)
  for (const [, id, shown] of home.matchAll(/data-teaser="([\w-]+)">(₱[\d,]+)</g)) {
    const small = (SERVICES.find((s) => s.id === id) ?? PLANS.find((p) => p.id === id))?.prices.small
    assert.equal(shown, peso(small ?? -1), `${id}: small-car price`)
  }
  assert.ok(!/★|\brating|\breviews?\b|testimonial|trusted by|award|as seen|customers/i.test(home), 'no invented proof')
})

test('the bay tiles and the line live once, in partials both boards include', () => {
  const names = new Set([...PAGES.map((p) => read(p.file)), read('../app/404.html')].flatMap((html) => [...html.matchAll(/<!-- @include ([a-z]+)/g)].map(([, name]) => name)))
  assert.deepEqual([...names].sort(), ['bays', 'footer', 'header', 'line'])
  for (const name of names) {
    assert.ok(existsSync(new URL(`../app/components/${PARTIAL_FILES[name as PartialName]}`, import.meta.url)), `app/components/${PARTIAL_FILES[name as PartialName]}`)
    assert.ok(read('../build/partials.ts').includes(`'${name}'`), `partials.ts includes ${name}`)
  }
  const visit = pageOf('visit')
  assert.ok(!visit.includes('class="bay"') && visit.includes('<!-- @include line -->'), 'Visit uses the partials too')
  const bays = read('../app/components/bay-board/bays.html')
  assert.equal((bays.match(/<li class="bay"/g) ?? []).length, 3, 'three bays')
  assert.ok(bays.includes('data-msg-bay-left') && read('../app/components/bay-board/line.html').includes('data-msg-line-eta'), 'their copy templates travel with them')
})

test('the phone menu is a full-screen graphite dialog: status on top, big rows, the red Join the line at the bottom, a labelled close', () => {
  const toggle = header.match(/<button [^>]*data-menu-toggle[^>]*>/)?.[0] ?? ''
  for (const attr of ['aria-expanded="false"', 'aria-controls="site-menu"', 'aria-label="Menu"']) assert.ok(toggle.includes(attr), `menu button: ${attr}`)
  const dialog = header.match(/<dialog\b[^>]*id="site-menu"[^>]*>[\s\S]*?<\/dialog>/)?.[0] ?? ''
  const tag = dialog.match(/^<dialog[^>]*>/)?.[0] ?? ''
  assert.ok(tag.includes('aria-label="Menu"') && tag.includes('menu-panel') && tag.includes('bg-graphite'), 'a labelled graphite dialog')
  assert.match(dialog, /<button [^>]*aria-label="Close menu"[^>]*data-menu-close/, 'a labelled close button')
  assert.ok(dialog.indexOf('data-hours') > -1 && dialog.indexOf('data-hours') < dialog.indexOf('href="%BASE_URL%services/"'), 'the open or closed line comes first')
  for (const key of ['services', 'plans', 'visit', 'location']) assert.ok(dialog.includes(`href="%BASE_URL%${key}/" data-nav="${key}"`), `menu row: ${key}`)
  const links = [...dialog.matchAll(/<a [^>]*>[\s\S]*?<\/a>/g)].map(([a]) => a)
  assert.match(links.at(-1) ?? '', /bg-accent[^>]*href="%BASE_URL%visit\/"[^>]*>Join the line<\/a>|href="%BASE_URL%visit\/"[^>]*bg-accent[^>]*>Join the line<\/a>/, 'the red Join the line comes last')

  const nav = read('../app/shared/nav.ts')
  assert.ok(nav.includes('showModal()'), 'opened as a modal: focus moves in and stays, Escape closes')
  assert.ok(nav.includes("addEventListener('close'") && nav.includes('toggle.focus()'), 'focus goes back to the menu button')
  assert.ok(nav.includes("setAttribute('aria-expanded'"), 'the button says whether the menu is open')
  const css = read('../app/styles/main.css')
  assert.match(css, /html:has\(\.menu-panel\[open\]\) \{\s*overflow: hidden;/, 'the page behind does not scroll')
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.menu-panel/, 'no motion under reduced motion')
})

test('wash packs everywhere, with their rules said plainly, and nothing unlimited', () => {
  for (const page of [...PAGES.map((p) => p.file), '../app/404.html', '../app/components/header.html', '../app/components/footer.html']) {
    assert.ok(!/unlimited/i.test(read(page)), `${page}: no unlimited plan`)
  }
  assert.equal(PACK_RULES.platesPerPack, 1)
  for (const key of ['plans', 'terms']) {
    const html = pageOf(key)
    for (const rule of ['one registered plate', 'one wash a day', 'carry over', 'before the next month starts']) assert.ok(html.includes(rule), `${key}: ${rule}`)
  }
  for (const key of ['basket', 'account']) assert.ok(/wash pack/i.test(pageOf(key)), `${key}: says wash pack`)
})

test('the company and legal pages: demonstration stated plainly, the Data Privacy Act, local storage only, no phone or email', () => {
  for (const key of COMPANY_PAGES) assert.ok(/demonstration site/i.test(pageOf(key)), `${key}: says it is a demonstration site`)
  for (const key of LEGAL_PAGES) assert.ok(pageOf(key).includes('Last updated'), `${key}: dated`)
  const privacy = pageOf('privacy')
  assert.ok(privacy.includes('Data Privacy Act of 2012') && privacy.includes('Republic Act No. 10173'), 'privacy: RA 10173')
  assert.ok(privacy.includes('National Privacy Commission'), 'privacy: where to complain')
  assert.ok(/no cookies/i.test(pageOf('cookies')), 'cookies: none')
  for (const page of PAGES) {
    const html = read(page.file)
    assert.ok(!/href="(tel|mailto):/.test(html), `${page.file}: no phone or email links`)
    assert.ok(!/\b0\d{3}[ -]?\d{3}[ -]?\d{4}\b|\+63[ -]?\d{3}/.test(html.replace(/placeholder="[^"]*"/g, '')), `${page.file}: no phone number`)
  }
  assert.ok(pageOf('contact').includes('<form'), 'contact: a form')
})

test('the Privacy and Cookie pages each list exactly the local storage keys the code uses', () => {
  // The keys as the code defines them (export const …_KEY = 'bayline.…' in app/lib), not a copy kept here.
  const code = sourceFiles().filter((url) => !url.pathname.endsWith('.test.ts')).map((url) => readFileSync(url, 'utf8')).join('\n')
  const keys = [...code.matchAll(/_KEY = '(bayline\.[a-z]+)'/g)].map(([, key]) => key).sort()
  assert.equal(keys.length, 5, `found ${keys.join(', ')}`)
  for (const page of ['privacy', 'cookies']) {
    const html = pageOf(page)
    const listed = [...html.matchAll(/<dt[^>]*>(bayline\.[a-z]+)<\/dt>/g)].map(([, key]) => key).sort()
    assert.deepEqual(listed, keys, `${page}: the table lists the code's keys`)
    const body = html.slice(html.indexOf('<main'))
    const mentioned = [...new Set([...body.matchAll(/bayline\.[a-z]+/g)].map(([key]) => key))].sort()
    assert.deepEqual(mentioned, keys, `${page}: names no other key`)
  }
})

test('the 404 page: described, noindex, no canonical, the shared footer, and links to the real pages', () => {
  const html = read('../app/404.html')
  assert.ok((meta(html, 'name', 'description') ?? '').length >= 50, 'description')
  assert.equal(meta(html, 'name', 'robots'), 'noindex', 'noindex')
  assert.ok(!html.includes('rel="canonical"'), 'no canonical on a missing page')
  assert.equal(meta(html, 'property', 'og:image'), '%VITE_SITE_URL%og.png', 'og:image')
  assert.ok(html.includes('<!-- @include footer -->'), 'footer include (disclosure)')
  for (const key of ['services', 'plans', 'visit', 'location']) assert.ok(html.includes(`href="%BASE_URL%${key}/"`), `links to ${key}`)
  assert.ok(!html.includes('home page.</p>'), 'no stale "all on the home page" line')
  assert.ok(html.includes('<!-- @include header -->'), 'the shared header, so a broken link still has the way round')
  assert.ok(!/<p [^>]*>Bayline<\/p>/.test(html), 'no standalone wordmark paragraph')
})

test('design review: phones put the join form before the board, and the graphite band ends before the footer', () => {
  const visit = pageOf('visit')
  const walkIn = visit.slice(visit.indexOf('id="panel-walk-in"'), visit.indexOf('id="panel-schedule"'))
  assert.match(walkIn, /class="[^"]*\bmax-xl:order-first\b[^"]*"[^>]*>\s*<p [^>]*>\s*<span [^>]*>Your wash/, 'the form column is first on phones')
  const band = visit.indexOf('</section>')
  const after = visit.slice(band, visit.indexOf('<!-- @include footer -->'))
  assert.match(after, /<section class="[^"]*\bbg-canvas\b/, 'a white strip follows the graphite band')
})

test('design review: per-pack and empty-basket buttons are not red; red stays on join and book', () => {
  const plans = pageOf('plans')
  for (const button of plans.matchAll(/<button [^>]*data-add-plan[^>]*>/g)) assert.ok(!/bg-accent/.test(button[0]), 'pack add is outline')
  const basket = pageOf('basket')
  assert.ok(!/bg-accent[^>]*>See prices/.test(basket), 'See prices is secondary')
  assert.ok(plans.includes('4 washes with a vacuum a month, one of them with a hand wax.'), 'Care 4 copy')
})

test('every photo the pages and the bay board point at exists in public/photos', () => {
  const sources = [...PAGES.map((page) => read(page.file)), read('../app/shared/vehicle-photo.ts')].join('\n')
  const photos = new Set([...sources.matchAll(/\/photos\/([\w-]+\.webp)/g)].map(([, name]) => name))
  for (const stem of sources.matchAll(/: '(vehicle-[\w-]+)'/g)) for (const size of ['400', '800']) photos.add(`${stem[1]}-${size}.webp`)
  assert.ok(photos.size >= 12, `found ${photos.size} photo references`)
  for (const name of photos) assert.ok(existsSync(new URL(`../public/photos/${name}`, import.meta.url)), `${name} exists`)
})

// Field errors (plate, sign-in) aren't listed: they're announced through aria-describedby on the focused field.
test('on-demand error boxes are announced to screen readers', () => {
  const boxes = [
    ['../app/visit/index.html', 'data-booking-error'],
    ['../app/basket/index.html', 'data-subscribe-error'],
    ['../app/basket/index.html', 'data-basket-blocked'],
    ['../app/account/index.html', 'data-storage-error'],
  ] as const
  for (const [file, attr] of boxes) {
    const html = readFileSync(new URL(file, import.meta.url), 'utf8')
    const tag = html.match(new RegExp(`<p [^>]*${attr}[^>]*>`))?.[0]
    assert.ok(tag, `${file}: ${attr}`)
    assert.match(tag, /role="alert"/, `${file}: ${attr} needs role="alert"`)
  }
})
