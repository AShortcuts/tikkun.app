import { expect, test, vi } from 'vitest'
import {
  onRequest,
  type AudioRangeFunctionContext,
} from './[[path]].ts'
import { parseHttpByteRange } from '../../app/audio/http-byte-range.ts'

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

function nativeRangeAsset() {
  const state = {
    activeRequests: 0,
    maxActiveRequests: 0,
    transferredBytes: 0,
  }
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    state.activeRequests += 1
    state.maxActiveRequests = Math.max(
      state.maxActiveRequests,
      state.activeRequests
    )
    await Promise.resolve()

    try {
      const request = input instanceof Request ? input : new Request(input)
      const rangeHeader = request.headers.get('range')
      const headers = new Headers({
        'accept-ranges': 'bytes',
        'content-type': 'audio/mp4',
        etag: '"sample"',
      })
      if (request.method === 'HEAD' || !rangeHeader) {
        headers.set('content-length', String(audioBytes.byteLength))
        return new Response(request.method === 'HEAD' ? null : audioBytes, {
          headers,
        })
      }

      const range = parseHttpByteRange(rangeHeader, audioBytes.byteLength)
      if (!range) {
        headers.set('content-length', '0')
        headers.set('content-range', `bytes */${audioBytes.byteLength}`)
        return new Response(null, { status: 416, headers })
      }

      const body = audioBytes.slice(range.start, range.end + 1)
      state.transferredBytes += body.byteLength
      headers.set('content-length', String(body.byteLength))
      headers.set(
        'content-range',
        `bytes ${range.start}-${range.end}/${audioBytes.byteLength}`
      )
      return new Response(body, { status: 206, headers })
    } finally {
      state.activeRequests -= 1
    }
  })

  return { fetch, state }
}

function nativeContext(
  asset: ReturnType<typeof nativeRangeAsset>,
  range: string
): AudioRangeFunctionContext {
  return {
    request: new Request('https://tikkun.test/audio/reader/sample.m4a', {
      headers: { range },
    }),
    env: { ASSETS: { fetch: asset.fetch } },
  }
}

test('does not synthesize a partial response when upstream ignores Range', async () => {
  const fixture = context('bytes=1-3')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(200)
  expect(response.headers.has('accept-ranges')).toBe(false)
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.has('content-range')).toBe(false)
  expect(response.headers.get('content-length')).toBe('6')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes)

  const assetRequest = fixture.fetch.mock.calls[0]?.[0]
  expect(assetRequest).toBeInstanceOf(Request)
  if (!(assetRequest instanceof Request)) throw new Error('Missing asset request')
  expect(assetRequest.headers.get('range')).toBe('bytes=1-3')
})

test('streams an ignored range without a prefix-discard transform', async () => {
  const asset = chunkedAssetResponse()
  const fixture = context('bytes=4-5', { assetResponse: asset.response })
  const upstreamArrayBuffer = vi.spyOn(asset.response, 'arrayBuffer')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(200)
  expect(response.headers.has('accept-ranges')).toBe(false)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes)
  expect(upstreamArrayBuffer).not.toHaveBeenCalled()
  expect(asset.state.bytesRead).toBe(audioBytes.byteLength)
  expect(asset.state.cancelled).toBe(false)
})

test('serves suffix ranges used to read media metadata at the end of a file', async () => {
  const asset = nativeRangeAsset()
  const response = await onRequest(nativeContext(asset, 'bytes=-2'))

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
  const matching = context('bytes=1-3', {
    ifRange: '"sample"',
    assetResponse: new Response(Uint8Array.from([20, 30, 40]), {
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-length': '3',
        'content-range': 'bytes 1-3/6',
        etag: '"sample"',
      },
    }),
  })
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
  expect(response.headers.has('accept-ranges')).toBe(false)
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

test('keeps concurrent seeks native and proportional', async () => {
  const asset = nativeRangeAsset()
  const responses = await Promise.all([
    onRequest(nativeContext(asset, 'bytes=0-1')),
    onRequest(nativeContext(asset, 'bytes=2-3')),
    onRequest(nativeContext(asset, 'bytes=-2')),
  ])
  const bodies = await Promise.all(
    responses.map(async (response) =>
      Array.from(new Uint8Array(await response.arrayBuffer()))
    )
  )

  expect(responses.map((response) => response.status)).toEqual([206, 206, 206])
  expect(bodies).toEqual([
    [10, 20],
    [30, 40],
    [50, 60],
  ])
  expect(asset.fetch).toHaveBeenCalledTimes(3)
  expect(asset.state.maxActiveRequests).toBe(3)
  expect(asset.state.transferredBytes).toBe(6)
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

test('streams ordinary audio requests without inventing range support', async () => {
  const fixture = context()
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(200)
  expect(response.headers.has('accept-ranges')).toBe(false)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes)
  expect(fixture.fetch).toHaveBeenCalledWith(fixture.value.request)
})

test('preserves upstream errors instead of shaping them as media responses', async () => {
  const fixture = context('bytes=0-1', { status: 404 })
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(404)
  expect(await response.text()).toBe('Missing')
})
