import { expect, test } from 'vitest'
import { dueCheckIn, eventContext, LAST_ACTIVE_DAY_KEY, osMajorFromUserAgent, webDeviceKind } from './context.ts'
import { timingBucket } from './reading-timing.ts'
import { validEvent } from './schema.ts'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

test('local hour and weekday come from the device clock', () => {
  expect(eventContext(new Date(2026, 9, 29, 16, 5))).toEqual({ hour: 16, weekday: 'thu' })
  expect(eventContext(new Date(2026, 10, 1, 0, 0))).toEqual({ hour: 0, weekday: 'sun' })
})

test.each([
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15', 'iphone', 26],
  ['Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15', 'ipad', 18],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.1 Safari/605.1.15', 'ipad_or_mac', 0],
  ['Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36', 'android_phone', 15],
  ['Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36', 'android_tablet', 14],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0', 'windows', 0],
  ['Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) Chrome/141.0', 'chromebook', 0],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Firefox/144.0', 'linux', 0],
  ['Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15', 'other', 0],
] as const)('web device for %s', (agent, device, os) => {
  expect(webDeviceKind(agent)).toBe(device)
  expect(osMajorFromUserAgent(agent)).toBe(os)
})

test('check-in is due once per local day and marks the first of each month', () => {
  const storage = new MemoryStorage() as unknown as Storage
  const first = dueCheckIn(storage, new Date(2026, 9, 29, 9))
  expect(first?.first_this_month).toBe(true)
  first?.commit()
  expect(dueCheckIn(storage, new Date(2026, 9, 29, 22))).toBeNull()
  const nextDay = dueCheckIn(storage, new Date(2026, 9, 30, 8))
  expect(nextDay?.first_this_month).toBe(false)
  nextDay?.commit()
  expect(dueCheckIn(storage, new Date(2026, 10, 1, 8))?.first_this_month).toBe(true)
  expect([...((storage as unknown as MemoryStorage).values.keys())]).toEqual([LAST_ACTIVE_DAY_KEY])
})

test('an uncommitted check-in is retried on the next foreground', () => {
  const storage = new MemoryStorage() as unknown as Storage
  expect(dueCheckIn(storage, new Date(2026, 9, 29, 9))).not.toBeNull()
  expect(dueCheckIn(storage, new Date(2026, 9, 29, 10))).not.toBeNull()
})

test.each([
  [0, null, 'this_week'], [6, null, 'this_week'], [7, null, 'next_week'], [13, null, 'next_week'],
  [14, null, 'weeks_2_4'], [34, null, 'weeks_2_4'], [35, null, 'months_1_3'], [92, null, 'months_1_3'],
  [93, null, 'later'], [358, 2, 'last_week'], [3, 4, 'this_week'], [null, null, 'later'], [null, 5, 'last_week'],
] as const)('timing bucket for %s days ahead, %s days since last', (until, since, expected) => {
  expect(timingBucket(until, since)).toBe(expected)
})

test('app_active, coming_up_select and campaign values stay bounded', () => {
  expect(validEvent('app_active', { first_this_month: true, device: 'ipad', os: 26, app_version: '1.2', hour: 9, weekday: 'fri' })).toBe(true)
  expect(validEvent('app_active', { first_this_month: true, device: 'android_tablet', os: 14, app_version: 'web' })).toBe(true)
  expect(validEvent('app_active', { first_this_month: true, device: 'tablet', os: 26, app_version: '1.2' })).toBe(false)
  expect(validEvent('app_active', { first_this_month: true, device: 'watch', os: 26, app_version: '1.2' })).toBe(false)
  expect(validEvent('app_active', { first_this_month: true, device: 'ipad', os: 26, app_version: '1.2', region: 'US/New York' })).toBe(false)
  expect(validEvent('coming_up_select', { position: 2 })).toBe(true)
  expect(validEvent('coming_up_select', { position: 4 })).toBe(false)
  expect(validEvent('app_store_open', { campaign: 'tr-reader' })).toBe(true)
  expect(validEvent('app_store_open', { campaign: 'https://private' })).toBe(false)
  expect(validEvent('reader_open', { layout: 'reading', sides: 'one', route: 'parsha', timing: 'weeks_2_4' })).toBe(true)
  expect(validEvent('reader_open', { layout: 'reading', sides: 'one', route: 'parsha', timing: 'noach' })).toBe(false)
  expect(validEvent('playback_start', { timed: true, hour: 24, weekday: 'mon' })).toBe(false)
  expect(validEvent('playback_start', { timed: true, hour: 8.5, weekday: 'mon' })).toBe(false)
})
