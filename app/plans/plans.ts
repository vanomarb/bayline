import { fill, peso } from '../lib/format.ts'
import { PLANS, packPrice, perWashTotal, savings } from '../lib/plans.ts'
import { isVehicle, type Vehicle } from '../lib/services.ts'
import { currentSelection, emitSelection, onSelection } from '../services/price-picker.ts'

/** Follows the selected vehicle, and choosing one here moves the selection too. */
export function initPlans(root: HTMLElement): void {
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[name="plans-vehicle"]')]
  const cards = [...root.querySelectorAll<HTMLElement>('[data-plan]')]
  const live = root.querySelector<HTMLElement>('[data-plans-live]')
  const text = (template: string | undefined, values: Record<string, string | number> = {}) => fill(template ?? '', values)
  const spoken: string[] = []

  function render(vehicle: Vehicle): void {
    for (const input of inputs) input.checked = input.value === vehicle
    spoken.length = 0

    for (const card of cards) {
      const plan = PLANS.find((p) => p.id === card.dataset.plan)
      if (!plan) continue
      const amount = card.querySelector<HTMLElement>('[data-plan-amount]')
      const per = card.querySelector<HTMLElement>('[data-plan-per]')
      const save = card.querySelector<HTMLElement>('[data-plan-save]')
      const single = card.querySelector<HTMLElement>('[data-plan-single]')
      const price = packPrice(plan, vehicle)
      const total = perWashTotal(plan, vehicle)
      const saved = savings(plan, vehicle)
      const offered = price !== null && total !== null && saved !== null

      card.dataset.offered = String(offered)
      if (per) per.hidden = !offered
      if (save) save.hidden = !offered
      if (offered) {
        if (amount) amount.textContent = peso(price)
        if (save) save.textContent = text(root.dataset.msgSave, { amount: peso(saved) })
        if (single) single.textContent = text(root.dataset.msgSingle, { price: peso(total) })
        spoken.push(`${plan.name} ${peso(price)} a month, saving ${peso(saved)}`)
      } else {
        if (amount) amount.textContent = amount.dataset.msgNotOffered ?? ''
        if (single) single.textContent = single.dataset.msgNotOfferedNote ?? ''
        spoken.push(`${plan.name} ${(amount?.dataset.msgNotOffered ?? '').toLowerCase()}`)
      }
    }
  }

  function announce(input: HTMLInputElement): void {
    if (!live) return
    const vehicle = input.closest('label')?.querySelector('.vehicle-option__name')?.textContent ?? input.value
    live.textContent = text(live.dataset.msgLive, { vehicle, packs: spoken.join(', ') })
  }

  for (const input of inputs) {
    input.addEventListener('change', () => {
      if (!isVehicle(input.value)) return
      render(input.value)
      announce(input)
      emitSelection({ vehicle: input.value, ids: currentSelection().ids })
    })
  }

  onSelection((selection) => render(selection.vehicle))
  render(currentSelection().vehicle)
}
