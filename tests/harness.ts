import { readFileSync } from 'node:fs'
import { JSDOM, VirtualConsole, type DOMWindow } from 'jsdom'
import { boot } from '../app/boot.ts'
import { PARTIAL_FILES, includePartials, type PartialName } from '../build/partials.ts'
import { SITE_BASE } from '../app/lib/site.ts'

// A page is its real HTML with the partials put in by includePartials, as in the build, and boot() runs on it.
// The stand-ins below imitate what jsdom lacks (they are not under test); the clock moves only through advance().

const root = new URL('../app/', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const partial = (name: PartialName) => read(`components/${PARTIAL_FILES[name]}`)

/** A weekday in Mandaue with the bays open (the capture build's clock). */
export const OPEN_AT = '2026-11-19T10:30:00+08:00'
/** The same day, after closing. */
export const CLOSED_AT = '2026-11-19T22:00:00+08:00'

export interface PageOptions {
  /** localStorage before the page parses; values are JSON-encoded, as the site writes them. */
  storage?: Record<string, unknown>
  /** sessionStorage likewise. */
  session?: Record<string, unknown>
  /** When the page's clock starts. Default: OPEN_AT. */
  at?: string
  /** The window is at least 60rem wide (the desktop nav). Default: a phone. */
  wide?: boolean
  /** Default true, so nothing animates or waits on a transition. */
  reducedMotion?: boolean
  /** Make localStorage throw, as in a private window that blocks site data. */
  blockedStorage?: boolean
}

export interface Page {
  window: DOMWindow
  document: Document
  /** Runs boot() on this page and returns any start-up errors it logged. */
  boot(): string[]
  $<T extends Element = HTMLElement>(selector: string): T
  $$<T extends Element = HTMLElement>(selector: string): T[]
  /** A person's click: mouse down (which focuses what is under the pointer), mouse up, click. */
  click(target: string | Element): void
  /** Types into a field one character at a time (keydown, input, keyup), appending to what is there. */
  type(target: string | Element, text: string): void
  /** Replaces a field's content as if select-all then typing. */
  fill(target: string | Element, text: string): void
  /** One key press on the focused element (or `target`): keydown, then keyup. Returns false if keydown was cancelled. */
  key(key: string, target?: Element): boolean
  /** Tab and Shift+Tab are not simulated (jsdom has no tab order); focus things with click() or focus(). */
  focus(target: string | Element): void
  /** Moves the page's clock and fires the timers that fall due, in order. */
  advance(ms: number): void
  /** Everything location.assign() was asked to open (jsdom can't navigate). */
  navigations: string[]
  storage(key: string): unknown
  session(key: string): unknown
  /** Reports an element as scrolled into view to the page's IntersectionObserver. */
  intersect(target: Element): void
  /** Moves the window across the desktop breakpoint. */
  resize(wide: boolean): void
  /** The focused element's id, or its tag. */
  focused(): string
  close(): void
}

const open: Page[] = []
const RealDate = Date
/** What Node itself defines: the page's globals never replace these (except the few jsdom must own). */
const NATIVE = new Set(Object.getOwnPropertyNames(globalThis))
const JSDOM_OWNS = ['Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'Node']

/** Closes every page opened so far and puts the real Date back. */
export function closeAll(): void {
  while (open.length) open.pop()!.close()
  globalThis.Date = RealDate
}

interface Timer {
  id: number
  at: number
  every: number | null
  run: () => void
}

/** `file` is under app/; `path` is under /bayline/ and may carry a query or hash, like 'visit/?from=basket#book'. */
export function loadPage(file: string, path: string, options: PageOptions = {}): Page {
  const { storage = {}, session = {}, reducedMotion = true, blockedStorage = false } = options
  let wide = options.wide ?? false
  let now = Date.parse(options.at ?? OPEN_AT)
  const timers = new Map<number, Timer>()
  let nextTimer = 1
  const mediaListeners = new Set<(event: { matches: boolean }) => void>()
  const observed = new Set<Element>()
  let reveal: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | null = null
  const navigations: string[] = []
  const virtualConsole = new VirtualConsole()
  const problems: string[] = []
  virtualConsole.on('jsdomError', (error: Error) => {
    if (error.message.startsWith('Not implemented: navigation')) return
    problems.push(error.message)
  })

  const html = includePartials(read(file), partial, SITE_BASE)
  const dom = new JSDOM(html, {
    url: `https://bayline.test${SITE_BASE}${path}`,
    pretendToBeVisual: true,
    // The head's inline script runs while the page parses; the module script isn't loaded, and boot() stands in for it.
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      // Stand-in: matchMedia answers the two queries the scripts ask, and reports breakpoint changes.
      window.matchMedia = ((query: string) => ({
        media: query,
        get matches() {
          if (query.includes('prefers-reduced-motion: reduce')) return reducedMotion
          if (query.includes('min-width: 60rem')) return wide
          return false
        },
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
          if (query.includes('min-width: 60rem')) mediaListeners.add(listener)
        },
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => mediaListeners.delete(listener),
      })) as unknown as typeof window.matchMedia

      // Stand-in: an IntersectionObserver that reports only when a test calls page.intersect().
      window.IntersectionObserver = class {
        constructor(callback: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
          reveal = callback
        }
        observe(target: Element) {
          observed.add(target)
        }
        unobserve(target: Element) {
          observed.delete(target)
        }
        disconnect() {
          observed.clear()
        }
        takeRecords() {
          return []
        }
      } as unknown as typeof window.IntersectionObserver

      // Stand-in: the page's timers, moved by advance(), so nothing waits in real time.
      const schedule = (run: () => void, ms: number | undefined, every: boolean): number => {
        const id = nextTimer++
        timers.set(id, { id, at: now + Math.max(0, ms ?? 0), every: every ? Math.max(1, ms ?? 0) : null, run })
        return id
      }
      window.setTimeout = ((run: () => void, ms?: number) => schedule(run, ms, false)) as typeof window.setTimeout
      window.setInterval = ((run: () => void, ms?: number) => schedule(run, ms, true)) as typeof window.setInterval
      window.clearTimeout = window.clearInterval = ((id?: number) => void timers.delete(id ?? 0)) as typeof window.clearTimeout
      window.requestAnimationFrame = ((run: (time: number) => void) => schedule(() => run(now), 16, false)) as typeof window.requestAnimationFrame
      window.cancelAnimationFrame = ((id: number) => void timers.delete(id)) as typeof window.cancelAnimationFrame

      // Stand-in for <dialog>: showModal focuses the autofocus or first control; Escape fires a cancelable "cancel", then closes.
      // It does not hand focus back on close: the site's own code must, and the tests check that it does.
      const dialog = window.HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>
      dialog.showModal = function (this: HTMLDialogElement) {
        if (this.open) throw new window.DOMException('The dialog is already open.', 'InvalidStateError')
        this.setAttribute('open', '')
        const target = this.querySelector<HTMLElement>('[autofocus]') ?? this.querySelector<HTMLElement>('a[href], button, input, select, textarea')
        target?.focus()
      }
      dialog.close = function (this: HTMLDialogElement) {
        if (!this.open) return
        this.removeAttribute('open')
        this.dispatchEvent(new window.Event('close'))
      }
      window.document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return
        const top = [...window.document.querySelectorAll('dialog[open]')].pop() as HTMLDialogElement | undefined
        if (top && top.dispatchEvent(new window.Event('cancel', { cancelable: true }))) top.close()
      })

      // jsdom can't navigate: a link click is stopped once every handler has seen it (location.assign() is recorded).
      window.addEventListener('click', (event) => {
        if ((event.target as Element | null)?.closest?.('a[href]')) event.preventDefault()
      })

      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, JSON.stringify(value))
      for (const [key, value] of Object.entries(session)) window.sessionStorage.setItem(key, JSON.stringify(value))
      if (blockedStorage) {
        const blocked = () => {
          throw new window.DOMException('The operation is insecure.', 'SecurityError')
        }
        Object.defineProperty(window, 'localStorage', { get: blocked, configurable: true })
      }
    },
  })
  const { window } = dom
  const document = window.document
  const element = (target: string | Element): Element => (typeof target === 'string' ? page.$(target) : target)

  const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]'
  const mouse = (el: Element, type: string) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }))

  function runTimers(until: number): void {
    for (;;) {
      const due = [...timers.values()].filter((t) => t.at <= until).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      now = Math.max(now, due.at)
      if (due.every === null) timers.delete(due.id)
      else due.at += due.every
      due.run()
    }
    now = until
  }

  const page: Page = {
    window,
    document,
    navigations,
    boot() {
      // The feature modules use the browser's globals, so point them at this page.
      const globals: Record<string, unknown> = { window, document, Date: undefined }
      for (const name of Object.getOwnPropertyNames(window)) {
        if (!NATIVE.has(name) || JSDOM_OWNS.includes(name)) globals[name] = (window as never)[name]
      }
      delete globals.Date
      // The page's clock: `new Date()` and Date.now() read the fake time; everything else is the real Date.
      class FakeDate extends RealDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) super(now)
          else super(...(args as [string | number | Date]))
        }
        static override now(): number {
          return now
        }
      }
      globals.Date = FakeDate
      // location: the page's own, except that assign() is recorded instead of navigating.
      const record = (url: string | URL) => void navigations.push(new URL(String(url), window.location.href).href)
      globals.location = {
        assign: record,
        replace: record,
        get href() {
          return window.location.href
        },
        get origin() {
          return window.location.origin
        },
        get pathname() {
          return window.location.pathname
        },
        get search() {
          return window.location.search
        },
        get hash() {
          return window.location.hash
        },
      }
      for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
      const logged: string[] = []
      const original = console.error
      console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '))
      try {
        boot()
      } finally {
        console.error = original
      }
      return [...logged, ...problems]
    },
    $<T extends Element = HTMLElement>(selector: string) {
      const found = document.querySelector<T>(selector)
      if (!found) throw new Error(`No element matches ${selector}`)
      return found
    },
    $$<T extends Element = HTMLElement>(selector: string) {
      return [...document.querySelectorAll<T>(selector)]
    },
    click(target) {
      const el = element(target)
      if (mouse(el, 'mousedown')) {
        // A pointer press focuses the nearest focusable thing under it, or lets go of focus if there is none.
        const focusable = el.closest<HTMLElement>(FOCUSABLE)
        if (focusable && !(focusable as HTMLInputElement).disabled) focusable.focus()
        else (document.activeElement as HTMLElement | null)?.blur()
      }
      mouse(el, 'mouseup')
      mouse(el, 'click')
    },
    type(target, text) {
      const field = element(target) as HTMLInputElement
      for (const char of text) {
        field.dispatchEvent(new window.KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }))
        field.value += char
        field.dispatchEvent(new window.Event('input', { bubbles: true }))
        field.dispatchEvent(new window.KeyboardEvent('keyup', { key: char, bubbles: true }))
      }
    },
    fill(target, text) {
      const field = element(target) as HTMLInputElement
      field.value = ''
      page.type(field, text)
    },
    key(key, target = document.activeElement ?? document.body) {
      const go = target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      target.dispatchEvent(new window.KeyboardEvent('keyup', { key, bubbles: true }))
      // The browser's own defaults for Enter and Space, which the sites rely on.
      if (go && target instanceof window.HTMLButtonElement && (key === 'Enter' || key === ' ')) target.click()
      else if (go && key === 'Enter' && target instanceof window.HTMLInputElement && target.form && target.type !== 'radio' && target.type !== 'checkbox') target.form.requestSubmit()
      else if (go && key === ' ' && target instanceof window.HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox')) target.click()
      return go
    },
    focus(target) {
      ;(element(target) as HTMLElement).focus()
    },
    advance(ms) {
      runTimers(now + ms)
    },
    storage(key) {
      const text = window.localStorage.getItem(key)
      return text === null ? null : JSON.parse(text)
    },
    session(key) {
      const text = window.sessionStorage.getItem(key)
      return text === null ? null : JSON.parse(text)
    },
    intersect(target) {
      if (observed.has(target)) reveal?.([{ target, isIntersecting: true }])
    },
    resize(next) {
      wide = next
      for (const listener of mediaListeners) listener({ matches: next })
    },
    focused() {
      const el = document.activeElement
      return el ? el.id || el.tagName.toLowerCase() : ''
    },
    close() {
      window.close()
    },
  }
  open.push(page)
  return page
}
