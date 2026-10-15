import { analyticsConfig } from '../../app/analytics/config.ts'
import { analyticsPaths, validEvent } from '../../app/analytics/schema.ts'

export interface AnalyticsFunctionContext {
  request: Request
  env: Record<string, string | undefined>
}

const MAX_BODY = 32 * 1024
const response = (status: number) => new Response(null, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  ...(status === 405 ? { Allow: 'POST' } : {}),
} })

async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return text + decoder.decode()
      size += value.byteLength
      if (size > MAX_BODY) { await reader.cancel(); throw new RangeError('Analytics body exceeds limit') }
      text += decoder.decode(value, { stream: true })
    }
  } finally { reader.releaseLock() }
}

export async function onRequest({ request, env }: AnalyticsFunctionContext) {
  if (request.method !== 'POST') return response(405)
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response(415)
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return response(403)
  if (Number(request.headers.get('content-length')) > MAX_BODY) return response(413)
  const token = env.MELYTICS_RELAY_TOKEN
  if (!token || token.length < 32 || !env.TIKKUN_ANALYTICS_WEB_KEY) return response(503)
  let config
  try { config = analyticsConfig(env) }
  catch { console.error('Invalid analytics deployment configuration'); return response(503) }
  const clientIp = request.headers.get('CF-Connecting-IP')
  if (!clientIp) return response(503)
  let data
  try { data = JSON.parse(await readBody(request)) }
  catch (error) { return response(error instanceof RangeError ? 413 : 400) }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.k !== config.webKey || typeof data.u !== 'string') return response(400)
  if (Object.keys(data).some(key => !['k', 'u', 'r', 'w', 'e', 'p'].includes(key))) return response(400)
  let url: URL
  try { url = new URL(data.u) } catch { return response(400) }
  if (url.origin !== config.siteOrigin || url.search || url.hash || url.username || url.password || !analyticsPaths.some(path => path === url.pathname)) return response(400)
  if (data.e !== undefined ? !validEvent(data.e, data.p) : data.p !== undefined) return response(400)
  if (data.w !== undefined && ![390, 1280].includes(data.w)) return response(400)
  if (data.r !== undefined) {
    try {
      const referrer = new URL(data.r)
      if (!['https:', 'http:'].includes(referrer.protocol) || data.r !== referrer.origin) return response(400)
    } catch { return response(400) }
  }
  // The relay authenticates this hop before trusting the original visitor IP.
  // A normal cross-zone Worker fetch would replace CF-Connecting-IP and merge visitors.
  const headers = new Headers({
    'Content-Type': 'application/json',
    'User-Agent': request.headers.get('User-Agent') ?? '',
    'X-Tikkun-Relay-Token': token,
    'X-Tikkun-Client-IP': clientIp,
  })
  const country = request.headers.get('CF-IPCountry')
  if (country && /^[A-Z]{2}$/.test(country)) headers.set('X-Tikkun-Country', country)
  try {
    const upstream = await fetch('https://adamn.cc/api/tikkun-echo', {
      method: 'POST', body: JSON.stringify(data), headers,
      redirect: 'error', signal: AbortSignal.timeout(5000),
    })
    // The dedicated route identifies itself; an HTML catch-all is never success.
    if (upstream.status !== 204 || upstream.headers.get('X-Tikkun-Collector') !== '1') {
      console.error('Analytics relay is unavailable or misconfigured')
      return response(502)
    }
    return response(204)
  } catch { console.error('Analytics relay request failed'); return response(502) }
}
