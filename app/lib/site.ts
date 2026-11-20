// Shared by vite.config.ts, the browser code and the tests, so all of them use the same base path.

/** The path the site is served under (a folder, not the domain root): Vite's `base`, and what %BASE_URL% becomes. */
export const SITE_BASE = '/bayline/'

/** What builds use without VITE_SITE_URL: the local preview address. The Pages workflow passes the published one. */
export const LOCAL_SITE_URL = `http://localhost:4173${SITE_BASE}`

/** Vite's base where Vite runs; SITE_BASE in the tests and while vite.config.ts itself loads. */
export const BASE: string = import.meta.env?.BASE_URL ?? SITE_BASE

const FIX = `Set VITE_SITE_URL in .env to the address the site is published at, for example https://example.com${SITE_BASE}.`

/** Every canonical and og: URL is built from it: an absolute http(s) address under SITE_BASE. Throws with what to fix. */
export function checkSiteUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error(`VITE_SITE_URL is not set. ${FIX}`)
  if (value.includes('%')) throw new Error(`VITE_SITE_URL is still a placeholder ("${value}"). ${FIX}`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`VITE_SITE_URL ("${value}") is not an address. ${FIX}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`VITE_SITE_URL ("${value}") must start with https://. ${FIX}`)
  if (url.pathname !== SITE_BASE) throw new Error(`VITE_SITE_URL ("${value}") must end in ${SITE_BASE}, the folder the site is served from. ${FIX}`)
  return value
}

/** Any %NAME% placeholder still in a built page (a %VITE_SITE_URL% that wasn't filled, a misspelt %BASE_URL%). */
export function leftoverPlaceholders(html: string): string[] {
  return [...new Set(html.match(/%[A-Z][A-Z0-9_]*%/g) ?? [])]
}
