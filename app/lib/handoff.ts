import { findService, isVehicle, type Vehicle } from './services.ts'
import { readJSON, removeKey, writeJSON, type KeyValueStore } from './store.ts'

export interface HandOff {
  vehicle: Vehicle
  ids: string[]
}

/** 'vehicle=medium&services=express,engine': short enough to read in the address bar. */
export function selectionToQuery({ vehicle, ids }: HandOff): string {
  return `vehicle=${vehicle}&services=${ids.join(',')}`
}

/** Null without a known vehicle; drops unknown and repeated service ids; never throws on hand-edited input. */
export function selectionFromQuery(search: string): HandOff | null {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return null
  }
  const vehicle = params.get('vehicle') ?? ''
  if (!isVehicle(vehicle)) return null
  const ids = [...new Set((params.get('services') ?? '').split(','))].filter((id) => findService(id) !== undefined)
  return { vehicle, ids }
}

/** As long as the plate field on the line page (maxlength 24). */
const PLATE_MAX = 24
/** Session storage: this tab only, and gone once the line page reads it. */
export const JOIN_KEY = 'bayline.join'

/** Never in the address, so a plate stays out of the history. '' just focuses the line page's field; false when storage is blocked. */
export function stashPlate(store: KeyValueStore | null, plate: string): boolean {
  return writeJSON(store, JOIN_KEY, plate.trim().slice(0, PLATE_MAX))
}

/** One-shot: removed as it is read, so a reload starts fresh. Null when nothing was left; never throws. */
export function takePlate(store: KeyValueStore | null): string | null {
  const saved = readJSON(store, JOIN_KEY)
  removeKey(store, JOIN_KEY)
  return typeof saved === 'string' ? saved.trim().slice(0, PLATE_MAX) : null
}
