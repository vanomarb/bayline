export const PAGES = ['home', 'services', 'plans', 'visit', 'location', 'account', 'basket', 'about', 'contact', 'terms', 'privacy', 'cookies', 'accessibility']

export const PARTIAL_NAMES = ['header', 'footer', 'bays', 'line'] as const
export type PartialName = (typeof PARTIAL_NAMES)[number]

/** Paths under app/components/. */
export const PARTIAL_FILES: Record<PartialName, string> = {
  header: 'header.html',
  footer: 'footer.html',
  bays: 'bay-board/bays.html',
  line: 'bay-board/line.html',
}

const INCLUDE = /<!-- @include ([a-z]+)(?: current="[a-z]+")? -->/g

/** The Vite build and the jsdom tests both call this, so the pages they see are the same; runs before the icon step. */
export function includePartials(html: string, read: (name: PartialName) => string, base: string): string {
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(base)) throw new Error(`includePartials: the base "${base}" must start and end with "/"`)
  const current = html.match(/<!-- @include header current="([a-z]+)" -->/)?.[1]
  if (current !== undefined && !PAGES.includes(current)) throw new Error(`Unknown page "${current}" in the header include`)
  const page = html.replace(INCLUDE, (_tag, name: string) => {
    if (!(PARTIAL_NAMES as readonly string[]).includes(name)) throw new Error(`Unknown partial "${name}"`)
    let partial = read(name as PartialName).trim()
    if (current !== undefined) partial = partial.replaceAll(`data-nav="${current}"`, `data-nav="${current}" aria-current="page"`)
    return partial
  })
  return page.replaceAll('%BASE_URL%', base)
}
