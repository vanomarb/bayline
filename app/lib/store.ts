/** The part of localStorage the site uses. Tests pass an in-memory stand-in or one that throws. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Null where localStorage can't be reached: blocked site data throws on the property itself, not just on use. */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** This tab's sessionStorage, or null where it can't be reached (see browserStore). */
export function sessionStore(): KeyValueStore | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** The parsed value under a key, or null when it's missing, unreadable or not JSON. Never throws. */
export function readJSON(store: KeyValueStore | null, key: string): unknown {
  if (store === null) return null
  try {
    const raw = store.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/** Saves a value as JSON. False when storage is blocked or full. */
export function writeJSON(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (store === null) return false
  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Removes a key. False when storage is blocked. */
export function removeKey(store: KeyValueStore | null, key: string): boolean {
  if (store === null) return false
  try {
    store.removeItem(key)
    return true
  } catch {
    return false
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isISODate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
