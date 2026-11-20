import { loadPlan, savePlan } from '../lib/account.ts'
import {
  BASKET_KEY,
  MAX_PLATES,
  PAYMENT_NAMES,
  addPlan,
  addWash,
  basketTotals,
  isPayment,
  loadBasket,
  removePlan,
  removeService,
  saveBasket,
  setPlates,
  type Basket,
} from '../lib/cart.ts'
import { duration, peso } from '../lib/format.ts'
import { selectionToQuery } from '../lib/handoff.ts'
import { findPlan, type PlanId } from '../lib/plans.ts'
import { isValidPlate, normalizePlate } from '../lib/plates.ts'
import { VEHICLE_NAMES, findService, quote } from '../lib/services.ts'
import { BASE } from '../lib/site.ts'
import { browserStore } from '../lib/store.ts'
import { longDate, manilaTime } from '../lib/time.ts'
import { currentSelection } from '../services/price-picker.ts'
import { element, messages, say, serviceNames } from './ui.ts'
import { vehiclePhoto } from './vehicle-photo.ts'

export const BASKET_EVENT = 'bayline:basket'

/** Also tells the header badge. `saved` is false when storage is blocked. */
export function changeBasket(change: (basket: Basket) => Basket): { basket: Basket; saved: boolean } {
  const store = browserStore()
  const basket = change(loadBasket(store))
  const saved = saveBasket(store, basket)
  document.dispatchEvent(new CustomEvent<Basket>(BASKET_EVENT, { detail: basket }))
  return { basket, saved }
}

export function initBasketBadge(): void {
  const badge = document.querySelector<HTMLElement>('[data-basket-badge]')
  const count = badge?.querySelector('[data-basket-count]')
  const unit = badge?.querySelector('[data-basket-unit]')
  if (!badge || !count || !unit) return
  const show = (basket: Basket) => {
    const items = basketTotals(basket).items
    badge.hidden = items === 0
    count.textContent = String(items)
    unit.textContent = items === 1 ? 'item' : 'items'
  }
  document.addEventListener(BASKET_EVENT, (event) => show((event as CustomEvent<Basket>).detail))
  window.addEventListener('storage', (event) => {
    if (event.key === BASKET_KEY || event.key === null) show(loadBasket(browserStore()))
  })
  show(loadBasket(browserStore()))
}

function report(status: HTMLElement, message: string, withLink: boolean): void {
  const parts: Node[] = [document.createTextNode(message)]
  if (withLink) {
    const link = element('a', 'font-semibold underline underline-offset-4', 'View basket')
    link.href = `${BASE}basket/`
    parts.push(document.createTextNode(' '), link)
  }
  status.replaceChildren(...parts)
}

export function initAddWash(root: HTMLElement): void {
  const button = root.querySelector<HTMLButtonElement>('[data-add-wash]')
  const status = root.querySelector<HTMLElement>('[data-basket-status]')
  if (!button || !status) return
  const text = messages(root)
  button.addEventListener('click', () => {
    const selection = currentSelection()
    if (quote(selection.vehicle, selection.ids).minutes === 0) return report(status, text('msgAddNothing'), false)
    const { saved } = changeBasket((basket) => addWash(basket, selection.vehicle, selection.ids))
    if (!saved) return report(status, text('msgBasketBlocked'), false)
    report(status, text('msgAdded', { services: serviceNames(selection), vehicle: VEHICLE_NAMES[selection.vehicle] }), true)
  })
}

/** One pack at a time: adding another replaces it. */
export function initAddPlan(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>('[data-basket-status]')
  if (!status) return
  const text = messages(root)
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-add-plan]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.addPlan as PlanId
      const plan = findPlan(id)
      const vehicle = currentSelection().vehicle
      if (!plan || plan.prices[vehicle] === undefined) return
      const before = loadBasket(browserStore()).plan
      const { saved } = changeBasket((basket) => addPlan(basket, id, vehicle))
      if (!saved) return report(status, text('msgBasketBlocked'), false)
      const replaced = before !== null && (before.id !== id || before.vehicle !== vehicle)
      const previous = before ? `${findPlan(before.id)?.name ?? before.id} for a ${VEHICLE_NAMES[before.vehicle]}` : ''
      const values = { plan: plan.name, vehicle: VEHICLE_NAMES[vehicle], previous }
      report(status, text(replaced ? 'msgPlanReplaced' : 'msgPlanAdded', values), true)
    })
  }
}

/** "NBC 1234", "NBC 1234 and DEF 567", "A, B and C". */
function listPlates(plates: string[]): string {
  return plates.length <= 1 ? (plates[0] ?? '') : `${plates.slice(0, -1).join(', ')} and ${plates.at(-1)}`
}

/** Nothing is sent or charged: starting a pack only saves it for the account page. */
export function initBasketPage(root: HTMLElement): void {
  const store = browserStore()
  const text = messages(root)
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)
  const empty = q('[data-basket-empty]')
  const washBox = q('[data-basket-wash]')
  const planBox = q('[data-basket-plan]')
  const note = q('[data-basket-note]')
  const blocked = q('[data-basket-blocked]')
  const form = q<HTMLFormElement>('[data-subscribe-form]')
  const plateFields = q('[data-plate-fields]')
  const subscribeError = q('[data-subscribe-error]')
  const activeNote = q('[data-plan-active]')
  const subscribed = q('[data-subscribed]')
  // The trash icon is inlined into this template at build time.
  const trash = root.querySelector<HTMLTemplateElement>('template[data-trash-icon]')
  if (!empty || !washBox || !planBox || !note || !blocked || !form || !plateFields || !subscribeError || !subscribed || !activeNote) return

  let basket = loadBasket(store)
  let plates: string[] = []
  let shownVehicle = ''

  function change(next: (current: Basket) => Basket): void {
    const result = changeBasket(next)
    basket = result.basket
    say(blocked!, result.saved ? '' : text('msgBlocked'))
    render()
  }

  function renderWash(): void {
    const wash = basket.wash
    washBox!.hidden = wash === null
    if (!wash) {
      q('[data-wash-lines]')!.replaceChildren()
      return
    }
    const totals = basketTotals(basket)
    if (shownVehicle !== wash.vehicle) {
      shownVehicle = wash.vehicle
      q('[data-wash-photo]')?.replaceChildren(vehiclePhoto(wash.vehicle, '7rem', 'aspect-[4/3] w-full object-contain'))
    }
    q('[data-wash-vehicle]')!.textContent = text('msgVehicle', { vehicle: VEHICLE_NAMES[wash.vehicle] })
    q('[data-wash-total]')!.textContent = peso(totals.wash)
    q('[data-wash-time]')!.textContent = duration(totals.minutes)
    const query = selectionToQuery(wash)
    q<HTMLAnchorElement>('[data-wash-change]')!.href = `${BASE}services/?${query}`
    q<HTMLAnchorElement>('[data-wash-book]')!.href = `${BASE}visit/?${query}&from=basket#book`
    q('[data-wash-lines]')!.replaceChildren(
      ...wash.ids.map((id) => {
        const service = findService(id)!
        const row = element('li', 'flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3')
        const name = element('p', 'min-w-0 flex-1')
        name.append(element('span', 'block text-lg font-semibold', service.name), element('span', 'num block text-sm text-muted', duration(service.minutes)))
        const price = element('p', 'num text-lg', peso(service.prices[wash.vehicle] ?? 0))
        const remove = element('button', 'inline-flex size-11 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface hover:text-ink')
        remove.type = 'button'
        remove.dataset.removeService = id
        remove.setAttribute('aria-label', text('msgRemove', { service: service.name }))
        const icon = trash?.content.firstElementChild?.cloneNode(true)
        if (icon) remove.append(icon)
        row.append(name, price, remove)
        return row
      }),
    )
  }

  function renderPlates(count: number): void {
    plates = Array.from({ length: count }, (_, i) => plates[i] ?? '')
    const focused = document.activeElement instanceof HTMLInputElement && plateFields!.contains(document.activeElement) ? document.activeElement.name : null
    plateFields!.replaceChildren(
      ...plates.map((value, i) => {
        const id = `plan-plate-${i + 1}`
        const field = element('div', 'field grid gap-1')
        const label = element('label', 'text-sm font-semibold', text('msgPlateLabel', { n: i + 1 }))
        label.htmlFor = id
        const input = element('input', 'num min-h-12 w-full min-w-0 rounded-plate border-[1.5px] border-ink bg-canvas px-3 text-lg tracking-plate uppercase aria-invalid:outline-2 aria-invalid:outline-danger')
        input.id = id
        input.name = `plate-${i + 1}`
        input.type = 'text'
        input.autocomplete = 'off'
        input.spellcheck = false
        input.maxLength = 24
        input.value = value
        input.setAttribute('autocapitalize', 'characters')
        input.setAttribute('aria-describedby', `${id}-error`)
        input.addEventListener('input', () => {
          plates[i] = input.value
          input.removeAttribute('aria-invalid')
          say(error, '')
        })
        const error = element('p', 'text-sm font-semibold text-danger')
        error.id = `${id}-error`
        error.hidden = true
        field.append(label, input, error)
        return field
      }),
    )
    if (focused) plateFields!.querySelector<HTMLInputElement>(`input[name="${focused}"]`)?.focus()
  }

  function renderPlan(): void {
    const plan = basket.plan
    planBox!.hidden = plan === null
    if (!plan) return
    const totals = basketTotals(basket)
    q('[data-plan-name]')!.textContent = findPlan(plan.id)?.name ?? plan.id
    q('[data-plan-vehicle]')!.textContent = text('msgVehicle', { vehicle: VEHICLE_NAMES[plan.vehicle] })
    q('[data-plan-each]')!.textContent = peso(totals.planEach)
    q('[data-plates]')!.textContent = String(plan.plates)
    for (const step of root.querySelectorAll<HTMLButtonElement>('[data-plates-step]')) {
      step.disabled = step.dataset.platesStep === '-1' ? plan.plates <= 1 : plan.plates >= MAX_PLATES
    }
    const active = loadPlan(store)
    const activeName = active ? `${findPlan(active.id)?.name ?? active.id} for a ${VEHICLE_NAMES[active.vehicle]}` : ''
    activeNote!.hidden = active === null
    if (active) activeNote!.querySelector<HTMLElement>('[data-active-text]')!.textContent = text('msgActive', { plan: activeName, plates: listPlates(active.plates), date: longDate(active.since) })
    q('[data-subscribe]')!.textContent = text(active ? 'msgReplace' : 'msgSubscribe', { price: peso(totals.planMonthly) })
    if (plates.length !== plan.plates) renderPlates(plan.plates)
  }

  function render(): void {
    const isEmpty = basket.wash === null && basket.plan === null
    empty!.hidden = !isEmpty || !subscribed!.hidden
    renderWash()
    renderPlan()
  }

  root.addEventListener('click', (event) => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!target || !root.contains(target)) return
    if (target.dataset.removeService) {
      const id = target.dataset.removeService
      const name = findService(id)?.name ?? id
      const next = removeService(basket, id)
      change(() => next)
      note!.textContent = text('msgRemoved', { service: name })
      // Focus stays in the list, or goes to the section heading once it's empty.
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-remove-service]')]
      ;(buttons[0] ?? q(basket.wash ? '#wash-title' : basket.plan ? '#plan-title' : '#basket-title'))?.focus()
    } else if (target.matches('[data-remove-plan]')) {
      const name = basket.plan ? (findPlan(basket.plan.id)?.name ?? '') : ''
      change(removePlan)
      note!.textContent = text('msgPlanRemoved', { plan: name })
      q(basket.wash ? '#wash-title' : '#basket-title')?.focus()
    } else if (target.dataset.platesStep) {
      const step = Number(target.dataset.platesStep)
      change((current) => setPlates(current, (current.plan?.plates ?? 1) + step))
      if (target.disabled) q<HTMLButtonElement>(`[data-plates-step="${-step}"]`)?.focus()
    }
  })

  form.addEventListener('change', (event) => {
    if ((event.target as HTMLInputElement).name === 'payment') say(subscribeError, '')
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const plan = basket.plan
    if (!plan) return
    say(subscribeError, '')
    const seen = new Set<string>()
    const typed: string[] = []
    for (const input of plateFields.querySelectorAll<HTMLInputElement>('input')) {
      const plate = normalizePlate(input.value)
      const problem = plate === '' ? 'msgPlateEmpty' : !isValidPlate(plate) ? 'msgPlateInvalid' : seen.has(plate) ? 'msgPlateRepeat' : ''
      const error = document.getElementById(`${input.id}-error`)
      if (problem) {
        input.setAttribute('aria-invalid', 'true')
        if (error) say(error, text(problem))
        input.focus()
        return
      }
      seen.add(plate)
      typed.push(plate)
      input.value = plate
    }
    const choice = form.querySelector<HTMLInputElement>('input[name="payment"]:checked')?.value
    if (!isPayment(choice)) {
      say(subscribeError, text('msgPickPayment'))
      form.querySelector<HTMLInputElement>('input[name="payment"]')?.focus()
      return
    }

    const details = findPlan(plan.id)!
    const replaced = loadPlan(store)
    const total = basketTotals(basket).planMonthly
    const saved = savePlan(store, { id: plan.id, vehicle: plan.vehicle, plates: typed, payment: choice, since: manilaTime(new Date()).isoDate })
    if (!saved) {
      say(subscribeError, text('msgBlocked'))
      return
    }
    const platesText = listPlates(typed)
    q('[data-subscribed-text]')!.textContent = text(replaced ? 'msgReplaced' : 'msgStarted', { plan: details.name, plates: platesText, price: peso(total), payment: PAYMENT_NAMES[choice], previous: replaced ? `${findPlan(replaced.id)?.name ?? replaced.id} for a ${VEHICLE_NAMES[replaced.vehicle]}` : '' })
    subscribed.hidden = false
    plates = []
    form.reset()
    change(removePlan)
    subscribed.focus()
  })

  window.addEventListener('storage', (event) => {
    if (event.key !== BASKET_KEY && event.key !== null) return
    basket = loadBasket(store)
    render()
  })

  render()
}
