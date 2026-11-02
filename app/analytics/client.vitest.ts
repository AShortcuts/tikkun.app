import { afterEach, expect, test, vi } from 'vitest'
import { createAnalyticsClient, type AnalyticsClient, type AnalyticsPayload } from './client.ts'
import { ANALYTICS_PREFERENCE_KEY, setAnalyticsAllowed } from './preferences.ts'
import { LAST_ACTIVE_DAY_KEY, type DeviceFacts } from './context.ts'

let client: AnalyticsClient | undefined
// The client reads the page only through view.location, so tests move this stand-in rather than the
// real history: WebKit allows 100 replaceState calls per 10 seconds across the whole test page.
let pageUrl = new URL('/reader/#/torah/parsha/noach/1-6-9', location.origin)
const navigate = (path: string) => { pageUrl = new URL(path, location.origin) }
const view = new Proxy(window, {
  get: (target, property) => {
    if (property === 'location') return pageUrl
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
}) as Window & typeof globalThis
const originalPreference = localStorage.getItem(ANALYTICS_PREFERENCE_KEY)
const originalDnt = Object.getOwnPropertyDescriptor(navigator, 'doNotTrack')
const originalGpc = Object.getOwnPropertyDescriptor(navigator, 'globalPrivacyControl')
const dnt = (value: string | null) => Object.defineProperty(navigator, 'doNotTrack', { configurable: true, get: () => value })
afterEach(() => {
  client?.destroy(); client = undefined
  vi.restoreAllMocks()
  setAnalyticsAllowed(window, true)
  localStorage.removeItem(LAST_ACTIVE_DAY_KEY)
  if (originalPreference === null) localStorage.removeItem(ANALYTICS_PREFERENCE_KEY)
  else localStorage.setItem(ANALYTICS_PREFERENCE_KEY, originalPreference)
  if (originalDnt) Object.defineProperty(navigator, 'doNotTrack', originalDnt)
  else Reflect.deleteProperty(navigator, 'doNotTrack')
  if (originalGpc) Object.defineProperty(navigator, 'globalPrivacyControl', originalGpc)
  else Reflect.deleteProperty(navigator, 'globalPrivacyControl')
})
function fixture(options: { native?: boolean; enabled?: boolean; host?: string; appSurface?: boolean; date?: Date; deviceFacts?: () => Promise<DeviceFacts> } = {}) {
  const sent: AnalyticsPayload[] = []
  let clock = 0
  let date = options.date ?? new Date(2026, 9, 29, 16, 5)
  navigate('/reader/#/torah/parsha/noach/1-6-9')
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  dnt(null)
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, get: () => false })
  setAnalyticsAllowed(window, true)
  client = createAnalyticsClient({ view, native: options.native ?? false, enabled: options.enabled ?? true,
    config: { webKey: 'website', appKey: 'native', siteOrigin: options.host ?? location.origin, appOrigin: 'https://app.tikkunreader.com', appCollector: 'https://adamn.cc/api/echo' },
    send: async payload => { sent.push(payload) }, now: () => clock,
    clock: () => date, appSurface: options.appSurface ?? false,
    deviceFacts: options.deviceFacts ?? (async () => ({ device: 'ipad', os: 26, app_version: '1.2' })),
  })
  return { sent, client, advance: (ms: number) => { clock += ms }, setDate: (value: Date) => { date = value },
    settle: async () => { for (let i = 0; i < 6; i++) await Promise.resolve() } }
}
test('initial hydration and hash navigation do not duplicate pageviews or leak passage URLs', async () => {
  const f = fixture()
  f.client.page(); f.client.page()
  navigate('/reader/#/torah/parsha/beresheet/1-1-1')
  f.client.page()
  f.client.track('search_results', { surface: 'overlay', results: 'none' })
  await f.settle()
  expect(f.sent).toHaveLength(2)
  expect(f.sent.filter(p => !p.e)).toHaveLength(1)
  expect(f.sent.every(p => p.u === `${location.origin}/reader`)).toBe(true)
  expect(JSON.stringify(f.sent)).not.toMatch(/beresheet|noach|1-1-1/)
})
test('opt-out stops queued and later events; opting back in does not replay them', async () => {
  const f = fixture(); f.client.page()
  setAnalyticsAllowed(window, false); await f.settle()
  f.client.track('download_start'); await f.settle()
  expect(f.sent).toEqual([])
  setAnalyticsAllowed(window, true); await f.settle()
  expect(f.sent).toHaveLength(1)
  expect(f.sent[0].e).toBeUndefined()
})
test.each([{ enabled: false }])('disabled or non-production runtime stays quiet: %j', async options => {
  const f = fixture(options); f.client.page(); f.client.track('download_start'); await f.settle()
  expect(f.sent).toEqual([])
})
test('internal routes never collect custom events', async () => {
  const f = fixture(); navigate('/settings/?private=value')
  f.client.page(); f.client.track('client_error', { kind: 'uncaught' }); await f.settle()
  expect(f.sent).toEqual([])
})
test('unreadable preferences fail closed; an unsavable opt-out still applies to this session', async () => {
  const f = fixture()
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  f.client.page(); f.client.track('download_start'); await f.settle()
  expect(f.sent).toEqual([])
  read.mockRestore()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => setAnalyticsAllowed(window, false)).toThrow('blocked')
  f.client.track('download_start'); await f.settle()
  expect(f.sent).toEqual([])
})
test('websites and opted-out devices never check in; a failed device lookup retries later', async () => {
  const site = fixture(); await site.settle()
  expect(site.sent.some(p => p.e === 'app_active')).toBe(false)
  client?.destroy()
  setAnalyticsAllowed(window, false)
  const optedOut = fixture({ appSurface: true }); setAnalyticsAllowed(window, false); await optedOut.settle()
  expect(optedOut.sent).toEqual([])
  expect(localStorage.getItem(LAST_ACTIVE_DAY_KEY)).toBeNull()
  client?.destroy()
  const failing = fixture({ appSurface: true, deviceFacts: () => Promise.reject(new Error('old build')) }); await failing.settle()
  expect(failing.sent.some(p => p.e === 'app_active')).toBe(false)
  expect(localStorage.getItem(LAST_ACTIVE_DAY_KEY)).toBeNull()
})
