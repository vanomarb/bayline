import { duration, peso } from '../lib/format.ts'
import { VEHICLE_NAMES, findService, isVehicle, quote, type Vehicle } from '../lib/services.ts'
import { messages } from '../shared/ui.ts'

/** One per page, shared by the price list and the walk-in, schedule and plan views. */
export interface Selection {
  vehicle: Vehicle
  ids: string[]
}

const SELECTION_EVENT = 'bayline:selection'
let current: Selection = { vehicle: 'small', ids: ['express'] }

/** A selection handed over in the address (lib/handoff.ts): the price list ticks it, other views read currentSelection(). */
let seeded = false
export function seedSelection(selection: Selection): void {
  current = { vehicle: selection.vehicle, ids: [...selection.ids] }
  seeded = true
}

export function resetSelection(): void {
  current = { vehicle: 'small', ids: ['express'] }
  seeded = false
}

/** The latest selection, for views that start after the picker has announced it. */
export function currentSelection(): Selection {
  return current
}

export function emitSelection(selection: Selection): void {
  current = { vehicle: selection.vehicle, ids: [...selection.ids] }
  document.dispatchEvent(new CustomEvent<Selection>(SELECTION_EVENT, { detail: current }))
}

export function onSelection(listener: (selection: Selection) => void): void {
  document.addEventListener(SELECTION_EVENT, (event) => listener((event as CustomEvent<Selection>).detail))
}

/** Services the vehicle can't get are disabled and say why, but stay ticked so switching back restores them. */
export function initPricePicker(root: HTMLElement): void {
  const vehicleInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="picker-vehicle"]')]
  const serviceInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="service"]')]
  const total = root.querySelector<HTMLElement>('[data-total]')
  const time = root.querySelector<HTMLElement>('[data-time]')
  const note = root.querySelector<HTMLElement>('[data-total-note]')
  const totalLabel = root.querySelector<HTMLElement>('[data-total-label]')
  const text = messages(root)

  function read(): Selection {
    const value = vehicleInputs.find((input) => input.checked)?.value ?? ''
    return {
      vehicle: isVehicle(value) ? value : 'small',
      ids: serviceInputs.filter((input) => input.checked).map((input) => input.value),
    }
  }

  function render(selection: Selection): void {
    root.dataset.vehicle = selection.vehicle
    for (const input of vehicleInputs) input.checked = input.value === selection.vehicle
    for (const input of serviceInputs) {
      const offered = findService(input.value)?.prices[selection.vehicle] !== undefined
      const reason = input.closest('tr')?.querySelector<HTMLElement>('[data-reason]')
      input.disabled = !offered
      if (reason && !offered) input.setAttribute('aria-describedby', reason.id)
      else input.removeAttribute('aria-describedby')
    }

    const result = quote(selection.vehicle, selection.ids)
    if (totalLabel) totalLabel.textContent = text('msgTotalLabel', { vehicle: VEHICLE_NAMES[selection.vehicle] })
    if (total) total.textContent = peso(result.total)
    if (time) time.textContent = duration(result.minutes)
    if (!note) return
    if (selection.ids.length === 0) {
      note.textContent = text('msgNothing')
    } else if (result.unavailable.length > 0) {
      const names = result.unavailable.map((id) => findService(id)?.name ?? id).join(', ')
      note.textContent = text('msgLeftOut', { services: names })
    } else {
      note.textContent = ''
    }
  }

  function update(): void {
    const selection = read()
    render(selection)
    emitSelection(selection)
  }

  root.addEventListener('change', (event) => {
    if ((event.target as Element).matches('input[name="picker-vehicle"], input[name="service"]')) update()
  })

  // Enter on a vehicle moves on to the services.
  root.addEventListener('keydown', (event) => {
    const target = event.target as HTMLInputElement
    if (event.key !== 'Enter' || target.name !== 'picker-vehicle') return
    event.preventDefault()
    serviceInputs.find((input) => !input.disabled)?.focus()
  })

  // A selection handed over from the walk-in page replaces the ticks written in the HTML.
  if (seeded) {
    for (const input of vehicleInputs) input.checked = input.value === current.vehicle
    for (const input of serviceInputs) input.checked = current.ids.includes(input.value)
  }

  // The plans and the walk-in size select change the vehicle too.
  onSelection((selection) => {
    if (selection.vehicle !== read().vehicle) render({ ...read(), vehicle: selection.vehicle })
  })

  update()
}
