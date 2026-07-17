import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import {
  renderServiceWorkerSource,
  shouldPrecache,
} from './generate-service-worker.mjs'

type FakeResponse = {
  ok: boolean
  status: number
  clone?: () => FakeResponse
}

function loadNetworkFirst({
  fetchResponse,
  fetchError,
  cachedResponse,
  fallbackResponse,
}: {
  fetchResponse?: FakeResponse
  fetchError?: Error
  cachedResponse?: FakeResponse
  fallbackResponse?: FakeResponse
}) {
  const match = vi.fn(async (request: unknown) =>
    request === '/index.html' ? fallbackResponse : cachedResponse
  )
  const context = {
    URL,
    fetch: vi.fn(async () => {
      if (fetchError) throw fetchError
      return fetchResponse
    }),
    caches: {
      match,
      open: vi.fn(async () => ({ put: vi.fn() })),
      keys: vi.fn(async () => []),
      delete: vi.fn(),
    },
    self: {
      addEventListener: vi.fn(),
      location: { origin: 'https://tikkun.test' },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
    },
  }
  vm.runInNewContext(
    `${renderServiceWorkerSource({
      buildHash: 'test',
      precacheUrls: ['/', '/index.html'],
    })}\nglobalThis.networkFirstForTest = networkFirst`,
    context
  )
  return (
    context as typeof context & {
      networkFirstForTest: (
        request: unknown,
        fallbackUrl: string
      ) => Promise<FakeResponse | undefined>
    }
  ).networkFirstForTest
}

test('navigation falls back for server errors and thrown network failures', async () => {
  const fallback = { ok: true, status: 200 }
  const serverFailure = { ok: false, status: 503 }
  await expect(
    loadNetworkFirst({
      fetchResponse: serverFailure,
      fallbackResponse: fallback,
    })({ url: '/route' }, '/index.html')
  ).resolves.toBe(fallback)

  await expect(
    loadNetworkFirst({
      fetchError: new Error('offline'),
      fallbackResponse: fallback,
    })({ url: '/route' }, '/index.html')
  ).resolves.toBe(fallback)
})

test('navigation preserves non-server HTTP responses and uncached server failures', async () => {
  const notFound = { ok: false, status: 404 }
  const serverFailure = { ok: false, status: 503 }
  await expect(
    loadNetworkFirst({ fetchResponse: notFound })(
      { url: '/missing' },
      '/index.html'
    )
  ).resolves.toBe(notFound)
  await expect(
    loadNetworkFirst({ fetchResponse: serverFailure })(
      { url: '/route' },
      '/index.html'
    )
  ).resolves.toBe(serverFailure)
})

test('precache excludes media and the generated service worker itself', () => {
  expect(shouldPrecache('assets/app.js')).toBe(true)
  expect(shouldPrecache('audio/reader/aliyah.m4a')).toBe(false)
  expect(shouldPrecache('assets/movie.mp4')).toBe(false)
  expect(shouldPrecache('service-worker.js')).toBe(false)
})
