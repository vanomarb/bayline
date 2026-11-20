export type Vehicle = 'small' | 'medium' | 'large' | 'motorcycle'

export const VEHICLES: readonly Vehicle[] = ['small', 'medium', 'large', 'motorcycle']

/** How a vehicle reads mid-sentence, e.g. "Express wash for a small car". */
export const VEHICLE_NAMES: Record<Vehicle, string> = {
  small: 'small car',
  medium: 'medium vehicle',
  large: 'large vehicle',
  motorcycle: 'motorcycle',
}

export interface Service {
  id: string
  name: string
  minutes: number
  /** Sample prices in pesos; a missing vehicle means the service isn't offered for it. */
  prices: Partial<Record<Vehicle, number>>
  appointmentOnly?: true
}

export const SERVICES: Service[] = [
  { id: 'express', name: 'Express wash', minutes: 20, prices: { small: 180, medium: 220, large: 260, motorcycle: 100 } },
  { id: 'wash-vacuum', name: 'Wash and vacuum', minutes: 35, prices: { small: 280, medium: 330, large: 380 } },
  { id: 'wash-wax', name: 'Wash and hand wax', minutes: 50, prices: { small: 480, medium: 560, large: 640, motorcycle: 220 } },
  { id: 'engine', name: 'Engine wash', minutes: 30, prices: { small: 400, medium: 450, large: 500, motorcycle: 150 } },
  { id: 'glass', name: 'Glass and watermark removal', minutes: 90, prices: { small: 900, medium: 1100, large: 1300 } },
  { id: 'interior', name: 'Interior deep clean', minutes: 180, prices: { small: 1800, medium: 2200, large: 2600 } },
  { id: 'ceramic', name: 'Ceramic coating', minutes: 480, prices: { small: 12000, medium: 15000, large: 18000, motorcycle: 4500 }, appointmentOnly: true },
]

export function isVehicle(value: string): value is Vehicle {
  return (VEHICLES as readonly string[]).includes(value)
}

export function findService(id: string): Service | undefined {
  return SERVICES.find((service) => service.id === id)
}

/** Services the vehicle can't get, and unknown ids, are left out of both sums and listed in `unavailable`. */
export function quote(vehicle: Vehicle, ids: string[]): { total: number; minutes: number; unavailable: string[] } {
  let total = 0
  let minutes = 0
  const unavailable: string[] = []
  for (const id of new Set(ids)) {
    const service = findService(id)
    const price = service?.prices[vehicle]
    if (service === undefined || price === undefined) {
      unavailable.push(id)
      continue
    }
    total += price
    minutes += service.minutes
  }
  return { total, minutes, unavailable }
}
