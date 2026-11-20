import { BASE } from '../lib/site.ts'
import type { Vehicle } from '../lib/services.ts'

/** Stems in public/photos/. They show the class, not the customer's car, so alt is empty. */
export const PHOTOS: Record<Vehicle, string> = {
  small: 'vehicle-small-sedan',
  medium: 'vehicle-medium-suv',
  large: 'vehicle-large-pickup',
  motorcycle: 'vehicle-motorcycle-scooter',
}

export function vehiclePhoto(vehicle: Vehicle, sizes: string, className: string, eager = false): HTMLImageElement {
  const stem = `${BASE}photos/${PHOTOS[vehicle]}`
  const img = document.createElement('img')
  img.className = className
  img.src = `${stem}-400.webp`
  img.srcset = `${stem}-400.webp 400w, ${stem}-800.webp 800w`
  img.sizes = sizes
  img.width = 800
  img.height = 600
  img.alt = ''
  img.loading = eager ? 'eager' : 'lazy'
  img.decoding = 'async'
  return img
}
