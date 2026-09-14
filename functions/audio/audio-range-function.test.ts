import { beforeEach, expect, test, vi } from 'vitest'
import {
  onRequest,
  type AudioRangeFunctionContext,
} from './[[path]].ts'
import { audioRecordings } from '../../generated/audio-manifest.ts'

const audioBytes = Uint8Array.from([10, 20, 30, 40, 50, 60])

// Node lacks Cloudflare's fixed-length stream; the edge-runtime smoke check
// additionally verifies that Content-Length survives actual HTTP transport.
beforeEach(() => vi.stubGlobal('FixedLengthStream', class extends TransformStream {
  constructor() { super() }
}))

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

test('serves exact partial bytes when Pages returns the full asset', async () => {
  const fixture = context('bytes=1-3')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(206)
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('content-range')).toBe('bytes 1-3/6')
  expect(response.headers.get('content-length')).toBe('3')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes.slice(1, 4))

  const assetRequest = fixture.fetch.mock.calls[0]?.[0]
  expect(assetRequest).toBeInstanceOf(Request)
  if (!(assetRequest instanceof Request)) throw new Error('Missing asset request')
  expect(assetRequest.headers.has('range')).toBe(false)
})

test('streams across chunk boundaries without buffering the full asset', async () => {
  const asset = chunkedAssetResponse()
  const fixture = context('bytes=1-2', { assetResponse: asset.response })
  const upstreamArrayBuffer = vi.spyOn(asset.response, 'arrayBuffer')
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(206)
  expect(asset.state.bytesRead).toBeLessThanOrEqual(4)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes.slice(1, 3))
  expect(upstreamArrayBuffer).not.toHaveBeenCalled()
  expect(asset.state.bytesRead).toBe(4)
  expect(asset.state.cancelled).toBe(true)
})

test('serves suffix ranges used to read media metadata at the end of a file', async () => {
  const response = await onRequest(context('bytes=-2').value)

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
  })
  const partialResponse = await onRequest(matching.value)
  expect(partialResponse.status).toBe(206)
  expect(new Uint8Array(await partialResponse.arrayBuffer())).toEqual(audioBytes.slice(1, 4))
  const forwarded = matching.fetch.mock.calls[0]?.[0]
  expect(forwarded).toBeInstanceOf(Request)
  if (!(forwarded instanceof Request)) throw new Error('Missing asset request')
  expect(forwarded.headers.has('if-range')).toBe(false)

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

test('keeps concurrent range streams independent', async () => {
  const responses = await Promise.all([
    onRequest(context('bytes=0-1').value),
    onRequest(context('bytes=2-3').value),
    onRequest(context('bytes=-2').value),
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

test.each(['GET', 'HEAD'])('uses published asset size when Pages omits Content-Length (%s)', async (method) => {
  const recording = audioRecordings.find((recording) => recording.status === 'available')!
  const fixture = context('bytes=0-1', {
    method,
    assetResponse: new Response(method === 'HEAD' ? null : audioBytes, {
      headers: { 'content-type': 'audio/mp4' },
    }),
  })
  fixture.value.request = new Request(`https://tikkun.test${recording.playSrc}?tikkun-media=${recording.mediaIdentity!.digest}`, {
    method, headers: { range: 'bytes=0-1' },
  })
  const response = await onRequest(fixture.value)
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  if (method === 'HEAD') {
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(recording.mediaIdentity!.byteLength))
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  } else {
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 0-1/${recording.mediaIdentity!.byteLength}`)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes.slice(0, 2))
  }
})

test('streams ordinary downloads and advertises available range support', async () => {
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

test.each([
  ['bytes=0-1', [10, 20], 'bytes 0-1/6'],
  ['bytes=3-', [40, 50, 60], 'bytes 3-5/6'],
  ['bytes=4-999', [50, 60], 'bytes 4-5/6'],
  ['bytes=-999', [10, 20, 30, 40, 50, 60], 'bytes 0-5/6'],
])('handles native player range %s', async (range, bytes, contentRange) => {
  const response = await onRequest(context(range).value)
  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe(contentRange)
  expect(response.headers.get('content-length')).toBe(String(bytes.length))
  expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(bytes)
})

test('stops upstream reads when the player cancels a seek', async () => {
  const asset = chunkedAssetResponse()
  const response = await onRequest(context('bytes=0-5', { assetResponse: asset.response }).value)
  const reader = response.body!.getReader()
  expect((await reader.read()).value).toEqual(audioBytes.slice(0, 2))
  await reader.cancel('Seek replaced')
  await vi.waitFor(() => expect(asset.state.cancelled).toBe(true))
  expect(asset.state.bytesRead).toBeLessThanOrEqual(4)
})

test('fails a truncated asset instead of silently returning a short range', async () => {
  const assetResponse = new Response(audioBytes.slice(0, 2), {
    headers: { 'content-length': '6' },
  })
  const response = await onRequest(context('bytes=0-5', { assetResponse }).value)
  await expect(response.arrayBuffer()).rejects.toThrow('Audio asset ended')
})

test('propagates an upstream stream failure', async () => {
  const assetResponse = new Response(new ReadableStream({
    pull() { throw new Error('Asset disconnected') },
  }), { headers: { 'content-length': '6' } })
  const response = await onRequest(context('bytes=0-1', { assetResponse }).value)
  await expect(response.arrayBuffer()).rejects.toThrow('Asset disconnected')
})

test('keeps a complete range successful if upstream cancellation fails', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const assetResponse = new Response(new ReadableStream({
    start(controller) { controller.enqueue(audioBytes) },
    cancel() { throw new Error('Upstream already disconnected') },
  }), { headers: { 'content-length': '6' } })
  try {
    const response = await onRequest(context('bytes=0-1', { assetResponse }).value)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes.slice(0, 2))
    expect(warning).toHaveBeenCalledOnce()
  } finally {
    warning.mockRestore()
  }
})

test('does not slice compressed representations', async () => {
  const assetResponse = new Response(audioBytes, {
    headers: { 'content-length': '6', 'content-encoding': 'gzip' },
  })
  const response = await onRequest(context('bytes=0-1', { assetResponse }).value)
  expect(response.status).toBe(200)
  expect(response.headers.has('accept-ranges')).toBe(false)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audioBytes)
})

test('preserves versioned URLs and request preconditions while removing range headers', async () => {
  const fixture = context('bytes=0-1', { ifRange: 'W/"sample"' })
  fixture.value.request = new Request('https://tikkun.test/audio/sample.m4a?tikkun-media=abc', {
    headers: { range: 'bytes=0-1', 'if-range': 'W/"sample"', 'if-none-match': '"old"' },
  })
  const response = await onRequest(fixture.value)
  expect(response.status).toBe(200)
  const forwarded = fixture.fetch.mock.calls[0]?.[0]
  if (!(forwarded instanceof Request)) throw new Error('Missing asset request')
  expect(forwarded.url).toBe(fixture.value.request.url)
  expect(forwarded.headers.get('if-none-match')).toBe('"old"')
  expect(forwarded.headers.has('range')).toBe(false)
  expect(forwarded.headers.has('if-range')).toBe(false)
  expect(fixture.value.request.headers.has('range')).toBe(true)
})
