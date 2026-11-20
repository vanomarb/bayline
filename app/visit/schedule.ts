import { addBooking, loadBookings, loadPlan } from '../lib/account.ts'
import { PAYMENT_NAMES, clearWash, isPayment } from '../lib/cart.ts'
import { findPlan, packBooking } from '../lib/plans.ts'
import { isValidPlate, normalizePlate } from '../lib/plates.ts'
import { DAY_JOB_START, firstOpenDay, scheduleSlots } from '../lib/schedule.ts'
import { peso } from '../lib/format.ts'
import { VEHICLE_NAMES, quote } from '../lib/services.ts'
import { browserStore } from '../lib/store.ts'
import { addDaysISO, formatClock, fullDate, longDate, manilaTime, monthName, utcDay, weekdayShort } from '../lib/time.ts'
import { changeBasket } from '../shared/basket.ts'
import { currentSelection, onSelection, type Selection } from '../services/price-picker.ts'
import { element, messages, say, selectionSummary } from '../shared/ui.ts'

const DAYS_AHEAD = 7
const REFRESH_MS = 30_000

/** Rechecked every 30 s and when the tab returns, so "Today" moves over at Manila midnight and past times strike through. */
export function initSchedule(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-booking-form]')
  const days = root.querySelector<HTMLElement>('[data-days]')
  const slots = root.querySelector<HTMLElement>('[data-slots]')
  const slotsNote = root.querySelector<HTMLElement>('[data-slots-note]')
  const selectionText = root.querySelector<HTMLElement>('[data-selection]')
  const plateInput = root.querySelector<HTMLInputElement>('input[name="plate"]')
  const plateError = plateInput?.closest('.field')?.querySelector<HTMLElement>('[data-field-error]')
  const bookingError = root.querySelector<HTMLElement>('[data-booking-error]')
  const confirmButton = root.querySelector<HTMLButtonElement>('[data-confirm]')
  const confirmation = root.querySelector<HTMLElement>('[data-confirmation]')
  if (!form || !days || !slots || !plateInput || !plateError || !bookingError || !confirmButton || !confirmation) return
  const text = messages(root)
  const store = browserStore()
  /** Start times the visitor has booked on a day (any plate): they show as taken. */
  const bookedOn = (isoDate: string): number[] => loadBookings(store).filter((b) => b.day === isoDate).map((b) => b.start)
  const selectionTemplate = root.closest<HTMLElement>('[data-msg-selection]')?.dataset.msgSelection ?? ''
  let selection: Selection = currentSelection()
  let shownToday = ''
  let dayChosen = false // until the visitor picks a day, the schedule opens on the first day with a free time
  let day = defaultDay()
  let slot: number | null = null
  let slotsKey = ''

  function minutesNeeded(): number {
    return quote(selection.vehicle, selection.ids).minutes
  }

  function defaultDay(): string {
    return firstOpenDay(manilaTime(new Date()).isoDate, DAYS_AHEAD, Math.max(minutesNeeded(), 1), new Date(), bookedOn)
  }

  function chip(className: string, name: string, value: string, checked: boolean, disabled: boolean, label: Node[]): HTMLLabelElement {
    const wrap = element('label', className)
    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = name
    radio.value = value
    radio.checked = checked
    radio.disabled = disabled
    wrap.append(radio, ...label)
    return wrap
  }

  /** Swaps a group of chips, keeping keyboard focus on the same chip (or the nearest usable one). */
  function rebuild(group: HTMLElement, chips: Node[]): void {
    const focused = document.activeElement
    const value = focused instanceof HTMLInputElement && group.contains(focused) ? focused.value : null
    group.replaceChildren(...chips)
    if (value === null) return
    const same = group.querySelector<HTMLInputElement>(`input[value="${value}"]:enabled`)
    const fallback = group.querySelector<HTMLInputElement>('input:checked:enabled') ?? group.querySelector<HTMLInputElement>('input:enabled')
    ;(same ?? fallback ?? plateInput)?.focus()
  }

  function dayLabel(isoDate: string, today: string): string {
    if (isoDate === today) return text('msgToday')
    if (isoDate === addDaysISO(today, 1)) return text('msgTomorrow')
    return weekdayShort(isoDate)
  }

  function renderDays(): void {
    const today = manilaTime(new Date()).isoDate
    shownToday = today
    const chips = Array.from({ length: DAYS_AHEAD }, (_, offset) => {
      const isoDate = addDaysISO(today, offset)
      const small = element('span', 'chip__small', dayLabel(isoDate, today))
      const big = element('span', 'chip__big num', String(utcDay(isoDate).getUTCDate()))
      small.setAttribute('aria-hidden', 'true')
      big.setAttribute('aria-hidden', 'true')
      const spoken = offset < 2 ? `${small.textContent}, ${fullDate(isoDate)}` : fullDate(isoDate)
      return chip('chip day', 'day', isoDate, isoDate === day, false, [small, big, element('span', 'sr-only', spoken)])
    })
    rebuild(days!, chips)
  }

  function renderSlots(): void {
    const minutes = minutesNeeded()
    const now = manilaTime(new Date())
    if (minutes === 0) {
      slot = null
      slotsKey = ''
      rebuild(slots!, [])
      if (slotsNote) slotsNote.textContent = text('msgNoService')
      renderConfirm()
      return
    }

    const list = scheduleSlots(day, minutes, new Date(), bookedOn(day))
    if (!list.some((s) => s.available && s.start === slot)) slot = null
    const isPast = (start: number) => day < now.isoDate || (day === now.isoDate && start <= now.minutes)
    const key = [day, minutes, slot, ...list.map((s) => `${s.start}${s.available ? 'a' : isPast(s.start) ? 'p' : 't'}`)].join('|')
    if (key !== slotsKey) {
      slotsKey = key
      rebuild(
        slots!,
        list.map((s) => {
          const past = isPast(s.start)
          const label: Node[] = [element('span', 'chip__big num', formatClock(s.start))]
          const className = s.available ? 'chip slot' : past ? 'chip slot slot--past' : 'chip slot slot--taken'
          if (!s.available) label.push(element('span', 'chip__small', past ? text('msgPast') : text('msgTaken')))
          return chip(className, 'slot', String(s.start), s.start === slot, !s.available, label)
        }),
      )
    }

    let note = ''
    if (minutes >= 480) note = list.length > 0 ? text('msgFullDay', { time: formatClock(DAY_JOB_START + minutes) }) : text('msgTooLong')
    if (list.length > 0 && !list.some((s) => s.available)) note = text('msgNoTimes')
    if (slotsNote) slotsNote.textContent = note
    renderConfirm()
  }

  function renderConfirm(): void {
    confirmButton!.textContent = slot === null ? text('msgConfirm') : text('msgConfirmTime', { time: formatClock(slot) })
  }

  function summary(): string {
    return selectionSummary(selection, selectionTemplate) || text('msgNoService')
  }

  function renderSelection(): void {
    if (selectionText) selectionText.textContent = summary()
  }

  /** A day the visitor picked is kept unless it has slipped into the past. */
  function refresh(): void {
    const today = manilaTime(new Date()).isoDate
    let daysChanged = today !== shownToday
    if (day < today) dayChosen = false
    if (!dayChosen) {
      const next = defaultDay()
      if (next !== day) {
        day = next
        daysChanged = true
      }
    }
    if (daysChanged) renderDays()
    renderSlots()
  }

  function clearErrors(): void {
    plateError!.hidden = true
    say(plateError!, '')
    plateInput!.removeAttribute('aria-invalid')
    bookingError!.hidden = true
    say(bookingError!, '')
  }

  function firstOpenSlot(): HTMLInputElement | null {
    return slots!.querySelector<HTMLInputElement>('input:checked:enabled') ?? slots!.querySelector<HTMLInputElement>('input:enabled')
  }

  form.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement
    if (target.name === 'day') {
      day = target.value
      dayChosen = true
      confirmation.hidden = true
      renderSlots()
    } else if (target.name === 'slot') {
      slot = Number(target.value)
      confirmation.hidden = true
      bookingError.hidden = true
      renderConfirm()
    } else if (target.name === 'payment') {
      bookingError.hidden = true
    }
  })

  form.addEventListener('keydown', (event) => {
    const target = event.target as HTMLInputElement
    if (event.key !== 'Enter' || (target.name !== 'day' && target.name !== 'slot')) return
    event.preventDefault()
    if (target.name === 'day') {
      ;(firstOpenSlot() ?? plateInput).focus()
      return
    }
    // Enter on a time that isn't picked yet picks it, then moves on.
    if (!target.checked) {
      target.checked = true
      target.dispatchEvent(new Event('change', { bubbles: true }))
    }
    plateInput.focus()
  })

  plateInput.addEventListener('input', () => {
    plateError.hidden = true
    plateInput.removeAttribute('aria-invalid')
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    clearErrors()
    confirmation.hidden = true

    const minutes = minutesNeeded()
    const fail = (message: string, focus: HTMLElement | null) => {
      say(bookingError, message)
      bookingError.hidden = false
      focus?.focus()
    }
    if (minutes === 0) return fail(text('msgNoService'), null)
    if (slot === null) return fail(text('msgPickTime'), firstOpenSlot())
    const chosen = slot
    // The plain grid decides here; this browser's bookings (maybe from another tab) are checked below, once the plate is known.
    if (!scheduleSlots(day, minutes, new Date()).some((s) => s.start === chosen && s.available)) {
      renderSlots()
      return fail(text('msgTimePassed'), firstOpenSlot())
    }

    const plate = normalizePlate(plateInput.value)
    const plateProblem = plate === '' ? text('msgPlateEmpty') : isValidPlate(plate) ? '' : text('msgPlateInvalid')
    if (plateProblem) {
      say(plateError, plateProblem)
      plateInput.setAttribute('aria-invalid', 'true')
      plateInput.focus()
      return
    }

    const existing = loadBookings(store)
    if (existing.some((b) => b.day === day && b.start === chosen)) {
      renderSlots()
      const same = existing.some((b) => b.day === day && b.start === chosen && b.plate === plate)
      return fail(text(same ? 'msgDuplicate' : 'msgSlotBooked', { plate, day: fullDate(day), time: formatClock(chosen) }), firstOpenSlot())
    }

    // The wash pack's rules: one wash a day on a pack plate, and a wash the pack doesn't cover is charged at the bay price.
    const pack = loadPlan(store)
    const packRules = pack ? findPlan(pack.id) : undefined
    const { unavailable } = quote(selection.vehicle, selection.ids)
    const ids = selection.ids.filter((id) => !unavailable.includes(id))
    let packNote = ''
    if (pack && packRules) {
      const verdict = packBooking(packRules, pack.plates, pack.since, existing, day, plate, ids)
      if (verdict.kind === 'one-a-day') return fail(text('msgPackDay', { plate, plan: packRules.name, day: fullDate(day) }), plateInput)
      if (verdict.kind === 'charged') {
        const key = { 'not-started': 'msgPackLater', 'none-left': 'msgPackNone', 'not-included': 'msgPackOther' }[verdict.why]
        packNote = text(key, { plate, plan: packRules.name, month: monthName(day.slice(0, 7)), date: longDate(pack.since), price: peso(quote(selection.vehicle, ids).total), vehicle: VEHICLE_NAMES[selection.vehicle] })
      }
    }

    plateInput.value = plate

    const payment = form.querySelector<HTMLInputElement>('input[name="payment"]:checked')?.value
    if (!isPayment(payment)) return fail(text('msgPickPayment'), form.querySelector<HTMLInputElement>('input[name="payment"]'))

    const today = manilaTime(new Date()).isoDate
    const saved = addBooking(store, { id: `${day}-${chosen}-${Date.now()}`, day, start: chosen, plate, summary: summary(), payment, made: today, ids })
    if (new URLSearchParams(location.search).get('from') === 'basket') changeBasket(clearWash)
    const confirmed = text('msgConfirmed', { day: fullDate(day), time: formatClock(chosen), plate, selection: summary(), payment: PAYMENT_NAMES[payment] })
    // The booked time now shows as taken; the confirmation stays.
    renderSlots()
    say(confirmation, [confirmed, packNote, saved ? '' : text('msgNotSaved')].filter(Boolean).join(' '))
    confirmation.focus()
  })

  onSelection((next) => {
    selection = next
    confirmation.hidden = true
    // An error about the wash or the time no longer applies once the wash changes.
    bookingError.hidden = true
    say(bookingError, '')
    if (!dayChosen) {
      day = defaultDay()
      renderDays()
    }
    renderSelection()
    renderSlots()
  })

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh()
  })
  // A booking cancelled or made in another tab frees or takes its time here.
  window.addEventListener('storage', refresh)
  window.setInterval(refresh, REFRESH_MS)

  renderDays()
  renderSelection()
  renderSlots()
}
