const STAGGER_MS = 70
const STAGGER_MAX = 5 // later items start with the fifth, so long lists don't drag

/** Only this adds .reveal-item, so nothing hides before it runs; items already on screen get .is-revealed with it. */
export function initReveal(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return

  const items = collect()
  const height = window.innerHeight
  const onScreen = items.map((item) => {
    const box = item.getBoundingClientRect()
    return box.bottom > 0 && box.top < height
  })
  items.forEach((item, i) => item.classList.add(...(onScreen[i] ? ['reveal-item', 'is-revealed'] : ['reveal-item'])))

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  for (const item of items) if (!item.classList.contains('is-revealed')) observer.observe(item)
}

function stagger(elements: Element[]): HTMLElement[] {
  const blocks = elements.filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName !== 'TEMPLATE')
  blocks.forEach((el, i) => el.style.setProperty('--reveal-delay', `${Math.min(i, STAGGER_MAX - 1) * STAGGER_MS}ms`))
  return blocks
}

function collect(): HTMLElement[] {
  const items: HTMLElement[] = []
  const sections = [...document.querySelectorAll<HTMLElement>('main section, main article')].filter(
    (section) => !section.parentElement?.closest('main section, main article'),
  )
  for (const section of sections) {
    // A block holding a marked list stays put; its list items move instead.
    const blocks = [...section.querySelectorAll(':scope > .wrap > *')].filter(
      (child) => !child.matches('[data-reveal-list]') && !child.querySelector('[data-reveal-list]'),
    )
    items.push(...stagger(blocks))
    for (const list of section.querySelectorAll('[data-reveal-list]')) items.push(...stagger([...list.children]))
  }
  return items
}
