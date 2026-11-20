const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Pesos without decimals, e.g. 1290 → '₱1,290'. */
export function peso(amount: number): string {
  return `₱${wholeNumber.format(Math.round(amount))}`
}

/** Job length the way the price list writes it: '35 min', '1 h 30 min', '3 h', '1 day'. */
export function duration(minutes: number): string {
  if (minutes >= 480) return minutes <= 720 ? '1 day' : 'Over a day'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins} min`
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`
}

/** 1 → '1st', 2 → '2nd', 11 → '11th'. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}

/** Fills {key} placeholders in a copy template from the HTML. Unknown keys are left as written. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
