declare global {
  namespace App {}

  const __TIKKUN_BUILD_ID__: string
  const __TIKKUN_ANALYTICS_CONFIG__: import('../app/analytics/config.ts').AnalyticsConfig
}

export {}
