/** An inline <head> script sets <html data-visit> from #book first, so the right panel shows before this runs. */
export function initVisitSwitch(root: HTMLElement): void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  if (tabs.length === 0) return

  function select(mode: string | undefined, focus: boolean): void {
    const chosen = tabs.find((tab) => tab.dataset.mode === mode) ?? tabs[0]
    for (const tab of tabs) {
      const on = tab === chosen
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '')
      if (panel) panel.hidden = !on
    }
    document.documentElement.dataset.visit = chosen.dataset.mode ?? 'walk-in'
    if (focus) chosen.focus({ preventScroll: true })
  }

  for (const tab of tabs) tab.addEventListener('click', () => select(tab.dataset.mode, false))

  root.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(event.target as HTMLButtonElement)
    if (index === -1) return
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length]
    select(next.dataset.mode, true)
  })

  window.addEventListener('hashchange', () => select(location.hash === '#book' ? 'schedule' : 'walk-in', false))
  select(location.hash === '#book' ? 'schedule' : 'walk-in', false)
}
