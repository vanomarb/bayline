import { stashPlate, takePlate } from '../lib/handoff.ts'
import { sessionStore } from '../lib/store.ts'

/** Leaves the plate in session storage for the line page's walk-in form: one form checks it, and it never enters the address. */
export function initJoinHandoff(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>('input[name="plate"]')
  if (!input) return
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    stashPlate(sessionStore(), input.value)
    location.assign(form.action)
  })
}

/** Read once and removed; null when the page wasn't opened from Home's strip. */
export function takeHandedPlate(): string | null {
  return takePlate(sessionStore())
}
