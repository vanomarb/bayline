import { initAccount, initSession } from './account/account.ts'
import { YARD_EVENT, initBayBoard, initBoardPreview, yardSummary } from './components/bay-board/bay-board.ts'
import { initAddPlan, initAddWash, initBasketBadge, initBasketPage } from './shared/basket.ts'
import { initConceptDialog } from './shared/concept.ts'
import { initJoinHandoff, takeHandedPlate } from './home/join-handoff.ts'
import { initMockForm } from './contact/mock-form.ts'
import { initNav } from './shared/nav.ts'
import { initPlans } from './plans/plans.ts'
import { currentSelection, initPricePicker, onSelection, resetSelection, seedSelection, type Selection } from './services/price-picker.ts'
import { initReveal } from './shared/reveal.ts'
import { initSchedule } from './visit/schedule.ts'
import { initStatus } from './shared/status.ts'
import { initVisitSwitch } from './visit/visit-switch.ts'
import { selectionFromQuery, selectionToQuery } from './lib/handoff.ts'
import { seedQueue } from './lib/queue.ts'

function mount(selector: string, init: (root: HTMLElement) => void): void {
  const root = document.querySelector<HTMLElement>(selector)
  if (root) init(root)
}

function carrySelection(selection: Selection): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-carry-selection]')) {
    const url = new URL(link.href)
    url.search = selectionToQuery(selection)
    link.href = url.href
  }
}

/** Once per page load. The jsdom tests call it on the real pages, so they run exactly what the browser runs. */
export function boot(): void {
  const handed = selectionFromQuery(location.search)
  if (handed) seedSelection(handed)
  else resetSelection() // module state, so a page starts from the default itself

  initSession()
  initConceptDialog()
  initNav()
  initBasketBadge()
  initStatus() // listens for the bay board before it first reports
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-contact-form]')) initMockForm(form)
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-join-handoff]')) initJoinHandoff(form)
  mount('[data-account-page]', initAccount)
  mount('[data-basket-page]', initBasketPage)
  mount('[data-visit-switch]', initVisitSwitch)
  mount('[data-plans]', initPlans)
  mount('[data-plans]', initAddPlan)
  mount('[data-board-preview]', initBoardPreview)
  mount('[data-bay-board]', (root) => initBayBoard(root, takeHandedPlate()))
  mount('[data-schedule]', initSchedule)
  mount('[data-price-picker]', initAddWash)
  mount('[data-price-picker]', initPricePicker) // last: announces the starting selection to everything above

  // Pages without the walk-in board (Home's included) show the sample line it starts on.
  if (!document.querySelector('[data-bay-board]')) {
    document.dispatchEvent(new CustomEvent(YARD_EVENT, { detail: yardSummary(seedQueue()) }))
  }
  onSelection(carrySelection)
  carrySelection(currentSelection())

  // Last, once every interaction has drawn its content.
  initReveal()
}
