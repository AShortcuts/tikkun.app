import type { AnalyticsConfig } from './config.ts'
import { analyticsPath, validEvent, type AnalyticsEvent, type AnalyticsProperties } from './schema.ts'
import { ANALYTICS_PREFERENCE_EVENT, ANALYTICS_PREFERENCE_KEY, analyticsAllowed } from './preferences.ts'

export interface AnalyticsPayload {
  k: string
  u: string
  r?: string
  w?: number
  e?: string
  p?: AnalyticsProperties
}
export type AnalyticsSender = (payload: AnalyticsPayload) => Promise<void>
export interface AnalyticsClient {
  isCollecting(): boolean
  page(): void
  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void
  destroy(): void
}

const noop: AnalyticsClient = { isCollecting: () => false, page() {}, track() {}, destroy() {} }
let activeClient = noop
export const analyticsIsCollecting = () => activeClient.isCollecting()
export function trackAnalytics(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  activeClient.track(event, properties)
}
export function installAnalytics(client: AnalyticsClient) {
  activeClient = client
  return () => { if (activeClient === client) activeClient = noop; client.destroy() }
}

export function createAnalyticsClient({ view, config, native, enabled, send, now = () => performance.now() }: {
  view: Window
  config: AnalyticsConfig
  native: boolean
  enabled: boolean
  send: AnalyticsSender
  now?: () => number
}): AnalyticsClient {
  const key = native ? config.appKey : config.webKey
  const site = new URL(config.siteOrigin)
  const correctHost = native || view.location.origin === site.origin || view.location.origin === `https://www.${site.hostname}`
  if (!enabled || !key || !correctHost) return noop
  const document = view.document
  const origin = native ? config.appOrigin : config.siteOrigin
  let lastPath: string | null = null
  let visibleSince: number | null = null
  let engagement = 0
  let destroyed = false
  let inFlight = 0
  let failed = false
  let allowance = 60
  let refillAt = now()
  const permitted = () => !destroyed && view.navigator.onLine && analyticsAllowed(view) && analyticsPath(new URL(view.location.href)) !== null
  const sendAt = (path: string, event?: string, properties?: AnalyticsProperties) => {
    if (!permitted() || !view.navigator.onLine) return
    const elapsed = now() - refillAt
    if (elapsed >= 60_000) { allowance = 60; refillAt = now() }
    if (allowance <= 0 || inFlight >= 4) return
    allowance -= 1
    inFlight += 1
    const payload: AnalyticsPayload = { k: key, u: `${origin}${native ? '/app' : ''}${path}`, w: view.innerWidth < 870 ? 390 : 1280 }
    // A referrer host is sufficient for acquisition; never transmit its path/query.
    if (!native && document.referrer) {
      try {
        const referrer = new URL(document.referrer)
        if (referrer.protocol === 'https:' || referrer.protocol === 'http:') payload.r = referrer.origin
      } catch { /* Browser-provided referrers can be absent or unparsable. */ }
    }
    if (event) { payload.e = event; payload.p = properties ?? {} }
    // No persistent queue: offline activity and failed deliveries are discarded.
    void Promise.resolve().then(() => {
      if (analyticsAllowed(view) && view.navigator.onLine && analyticsPath(new URL(view.location.href)) !== null) return send(payload)
    }).catch(() => {
      if (!failed) { failed = true; console.warn('Usage analytics delivery failed; reading is unaffected.') }
    }).finally(() => { inFlight -= 1 })
  }
  const accountVisible = () => {
    const current = now()
    if (visibleSince !== null) engagement += Math.max(0, current - visibleSince)
    visibleSince = document.visibilityState === 'visible' && permitted() ? current : null
  }
  const flushEngagement = () => {
    accountVisible()
    const seconds = Math.min(3600, Math.floor(engagement / 1000))
    if (lastPath && seconds > 0) sendAt(lastPath, 'page_engagement', { seconds })
    engagement = 0
  }
  const page = () => {
    const path = analyticsPath(new URL(view.location.href))
    if (!permitted() || document.visibilityState !== 'visible') { visibleSince = null; engagement = 0; lastPath = null; return }
    if (path === lastPath) return
    flushEngagement()
    lastPath = path
    if (path) sendAt(path)
    visibleSince = now()
  }
  const track = (event: AnalyticsEvent, properties: AnalyticsProperties = {}) => {
    if (!validEvent(event, properties)) { console.warn('Invalid usage analytics event rejected.'); return }
    const path = analyticsPath(new URL(view.location.href))
    if (path) sendAt(path, event, properties)
  }
  const visible = () => {
    if (document.visibilityState === 'hidden') { flushEngagement(); visibleSince = null }
    else { page(); visibleSince = permitted() ? now() : null }
  }
  const preference = () => { lastPath = null; visibleSince = null; engagement = 0; page() }
  const storage = (event: StorageEvent) => { if (!event.key || event.key === ANALYTICS_PREFERENCE_KEY) preference() }
  const error = () => track('client_error', { kind: 'uncaught' })
  const rejection = () => track('client_error', { kind: 'unhandled' })
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return
    const link = event.target.closest<HTMLAnchorElement>('a[href]')
    if (link?.hostname === 'apps.apple.com') track('app_store_open')
  }
  const heartbeat = view.setInterval(() => {
    if (document.visibilityState !== 'visible' || !permitted()) return
    flushEngagement()
    track('__ping')
  }, 120_000)
  document.addEventListener('visibilitychange', visible)
  document.addEventListener('click', click, true)
  view.addEventListener('pagehide', flushEngagement)
  view.addEventListener('hashchange', page)
  view.addEventListener('error', error)
  view.addEventListener('unhandledrejection', rejection)
  view.addEventListener('storage', storage)
  view.addEventListener('online', preference)
  view.addEventListener('offline', preference)
  view.addEventListener(ANALYTICS_PREFERENCE_EVENT, preference)
  return { isCollecting: permitted, page, track, destroy() {
    flushEngagement()
    destroyed = true
    view.clearInterval(heartbeat)
    document.removeEventListener('visibilitychange', visible)
    document.removeEventListener('click', click, true)
    view.removeEventListener('pagehide', flushEngagement)
    view.removeEventListener('hashchange', page)
    view.removeEventListener('error', error)
    view.removeEventListener('unhandledrejection', rejection)
    view.removeEventListener('storage', storage)
    view.removeEventListener('online', preference)
    view.removeEventListener('offline', preference)
    view.removeEventListener(ANALYTICS_PREFERENCE_EVENT, preference)
  } }
}
