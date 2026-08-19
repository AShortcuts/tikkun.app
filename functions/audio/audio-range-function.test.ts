import { expect, test, vi } from 'vitest'
import {
  onRequest,
  type AudioRangeFunctionContext,
} from './[[path]].ts'

const audioBytes = Uint8Array.from([10, 20, 30, 40, 50, 60])

function context(
  range?: string,
  {
    method = 'GET',
    status = 200,
    assetResponse,
    ifRange,
  }: {
    method?: string
    status?: number
    assetResponse?: Response
    ifRange?: string
  } = {}
) {
  const headers = new Headers()
  if (range) headers.set('range', range)
  if (ifRange) headers.set('if-range', ifRange)
  const request = new Request('https://tikkun.test/audio/reader/sample.m4a', {
    method,
    headers,
  })
  const response =
    assetResponse ??
    new Response(status === 200 ? audioBytes : 'Missing', {
      status,
      headers: {
        'cache-control': 'public, max-age=0, must-revalidate',
        'content-length': status === 200 ? String(audioBytes.byteLength) : '7',
        'content-type': status === 200 ? 'audio/mp4' : 'text/plain',
        etag: '"sample"',
      },
    })
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    void input
    return response
  })

  return {
    value: {
      request,
      env: { ASSETS: { fetch } },
    } satisfies AudioRangeFunctionContext,
    fetch,
    assetResponse: response,
  }
}

function chunkedAssetResponse() {
  const chunks = [
    Uint8Array.from([10, 20]),
    Uint8Array.from([30, 40]),
    Uint8Array.from([50, 60]),
  ]
  const state = { bytesRead: 0, cancelled: false }
  let index = 0
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[index]
        if (!chunk) {
          controller.close()
          return
        }
        index += 1
        state.bytesRead += chunk.byteLength
        controller.enqueue(chunk)
      },
      cancel() {
        state.cancelled = true
      },
    },
    { highWaterMark: 0 }
  )

  return {
    response: new Response(body, {
      headers: {
        'content-length': String(audioBytes.byteLength),
        'content-type': 'audio/mp4',
        etag: '"sample"',
      },
    }),
    state,
  }
}

test('serves a satisfiable audio range as partial content', async () => {
  const fixture = context('bytes=1-3')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(206)
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('content-range')).toBe('bytes 1-3/6')
  expect(response.headers.get('content-length')).toBe('3')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    Uint8Array.from([20, 30, 40])
  )

  const assetRequest = fixture.fetch.mock.calls[0]?.[0]
  expect(assetRequest).toBeInstanceOf(Request)
  if (!(assetRequest instanceof Request)) throw new Error('Missing asset request')
  expect(assetRequest.headers.get('range')).toBe('bytes=1-3')
})

test('streams a prefix range without buffering or reading the remaining asset', async () => {
  const asset = chunkedAssetResponse()
  const fixture = context('bytes=0-1', { assetResponse: asset.response })
  const upstreamArrayBuffer = vi.spyOn(asset.response, 'arrayBuffer')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe('bytes 0-1/6')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    Uint8Array.from([10, 20])
  )
  expect(upstreamArrayBuffer).not.toHaveBeenCalled()
  expect(asset.state.bytesRead).toBe(2)
  expect(asset.state.cancelled).toBe(true)
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

test('rejects malformed and unsupported multiple ranges', async () => {
  const fixture = context('bytes=0-1,4-5')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(416)
  expect(response.headers.get('content-range')).toBe('bytes */6')
  expect(response.headers.get('content-length')).toBe('0')
})

test('ignores unsupported range units', async () => {
  const fixture = context('items=0-1')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(200)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes)
})

test('applies only a matching strong If-Range validator', async () => {
  const matching = context('bytes=1-3', { ifRange: '"sample"' })
  const partialResponse = await onRequest(matching.value)
  expect(partialResponse.status).toBe(206)

  const stale = context('bytes=1-3', { ifRange: '"old-sample"' })
  const fullResponse = await onRequest(stale.value)
  expect(fullResponse.status).toBe(200)
  expect(new Uint8Array(await fullResponse.arrayBuffer())).toEqual(audioBytes)
})

test('answers range HEAD requests with full metadata and no body', async () => {
  const fixture = context('bytes=1-3', { method: 'HEAD' })
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(200)
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  expect(response.headers.get('content-length')).toBe('6')
  expect((await response.arrayBuffer()).byteLength).toBe(0)

  const assetRequest = fixture.fetch.mock.calls[0]?.[0]
  expect(assetRequest).toBeInstanceOf(Request)
  if (!(assetRequest instanceof Request)) throw new Error('Missing asset request')
  expect(assetRequest.method).toBe('HEAD')
  expect(assetRequest.headers.has('range')).toBe(false)
})

test('passes through native upstream range responses', async () => {
  const fixture = context('bytes=1-3', {
    assetResponse: new Response(Uint8Array.from([20, 30, 40]), {
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-length': '3',
        'content-range': 'bytes 1-3/6',
        'content-type': 'audio/mp4',
      },
    }),
  })
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe('bytes 1-3/6')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    Uint8Array.from([20, 30, 40])
  )
})

test('streams a full response when upstream omits required range metadata', async () => {
  const fixture = context('bytes=1-3', {
    assetResponse: new Response(audioBytes, {
      headers: { 'content-type': 'audio/mp4' },
    }),
  })
  const upstreamArrayBuffer = vi.spyOn(fixture.assetResponse, 'arrayBuffer')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(200)
  expect(response.headers.has('accept-ranges')).toBe(false)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes)
  expect(upstreamArrayBuffer).not.toHaveBeenCalled()
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
