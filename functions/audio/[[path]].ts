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

function assetRequestWithoutRange(request: Request) {
  const assetRequest = new Request(request)
  assetRequest.headers.delete('if-range')
  assetRequest.headers.delete('range')
  return assetRequest
}

function mediaHeaders(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('accept-ranges', 'bytes')
  return headers
}

function forwardAsset(response: Response, method: string) {
  return new Response(method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: mediaHeaders(response),
  })
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
  const assetResponse = await env.ASSETS.fetch(
    rangeHeader ? assetRequestWithoutRange(request) : request
  )
  if (!assetResponse.ok || assetResponse.status !== 200 || !rangeHeader) {
    return forwardAsset(assetResponse, request.method)
  }

  if (request.method === 'HEAD') return forwardAsset(assetResponse, request.method)

  const asset = await assetResponse.arrayBuffer()
  const range = parseHttpByteRange(rangeHeader, asset.byteLength)
  if (!range) return rangeNotSatisfiable(assetResponse, asset.byteLength)

  const body = asset.slice(range.start, range.end + 1)
  const headers = mediaHeaders(assetResponse)
  headers.delete('content-encoding')
  headers.set('content-length', String(body.byteLength))
  headers.set(
    'content-range',
    `bytes ${range.start}-${range.end}/${asset.byteLength}`
  )

  return new Response(body, {
    status: 206,
    statusText: 'Partial Content',
    headers,
  })
}
