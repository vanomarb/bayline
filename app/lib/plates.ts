/** Plate formats the field accepts, after normalising: cars first, then motorcycles. */
const PLATE_FORMATS = [/^[A-Z]{3} \d{4}$/, /^[A-Z]{3} \d{3}$/, /^\d{3} [A-Z]{3}$/, /^\d{4} [A-Z]{2}$/, /^[A-Z]{2} \d{5}$/]

/** ' nbc-1234 ' → 'NBC 1234': letters and digits only, uppercased, one space between letter and digit runs. */
export function normalizePlate(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return (compact.match(/[A-Z]+|[0-9]+/g) ?? []).join(' ')
}

export function isValidPlate(input: string): boolean {
  const plate = normalizePlate(input)
  return PLATE_FORMATS.some((format) => format.test(plate))
}
