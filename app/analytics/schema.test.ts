import { expect, test } from 'vitest'
import { analyticsConfig } from './config.ts'
import { analyticsPath, validEvent } from './schema.ts'

test('configuration defaults to no collection and rejects a shared property key', () => {
  expect(analyticsConfig({})).toMatchObject({ webKey: '', appKey: '' })
  expect(() => analyticsConfig({ TIKKUN_ANALYTICS_WEB_KEY: 'same', TIKKUN_ANALYTICS_APP_KEY: 'same' })).toThrow('separate')
})
test.each(['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com/?token=x'])('rejects unsafe analytics origin %s', value => {
  expect(() => analyticsConfig({ TIKKUN_ANALYTICS_SITE_ORIGIN: value })).toThrow()
})
test.each(['/settings/', '/prototypes/print/', '/print/document/', '/unknown/person@example.com', '/reader/?recording=1&audioId=private', '/reader/#/about/cue-analytics', '/reader/?token=secret'])('excludes sensitive and internal route %s', path => {
  expect(analyticsPath(new URL(path, 'https://tikkunreader.com'))).toBeNull()
})
test('normalizes public routes without emitting queries or fragments', () => {
  expect(analyticsPath(new URL('https://tikkunreader.com/reader/?utm_source=newsletter#/torah/parsha/noach/1-6-9'))).toBe('/reader')
})
test('event boundary rejects text, extra properties, nonfinite values and unknown events', () => {
  expect(validEvent('search_results', { surface: 'overlay', results: 'none' })).toBe(true)
  expect(validEvent('search_results', { surface: 'overlay', results: 'none', query: 'private' })).toBe(false)
  expect(validEvent('playback_listened', { seconds: Infinity })).toBe(false)
  expect(validEvent('playback_listened', { seconds: -1 })).toBe(false)
  expect(validEvent('share_reading', { outcome: 'https://secret' })).toBe(false)
  expect(validEvent('__proto__', {})).toBe(false)
  expect(validEvent('unregistered', {})).toBe(false)
})
