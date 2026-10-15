import { afterEach, expect, test, vi } from 'vitest'
import { CapacitorHttp } from '@capacitor/core'
import { analyticsTransport } from './transport.ts'
import { analyticsConfig } from './config.ts'
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { post: vi.fn() } }))

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const config = analyticsConfig({})
const payload = { k: 'test', u: 'https://tikkunreader.com/reader' }
test('browser transport omits credentials and referrer, bounds requests, and rejects false success', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  await analyticsTransport(config, false)(payload)
  expect(fetch).toHaveBeenCalledWith('/api/echo', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, redirect: 'error', body: JSON.stringify(payload) }))
  fetch.mockResolvedValue(new Response('<html/>'))
  await expect(analyticsTransport(config, false)(payload)).rejects.toThrow('rejected')
})
test('app uses native HTTP without changing browser fetch or sharing the website key', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone)' })
  const post = vi.mocked(CapacitorHttp.post).mockResolvedValue({ status: 204, data: '', headers: {}, url: config.appCollector })
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  await analyticsTransport(config, true)(payload)
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://adamn.cc/api/echo', data: payload,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'TikkunReader/1.0 Mozilla/5.0 (iPhone)' },
    connectTimeout: 5000, readTimeout: 5000, disableRedirects: true }))
  expect(fetch).not.toHaveBeenCalled()
})
