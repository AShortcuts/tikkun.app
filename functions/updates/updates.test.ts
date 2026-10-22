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
  expect((await call('index.json')).headers.get('cache-control')).toBe('no-store')
  expect((await call(`web/6/${'a'.repeat(64)}.zip`)).headers.get('cache-control')).toContain('immutable')
  expect((await call('web/6/private.pem')).status).toBe(404)
  expect(fetch).toHaveBeenCalledTimes(3)
})

test('new native versions can restart at build 1 without colliding with older feeds', async () => {
  const fetch = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
  const call = (feed: string) => onRequest({ request: new Request(`https://tikkunreader.com/updates/web/${feed}/latest.json`),
    env: { ASSETS: { fetch } } })
  for (const feed of ['1', '1.2-1', '1.3-1', '1.2.1-10']) expect((await call(feed)).status).toBe(200)
  for (const feed of ['invalid', '1.2.-1', '1.2-1/private.pem']) expect((await call(feed)).status).toBe(404)
  expect(fetch).toHaveBeenCalledTimes(4)
})
