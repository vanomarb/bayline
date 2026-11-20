import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SITE_BASE, checkSiteUrl, leftoverPlaceholders } from './site.ts'

test('the build guard accepts the published address and names what to fix otherwise', () => {
  assert.equal(checkSiteUrl('https://example.com/bayline/'), 'https://example.com/bayline/')
  assert.throws(() => checkSiteUrl(undefined), /VITE_SITE_URL is not set\. Set VITE_SITE_URL in \.env/)
  assert.throws(() => checkSiteUrl('  '), /not set/)
  assert.throws(() => checkSiteUrl('%VITE_SITE_URL%'), /still a placeholder/)
  assert.throws(() => checkSiteUrl('example.com/bayline/'), /is not an address/)
  assert.throws(() => checkSiteUrl('ftp://example.com/bayline/'), /must start with https/)
  assert.throws(() => checkSiteUrl('https://example.com/'), new RegExp(`must end in ${SITE_BASE}`))
})

test('a placeholder left in a built page is found, once each', () => {
  assert.deepEqual(leftoverPlaceholders('<link href="%VITE_SITE_URL%x"><a href="%BASE_URL%a"><b href="%VITE_SITE_URL%y">'), ['%VITE_SITE_URL%', '%BASE_URL%'])
  assert.deepEqual(leftoverPlaceholders('<p>100% sure, 5% off</p>'), [])
})
