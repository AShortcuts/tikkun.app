import { parseHttpByteRange } from '../../app/audio/http-byte-range.ts'

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
    response.headers.get('accept-ranges')?.toLowerCase() === 'bytes'
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

  // A 200 response is sequential. Synthesizing a middle or suffix 206 from it
  // would consume every preceding byte and make seek cost scale with file size.
  // Stream the honest full response instead; release verification requires the
  // deployed asset binding to return a native 206 for byte-range requests.
  void range
  return forwardAsset(assetResponse, request.method, false)
}
