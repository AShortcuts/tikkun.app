import { parseHttpByteRange } from '../../app/audio/http-byte-range.ts'
import { audioRecordings } from '../../generated/audio-manifest.ts'
import { rangeAudioRecordings } from '../../app/data/range-audio-manifest.ts'

// Cloudflare uses this stream's byte count for Content-Length on the wire.
declare const FixedLengthStream: new (length: number) => TransformStream<Uint8Array, Uint8Array>

const publishedLengths = new Map([...audioRecordings, ...rangeAudioRecordings]
  .filter((recording) => recording.status === 'available' && recording.mediaIdentity)
  .map((recording) => [recording.playSrc, recording.mediaIdentity!.byteLength]))

interface AssetFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface AudioRangeFunctionContext {
  request: Request
  env: {
    ASSETS: AssetFetcher
  }
}

function requestWithoutRange(request: Request) {
  const assetRequest = new Request(request)
  assetRequest.headers.delete('if-range')
  assetRequest.headers.delete('range')
  return assetRequest
}

function mediaHeaders(response: Response, advertiseRanges = false) {
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  if (advertiseRanges) headers.set('accept-ranges', 'bytes')
  else headers.delete('accept-ranges')
  return headers
}

function forwardAsset(
  response: Response,
  method: string,
  advertiseRanges =
    response.status === 206 ||
    response.headers.get('accept-ranges')?.toLowerCase() === 'bytes',
  length: number | null = null,
) {
  const headers = mediaHeaders(response, advertiseRanges)
  if (length !== null) headers.set('content-length', String(length))
  const body = method === 'HEAD' ? null : response.body
  return new Response(body && length !== null ? body.pipeThrough(new FixedLengthStream(length)) : body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function responseContentLength(response: Response, request: Request) {
  const header = response.headers.get('content-length')
  // Pages can omit Content-Length inside ASSETS.fetch. The generated catalogue
  // travels with these exact assets and already records their verified sizes.
  if (header === null && response.headers.get('content-type')?.startsWith('audio/')) {
    return publishedLengths.get(new URL(request.url).pathname) ?? null
  }
  if (!header || !/^\d+$/.test(header)) return null

  const length = Number(header)
  return Number.isSafeInteger(length) ? length : null
}

function canSliceIdentityResponse(response: Response) {
  const contentEncoding = response.headers.get('content-encoding')
  return !contentEncoding || contentEncoding.toLowerCase() === 'identity'
}

function isByteRangeHeader(header: string) {
  return /^bytes=/i.test(header.trim())
}

function ifRangeMatches(request: Request, response: Response) {
  const validator = request.headers.get('if-range')
  if (!validator) return true

  if (validator.startsWith('"') || validator.startsWith('W/"')) {
    const etag = response.headers.get('etag')
    return Boolean(
      etag &&
        !validator.startsWith('W/') &&
        !etag.startsWith('W/') &&
        validator === etag
    )
  }

  return response.headers.get('last-modified') === validator
}

function streamRange(body: ReadableStream<Uint8Array>, start: number, end: number) {
  const reader = body.getReader()
  let offset = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (offset <= end) {
        const { done, value } = await reader.read()
        if (done) {
          controller.error(new Error('Audio asset ended before the requested range.'))
          return
        }
        const chunkStart = offset
        offset += value.byteLength
        if (offset <= start) continue
        controller.enqueue(value.subarray(
          Math.max(0, start - chunkStart),
          Math.min(value.byteLength, end + 1 - chunkStart),
        ))
        if (offset > end) {
          controller.close()
          try {
            await reader.cancel('Audio range complete')
          } catch (error) {
            console.warn('Could not cancel completed audio source', error)
          }
        }
        return
      }
    },
    cancel: (reason) => reader.cancel(reason),
  }, { highWaterMark: 0 })
}

function rangeNotSatisfiable(response: Response, totalLength: number) {
  const headers = mediaHeaders(response, false)
  headers.delete('content-encoding')
  headers.set('content-length', '0')
  headers.set('content-range', `bytes */${totalLength}`)
  return new Response(null, {
    status: 416,
    statusText: 'Range Not Satisfiable',
    headers,
  })
}

export async function onRequest({
  request,
  env,
}: AudioRangeFunctionContext): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return env.ASSETS.fetch(request)
  }

  const rangeHeader = request.headers.get('range')
  // Pages ignores Range and bypasses its asset cache for ranged requests.
  // Fetch the cacheable representation, then stream the requested portion.
  const assetRequest = rangeHeader ? requestWithoutRange(request) : request
  const assetResponse = await env.ASSETS.fetch(assetRequest)
  const totalLength = responseContentLength(assetResponse, request)
  const canSlice = totalLength !== null && canSliceIdentityResponse(assetResponse)
  if (assetResponse.status !== 200) {
    return forwardAsset(assetResponse, request.method)
  }

  if (!rangeHeader || request.method === 'HEAD' ||
      !isByteRangeHeader(rangeHeader) || !ifRangeMatches(request, assetResponse)) {
    return forwardAsset(assetResponse, request.method, canSlice, canSlice ? totalLength : null)
  }

  if (totalLength === null || !canSlice || !assetResponse.body) {
    return forwardAsset(assetResponse, request.method, false)
  }

  const range = parseHttpByteRange(rangeHeader, totalLength)
  if (!range) {
    await assetResponse.body?.cancel('Requested byte range is not satisfiable')
    return rangeNotSatisfiable(assetResponse, totalLength)
  }

  const headers = mediaHeaders(assetResponse, true)
  const length = range.end - range.start + 1
  headers.set('content-length', String(length))
  headers.set('content-range', `bytes ${range.start}-${range.end}/${totalLength}`)
  const body = streamRange(assetResponse.body, range.start, range.end)
    .pipeThrough(new FixedLengthStream(length))
  return new Response(body, {
    status: 206,
    statusText: 'Partial Content',
    headers,
  })
}
