/** Without scripts the menu button stays hidden and the footer carries the links. */
export function initNav(): void {
  const header = document.querySelector<HTMLElement>('[data-header]')
  if (header) {
    const mark = () => header.toggleAttribute('data-scrolled', window.scrollY > 4)
    window.addEventListener('scroll', mark, { passive: true })
    mark()
  }

  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')
  const menu = document.getElementById(toggle?.getAttribute('aria-controls') ?? '')
  if (!toggle || !(menu instanceof HTMLDialogElement)) return
  const desktop = matchMedia('(min-width: 60rem)')

  toggle.addEventListener('click', () => {
    if (menu.open) return
    menu.showModal()
    toggle.setAttribute('aria-expanded', 'true')
  })

  menu.querySelector('[data-menu-close]')?.addEventListener('click', () => menu.close())

  // A tap on the dialog's own box (reachable only if it is ever smaller than the screen) counts as the backdrop.
  menu.addEventListener('click', (event) => {
    if (event.target === menu || (event.target as Element).closest('a')) menu.close()
  })

  menu.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false')
    // The button is hidden on the desktop nav, so focus goes back only while it shows.
    if (!desktop.matches) toggle.focus()
  })

  desktop.addEventListener('change', () => {
    if (desktop.matches && menu.open) menu.close()
  })
}
