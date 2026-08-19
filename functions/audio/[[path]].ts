import {
  parseHttpByteRange,
  type HttpByteRange,
} from '../../app/audio/http-byte-range.ts'

interface AssetFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface FixedLengthStreamConstructor {
  new (
    expectedLength: number
  ): ReadableWritablePair<Uint8Array, Uint8Array>
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

function mediaHeaders(response: Response, advertiseRanges = true) {
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  if (advertiseRanges) headers.set('accept-ranges', 'bytes')
  else headers.delete('accept-ranges')
  return headers
}

function forwardAsset(
  response: Response,
  method: string,
  advertiseRanges = true
) {
  return new Response(method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: mediaHeaders(response, advertiseRanges),
  })
}

function responseContentLength(response: Response) {
  const header = response.headers.get('content-length')
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

function streamByteRange(
  body: ReadableStream<Uint8Array>,
  range: HttpByteRange
) {
  const reader = body.getReader()
  let sourceOffset = 0
  let remaining = range.end - range.start + 1
  let finished = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (!finished && remaining > 0) {
        const { done, value } = await reader.read()
        if (done) {
          finished = true
          controller.error(
            new Error('Audio asset ended before its declared Content-Length')
          )
          return
        }

        const chunkStart = sourceOffset
        sourceOffset += value.byteLength
        if (sourceOffset <= range.start) continue

        const startInChunk = Math.max(0, range.start - chunkStart)
        const byteCount = Math.min(
          value.byteLength - startInChunk,
          remaining
        )
        if (byteCount > 0) {
          controller.enqueue(
            value.subarray(startInChunk, startInChunk + byteCount)
          )
          remaining -= byteCount
        }

        if (remaining === 0) {
          finished = true
          controller.close()
          await reader.cancel('Requested byte range complete')
        }
        return
      }
    },
    async cancel(reason) {
      finished = true
      await reader.cancel(reason)
    },
  })
}

function fixedLengthByteRange(
  body: ReadableStream<Uint8Array>,
  range: HttpByteRange,
  contentLength: number
) {
  const source = streamByteRange(body, range)
  const FixedLengthStream = (
    globalThis as typeof globalThis & {
      FixedLengthStream?: FixedLengthStreamConstructor
    }
  ).FixedLengthStream

  return FixedLengthStream
    ? source.pipeThrough(new FixedLengthStream(contentLength))
    : source
}

function rangeNotSatisfiable(response: Response, totalLength: number) {
  const headers = mediaHeaders(response)
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
  const assetRequest =
    request.method === 'HEAD' && rangeHeader
      ? requestWithoutRange(request)
      : request
  const assetResponse = await env.ASSETS.fetch(assetRequest)
  if (!assetResponse.ok || assetResponse.status !== 200 || !rangeHeader) {
    return forwardAsset(assetResponse, request.method)
  }

  if (request.method === 'HEAD') return forwardAsset(assetResponse, request.method)

  if (!isByteRangeHeader(rangeHeader) || !ifRangeMatches(request, assetResponse)) {
    return forwardAsset(assetResponse, request.method)
  }

  const totalLength = responseContentLength(assetResponse)
  if (totalLength === null || !canSliceIdentityResponse(assetResponse)) {
    return forwardAsset(assetResponse, request.method, false)
  }

  const range = parseHttpByteRange(rangeHeader, totalLength)
  if (!range) {
    await assetResponse.body?.cancel('Requested byte range is not satisfiable')
    return rangeNotSatisfiable(assetResponse, totalLength)
  }

  if (!assetResponse.body) {
    return new Response('Audio asset body unavailable', {
      status: 502,
      statusText: 'Bad Gateway',
    })
  }

  const contentLength = range.end - range.start + 1
  const headers = mediaHeaders(assetResponse)
  headers.delete('content-encoding')
  headers.set('content-length', String(contentLength))
  headers.set(
    'content-range',
    `bytes ${range.start}-${range.end}/${totalLength}`
  )

  return new Response(
    fixedLengthByteRange(assetResponse.body, range, contentLength),
    {
      status: 206,
      statusText: 'Partial Content',
      headers,
    }
  )
}
