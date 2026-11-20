import { duration, fill, peso } from '../lib/format.ts'
import { VEHICLE_NAMES, findService, quote } from '../lib/services.ts'
import type { Selection } from '../services/price-picker.ts'

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.className = className
  el.textContent = content
  return el
}

export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Writes into the box's [data-error-text] or [data-confirmation-text] span, so its icon stays; '' hides the box. */
export function say(box: HTMLElement, message: string): void {
  ;(box.querySelector<HTMLElement>('[data-error-text], [data-confirmation-text]') ?? box).textContent = message
  box.hidden = message === ''
}

/** Copy templates come from the root's data-msg-* attributes, so all copy stays in the HTML. */
export function messages(root: HTMLElement): (key: string, values?: Record<string, string | number>) => string {
  return (key, values = {}) => fill(root.dataset[key] ?? '', values)
}

/** "Express wash + Engine wash", counting only what the vehicle can get. */
export function serviceNames(selection: Selection): string {
  const { unavailable } = quote(selection.vehicle, selection.ids)
  return selection.ids
    .filter((id) => !unavailable.includes(id))
    .map((id) => findService(id)?.name ?? id)
    .join(' + ')
}

/** "Express wash for a small car, 20 min, ₱180", from the data-msg-selection template; '' when nothing counts. */
export function selectionSummary(selection: Selection, template: string): string {
  const { total, minutes } = quote(selection.vehicle, selection.ids)
  if (minutes === 0) return ''
  return fill(template, {
    services: serviceNames(selection),
    vehicle: VEHICLE_NAMES[selection.vehicle],
    // Non-breaking spaces, so "1 h 30 min" never splits across lines.
    duration: duration(minutes).replaceAll(' ', '\u00a0'),
    price: peso(total),
  })
}
