export interface AnalyticsConfig {
  webKey: string
  appKey: string
  siteOrigin: string
  appOrigin: string
  appCollector: string
}

export const currentAnalyticsConfig = () => __TIKKUN_ANALYTICS_CONFIG__

export function analyticsConfig(environment: Record<string, string | undefined>): AnalyticsConfig {
  const key = (name: string) => {
    const value = environment[name] ?? ''
    if (value && !/^[a-zA-Z0-9_-]{1,24}$/.test(value)) throw new Error(`${name} must be a Melytics public site key (at most 24 characters)`)
    return value
  }
  const https = (name: string, fallback: string, originOnly = true) => {
    const value = new URL(environment[name] || fallback)
    if (value.protocol !== 'https:' || value.username || value.password || value.search || value.hash || (originOnly && value.pathname !== '/')) {
      throw new Error(`${name} must be an HTTPS ${originOnly ? 'origin' : 'URL'} without credentials, query, or fragment`)
    }
    return originOnly ? value.origin : value.href
  }
  const config = {
    webKey: key('TIKKUN_ANALYTICS_WEB_KEY'),
    appKey: key('TIKKUN_ANALYTICS_APP_KEY'),
    siteOrigin: https('TIKKUN_ANALYTICS_SITE_ORIGIN', 'https://tikkunreader.com'),
    appOrigin: https('TIKKUN_ANALYTICS_APP_ORIGIN', 'https://app.tikkunreader.com'),
    appCollector: https('TIKKUN_ANALYTICS_APP_COLLECTOR', 'https://adamn.cc/api/echo', false),
  }
  if (config.webKey && config.webKey === config.appKey) throw new Error('Website and app analytics require separate Melytics site keys')
  return config
}
