import { expect, test, vi } from 'vitest'
import { onRequest } from './[[path]].ts'

test('missing updates return a real 404 with native CORS instead of the Pages HTML fallback', async () => {
  const response = await onRequest({ request: new Request('https://tikkunreader.com/updates/web/6/latest.json'),
    env: { ASSETS: { fetch: async () => new Response('<html>Home</html>', { headers: { 'content-type': 'text/html' } }) } } })
  expect(response.status).toBe(404)
  expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
  expect(response.headers.get('cache-control')).toBe('no-store')
})
test('manifests are never cached, immutable artifacts are cached, unexpected paths are rejected', async () => {
  const fetch = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
  const call = (path: string) => onRequest({ request: new Request(`https://tikkunreader.com/updates/${path}`), env: { ASSETS: { fetch } } })
  expect((await call('web/6/latest.json')).headers.get('cache-control')).toBe('no-store')
  expect((await call(`web/6/${'a'.repeat(64)}.zip`)).headers.get('cache-control')).toContain('immutable')
  expect((await call('web/6/private.pem')).status).toBe(404)
  expect(fetch).toHaveBeenCalledTimes(2)
})
