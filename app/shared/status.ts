import { fill } from '../lib/format.ts'
import { hoursStatus } from '../lib/schedule.ts'
import { formatClock, manilaTime } from '../lib/time.ts'
import { YARD_EVENT, type YardSummary } from '../components/bay-board/bay-board.ts'

/** Always Mandaue time. Rechecked every 30 s and when a hidden tab returns, as background tabs run timers late. */
export function initStatus(): void {
  const sign = document.querySelector<HTMLElement>('[data-wait-sign]')
  const hoursLines = [...document.querySelectorAll<HTMLElement>('[data-hours]')]
  const yardLines = [...document.querySelectorAll<HTMLElement>('[data-yard-line]')]
  let openNow = true
  let yard: YardSummary | null = null

  function showYardLines(): void {
    for (const line of yardLines) {
      const label = line.querySelector<HTMLElement>('[data-yard-text]') ?? line
      if (!openNow) label.textContent = line.dataset.msgLineClosed ?? ''
      else if (yard) label.textContent = fill((yard.wait === 0 ? line.dataset.msgLineFree : line.dataset.msgLine) ?? '', { waiting: yard.waiting, wait: yard.wait })
    }
  }

  function showNow(): void {
    const now = new Date()
    const { open, opens } = hoursStatus(now)
    const time = formatClock(manilaTime(now).minutes)
    openNow = open
    showYardLines()

    if (sign) {
      sign.dataset.state = open ? 'open' : 'closed'
      const clock = sign.querySelector('[data-wait-clock]')
      if (clock) clock.textContent = fill(sign.dataset.msgTime ?? '', { time })
    }

    for (const hours of hoursLines) {
      hours.dataset.open = String(open)
      const line = hours.querySelector<HTMLElement>('[data-open-line]')
      if (line) line.dataset.open = String(open)
      const pill = hours.querySelector<HTMLElement>('[data-open-pill]')
      if (pill) pill.textContent = (open ? hours.dataset.msgOpen : opens === 'today' ? hours.dataset.msgClosedToday : hours.dataset.msgClosedTomorrow) ?? ''
      const clock = hours.querySelector('[data-hours-clock]')
      if (clock) clock.textContent = fill(hours.dataset.msgTime ?? '', { time })
    }
  }

  // The wait sign rounds to the nearest 5 minutes; the walk-in panel gives the exact figure.
  function showWait(summary: YardSummary): void {
    yard = summary
    showYardLines()
    const { wait, busy, waiting } = summary
    if (!sign) return
    const free = wait === 0
    const number = sign.querySelector<HTMLElement>('[data-wait-number]')
    const unit = sign.querySelector<HTMLElement>('[data-wait-unit]')
    const yardText = sign.querySelector<HTMLElement>('[data-wait-yard]')
    if (unit) unit.hidden = free
    if (number) number.textContent = free ? (sign.dataset.msgNoWait ?? '') : String(Math.max(5, Math.round(wait / 5) * 5))
    if (yardText) yardText.textContent = fill(sign.dataset.msgYard ?? '', { busy, waiting })
  }

  document.addEventListener(YARD_EVENT, (event) => showWait((event as CustomEvent<YardSummary>).detail))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) showNow()
  })
  showNow()
  window.setInterval(showNow, 30_000)
}
