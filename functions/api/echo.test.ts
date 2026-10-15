import { afterEach, expect, test, vi } from 'vitest'
import { onRequest } from './echo.ts'

const env = { TIKKUN_ANALYTICS_WEB_KEY: 'test-web-key', MELYTICS_RELAY_TOKEN: 'a'.repeat(64) }
const payload = { k: env.TIKKUN_ANALYTICS_WEB_KEY, u: 'https://tikkunreader.com/reader', e: 'playback_start', p: { timed: true }, w: 390 }
function request(body: unknown = payload, headers: Record<string, string> = {}) {
  return new Request('https://tikkunreader.com/api/echo', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.17',
    'CF-IPCountry': 'US', 'User-Agent': 'TestBrowser/1.0', ...headers,
  }, body: JSON.stringify(body) })
}
afterEach(() => vi.unstubAllGlobals())
test('forwards validated events with authenticated visitor headers and strips site credentials', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'X-Tikkun-Collector': '1' } }))
  vi.stubGlobal('fetch', fetch)
  expect((await onRequest({ request: request(payload, { Cookie: 'private', Authorization: 'Bearer private', 'X-Tikkun-Client-IP': 'spoofed' }), env })).status).toBe(204)
  expect(fetch).toHaveBeenCalledOnce()
  const [url, init] = fetch.mock.calls[0]
  expect(url).toBe('https://adamn.cc/api/tikkun-echo')
  expect(init.headers.get('Cookie')).toBeNull()
  expect(init.headers.get('Authorization')).toBeNull()
  expect(init.headers.get('X-Tikkun-Relay-Token')).toBe(env.MELYTICS_RELAY_TOKEN)
  expect(init.headers.get('X-Tikkun-Client-IP')).toBe('203.0.113.17')
  expect(init.headers.get('X-Tikkun-Country')).toBe('US')
  expect(JSON.parse(init.body)).toEqual(payload)
})
test.each([
  { ...payload, k: 'another-key' }, { ...payload, i: 'persistentvisitor' },
  { ...payload, u: 'https://unrelated.example/reader' }, { ...payload, u: 'https://tikkunreader.com/reader?secret=1' },
  { ...payload, u: 'https://tikkunreader.com/reader#private' }, { ...payload, u: 'https://tikkunreader.com/settings' },
  { ...payload, p: { timed: true, error: 'private' } }, { ...payload, r: 'https://referrer.test/person?email=secret' },
])('rejects unapproved payload %#', async body => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  expect((await onRequest({ request: request(body), env })).status).toBe(400)
  expect(fetch).not.toHaveBeenCalled()
})
test('rejects cross-origin requests, incorrect methods, and bodies over 32 KiB', async () => {
  expect((await onRequest({ request: request(payload, { Origin: 'https://foreign.example' }), env })).status).toBe(403)
  expect((await onRequest({ request: new Request('https://tikkunreader.com/api/echo'), env })).status).toBe(405)
  expect((await onRequest({ request: request({ value: 'x'.repeat(33000) }), env })).status).toBe(413)
})
test('missing configuration or trusted visitor header fails closed', async () => {
  expect((await onRequest({ request: request(), env: {} })).status).toBe(503)
  const noIp = request(); noIp.headers.delete('CF-Connecting-IP')
  expect((await onRequest({ request: noIp, env })).status).toBe(503)
})
test.each([new Response('<html/>'), new Response(null, { status: 204 })])('does not mistake a catch-all or unverified upstream response for success', async upstream => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstream))
  const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect((await onRequest({ request: request(), env })).status).toBe(502)
  warn.mockRestore()
})
