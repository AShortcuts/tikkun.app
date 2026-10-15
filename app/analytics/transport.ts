import { CapacitorHttp } from '@capacitor/core'
import type { AnalyticsConfig } from './config.ts'
import type { AnalyticsSender } from './client.ts'

export function analyticsTransport(config: AnalyticsConfig, native: boolean): AnalyticsSender {
  if (native) return async payload => {
    const response = await CapacitorHttp.post({
      url: config.appCollector,
      data: payload,
      headers: { 'Content-Type': 'application/json', 'User-Agent': `TikkunReader/1.0 ${navigator.userAgent}` },
      connectTimeout: 5000, readTimeout: 5000, disableRedirects: true,
    })
    if (response.status !== 204) throw new Error('Analytics collector rejected the request')
  }
  return async payload => {
    const response = await fetch('/api/echo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), credentials: 'omit', referrerPolicy: 'no-referrer',
      keepalive: true, redirect: 'error', signal: AbortSignal.timeout(5000),
    })
    if (response.status !== 204) throw new Error('Analytics collector rejected the request')
  }
}
