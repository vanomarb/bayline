import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'vite'
import { LOCAL_SITE_URL } from '../app/lib/site.ts'

// The real build, in memory (nothing is written), checked on what ships.

const AT = '2026-11-19T10:30:00+08:00'
const SITE = LOCAL_SITE_URL

type Output = { fileName: string; type: string; code?: string; source?: string | Uint8Array }
async function built(mode: string, env: Record<string, string>): Promise<Output[]> {
  const before = { ...process.env }
  Object.assign(process.env, env)
  try {
    const result = await build({ mode, logLevel: 'silent', build: { write: false, outDir: 'dist-test' } })
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? (r.output as Output[]) : []))
    assert.ok(outputs.length > 0)
    return outputs
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]
    Object.assign(process.env, before)
  }
}
const scripts = (outputs: Output[]) => outputs.filter((o) => o.type === 'chunk').map((o) => o.code ?? '')
const pages = (outputs: Output[]) => outputs.filter((o) => o.fileName.endsWith('.html')).map((o) => String(o.source))

test('a normal build ships no capture clock, even with VITE_CAPTURE_AT set in the environment', async () => {
  const outputs = await built('production', { VITE_CAPTURE_AT: AT })
  const code = scripts(outputs).join('\n')
  assert.ok(code.length > 1000, 'the bundle is there')
  assert.ok(!code.includes(AT) && !code.includes('2026-11-19T10:30'), 'the pinned time is not in the bundle')
  assert.ok(!/PinnedDate|__CAPTURE_AT__/.test(code), 'neither is the shim')
})

test('only the capture mode pins the clock', async () => {
  const code = scripts(await built('capture', { VITE_CAPTURE_AT: AT })).join('\n')
  assert.ok(code.includes(AT), 'the capture build embeds the time')
})

test('every built page has its canonical and Open Graph address filled in, and no placeholder is left', async () => {
  const html = pages(await built('production', {}))
  assert.equal(html.length, 14, 'thirteen pages and the 404')
  for (const page of html) assert.ok(!/%[A-Z][A-Z0-9_]*%/.test(page), 'no %PLACEHOLDER% left')
  const home = html.find((page) => page.includes('<title>') && page.includes(`rel="canonical" href="${SITE}"`))
  assert.ok(home, 'the home page’s canonical is the published address')
  assert.ok(html.every((page) => !page.includes('href="/bayline/bayline/')), 'base placeholders in the partials are filled once')
  assert.ok(html.some((page) => page.includes('href="/bayline/visit/"')), 'links in the shared partials sit under the base path')
})

test('a production build stops with a clear message when VITE_SITE_URL is unset or still a placeholder', async () => {
  await assert.rejects(built('production', { VITE_SITE_URL: '' }), /VITE_SITE_URL is not set/)
  await assert.rejects(built('production', { VITE_SITE_URL: '%VITE_SITE_URL%' }), /still a placeholder/)
})
