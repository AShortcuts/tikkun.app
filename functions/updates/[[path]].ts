export interface UpdateFunctionContext {
  request: Request
  env: { ASSETS: { fetch(request: Request): Promise<Response> } }
}

export async function onRequest({ request, env }: UpdateFunctionContext): Promise<Response> {
  const pathname = new URL(request.url).pathname
  const headers = new Headers({
    'access-control-allow-origin': 'capacitor://localhost',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers })
  const valid = /^\/updates\/(?:web\/\d+\/(?:latest\.json|[a-f0-9]{64}\.zip)|content\/[a-f0-9]{64}\/(?:latest|[a-f0-9]{64})\.json)$/.test(pathname)
  if (!valid) return new Response(null, { status: 404, headers })
  const response = await env.ASSETS.fetch(request)
  // Pages can return the site's HTML fallback with status 200 for a missing asset.
  const type = response.headers.get('content-type') ?? ''
  if (response.status === 404 || type.includes('text/html')) return new Response(null, { status: 404, headers })
  if (!response.ok) return new Response(null, { status: response.status, headers })
  headers.set('content-type', pathname.endsWith('.zip') ? 'application/zip' : 'application/json')
  if (!pathname.endsWith('/latest.json')) headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(request.method === 'HEAD' ? null : response.body, { status: 200, headers })
}
