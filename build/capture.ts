/** A capture time counts only under `--mode capture` and only as a real date; any other build gets '' (the real clock). */
export function captureAt(mode: string, value: string | undefined): string {
  if (mode !== 'capture' || !value || Number.isNaN(Date.parse(value))) return ''
  return value
}
