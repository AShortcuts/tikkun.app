import { expect, test, vi } from 'vitest'
import {
  onRequest,
  type AudioRangeFunctionContext,
} from './[[path]].ts'

const audioBytes = Uint8Array.from([10, 20, 30, 40, 50, 60])

function context(
  range?: string,
  { method = 'GET', status = 200 }: { method?: string; status?: number } = {}
) {
  const headers = new Headers()
  if (range) headers.set('range', range)
  const request = new Request('https://tikkun.test/audio/reader/sample.m4a', {
    method,
    headers,
  })
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    void input
    return new Response(status === 200 ? audioBytes : 'Missing', {
      status,
      headers: {
        'cache-control': 'public, max-age=0, must-revalidate',
        'content-type': status === 200 ? 'audio/mp4' : 'text/plain',
        etag: '"sample"',
      },
    })
  })

  return {
    value: {
      request,
      env: { ASSETS: { fetch } },
    } satisfies AudioRangeFunctionContext,
    fetch,
  }
}

test('serves a satisfiable audio range as partial content', async () => {
  const fixture = context('bytes=1-3')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(206)
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  expect(response.headers.get('content-range')).toBe('bytes 1-3/6')
  expect(response.headers.get('content-length')).toBe('3')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    Uint8Array.from([20, 30, 40])
  )

  const assetRequest = fixture.fetch.mock.calls[0]?.[0]
  expect(assetRequest).toBeInstanceOf(Request)
  if (!(assetRequest instanceof Request)) throw new Error('Missing asset request')
  expect(assetRequest.headers.has('range')).toBe(false)
})

test('serves suffix ranges used to read media metadata at the end of a file', async () => {
  const fixture = context('bytes=-2')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe('bytes 4-5/6')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    Uint8Array.from([50, 60])
  )
})

test('rejects an unsatisfiable range without returning the full asset', async () => {
  const fixture = context('bytes=6-')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(416)
  expect(response.headers.get('content-range')).toBe('bytes */6')
  expect(response.headers.get('content-length')).toBe('0')
  expect((await response.arrayBuffer()).byteLength).toBe(0)
})

test('streams ordinary audio requests and advertises range support', async () => {
  const fixture = context()
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(200)
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes)
  expect(fixture.fetch).toHaveBeenCalledWith(fixture.value.request)
})

test('preserves upstream errors instead of shaping them as media responses', async () => {
  const fixture = context('bytes=0-1', { status: 404 })
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(404)
  expect(await response.text()).toBe('Missing')
})
