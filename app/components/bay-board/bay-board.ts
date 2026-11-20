import { duration, ordinal } from '../../lib/format.ts'
import { isValidPlate, normalizePlate } from '../../lib/plates.ts'
import { join, seedQueue, tick, waitForNext, waitTimes, type Car, type QueueState } from '../../lib/queue.ts'
import { CLOSES, isOpen } from '../../lib/schedule.ts'
import { SERVICES, VEHICLE_NAMES, findService, isVehicle, quote, type Vehicle } from '../../lib/services.ts'
import { formatClock, manilaTime } from '../../lib/time.ts'
import { currentSelection, emitSelection, onSelection, type Selection } from '../../services/price-picker.ts'
import { capitalise, element, messages, selectionSummary } from '../../shared/ui.ts'
import { vehiclePhoto } from '../../shared/vehicle-photo.ts'

/** Sent as YARD_EVENT after every change, for Home's wait sign and the footer's status strip. */
export interface YardSummary {
  wait: number
  busy: number
  waiting: number
}

export const YARD_EVENT = 'bayline:yard'

export function yardSummary(state: QueueState): YardSummary {
  return { wait: waitForNext(state), busy: state.bays.filter(Boolean).length, waiting: state.waiting.length }
}

/** For estimating how far along the cars already in a bay are when the page opens. */
const LENGTHS = [...new Set(SERVICES.map((service) => service.minutes))].sort((a, b) => a - b)
/** Seconds the "Bay 2 is ready" status stays up before it becomes a wash countdown. */
const TURN_SECONDS = 4
const TOAST_MS = 6000
const FADE_MS = 200
const ROW_MS = 220

type Phase = 'idle' | 'waiting' | 'turn' | 'washing' | 'done'

interface BayView {
  tile: HTMLElement
  frame: HTMLElement
  you: HTMLElement | null
  left: HTMLElement | null
  plate: HTMLElement | null
  size: HTMLElement | null
  bar: HTMLElement | null
  img: HTMLImageElement | null
  plateShown: string
}

interface RowView {
  row: HTMLLIElement
  what: HTMLElement
  eta: HTMLElement
}

/** Draws a yard into bays.html and line.html, the partials beside this file. */
export interface Board {
  render(state: QueueState, animate: boolean): void
  clear(): void
}

/** Both boards use it. Copy templates sit on [data-bays] and [data-line]; `eager` is for a board that opens the page. */
export function createBoard(scope: ParentNode, eager = false): Board | null {
  const baysEl = scope.querySelector<HTMLElement>('[data-bays]')
  const lineEl = scope.querySelector<HTMLElement>('[data-line]')
  const queueEl = lineEl?.querySelector<HTMLOListElement>('[data-queue]')
  if (!baysEl || !lineEl || !queueEl) return null
  const emptyEl = lineEl.querySelector<HTMLElement>('[data-queue-empty]')
  const sayBay = messages(baysEl)
  const sayLine = messages(lineEl)
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

  const bays: BayView[] = [...baysEl.querySelectorAll<HTMLElement>('[data-bay]')].map((tile) => ({
    tile,
    frame: tile.querySelector<HTMLElement>('[data-bay-frame]') ?? tile,
    you: tile.querySelector<HTMLElement>('[data-bay-you]'),
    left: tile.querySelector<HTMLElement>('[data-bay-left]'),
    plate: tile.querySelector<HTMLElement>('[data-bay-plate]'),
    size: tile.querySelector<HTMLElement>('[data-bay-size]'),
    bar: tile.querySelector<HTMLElement>('[data-bay-bar]'),
    img: null,
    plateShown: '',
  }))
  /** Full job length per plate, for the progress bars; cars already in a bay when the page opens are estimated. */
  const lengths = new Map<string, number>()
  const rows = new Map<string, RowView>()

  function lengthOf(car: Car): number {
    return lengths.get(car.plate) ?? LENGTHS.find((minutes) => minutes >= car.minutesLeft) ?? car.minutesLeft
  }

  // The new photo is in place first and only the fade is animated, so a skipped animation never leaves the board wrong.
  const fade = (animate: boolean) => animate && !reducedMotion.matches && !document.hidden

  function swapPhoto(view: BayView, car: Car | null, animate: boolean): void {
    const old = view.img
    view.img = null
    if (car) {
      const img = vehiclePhoto(car.vehicle, '(min-width: 64rem) 14rem, (min-width: 48rem) 30vw, 8.5rem', 'bay__img', eager)
      view.frame.append(img)
      view.img = img
      if (fade(animate)) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'linear' })
    }
    if (!old) return
    if (!fade(animate)) {
      old.remove()
      return
    }
    const done = () => old.remove()
    old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'linear', fill: 'forwards' }).finished.then(done, done)
    window.setTimeout(done, FADE_MS + 100)
  }

  function renderBays(state: QueueState, animate: boolean): void {
    state.bays.forEach((car, index) => {
      const view = bays[index]
      if (!view) return
      const plate = car?.plate ?? ''
      if (plate !== view.plateShown) {
        view.plateShown = plate
        swapPhoto(view, car, animate)
        // A new car's bar starts from its own position instead of sliding back from the last car's.
        if (view.bar) view.bar.replaceChildren(document.createElement('span'))
      }
      view.tile.dataset.state = car ? (car.mine ? 'yours' : 'busy') : 'open'
      if (view.you) view.you.hidden = !car?.mine
      if (!car) return
      if (view.left) view.left.textContent = sayBay('msgBayLeft', { minutes: car.minutesLeft })
      if (view.plate) view.plate.textContent = car.plate
      if (view.size) view.size.textContent = capitalise(VEHICLE_NAMES[car.vehicle])
      const fill = view.bar?.firstElementChild as HTMLElement | null
      if (fill) fill.style.setProperty('--progress', String(Math.min(1, Math.max(0, 1 - car.minutesLeft / lengthOf(car)))))
    })
  }

  // Rows are kept per plate, so the ones that stay can slide up when the front car pulls in.
  function renderQueue(state: QueueState, animate: boolean): void {
    const waits = waitTimes(state)
    const before = new Map([...rows].map(([plate, view]) => [plate, view.row.getBoundingClientRect().top]))
    const present = new Set<string>()

    state.waiting.forEach((car, index) => {
      present.add(car.plate)
      lengths.set(car.plate, car.minutesLeft) // in line, minutesLeft is the whole job
      let view = rows.get(car.plate)
      if (!view) {
        const row = document.createElement('li')
        const thumb = element('span', 'queue-row__thumb')
        thumb.append(vehiclePhoto(car.vehicle, '56px', 'queue-row__img', eager))
        view = { row, what: element('span', 'queue-row__what'), eta: element('span', 'queue-row__eta num') }
        row.append(thumb, element('span', 'plate', car.plate), view.what, view.eta)
        rows.set(car.plate, view)
      }
      view.row.className = car.mine ? 'queue-row queue-row--yours' : 'queue-row'
      const size = capitalise(VEHICLE_NAMES[car.vehicle])
      view.what.replaceChildren(...(car.mine ? [element('span', 'you', sayLine('msgLineYou')), size] : [size]))
      view.eta.replaceChildren(element('span', 'sr-only', `${sayLine('msgLineWait')} `), waits[index] === 0 ? sayLine('msgLineNext') : sayLine('msgLineEta', { minutes: waits[index] }))
      queueEl!.append(view.row)
    })

    for (const [plate, view] of rows) {
      if (present.has(plate)) continue
      view.row.remove()
      rows.delete(plate)
    }
    if (emptyEl) emptyEl.hidden = state.waiting.length > 0

    if (!fade(animate)) return
    for (const [plate, view] of rows) {
      const top = before.get(plate)
      const shift = top === undefined ? 0 : top - view.row.getBoundingClientRect().top
      if (shift !== 0) view.row.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: ROW_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    }
  }

  return {
    render(state, animate) {
      renderBays(state, animate)
      renderQueue(state, animate)
    },
    clear() {
      lengths.clear()
      for (const view of bays) {
        view.img?.remove()
        view.img = null
        view.plateShown = ''
      }
      for (const view of rows.values()) view.row.remove()
      rows.clear()
    },
  }
}

/** Home's board: drawn once from the sample yard and never run; joining happens on the line page. */
export function initBoardPreview(root: HTMLElement): void {
  createBoard(root, true)?.render(seedQueue(), false)
}

/** One simulated minute per second. `handedPlate` (typed on Home) goes through this form, the one place that checks a plate. */
export function initBayBoard(root: HTMLElement, handedPlate: string | null = null): void {
  const board = createBoard(root)
  const form = root.querySelector<HTMLFormElement>('[data-join-form]')
  const input = form?.querySelector<HTMLInputElement>('input[name="plate"]')
  const error = form?.querySelector<HTMLElement>('[data-field-error]')
  const errorText = error?.querySelector<HTMLElement>('[data-error-text]') ?? error
  const sizeSelect = form?.querySelector<HTMLSelectElement>('[data-size-select]')
  const status = root.querySelector<HTMLElement>('[data-walk-in-status]')
  const statusMain = root.querySelector<HTMLElement>('[data-status-main]')
  const statusNote = root.querySelector<HTMLElement>('[data-status-note]')
  const live = root.querySelector<HTMLElement>('[data-walk-in-live]')
  const clockButton = root.querySelector<HTMLButtonElement>('[data-clock]')
  const clockLabel = clockButton?.querySelector<HTMLElement>('[data-clock-label]') ?? clockButton
  const resetButton = root.querySelector<HTMLButtonElement>('[data-reset]')
  const selectionText = root.querySelector<HTMLElement>('[data-selection]')
  const selectionLink = selectionText?.parentElement?.querySelector<HTMLAnchorElement>('a')
  const toast = document.querySelector<HTMLElement>('[data-toast]')
  const toastText = toast?.querySelector<HTMLElement>('[data-toast-text]') ?? toast
  if (!board || !form || !input || !error || !errorText || !status || !statusMain || !clockButton || !clockLabel || !resetButton) return

  const text = messages(root)
  const selectionTemplate = root.closest<HTMLElement>('[data-msg-selection]')?.dataset.msgSelection ?? ''

  let state: QueueState = seedQueue()
  let selection: Selection = currentSelection()
  let phase: Phase = 'idle'
  let mine: Car | null = null
  let myBay = -1
  let turnSeconds = 0
  let lastMoment = ''
  let timer = 0
  let toastTimer = 0
  let resumeWhenVisible = false
  let errorAbout: 'plate' | 'selection' | null = null

  function statusLine(): { message: string; tone: string } {
    if (phase === 'idle') {
      const now = new Date()
      if (!isOpen(now)) return { message: text('msgClosed', { time: formatClock(manilaTime(now).minutes) }), tone: 'closed' }
      const wait = waitForNext(state)
      return { message: wait === 0 ? text('msgBeforeJoinFree') : text('msgBeforeJoin', { minutes: wait }), tone: '' }
    }
    const plate = mine?.plate ?? ''
    if (phase === 'waiting') {
      const index = state.waiting.findIndex((car) => car.mine)
      const wait = waitTimes(state)[index] ?? 0
      return { message: wait === 0 ? text('msgNext') : text('msgWaiting', { position: ordinal(index + 1), minutes: wait }), tone: '' }
    }
    if (phase === 'turn') return { message: text('msgTurnStatus', { bay: myBay + 1, plate }), tone: 'ready' }
    if (phase === 'washing') return { message: text('msgWashing', { plate, bay: myBay + 1, minutes: state.bays[myBay]?.minutesLeft ?? 0 }), tone: '' }
    return { message: text('msgDone', { plate }), tone: 'ready' }
  }

  function renderStatus(): void {
    const { message, tone } = statusLine()
    if (statusMain) statusMain.textContent = message
    if (tone) status!.dataset.tone = tone
    else delete status!.dataset.tone
    if (statusNote) statusNote.hidden = phase === 'idle'
  }

  function renderSelection(): void {
    if (selectionLink) selectionLink.hidden = phase !== 'idle'
    if (!selectionText || phase !== 'idle') return
    selectionText.textContent = selectionSummary(selection, selectionTemplate) || text('msgNoService')
  }

  function render(animate: boolean): void {
    board!.render(state, animate)
    renderStatus()
    renderSelection()
    document.dispatchEvent(new CustomEvent<YardSummary>(YARD_EVENT, { detail: yardSummary(state) }))
  }

  function announce(message: string): void {
    if (!live) return
    live.textContent = ''
    requestAnimationFrame(() => {
      live.textContent = message
    })
  }

  // A visual echo only (aria-hidden): the status line and the live region carry the message.
  // It moves to the top if it would cover the focused control, and hides if both edges would.
  function showToast(message: string): void {
    if (!toast) return
    window.clearTimeout(toastTimer)
    if (toastText) toastText.textContent = message
    toast.dataset.state = 'shown'
    placeToast()
    toastTimer = window.setTimeout(hideToast, TOAST_MS)
  }

  function hideToast(): void {
    if (!toast) return
    window.clearTimeout(toastTimer)
    toast.dataset.state = 'hidden'
    toastTimer = window.setTimeout(() => {
      if (toast.dataset.state === 'hidden' && toastText) toastText.textContent = ''
    }, 300)
  }

  function placeToast(): void {
    if (!toast || toast.dataset.state !== 'shown') return
    const focused = document.activeElement
    toast.dataset.edge = 'bottom'
    if (!(focused instanceof HTMLElement) || focused === document.body) return
    const covers = () => {
      const a = toast.getBoundingClientRect()
      const b = focused.getBoundingClientRect()
      return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    }
    if (!covers()) return
    toast.dataset.edge = 'top'
    if (covers()) hideToast()
  }

  function step(): void {
    const result = tick(state, 1)
    state = result.state
    for (const event of result.events) {
      if (event.type === 'my-turn' && mine) {
        phase = 'turn'
        myBay = event.bay
        turnSeconds = TURN_SECONDS
        showToast(text('msgTurn', { bay: event.bay + 1, plate: mine.plate }))
        announce(text('msgTurnStatus', { bay: event.bay + 1, plate: mine.plate }))
      } else if (event.type === 'bay-free' && event.bay === myBay && (phase === 'turn' || phase === 'washing')) {
        phase = 'done'
        announce(text('msgDone', { plate: mine?.plate ?? '' }))
      }
    }
    if (phase === 'turn' && --turnSeconds <= 0) phase = 'washing'

    // Speak when the place in line changes, and once when it's next; the countdown itself stays quiet.
    if (phase === 'waiting') {
      const position = state.waiting.findIndex((car) => car.mine) + 1
      const wait = waitTimes(state)[position - 1] ?? 0
      const moment = wait === 0 ? 'next' : String(position)
      if (moment !== lastMoment) {
        announce(wait === 0 ? text('msgNext') : text('msgWaiting', { position: ordinal(position), minutes: wait }))
        lastMoment = moment
      }
    }

    render(true)
    if (state.waiting.length === 0 && state.bays.every((car) => car === null)) pause()
  }

  function play(): void {
    if (timer) return
    timer = window.setInterval(step, 1000)
    clockButton!.dataset.running = 'true'
    clockLabel!.textContent = text('msgPause')
  }

  function pause(): void {
    window.clearInterval(timer)
    timer = 0
    clockButton!.dataset.running = 'false'
    clockLabel!.textContent = text('msgPlay')
  }

  function showError(message: string, aboutPlate: boolean): void {
    errorText!.textContent = message
    error!.hidden = false
    errorAbout = aboutPlate ? 'plate' : 'selection'
    if (aboutPlate) {
      input!.setAttribute('aria-invalid', 'true')
      input!.focus()
    } else {
      announce(message)
    }
  }

  function clearError(): void {
    error!.hidden = true
    errorText!.textContent = ''
    errorAbout = null
    input!.removeAttribute('aria-invalid')
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    clearError()
    const plate = normalizePlate(input.value)
    if (plate === '') return showError(text('msgPlateEmpty'), true)
    if (!isValidPlate(plate)) return showError(text('msgPlateInvalid'), true)
    if ([...state.bays, ...state.waiting].some((car) => car?.plate === plate)) return showError(text('msgPlateTaken', { plate }), true)

    const { minutes } = quote(selection.vehicle, selection.ids)
    if (minutes === 0) return showError(text('msgNoService'), false)
    const byAppointment = selection.ids.some((id) => findService(id)?.appointmentOnly && findService(id)?.prices[selection.vehicle] !== undefined)
    if (byAppointment) return showError(text('msgAppointment'), false)
    const now = new Date()
    if (isOpen(now) && manilaTime(now).minutes + waitForNext(state) + minutes > CLOSES) return showError(text('msgTooLate'), false)

    input.value = plate
    mine = { plate, vehicle: selection.vehicle, minutesLeft: minutes, mine: true }
    const joined = join(state, mine)
    state = joined.state
    phase = 'waiting'
    lastMoment = joined.etaMinutes === 0 ? 'next' : String(joined.position)
    form.hidden = true
    render(true)

    const message = joined.etaMinutes === 0 ? text('msgJoinedFree', { plate }) : text('msgJoined', { position: ordinal(joined.position), plate, minutes: joined.etaMinutes })
    statusMain.textContent = message
    play()
    // Said once, through the live region; focus moves on to the clock button, which now reads Pause.
    announce(`${message} ${statusNote?.textContent ?? ''}`)
    clockButton.focus()
  })

  input.addEventListener('input', clearError)
  clockButton.addEventListener('click', () => (timer ? pause() : play()))

  // A hidden tab pauses the yard, so a turn can't come and go unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer) {
        pause()
        resumeWhenVisible = true
      }
    } else if (resumeWhenVisible) {
      resumeWhenVisible = false
      play()
    }
  })

  document.addEventListener('focusin', placeToast)
  window.addEventListener('scroll', placeToast, { passive: true })
  window.addEventListener('resize', placeToast)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toast?.dataset.state === 'shown') hideToast()
  })
  resetButton.addEventListener('click', () => {
    pause()
    hideToast()
    state = seedQueue()
    phase = 'idle'
    mine = null
    myBay = -1
    board.clear()
    form.hidden = false
    input.value = ''
    clearError()
    render(false)
    input.focus()
  })

  // The size select is one more vehicle switcher: it moves the shared selection.
  sizeSelect?.addEventListener('change', () => {
    if (isVehicle(sizeSelect.value)) emitSelection({ vehicle: sizeSelect.value, ids: currentSelection().ids })
  })

  onSelection((next) => {
    selection = next
    if (sizeSelect) sizeSelect.value = next.vehicle
    // An error about the wash (none picked, by appointment, too late) no longer applies once the wash changes.
    if (errorAbout === 'selection') clearError()
    renderSelection()
  })
  if (sizeSelect) sizeSelect.value = selection.vehicle

  render(false)

  if (handedPlate !== null) {
    if (handedPlate === '') input.focus()
    else {
      input.value = handedPlate
      form.requestSubmit()
    }
  }
}
