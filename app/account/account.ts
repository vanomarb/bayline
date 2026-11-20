import {
  clearSession,
  codeMatches,
  demoCode,
  endPlan,
  loadBookings,
  loadPlan,
  loadSession,
  maskContact,
  readContact,
  readFirstName,
  removeBooking,
  saveSession,
  type Session,
} from '../lib/account.ts'
import { PAYMENT_NAMES } from '../lib/cart.ts'
import { peso } from '../lib/format.ts'
import { findPlan, washesLeft } from '../lib/plans.ts'
import { VEHICLE_NAMES } from '../lib/services.ts'
import { browserStore } from '../lib/store.ts'
import { formatClock, fullDate, longDate, manilaTime } from '../lib/time.ts'
import { capitalise, element, messages, say as show } from '../shared/ui.ts'

/** The <head> script sets <html data-signed-in> from the raw key before paint; this corrects it for a damaged session. */
export function initSession(): void {
  document.documentElement.toggleAttribute('data-signed-in', loadSession(browserStore()) !== null)
}

/** The one-time code is shown on screen instead of sent; the pack and bookings are read from this browser. */
export function initAccount(root: HTMLElement): void {
  const signIn = root.querySelector<HTMLElement>('[data-sign-in]')
  const account = root.querySelector<HTMLElement>('[data-account]')
  const contactStep = root.querySelector<HTMLFormElement>('[data-contact-step]')
  const codeStep = root.querySelector<HTMLFormElement>('[data-code-step]')
  const nameInput = contactStep?.querySelector<HTMLInputElement>('input[name="first-name"]')
  const contactInput = contactStep?.querySelector<HTMLInputElement>('input[name="contact"]')
  const codeInput = codeStep?.querySelector<HTMLInputElement>('input[name="code"]')
  const storageError = root.querySelector<HTMLElement>('[data-storage-error]')
  if (!signIn || !account || !contactStep || !codeStep || !nameInput || !contactInput || !codeInput || !storageError) return

  const store = browserStore()
  const say = messages(signIn)
  const sayAccount = messages(account)
  let pending: { firstName: string; contact: string; kind: Session['kind']; code: string } | null = null

  const errorFor = (input: HTMLInputElement) => input.closest('.field')?.querySelector<HTMLElement>('[data-field-error]') ?? null

  function setError(input: HTMLInputElement, message: string): void {
    const box = errorFor(input)
    if (box) show(box, message)
    if (message === '') input.removeAttribute('aria-invalid')
    else input.setAttribute('aria-invalid', 'true')
  }

  for (const input of [nameInput, contactInput, codeInput]) input.addEventListener('input', () => setError(input, ''))

  contactStep.addEventListener('submit', (event) => {
    event.preventDefault()
    show(storageError, '')
    const name = readFirstName(nameInput.value)
    const contact = readContact(contactInput.value)
    setError(nameInput, name.ok ? '' : say(name.problem === 'empty' ? 'msgNameEmpty' : 'msgNameLong'))
    setError(contactInput, contact.ok ? '' : say(contact.problem === 'empty' ? 'msgContactEmpty' : 'msgContactInvalid'))
    if (!name.ok) return nameInput.focus()
    if (!contact.ok) return contactInput.focus()

    pending = { firstName: name.value, contact: contact.value, kind: contact.kind, code: demoCode() }
    contactInput.value = contact.value
    root.querySelector('[data-code-contact]')!.textContent = say('msgCodeFor', { contact: contact.value })
    root.querySelector('[data-demo-code]')!.textContent = say('msgCode', { code: pending.code })
    codeInput.value = ''
    setError(codeInput, '')
    contactStep.hidden = true
    codeStep.hidden = false
    codeInput.focus()
  })

  codeStep.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!pending) return
    const problem = codeInput.value.trim() === '' ? 'msgCodeEmpty' : codeMatches(codeInput.value, pending.code) ? '' : 'msgCodeWrong'
    if (problem) {
      setError(codeInput, say(problem))
      codeInput.focus()
      return
    }

    const session: Session = { firstName: pending.firstName, contact: pending.contact, kind: pending.kind, since: manilaTime(new Date()).isoDate }
    if (!saveSession(store, session)) {
      show(storageError, say('msgStorage'))
      return
    }
    pending = null
    document.documentElement.setAttribute('data-signed-in', '')
    renderAccount()
    root.querySelector<HTMLElement>('#account-title')?.focus()
  })

  root.querySelector('[data-change-contact]')?.addEventListener('click', () => {
    pending = null
    codeStep.hidden = true
    contactStep.hidden = false
    contactInput.focus()
  })

  root.querySelector('[data-sign-out]')?.addEventListener('click', () => {
    clearSession(store)
    document.documentElement.removeAttribute('data-signed-in')
    contactStep.reset()
    codeStep.hidden = true
    contactStep.hidden = false
    status('')
    root.querySelector<HTMLElement>('#sign-in-title')?.focus()
  })

  const statusBox = account.querySelector<HTMLElement>('[data-account-status]')
  const status = (message: string) => {
    if (statusBox) statusBox.textContent = message
  }

  function renderPlan(): void {
    const plan = loadPlan(store)
    const none = account!.querySelector<HTMLElement>('[data-plan-none]')
    const current = account!.querySelector<HTMLElement>('[data-plan-current]')
    if (!none || !current) return
    none.hidden = plan !== null
    current.hidden = plan === null
    if (!plan) return
    const details = findPlan(plan.id)
    const each = details?.prices[plan.vehicle] ?? 0
    const plates = plan.plates.length === 1 ? '1 plate' : `${plan.plates.length} plates`
    current.querySelector('[data-plan-name]')!.textContent = details?.name ?? plan.id
    current.querySelector('[data-plan-vehicle]')!.textContent = sayAccount('msgPlanVehicle', { vehicle: capitalise(VEHICLE_NAMES[plan.vehicle]), plates })
    current.querySelector('[data-plan-plates]')!.replaceChildren(...plan.plates.map((plate) => element('span', 'plate', plate)))
    current.querySelector('[data-plan-price]')!.textContent = sayAccount('msgPlanPrice', { price: peso(each * plan.plates.length), payment: PAYMENT_NAMES[plan.payment] })
    current.querySelector('[data-plan-since]')!.textContent = sayAccount('msgPlanSince', { date: longDate(plan.since) })
    const month = manilaTime(new Date()).isoDate.slice(0, 7)
    const left = details ? washesLeft(details, plan.plates, loadBookings(store), month, plan.since) : []
    current.querySelector('[data-plan-left]')!.replaceChildren(
      ...left.map((entry) => {
        const item = details!.items.find((i) => i.service === entry.service)!
        return element('li', '', sayAccount('msgLeft', { left: entry.left, count: entry.count, washes: entry.count === 1 ? item.one : item.many }))
      }),
    )
  }

  function renderBookings(): void {
    const bookings = loadBookings(store)
    const none = account!.querySelector<HTMLElement>('[data-bookings-none]')
    const list = account!.querySelector<HTMLElement>('[data-bookings-list]')
    if (!none || !list) return
    none.hidden = bookings.length > 0
    list.hidden = bookings.length === 0
    const now = manilaTime(new Date())
    list.replaceChildren(
      ...bookings.map((booking) => {
        const past = booking.day < now.isoDate || (booking.day === now.isoDate && booking.start <= now.minutes)
        const item = element('li', 'grid gap-x-6 gap-y-2 border-b border-line py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start')
        const when = element('p', 'flex flex-wrap items-baseline gap-x-3 gap-y-1')
        when.append(element('span', 'text-h3 font-heading', `${fullDate(booking.day)}, ${formatClock(booking.start)}`))
        if (past) when.append(element('span', 'text-sm font-semibold text-muted', sayAccount('msgPast')))
        const what = element('div', 'grid gap-2')
        const plate = element('p', '')
        plate.append(element('span', 'plate', booking.plate))
        what.append(when, plate, element('p', '', booking.summary), element('p', 'text-sm text-muted', sayAccount('msgBookingPaid', { payment: PAYMENT_NAMES[booking.payment] })))
        const cancel = element('button', 'inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4', 'Cancel')
        cancel.type = 'button'
        cancel.setAttribute('aria-label', `Cancel the booking on ${fullDate(booking.day)} at ${formatClock(booking.start)}`)
        cancel.addEventListener('click', () => {
          removeBooking(store, booking.id)
          renderBookings()
          renderPlan()
          status(sayAccount('msgBookingCancelled', { day: fullDate(booking.day), time: formatClock(booking.start) }))
          account!.querySelector<HTMLElement>('#bookings-heading')?.focus()
        })
        item.append(what, cancel)
        return item
      }),
    )
  }

  function renderAccount(): void {
    const session = loadSession(store)
    if (!session) return
    const who = account!.querySelector('[data-account-who]')
    if (who) who.textContent = sayAccount('msgWho', { name: session.firstName, contact: maskContact(session.kind, session.contact) })
    renderPlan()
    renderBookings()
  }

  account.querySelector('[data-end-plan]')?.addEventListener('click', () => {
    endPlan(store)
    renderPlan()
    status(sayAccount('msgPlanEnded'))
    account.querySelector<HTMLElement>('#plan-heading')?.focus()
  })

  // Follow other tabs signing in or out, or booking a time.
  window.addEventListener('storage', () => {
    initSession()
    renderAccount()
  })

  renderAccount()
}
