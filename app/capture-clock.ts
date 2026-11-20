// Screenshot builds only: __CAPTURE_AT__ (vite.config.ts) is '' outside `--mode capture`, so other builds drop this.
declare const __CAPTURE_AT__: string
const captureAt = __CAPTURE_AT__

if (captureAt) {
  const RealDate = Date
  const offset = RealDate.parse(captureAt) - RealDate.now()
  class PinnedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset)
      else super(...(args as [string | number | Date]))
    }
    static override now(): number {
      return RealDate.now() + offset
    }
  }
  // `Date()` without `new` returns a string, and a class can't be called, so a Proxy answers that call.
  const Pinned = new Proxy(PinnedDate, {
    apply: () => new PinnedDate().toString(),
  }) as unknown as DateConstructor
  globalThis.Date = Pinned
}
