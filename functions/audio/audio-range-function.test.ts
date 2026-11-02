import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import {
  onRequest,
  type AudioRangeFunctionContext,
} from './[[path]].ts'
import { audioRecordings } from '../../generated/audio-manifest.ts'

const audioBytes = Uint8Array.from([10, 20, 30, 40, 50, 60])

// Node's standard minimum-read option models Cloudflare's native extension.
beforeAll(() => {
  ReadableStreamBYOBReader.prototype.readAtLeast = function (minBytes, view) {
    const read: (view: Uint8Array<ArrayBuffer>, options: { min: number }) =>
      Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>> = this.read.bind(this)
    return read(view, { min: minBytes })
  }
})
afterAll(() => Reflect.deleteProperty(ReadableStreamBYOBReader.prototype, 'readAtLeast'))

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
  const body = new ReadableStream(
    {
      type: 'bytes',
      pull(controller) {
        const chunk = chunks[index]
        if (!chunk) {
          controller.close()
          controller.byobRequest?.respond(0)
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

test.each(['GET'])('uses published asset size when Pages omits Content-Length (%s)', async (method) => {
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

test('preserves upstream errors instead of shaping them as media responses', async () => {
  const fixture = context('bytes=0-1', { status: 404 })
  const response = await onRequest(fixture.value)

  expect(response.status).toBe(404)
  expect(await response.text()).toBe('Missing')
})

test('reports an unpublished recording instead of serving the app shell as audio', async () => {
  const shell = new Response('<!doctype html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })
  const response = await onRequest(context(undefined, { assetResponse: shell }).value)

  expect(response.status).toBe(404)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.text()).toBe('Recording not found')
})

test.each([['bytes=3-', [40, 50, 60], 'bytes 3-5/6']])('handles native player range %s', async (range, bytes, contentRange) => {
  const response = await onRequest(context(range).value)
  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe(contentRange)
  expect(response.headers.get('content-length')).toBe(String(bytes.length))
  expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(bytes)
})

test('stops upstream reads when the player cancels a seek', async () => {
  let bytesRead = 0
  let cancelled = false
  const source = new ReadableStream({
    type: 'bytes',
    pull(controller) {
      bytesRead += 1024
      controller.enqueue(new Uint8Array(1024))
    },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  const response = await onRequest(context('bytes=0-4194303', {
    assetResponse: new Response(source, { headers: { 'content-length': '4194304' } }),
  }).value)
  const reader = response.body!.getReader()
  expect((await reader.read()).value!.byteLength).toBe(1024 * 1024)
  await reader.cancel('Seek replaced')
  await vi.waitFor(() => expect(cancelled).toBe(true))
  expect(bytesRead).toBeLessThanOrEqual(2 * 1024 * 1024)
})

test('fails a truncated asset instead of silently returning a short range', async () => {
  const assetResponse = new Response(audioBytes.slice(0, 2), {
    headers: { 'content-length': '6' },
  })
  const response = await onRequest(context('bytes=0-5', { assetResponse }).value)
  await expect(response.arrayBuffer()).rejects.toThrow()
})

test('redirects the earlier unnumbered recording URLs to the numbered library paths', async () => {
  const recording = audioRecordings.find((recording) => recording.status === 'available')!
  const legacyPath = recording.playSrc.replace(/\/\d{2}%20/, '/')
  expect(legacyPath).not.toBe(recording.playSrc)
  const fixture = context('bytes=0-1')
  fixture.value.request = new Request(`https://tikkun.test${legacyPath}?tikkun-media=${recording.mediaIdentity!.digest}`, {
    headers: { range: 'bytes=0-1' },
  })
  const response = await onRequest(fixture.value)
  expect(response.status).toBe(301)
  expect(response.headers.get('location')).toBe(`https://tikkun.test${recording.playSrc}?tikkun-media=${recording.mediaIdentity!.digest}`)
  expect(fixture.fetch).not.toHaveBeenCalled()

  const current = context('bytes=0-1')
  current.value.request = new Request(`https://tikkun.test${recording.playSrc}`, { headers: { range: 'bytes=0-1' } })
  expect((await onRequest(current.value)).status).toBe(206)
})
